/**
 * The look: soft toon shading, chunky rounded shapes, warm light.
 *
 * Every prop and character is assembled from simple primitives with a Builder,
 * which bakes each part's colour into vertex colours and merges the lot into a
 * single mesh — one draw call per prop or body part, one shared material.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let gradient = null;
export function gradientMap() {
  if (gradient) return gradient;
  const tones = [110, 180, 235, 255];
  const data = new Uint8Array(tones.length * 4);
  tones.forEach((t, i) => { data.set([t, t, t, 255], i * 4); });
  gradient = new THREE.DataTexture(data, tones.length, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const matCache = new Map();
export function toonMat(opts = {}) {
  const key = JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const { outline, ...rest } = opts;
  const m = new THREE.MeshToonMaterial({ gradientMap: gradientMap(), vertexColors: !rest.color, ...rest });
  if (outline === false) m.userData.outlineParameters = { visible: false };
  matCache.set(key, m);
  return m;
}

export const VC = () => toonMat({});                                     // vertex-coloured toon
export const VC_NO_OUTLINE = () => toonMat({ outline: false });

export function glowMat(color) {
  const key = 'glow' + color;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color });
  m.userData.outlineParameters = { visible: false };
  matCache.set(key, m);
  return m;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Place options: { x, y, z, rx, ry, rz, sx, sy, sz, s } */
function matrixFrom(p = {}) {
  _e.set(p.rx || 0, p.ry || 0, p.rz || 0);
  _q.setFromEuler(_e);
  _v.set(p.x || 0, p.y || 0, p.z || 0);
  const s = p.s ?? 1;
  _s.set((p.sx ?? 1) * s, (p.sy ?? 1) * s, (p.sz ?? 1) * s);
  return _m.compose(_v, _q, _s);
}

export class Builder {
  constructor() { this.parts = []; }

  add(geo, color, place) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    g.deleteAttribute('uv');
    if (g.attributes.uv2) g.deleteAttribute('uv2');
    g.applyMatrix4(place instanceof THREE.Matrix4 ? place : matrixFrom(place));
    _c.set(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  box(w, h, d, color, p = {}, r = Math.min(w, h, d) * 0.18) {
    const geo = r > 0.001 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2 - 0.001)) : new THREE.BoxGeometry(w, h, d);
    return this.add(geo, color, p);
  }
  flat(w, h, d, color, p = {}) { return this.add(new THREE.BoxGeometry(w, h, d), color, p); }
  sphere(r, color, p = {}, seg = 14) { return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))), color, p); }
  cyl(rt, rb, h, color, p = {}, seg = 16) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, p); }
  cone(r, h, color, p = {}, seg = 12) { return this.add(new THREE.ConeGeometry(r, h, seg), color, p); }
  capsule(r, len, color, p = {}) { return this.add(new THREE.CapsuleGeometry(r, len, 4, 10), color, p); }
  torus(R, r, color, p = {}, arc = Math.PI * 2) { return this.add(new THREE.TorusGeometry(R, r, 8, 20, arc), color, p); }
  disc(r, color, p = {}, seg = 20) { return this.add(new THREE.CircleGeometry(r, seg), color, { rx: -Math.PI / 2, ...p }); }
  geom(g, color, p = {}) { return this.add(g, color, p); }

  get empty() { return this.parts.length === 0; }

  geometry() {
    if (!this.parts.length) return new THREE.BufferGeometry();
    const g = mergeGeometries(this.parts, false);
    g.computeBoundingSphere();
    return g;
  }

  mesh({ shadow = true, receive = false, material = null } = {}) {
    const m = new THREE.Mesh(this.geometry(), material || VC());
    m.castShadow = shadow;
    m.receiveShadow = receive;
    return m;
  }
}

/** Soft round shadow blob for characters (cheap and cute). */
let blobTex = null;
export function blobShadow(radius = 0.42, opacity = 0.28) {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, 'rgba(60,40,30,1)');
    grd.addColorStop(1, 'rgba(60,40,30,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false }));
  m.material.userData.outlineParameters = { visible: false };
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}

/** Canvas text → texture (signs, menus, name boards). */
export function textTexture(text, { w = 512, h = 128, bg = '#fff7e8', fg = '#5a3b2a', font = '700 64px Fredoka, "Baloo 2", system-ui, sans-serif', border = null, radius = 28 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    roundRect(g, 4, 4, w - 8, h - 8, radius); g.fill();
    if (border) { g.lineWidth = 8; g.strokeStyle = border; g.stroke(); }
  }
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = parseInt(font.match(/(\d+)px/)?.[1] || 64, 10);
  while (g.measureText(text).width > w - 40 && size > 16) { size -= 4; g.font = font.replace(/\d+px/, size + 'px'); }
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export { THREE };
