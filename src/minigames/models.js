/**
 * Mini game models, built like the restaurant's props and items: chunky toon
 * primitives merged into one vertex-coloured mesh. Sizes are in metres at
 * real-ish scale (a plate is 0.26 m across); games scale them up as needed.
 * Origin is the base centre, front faces +z.
 *
 *   model('tomato')                 a fresh Mesh (geometry is cached per kind+options)
 *   model('bowl', { fill: '#f5e6b8' })
 *   defineModel('myThing', (b, o) => { … })   games can add their own kinds
 *   icon(renderer, 'tomato')        a cached little picture of a model for 2D UI
 */
import * as THREE from 'three';
import { Builder, VC, glowMat, textTexture } from '../three/toon.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';

const W = '#fbfaf5', STEEL = '#c9d3da', STEEL_D = '#9aa7b1', INK = '#3b2f2f', WOOD = '#c98f5a', WOOD_D = '#9c6a3f';

const DEFS = {
  /* produce & ingredients */
  tomato(b) { b.sphere(0.05, '#e8505b', { y: 0.045, sy: 0.85 }); b.cone(0.03, 0.02, '#5aa469', { y: 0.09 }, 5); },
  tomatoSlice(b) { b.cyl(0.05, 0.05, 0.014, '#e8505b', { y: 0.007 }); b.cyl(0.035, 0.035, 0.016, '#ff8a80', { y: 0.008 }); },
  cheese(b) { b.box(0.11, 0.06, 0.08, '#ffd23f', { y: 0.03 }, 0.008); for (const [x, z] of [[-0.02, 0.041], [0.03, 0.041]]) b.sphere(0.012, '#f2b705', { x, y: 0.035, z, sz: 0.3 }); },
  cheeseSlice(b) { b.box(0.1, 0.012, 0.1, '#ffd23f', { y: 0.006, ry: 0.3 }, 0.003); },
  lettuce(b) { for (let i = 0; i < 5; i++) b.sphere(0.045, i % 2 ? '#8ac926' : '#6aa84f', { x: Math.cos(i * 1.3) * 0.03, y: 0.04 + i * 0.006, z: Math.sin(i * 1.3) * 0.03, sy: 0.7 }); },
  lettuceLeaf(b) { b.sphere(0.06, '#8ac926', { y: 0.008, sy: 0.15 }); },
  onion(b) { b.sphere(0.048, '#d9a066', { y: 0.045 }); b.cone(0.018, 0.04, '#b5835a', { y: 0.1 }, 6); b.sphere(0.03, '#f1d1a8', { y: 0.06, z: 0.03, sz: 0.4 }); },
  onionRing(b, o) { b.torus(0.045, 0.018, o.coat || '#f1e1c2', { y: 0.018, rx: Math.PI / 2 }); },
  bacon(b) { for (let i = 0; i < 2; i++) b.box(0.13, 0.012, 0.035, i ? '#c0392b' : '#e07a5f', { y: 0.01 + i * 0.012, z: (i - 0.5) * 0.03, rz: i * 0.08 }, 0.004); },
  egg(b) { b.sphere(0.06, W, { y: 0.008, sy: 0.12 }); b.sphere(0.024, '#ffb703', { y: 0.016, sy: 0.6 }); },
  bunBottom(b) { b.cyl(0.07, 0.065, 0.03, '#e9a23b', { y: 0.015 }); },
  bunTop(b) { b.sphere(0.07, '#e9a23b', { y: 0.0, sy: 0.6 }); for (let i = 0; i < 6; i++) b.sphere(0.006, '#fff7e0', { x: Math.cos(i) * 0.035, y: 0.038, z: Math.sin(i) * 0.035 }); },
  patty(b) { b.cyl(0.068, 0.068, 0.025, '#7a3e22', { y: 0.012 }); },
  drumstick(b, o) { b.sphere(0.05, o.coat || '#e9b38a', { y: 0.04, sx: 1.3 }); b.cyl(0.012, 0.012, 0.07, W, { x: 0.075, y: 0.04, rz: Math.PI / 2 }); b.sphere(0.016, W, { x: 0.11, y: 0.04 }); },
  mozzStick(b, o) { b.capsule(0.022, 0.09, o.coat || '#fff3d6', { y: 0.025, rz: Math.PI / 2 }); },
  shrimp(b, o) { b.torus(0.035, 0.02, o.coat || '#ff9f80', { y: 0.02, rx: Math.PI / 2 }, Math.PI * 1.4); b.cone(0.02, 0.03, '#ff6b4a', { x: 0.035, y: 0.02, z: -0.02, rz: -1 }, 5); },
  /** A battered blob for anything coated; `coat` tints it from pale to golden to dark. */
  batter(b, o) { const c = o.coat || '#f4ead2'; b.sphere(0.06, c, { y: 0.04, sx: 1.25, sz: 0.9, sy: 0.75 }); for (let i = 0; i < 5; i++) b.sphere(0.022, c, { x: Math.cos(i * 1.7) * 0.05, y: 0.05, z: Math.sin(i * 1.7) * 0.035 }); },

  /* dishes */
  plate(b) { b.cyl(0.13, 0.1, 0.02, W, { y: 0.01 }); b.cyl(0.095, 0.095, 0.004, '#f1ece5', { y: 0.021 }); },
  bowl(b, o) { b.cyl(0.11, 0.06, 0.08, o.color || W, { y: 0.04 }); if (o.fill) b.cyl(0.1, 0.1, 0.01, o.fill, { y: 0.07 }); },
  /** A mixing bowl 0.48 m across: an open half-sphere with whatever's in it (`fill`) near the rim. */
  bigBowl(b, o) {
    b.geom(new THREE.SphereGeometry(0.24, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), o.color || W, { y: 0.22, sy: 0.85 });
    b.torus(0.235, 0.014, o.rim || '#e9e2d6', { y: 0.22, rx: Math.PI / 2 });
    b.cyl(0.215, 0.18, 0.02, o.fill || '#f5e6b8', { y: 0.19 });
    b.cyl(0.08, 0.1, 0.03, o.color || W, { y: 0.015 });
  },
  mug(b, o) { b.cyl(0.045, 0.04, 0.09, o.color || W, { y: 0.045 }); b.torus(0.025, 0.009, o.color || W, { x: 0.05, y: 0.05, ry: Math.PI / 2 }); if (o.fill) b.cyl(0.042, 0.042, 0.006, o.fill, { y: 0.088 }); },
  glass(b, o) { b.cyl(0.04, 0.034, 0.12, '#e8f6ff', { y: 0.06 }); if (o.fill) b.cyl(0.036, 0.032, 0.12 * (o.level ?? 0.7), o.fill, { y: 0.06 * (o.level ?? 0.7) + 0.003 }); },
  cup(b) { b.cyl(0.04, 0.03, 0.08, '#eef6ff', { y: 0.04 }); },
  cutlery(b) { b.flat(0.012, 0.004, 0.16, '#d9dee3', { x: -0.015, y: 0.003 }); b.flat(0.012, 0.004, 0.16, '#d9dee3', { x: 0.015, y: 0.003 }); },

  /* finished dishes (Line Cook) */
  burger(b) { DEFS.bunBottom(b); b.cyl(0.068, 0.068, 0.025, '#7a3e22', { y: 0.042 }); b.box(0.12, 0.008, 0.12, '#ffd23f', { y: 0.058, ry: 0.3 }, 0.003); b.sphere(0.07, '#8ac926', { y: 0.064, sy: 0.12 }); b.sphere(0.07, '#e9a23b', { y: 0.07, sy: 0.6 }); },
  taco(b) { b.sphere(0.08, '#f2c14e', { y: 0.045, sx: 1.1, sy: 0.6, sz: 0.38 }); for (let i = 0; i < 4; i++) b.sphere(0.022, i % 2 ? '#8ac926' : '#e8505b', { x: -0.05 + i * 0.033, y: 0.075, sy: 0.7 }); b.sphere(0.02, '#7a3e22', { x: 0.01, y: 0.08 }); },
  salad(b) { b.cyl(0.1, 0.06, 0.06, '#7cc6a4', { y: 0.03 }); for (let i = 0; i < 6; i++) b.sphere(0.035, i % 2 ? '#8ac926' : '#6aa84f', { x: Math.cos(i) * 0.05, y: 0.065, z: Math.sin(i) * 0.05, sy: 0.6 }); },
  ramen(b) { b.cyl(0.1, 0.06, 0.07, '#e85d75', { y: 0.035 }); b.cyl(0.092, 0.092, 0.01, '#f4d58d', { y: 0.068 }); b.sphere(0.028, W, { x: 0.03, y: 0.075, sy: 0.6 }); b.sphere(0.014, '#ffb703', { x: 0.03, y: 0.083 }); },
  toast(b) { b.box(0.11, 0.025, 0.1, '#e0a96d', { y: 0.013 }, 0.01); b.box(0.095, 0.004, 0.085, '#f4c27a', { y: 0.027 }, 0.002); },
  pizza(b) { b.cyl(0.11, 0.11, 0.015, '#f2c14e', { y: 0.008 }); b.cyl(0.095, 0.095, 0.006, '#e8505b', { y: 0.017 }); for (let i = 0; i < 5; i++) b.sphere(0.012, '#ffd23f', { x: Math.cos(i * 1.3) * 0.05, y: 0.021, z: Math.sin(i * 1.3) * 0.05, sy: 0.4 }); },

  /* kitchen kit */
  /** A shallow ingredient tub; put models on top at y ≈ 0.07. */
  tub(b, o) { b.box(o.w || 0.26, 0.07, o.d || 0.2, o.color || STEEL, { y: 0.035 }, 0.012); b.flat((o.w || 0.26) - 0.03, 0.01, (o.d || 0.2) - 0.03, o.inner || '#e6ecf0', { y: 0.066 }); },
  counterTop(b, o) { b.box(o.w || 2, 0.9, o.d || 0.7, o.body || WOOD, { y: 0.45 }, 0.04); b.box((o.w || 2) + 0.04, 0.06, (o.d || 0.7) + 0.04, o.top || '#f4efe6', { y: 0.92 }, 0.02); },
  steelTop(b, o) { b.box(o.w || 2, 0.9, o.d || 0.7, STEEL_D, { y: 0.45 }, 0.04); b.box((o.w || 2) + 0.04, 0.05, (o.d || 0.7) + 0.04, STEEL, { y: 0.92 }, 0.02); },
  wireBasket(b) {
    b.box(0.34, 0.012, 0.22, '#5c6670', { y: 0.006 }, 0.004);
    for (let i = 0; i <= 6; i++) b.flat(0.006, 0.13, 0.006, '#5c6670', { x: -0.17 + i * 0.0567, y: 0.065, z: 0.11 });
    for (let i = 0; i <= 6; i++) b.flat(0.006, 0.13, 0.006, '#5c6670', { x: -0.17 + i * 0.0567, y: 0.065, z: -0.11 });
    for (const z of [-0.11, 0.11]) b.flat(0.34, 0.008, 0.008, '#5c6670', { y: 0.13, z });
    for (const x of [-0.17, 0.17]) b.flat(0.008, 0.008, 0.22, '#5c6670', { x, y: 0.13 });
    b.box(0.26, 0.03, 0.03, '#2f2b33', { x: 0.3, y: 0.12 }, 0.012);
  },
  coin(b, o) { b.cyl(o.r || 0.012, o.r || 0.012, 0.004, o.color || '#ffd23f', { y: 0.002 }); },
  crate(b, o) { b.box(0.4, 0.26, 0.3, o.color || '#c9a27a', { y: 0.13 }, 0.02); b.flat(0.41, 0.03, 0.31, '#b08968', { y: 0.2 }); b.flat(0.41, 0.03, 0.31, '#b08968', { y: 0.07 }); },
  floorTile(b, o) { b.flat(o.w || 1, 0.02, o.d || 1, o.color || '#efe4d2', { y: -0.01 }); },
};

const cache = new Map();

export function defineModel(kind, fn) { DEFS[kind] = fn; }

/** A fresh mesh for a model kind (geometry shared per kind + options). */
export function model(kind, opts = {}) {
  const key = kind + (Object.keys(opts).length ? JSON.stringify(opts) : '');
  if (!cache.has(key)) {
    const fn = DEFS[kind];
    if (!fn) throw new Error(`no model ${kind}`);
    const b = new Builder();
    fn(b, opts);
    cache.set(key, b.geometry());
  }
  const m = new THREE.Mesh(cache.get(key), VC());
  m.castShadow = true;
  m.receiveShadow = true;
  m.name = 'model:' + kind;
  return m;
}

/** Flat text label as a plane facing +z (signs, price tags, table numbers). */
export function sign(textStr, { w = 0.5, h = 0.16, bg = '#fff7e8', fg = '#5a3b2a', border = null } = {}) {
  const tex = textTexture(textStr, { w: 512, h: Math.round(512 * h / w), bg, fg, border });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.material.userData.outlineParameters = { visible: false };
  m.userData.ownGeometry = true;
  return m;
}

export { glowMat };

/* ── icons: little pictures of models for the 2D UI (tickets, buttons) ── */

const icons = new Map();
let studio = null;

/**
 * A cached canvas picture of a model, drawn with the game's toon look, for
 * tickets and buttons on the 2D overlay (g.drawImage(icon(...), x, y, w, h)).
 */
export function icon(renderer, kind, opts = {}, { yaw = -0.5, pitch = 0.55 } = {}) {
  const key = kind + JSON.stringify(opts) + yaw + pitch;
  if (icons.has(key)) return icons.get(key);
  const size = 128;
  if (!studio) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff6e5', '#c9b6e8', 1.6));
    const key2 = new THREE.DirectionalLight('#ffffff', 1.8); key2.position.set(2, 4, 5); scene.add(key2);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    studio = { scene, cam, rt };
  }
  const { scene, cam, rt } = studio;
  const m = model(kind, opts);
  m.rotation.set(0, yaw, 0);
  const holder = new THREE.Group(); holder.rotation.x = pitch; holder.add(m);
  scene.add(holder);
  const box = new THREE.Box3().setFromObject(holder), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const half = Math.max(s.x, s.y) * 0.62;
  cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix();
  cam.position.set(c.x, c.y, c.z + 10); cam.lookAt(c);
  const outline = new OutlineEffect(renderer, { defaultThickness: 0.012, defaultColor: [0.22, 0.14, 0.12], defaultAlpha: 0.9 });
  const prevTarget = renderer.getRenderTarget(), prevAlpha = renderer.getClearAlpha(), prevColor = renderer.getClearColor(new THREE.Color());
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  outline.render(scene, cam);
  const buf = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);
  scene.remove(holder);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  ctx.putImageData(img, 0, 0);
  icons.set(key, canvas);
  return canvas;
}

export const PALETTE = { W, STEEL, STEEL_D, INK, WOOD, WOOD_D };
