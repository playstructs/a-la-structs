/**
 * Restaurant furniture and equipment. Each builder returns an Object3D whose
 * front faces +z. Anything that moves on its own carries
 * `userData.tick(dt, t)`; the scene calls it every frame.
 */
import * as THREE from 'three';
import { Builder, glowMat, textTexture, VC } from './toon.js';

const STEEL = '#c9d3da', STEEL_D = '#9aa7b1', WOOD = '#c98f5a', WOOD_D = '#9c6a3f', WOOD_L = '#e4b583';
const WHITE = '#fbfaf5', INK = '#3b2f2f', RED = '#e8505b', TEAL = '#4fbfa8', BUTTER = '#ffd66b', PINK = '#ff9eb0';

function group(...children) { const g = new THREE.Group(); children.forEach((c) => c && g.add(c)); return g; }
function ticking(obj, fn) { obj.userData.tick = fn; return obj; }

/* ── furniture ─────────────────────────────────────────────────────────── */

export function counter(w = 1.6, d = 0.8, top = '#f4efe6', body = WOOD) {
  const b = new Builder();
  b.box(w, 0.9, d, body, { y: 0.45 }, 0.06);
  b.box(w + 0.08, 0.08, d + 0.08, top, { y: 0.92 }, 0.03);
  return b.mesh();
}

export function steelCounter(w = 1.6, d = 0.8) {
  const b = new Builder();
  b.box(w, 0.86, d, STEEL, { y: 0.43 }, 0.05);
  b.box(w + 0.06, 0.06, d + 0.06, '#e3e9ee', { y: 0.9 }, 0.02);
  b.flat(w * 0.9, 0.02, 0.02, STEEL_D, { y: 0.6, z: d / 2 + 0.005 });
  return b.mesh();
}

export function table(round = true, cloth = '#fff5f5') {
  const b = new Builder();
  if (round) {
    b.cyl(0.62, 0.62, 0.06, WOOD_L, { y: 0.74 });
    b.cyl(0.66, 0.6, 0.04, cloth, { y: 0.78 });
  } else b.box(1.2, 0.07, 0.9, WOOD_L, { y: 0.75 }, 0.03);
  b.cyl(0.06, 0.08, 0.72, WOOD_D, { y: 0.36 });
  b.cyl(0.3, 0.32, 0.04, WOOD_D, { y: 0.02 });
  b.cyl(0.04, 0.04, 0.12, '#cfe8ff', { y: 0.86, x: 0.2 });
  b.sphere(0.05, PINK, { y: 0.95, x: 0.2 });
  b.sphere(0.035, '#ffffff', { y: 0.83, x: -0.25, z: 0.1, sy: 0.4 });
  return b.mesh();
}

export function chair(color = '#e88d67') {
  const b = new Builder();
  b.box(0.42, 0.06, 0.42, color, { y: 0.45 }, 0.03);
  b.box(0.42, 0.42, 0.06, color, { y: 0.68, z: -0.19 }, 0.03);
  for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) b.cyl(0.025, 0.025, 0.44, WOOD_D, { x, y: 0.22, z });
  return b.mesh();
}

export function stool(color = RED) {
  const b = new Builder();
  b.cyl(0.22, 0.22, 0.08, color, { y: 0.7 });
  b.cyl(0.04, 0.05, 0.66, STEEL_D, { y: 0.34 });
  b.torus(0.15, 0.015, STEEL_D, { y: 0.25, rx: Math.PI / 2 });
  b.cyl(0.18, 0.2, 0.03, STEEL_D, { y: 0.015 });
  return b.mesh();
}

export function plant(size = 1) {
  const b = new Builder();
  b.cyl(0.24, 0.18, 0.36, '#d97b4f', { y: 0.18 });
  b.cyl(0.25, 0.25, 0.05, '#c4693d', { y: 0.36 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.sphere(0.18, i % 2 ? '#5fa85a' : '#77c46b', { x: Math.cos(a) * 0.15, y: 0.6 + (i % 3) * 0.12, z: Math.sin(a) * 0.15, sy: 1.5 });
  }
  const m = b.mesh();
  m.scale.setScalar(size);
  return m;
}

export function backShelf(w = 6) {
  const b = new Builder();
  b.box(w, 1.8, 0.4, WOOD_D, { y: 0.9 }, 0.04);
  for (const y of [0.9, 1.4]) b.box(w - 0.1, 0.05, 0.42, WOOD_L, { y, z: 0.05 }, 0.01);
  const colors = ['#4fbfa8', '#f2a65a', '#b18cf2', '#e85d75', '#ffd66b', '#5aa9e6'];
  for (let i = 0; i < Math.floor(w * 4); i++) {
    const x = -w / 2 + 0.2 + i * 0.25;
    const row = i % 2;
    b.cyl(0.05, 0.06, 0.24, colors[(i * 7) % colors.length], { x, y: (row ? 1.4 : 0.9) + 0.15, z: 0.08 });
    b.cyl(0.02, 0.02, 0.08, '#3b2f2f', { x, y: (row ? 1.4 : 0.9) + 0.31, z: 0.08 });
  }
  return b.mesh();
}

export function passWindow(w = 4) {
  const b = new Builder();
  b.box(w, 0.08, 0.7, STEEL, { y: 1.05 }, 0.02);
  for (let i = 0; i < 3; i++) {
    const x = -w / 2 + w * (i + 0.5) / 3;
    b.cyl(0.02, 0.02, 0.5, STEEL_D, { x, y: 1.6 });
    b.cyl(0.14, 0.22, 0.14, RED, { x, y: 1.35 });
  }
  const g = group(b.mesh());
  const lamps = [];
  for (let i = 0; i < 3; i++) {
    const x = -w / 2 + w * (i + 0.5) / 3;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glowMat('#ffb36b'));
    l.position.set(x, 1.27, 0);
    g.add(l); lamps.push(l);
  }
  // order tickets
  const tb = new Builder();
  for (let i = 0; i < 5; i++) tb.flat(0.12, 0.16, 0.005, '#fffbe6', { x: -w / 2 + 0.4 + i * 0.35, y: 1.88, z: 0.0, rz: (i % 2 ? 0.1 : -0.08) });
  tb.flat(w, 0.03, 0.03, STEEL_D, { y: 1.97 });
  g.add(tb.mesh({ shadow: false }));
  return g;
}

export function hood(w = 6) {
  const b = new Builder();
  b.box(w, 0.5, 1.1, STEEL, { y: 2.55 }, 0.04);
  b.flat(w - 0.2, 0.05, 1.0, STEEL_D, { y: 2.29 });
  return b.mesh({ shadow: false });
}

export function potRack(w = 3) {
  const b = new Builder();
  b.flat(w, 0.05, 0.05, STEEL_D, { y: 2.2 });
  for (let i = 0; i < 5; i++) {
    const x = -w / 2 + 0.3 + i * (w - 0.6) / 4;
    b.flat(0.01, 0.3, 0.01, STEEL_D, { x, y: 2.05 });
    b.cyl(0.13 + (i % 2) * 0.04, 0.12, 0.08, i % 2 ? '#b87333' : '#3a3a44', { x, y: 1.85, rx: Math.PI / 2 - 0.2 });
  }
  return b.mesh({ shadow: false });
}

export function menuBoard() {
  const g = new THREE.Group();
  const b = new Builder();
  b.box(1.7, 1.1, 0.08, WOOD_D, {}, 0.04);
  g.add(b.mesh());
  const tex = textTexture('Today: Mystery Stew', { w: 512, h: 320, bg: '#2f3d36', fg: '#f7f3e3', font: '600 54px "Patrick Hand", "Fredoka", cursive', radius: 18 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.95), new THREE.MeshBasicMaterial({ map: tex }));
  m.material.userData.outlineParameters = { visible: false };
  m.position.z = 0.045;
  g.add(m);
  return g;
}

export function rug(w, d, color) {
  const b = new Builder();
  // layers sit on the floor (y 0.01) with clear steps so they never z-fight
  b.box(w, 0.04, d, color, { y: 0.03 }, 0.01);
  b.box(w - 0.3, 0.04, d - 0.3, '#fff8ef', { y: 0.045 }, 0.01);
  b.box(w - 0.45, 0.04, d - 0.45, color, { y: 0.06 }, 0.01);
  const m = b.mesh({ shadow: false });
  m.receiveShadow = true;
  return m;
}

export function lampPost() {
  const b = new Builder();
  b.cyl(0.07, 0.1, 3.0, '#3d4a5c', { y: 1.5 });
  b.cyl(0.18, 0.22, 0.12, '#3d4a5c', { y: 0.06 });
  b.cyl(0.24, 0.12, 0.2, '#3d4a5c', { y: 3.2 });
  const g = group(b.mesh());
  const l = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), glowMat('#fff3c4'));
  l.position.y = 3.02;
  g.add(l);
  return g;
}

export function tree(r = 1, seed = 0) {
  const b = new Builder();
  b.cyl(0.14, 0.2, 1.2, '#8a5a3c', { y: 0.6 });
  const greens = ['#6cbd61', '#5fa85a', '#82cf74'];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + seed;
    b.sphere(0.5, greens[i % 3], { x: Math.cos(a) * 0.45, y: 1.6 + (i % 2) * 0.3, z: Math.sin(a) * 0.45 });
  }
  b.sphere(0.6, greens[1], { y: 2.2 });
  if (seed % 2 > 1) for (let i = 0; i < 5; i++) b.sphere(0.07, '#ff8fab', { x: Math.cos(i * 1.3) * 0.7, y: 1.7 + (i % 3) * 0.3, z: Math.sin(i * 1.3) * 0.7 });
  const m = b.mesh();
  m.scale.setScalar(r);
  return m;
}

export function bench() {
  const b = new Builder();
  b.box(1.6, 0.08, 0.45, WOOD, { y: 0.45 }, 0.02);
  b.box(1.6, 0.35, 0.06, WOOD, { y: 0.75, z: -0.2 }, 0.02);
  for (const x of [-0.7, 0.7]) b.box(0.08, 0.45, 0.4, '#3d4a5c', { x, y: 0.22 }, 0.02);
  return b.mesh();
}

export function flowerBox(w = 2) {
  const b = new Builder();
  b.box(w, 0.4, 0.45, WOOD_D, { y: 0.2 }, 0.04);
  const cols = ['#ff8fab', '#ffd66b', '#b18cf2', '#ffffff', '#ff9f5a'];
  for (let i = 0; i < w * 4; i++) {
    b.sphere(0.12, '#6cbd61', { x: -w / 2 + 0.15 + i * 0.25, y: 0.45, z: (i % 2) * 0.1 - 0.05 });
    b.sphere(0.07, cols[i % cols.length], { x: -w / 2 + 0.15 + i * 0.25, y: 0.56, z: (i % 2) * 0.1 });
  }
  return b.mesh();
}

export function awning(w, color, stripe = '#ffffff') {
  const b = new Builder();
  const n = Math.max(4, Math.round(w / 0.6));
  for (let i = 0; i < n; i++) {
    b.box(w / n, 0.06, 1.3, i % 2 ? stripe : color, { x: -w / 2 + (i + 0.5) * w / n, rx: 0.35 }, 0.01);
    b.cyl(w / n / 2, w / n / 2, 0.06, i % 2 ? stripe : color, { x: -w / 2 + (i + 0.5) * w / n, y: -0.22, z: 0.62, rx: Math.PI / 2, sy: 1 }, 10);
  }
  return b.mesh();
}

export function car(color = '#7cc6f2') {
  const b = new Builder();
  b.box(2.2, 0.6, 1.1, color, { y: 0.55 }, 0.25);
  b.box(1.3, 0.5, 1.0, color, { y: 1.05, x: -0.1 }, 0.22);
  b.box(1.2, 0.36, 1.02, '#d8f1ff', { y: 1.07, x: -0.1 }, 0.15);
  for (const [x, z] of [[-0.7, 0.55], [0.7, 0.55], [-0.7, -0.55], [0.7, -0.55]]) b.cyl(0.25, 0.25, 0.18, '#2f2f3a', { x, y: 0.25, z, rx: Math.PI / 2 });
  b.sphere(0.09, '#fff3c4', { x: 1.1, y: 0.6, z: 0.35 });
  b.sphere(0.09, '#fff3c4', { x: 1.1, y: 0.6, z: -0.35 });
  return b.mesh();
}

/* ── workstations (one per role) ───────────────────────────────────────── */

export function stove() {
  const b = new Builder();
  b.box(1.3, 0.85, 0.85, STEEL, { y: 0.43 }, 0.05);
  b.flat(1.2, 0.04, 0.8, '#2f2f3a', { y: 0.87 });
  for (const x of [-0.3, 0.3]) for (const z of [-0.18, 0.18]) b.torus(0.12, 0.02, '#4a4a55', { x, y: 0.9, z, rx: Math.PI / 2 });
  for (let i = 0; i < 4; i++) b.cyl(0.04, 0.04, 0.05, RED, { x: -0.45 + i * 0.3, y: 0.6, z: 0.44, rx: Math.PI / 2 });
  b.cyl(0.2, 0.18, 0.2, '#b8c4cc', { x: -0.3, y: 1.0, z: -0.18 });
  b.cyl(0.18, 0.16, 0.05, '#3a3a44', { x: 0.3, y: 0.93, z: 0.18 });
  b.flat(0.25, 0.03, 0.04, INK, { x: 0.55, y: 0.94, z: 0.18 });
  const g = group(b.mesh());
  const flames = [];
  for (const [x, z] of [[-0.3, -0.18], [0.3, 0.18], [0.3, -0.18]]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 6), glowMat('#ff8a3d'));
    f.position.set(x, 0.98, z);
    if (x === -0.3) f.position.y = 0.9;
    g.add(f); flames.push(f);
  }
  return ticking(g, (dt, t) => flames.forEach((f, i) => { f.scale.y = 0.6 + Math.abs(Math.sin(t * 9 + i * 2)) * 0.6; f.scale.x = f.scale.z = 0.8 + Math.sin(t * 13 + i) * 0.15; }));
}

export function fryer() {
  const b = new Builder();
  b.box(1.0, 0.95, 0.8, STEEL, { y: 0.48 }, 0.05);
  b.flat(0.8, 0.05, 0.6, '#e9a23b', { y: 0.93 });
  b.box(0.32, 0.12, 0.26, STEEL_D, { x: -0.2, y: 1.0, z: 0.0 }, 0.01);
  b.box(0.32, 0.12, 0.26, STEEL_D, { x: 0.2, y: 1.0, z: 0.0 }, 0.01);
  b.flat(0.04, 0.04, 0.3, INK, { x: -0.2, y: 1.06, z: 0.25 });
  b.flat(0.04, 0.04, 0.3, INK, { x: 0.2, y: 1.06, z: 0.25 });
  b.box(0.25, 0.12, 0.02, '#2b2d42', { y: 0.7, z: 0.41 }, 0.01);
  const g = group(b.mesh());
  const bubbles = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), glowMat('#ffd27a'));
    s.position.set(-0.3 + (i % 3) * 0.3, 0.97, -0.15 + Math.floor(i / 3) * 0.3);
    g.add(s); bubbles.push(s);
  }
  return ticking(g, (dt, t) => bubbles.forEach((s, i) => { s.scale.setScalar(0.5 + Math.abs(Math.sin(t * 7 + i * 1.7))); }));
}

export function oven() {
  const b = new Builder();
  b.box(1.2, 1.25, 0.9, '#e8d5c4', { y: 0.62 }, 0.08);
  b.box(0.9, 0.55, 0.05, '#4a3b36', { y: 0.6, z: 0.45 }, 0.04);
  b.flat(0.6, 0.04, 0.06, STEEL_D, { y: 0.95, z: 0.47 });
  b.box(1.0, 0.18, 0.05, '#f2a65a', { y: 1.08, z: 0.45 }, 0.03);
  b.box(1.3, 0.08, 0.95, '#f7efe5', { y: 1.28 }, 0.03);
  for (let i = 0; i < 3; i++) b.torus(0.1, 0.04, '#e9a23b', { x: -0.35 + i * 0.35, y: 1.36, rx: Math.PI / 2 }, Math.PI * 1.3);
  const g = group(b.mesh());
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.38), glowMat('#ffb36b'));
  glow.position.set(0, 0.6, 0.48);
  g.add(glow);
  return ticking(g, (dt, t) => { glow.material.color.setHSL(0.07, 1, 0.6 + Math.sin(t * 2) * 0.06); });
}

export function prepTable() {
  const b = new Builder();
  b.box(1.5, 0.85, 0.8, STEEL, { y: 0.43 }, 0.04);
  b.box(1.56, 0.06, 0.86, '#e3e9ee', { y: 0.88 }, 0.02);
  b.box(0.6, 0.05, 0.4, '#d9a066', { x: -0.3, y: 0.94 }, 0.02);
  b.sphere(0.07, '#e63946', { x: -0.4, y: 1.0 });
  b.sphere(0.06, '#8ac926', { x: -0.2, y: 0.99, z: 0.1 });
  b.cyl(0.12, 0.1, 0.18, '#ffffff', { x: 0.4, y: 1.0 });
  b.flat(0.16, 0.22, 0.01, '#fff1d6', { x: 0.15, y: 0.92, z: 0.25, rx: -Math.PI / 2 });
  return b.mesh();
}

export function plating() {
  const b = new Builder();
  b.box(1.5, 0.85, 0.8, STEEL, { y: 0.43 }, 0.04);
  b.box(1.56, 0.06, 0.86, '#e3e9ee', { y: 0.88 }, 0.02);
  for (let i = 0; i < 3; i++) {
    b.cyl(0.15, 0.13, 0.03, WHITE, { x: -0.45 + i * 0.45, y: 0.93 });
    b.sphere(0.06, ['#e07a5f', '#81b29a', '#f2cc8f'][i], { x: -0.45 + i * 0.45, y: 0.97, sy: 0.6 });
  }
  b.cyl(0.03, 0.03, 0.2, '#ffd23f', { x: 0.6, y: 1.0, z: -0.25 });
  return b.mesh();
}

export function swingStation() {
  const b = new Builder();
  b.box(1.3, 0.85, 0.8, STEEL, { y: 0.43 }, 0.04);
  b.box(1.36, 0.06, 0.86, '#e3e9ee', { y: 0.88 }, 0.02);
  b.cyl(0.16, 0.15, 0.08, '#3a3a44', { x: -0.3, y: 0.95 });
  b.cyl(0.13, 0.11, 0.16, '#b8c4cc', { x: 0.3, y: 1.0 });
  b.flat(0.03, 0.4, 0.03, INK, { x: 0.5, y: 1.1, z: -0.3 });
  b.box(0.3, 0.3, 0.05, '#f2a65a', { x: 0.0, y: 1.25, z: -0.38 }, 0.03);
  return b.mesh();
}

export function barTaps() {
  const b = new Builder();
  b.box(1.4, 0.15, 0.4, '#3b2f2f', { y: 0.98, z: -0.05 }, 0.03);
  for (let i = 0; i < 4; i++) {
    b.cyl(0.03, 0.03, 0.25, '#d4a017', { x: -0.45 + i * 0.3, y: 1.18 });
    b.box(0.07, 0.18, 0.07, ['#e85d75', '#4fbfa8', '#ffd66b', '#b18cf2'][i], { x: -0.45 + i * 0.3, y: 1.38 }, 0.02);
  }
  b.cyl(0.06, 0.05, 0.14, '#e9f5ff', { x: 0.55, y: 0.97, z: 0.2 });
  b.cyl(0.06, 0.05, 0.14, '#e9f5ff', { x: -0.6, y: 0.97, z: 0.2 });
  return b.mesh();
}

export function espresso() {
  const b = new Builder();
  b.box(0.9, 0.55, 0.5, '#b23a48', { y: 1.17 }, 0.08);
  b.box(0.92, 0.08, 0.52, STEEL, { y: 1.47 }, 0.03);
  for (const x of [-0.2, 0.2]) { b.cyl(0.05, 0.05, 0.12, STEEL_D, { x, y: 0.98, z: 0.22 }); b.flat(0.1, 0.03, 0.15, INK, { x, y: 1.0, z: 0.32 }); }
  b.cyl(0.06, 0.05, 0.1, WHITE, { x: -0.2, y: 0.95, z: 0.25 });
  b.sphere(0.07, '#d9dee3', { x: 0.35, y: 1.25, z: 0.26 });
  for (let i = 0; i < 4; i++) b.cyl(0.05, 0.04, 0.09, i % 2 ? WHITE : '#ffd66b', { x: -0.3 + i * 0.18, y: 1.55 });
  const g = group(b.mesh());
  const steam = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }));
    s.material.userData.outlineParameters = { visible: false };
    g.add(s); steam.push(s);
  }
  return ticking(g, (dt, t) => steam.forEach((s, i) => {
    const p = (t * 0.6 + i / 3) % 1;
    s.position.set(-0.2 + Math.sin(t * 2 + i) * 0.04, 1.05 + p * 0.5, 0.25);
    s.scale.setScalar(0.6 + p * 1.6);
    s.material.opacity = 0.6 * (1 - p);
  }));
}

export function register() {
  const b = new Builder();
  b.box(0.6, 0.25, 0.45, '#5a6e8c', { y: 1.05 }, 0.05);
  b.box(0.45, 0.3, 0.06, '#2b2d42', { y: 1.35, z: -0.05, rx: -0.3 }, 0.03);
  b.box(0.5, 0.1, 0.35, '#e3e9ee', { y: 0.95, z: 0.05 }, 0.02);
  for (let i = 0; i < 6; i++) b.flat(0.07, 0.025, 0.07, '#ffd66b', { x: -0.15 + (i % 3) * 0.15, y: 1.19, z: 0.05 + Math.floor(i / 3) * 0.12 });
  b.box(0.18, 0.12, 0.18, '#ffd23f', { x: 0.45, y: 0.98 }, 0.03);
  const g = group(b.mesh());
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.2), glowMat('#8ef0d0'));
  screen.position.set(0, 1.37, 0.0); screen.rotation.x = -0.3;
  g.add(screen);
  return g;
}

export function serverStation() {
  const b = new Builder();
  b.box(0.9, 1.0, 0.55, WOOD_D, { y: 0.5 }, 0.05);
  b.box(0.95, 0.05, 0.6, WOOD_L, { y: 1.02 }, 0.02);
  b.box(0.35, 0.25, 0.05, '#2b2d42', { y: 1.2, z: -0.1, rx: -0.2 }, 0.02);
  for (let i = 0; i < 5; i++) b.cyl(0.13, 0.11, 0.02, WHITE, { x: 0.25, y: 1.05 + i * 0.025, z: 0.1 });
  b.cyl(0.05, 0.05, 0.15, '#81b29a', { x: -0.3, y: 1.1, z: 0.12 });
  const g = group(b.mesh());
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.18), glowMat('#9fd8ff'));
  screen.position.set(0, 1.21, -0.07); screen.rotation.x = -0.2;
  g.add(screen);
  return g;
}

export function busStation() {
  const b = new Builder();
  b.box(0.9, 0.08, 0.55, STEEL, { y: 0.8 }, 0.02);
  b.box(0.9, 0.08, 0.55, STEEL, { y: 0.35 }, 0.02);
  for (const [x, z] of [[-0.4, -0.23], [0.4, -0.23], [-0.4, 0.23], [0.4, 0.23]]) b.cyl(0.025, 0.025, 0.8, STEEL_D, { x, y: 0.4, z });
  b.box(0.6, 0.18, 0.42, '#6c7a89', { y: 0.93 }, 0.03);
  b.cyl(0.12, 0.1, 0.02, WHITE, { x: -0.1, y: 1.03 });
  b.box(0.6, 0.18, 0.42, '#6c7a89', { y: 0.48 }, 0.03);
  for (const [x, z] of [[-0.35, -0.2], [0.35, -0.2], [-0.35, 0.2], [0.35, 0.2]]) b.sphere(0.05, INK, { x, y: 0.05, z });
  return b.mesh();
}

export function hostStand() {
  const b = new Builder();
  b.box(0.7, 1.05, 0.5, '#6d55a3', { y: 0.52 }, 0.06);
  b.box(0.8, 0.06, 0.55, WOOD_L, { y: 1.08, rx: -0.15 }, 0.02);
  b.flat(0.3, 0.4, 0.02, '#ffd23f', { y: 0.6, z: 0.26 });
  b.flat(0.35, 0.02, 0.4, '#ffffff', { y: 1.13, rx: -0.15 });
  b.cyl(0.04, 0.04, 0.2, '#cfe8ff', { x: 0.25, y: 1.2 });
  b.sphere(0.06, PINK, { x: 0.25, y: 1.32 });
  return b.mesh();
}

export function potSink() {
  const b = new Builder();
  b.box(1.5, 0.9, 0.85, STEEL, { y: 0.45 }, 0.05);
  b.box(1.2, 0.08, 0.6, '#9fc9e0', { y: 0.88 }, 0.02);
  b.cyl(0.03, 0.03, 0.5, STEEL_D, { y: 1.15, z: -0.35 });
  b.torus(0.15, 0.025, STEEL_D, { y: 1.4, z: -0.22, rx: 0 }, Math.PI);
  b.cyl(0.18, 0.16, 0.16, '#3a3a44', { x: 0.35, y: 0.98 });
  b.cyl(0.16, 0.14, 0.14, '#b87333', { x: -0.35, y: 0.97, rz: 0.4 });
  const g = group(b.mesh());
  return withSuds(g, 1.0, 0.95);
}

export function dishSink() {
  const b = new Builder();
  b.box(1.5, 0.9, 0.85, STEEL, { y: 0.45 }, 0.05);
  b.box(1.2, 0.08, 0.6, '#9fc9e0', { y: 0.88 }, 0.02);
  b.cyl(0.03, 0.03, 0.5, STEEL_D, { y: 1.15, z: -0.35 });
  b.torus(0.15, 0.025, STEEL_D, { y: 1.4, z: -0.22 }, Math.PI);
  // drying rack
  b.box(0.5, 0.06, 0.4, STEEL_D, { x: 0.95, y: 1.0 }, 0.01);
  for (let i = 0; i < 5; i++) b.cyl(0.14, 0.14, 0.02, WHITE, { x: 0.8 + i * 0.07, y: 1.15, rz: Math.PI / 2 });
  const g = group(b.mesh());
  return withSuds(g, 1.0, 0.95);
}

function withSuds(g, w, y) {
  const suds = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshToonMaterial({ color: '#ffffff', transparent: true, opacity: 0.92 }));
    s.material.userData.outlineParameters = { visible: false };
    s.position.set(-0.4 + (i % 5) * 0.2, y, -0.15 + Math.floor(i / 5) * 0.25);
    g.add(s); suds.push(s);
  }
  return ticking(g, (dt, t) => suds.forEach((s, i) => {
    s.scale.setScalar(0.7 + Math.abs(Math.sin(t * 1.6 + i * 0.9)) * 0.7);
    s.position.y = y + Math.abs(Math.sin(t * 1.2 + i)) * 0.06;
  }));
}

export function crates() {
  const b = new Builder();
  const fruit = ['#e63946', '#8ac926', '#ff9f1c', '#ffd23f', '#a4133c'];
  for (let i = 0; i < 3; i++) {
    const x = -0.5 + i * 0.5, y = i === 1 ? 0.45 : 0.16;
    b.box(0.48, 0.32, 0.4, '#c9a27a', { x: i === 1 ? 0 : x, y, z: 0 }, 0.02);
    for (let j = 0; j < 4; j++) b.sphere(0.07, fruit[(i + j) % fruit.length], { x: (i === 1 ? 0 : x) - 0.12 + j * 0.08, y: y + 0.18, z: (j % 2) * 0.1 - 0.05 });
  }
  b.box(0.5, 0.6, 0.45, '#8ecae6', { x: 0.75, y: 0.3 }, 0.04);
  b.flat(0.3, 0.06, 0.02, '#ffffff', { x: 0.75, y: 0.45, z: 0.23 });
  return b.mesh();
}

export function managerDesk() {
  const b = new Builder();
  b.box(0.9, 0.08, 0.5, WOOD_L, { y: 1.05 }, 0.02);
  b.cyl(0.04, 0.05, 1.0, WOOD_D, { y: 0.5 });
  b.cyl(0.25, 0.28, 0.04, WOOD_D, { y: 0.02 });
  b.flat(0.3, 0.38, 0.02, '#fff7b3', { x: -0.2, y: 1.09, rx: -Math.PI / 2 + 0.05 });
  b.cyl(0.06, 0.05, 0.1, WHITE, { x: 0.25, y: 1.14 });
  b.box(0.18, 0.12, 0.02, '#ffd23f', { x: 0.1, y: 1.2, z: -0.18 }, 0.01);
  return b.mesh();
}

/* ── equipment that IS the struct ──────────────────────────────────────── */

export function freezer() {
  const b = new Builder();
  b.box(1.4, 1.0, 0.85, '#e9f5ff', { y: 0.5 }, 0.1);
  b.box(1.42, 0.12, 0.87, '#a8dadc', { y: 1.02 }, 0.04);
  b.flat(0.5, 0.06, 0.05, STEEL_D, { y: 0.85, z: 0.44 });
  b.box(0.4, 0.25, 0.02, '#ffffff', { x: 0.35, y: 0.55, z: 0.43 }, 0.02);
  b.sphere(0.06, '#5aa9e6', { x: -0.5, y: 0.75, z: 0.43, sz: 0.3 });
  // frost & a padlock: recipes are safe
  b.box(0.16, 0.16, 0.06, '#d4a017', { x: 0, y: 0.68, z: 0.46 }, 0.03);
  b.torus(0.06, 0.018, '#b8b8b8', { y: 0.78, z: 0.46 }, Math.PI);
  for (let i = 0; i < 5; i++) b.sphere(0.05, '#ffffff', { x: -0.6 + i * 0.3, y: 1.1, z: 0.3 - (i % 2) * 0.4, sy: 0.4 });
  return b.mesh();
}

export function luckyCat() {
  const g = new THREE.Group();
  const b = new Builder();
  b.box(0.7, 0.3, 0.6, '#c0392b', { y: 0.15 }, 0.06);
  b.box(0.72, 0.05, 0.62, '#ffd23f', { y: 0.31 }, 0.02);
  b.capsule(0.27, 0.15, '#ffffff', { y: 0.68 });
  b.sphere(0.27, '#ffffff', { y: 1.1 });
  b.cone(0.09, 0.15, '#ffffff', { x: 0.16, y: 1.33, rz: -0.3 }, 4);
  b.cone(0.09, 0.15, '#ffffff', { x: -0.16, y: 1.33, rz: 0.3 }, 4);
  b.cone(0.05, 0.08, '#ff9eb0', { x: 0.16, y: 1.33, z: 0.04, rz: -0.3 }, 4);
  b.cone(0.05, 0.08, '#ff9eb0', { x: -0.16, y: 1.33, z: 0.04, rz: 0.3 }, 4);
  b.sphere(0.06, '#ffd23f', { y: 0.6, z: 0.24 });
  b.torus(0.17, 0.03, '#e8505b', { y: 0.86, rx: Math.PI / 2 + 0.2 });
  b.box(0.22, 0.28, 0.06, '#ffd23f', { x: -0.17, y: 0.62, z: 0.2, rz: 0.2 }, 0.05);
  for (const s of [-1, 1]) { b.torus(0.04, 0.012, '#2b2024', { x: s * 0.09, y: 1.12, z: 0.25 }, Math.PI); }
  b.sphere(0.04, '#ff9eb0', { y: 1.06, z: 0.27 });
  b.sphere(0.045, '#ff9eb0', { x: 0.17, y: 1.04, z: 0.2, sz: 0.4 });
  b.sphere(0.045, '#ff9eb0', { x: -0.17, y: 1.04, z: 0.2, sz: 0.4 });
  g.add(b.mesh());
  const arm = new THREE.Group();
  arm.position.set(0.24, 0.92, 0.05);
  const ab = new Builder();
  ab.capsule(0.08, 0.22, '#ffffff', { y: 0.16 });
  ab.sphere(0.1, '#ffffff', { y: 0.32 });
  arm.add(ab.mesh());
  g.add(arm);
  return ticking(g, (dt, t) => { arm.rotation.x = -0.2 + Math.sin(t * 3.2) * 0.55; });
}

export function softServe() {
  const g = new THREE.Group();
  const b = new Builder();
  b.box(0.9, 1.3, 0.7, '#ffd1dc', { y: 0.65 }, 0.12);
  b.box(0.92, 0.25, 0.72, '#ffffff', { y: 1.4 }, 0.08);
  b.cyl(0.08, 0.06, 0.22, STEEL, { y: 0.95, z: 0.36 });
  b.cyl(0.08, 0.06, 0.22, STEEL, { x: -0.25, y: 0.95, z: 0.36 });
  b.flat(0.03, 0.2, 0.03, '#e8505b', { y: 1.15, z: 0.42, rx: 0.4 });
  b.box(0.7, 0.05, 0.3, STEEL_D, { y: 0.5, z: 0.3 }, 0.01);
  // giant cone on top
  b.cone(0.16, 0.36, '#e0a96d', { y: 1.72, rx: Math.PI });
  b.sphere(0.2, '#fff4f7', { y: 1.95 });
  b.sphere(0.15, '#ffc8dd', { y: 2.12 });
  b.cone(0.09, 0.18, '#fff4f7', { y: 2.28 });
  g.add(b.mesh());
  const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 6, 14), new THREE.MeshToonMaterial({ color: '#ffc8dd' }));
  swirl.position.set(0, 0.74, 0.36);
  swirl.rotation.x = Math.PI / 2;
  g.add(swirl);
  return ticking(g, (dt, t) => { swirl.rotation.z = t * 3; swirl.scale.setScalar(0.7 + Math.abs(Math.sin(t * 1.5)) * 0.4); });
}

export function poleSign(name = 'EAT!', color = '#ff7a8a') {
  const g = new THREE.Group();
  const b = new Builder();
  b.cyl(0.08, 0.1, 3.2, '#3d4a5c', { y: 1.6 });
  b.cyl(0.35, 0.4, 0.2, '#3d4a5c', { y: 0.1 });
  b.box(1.8, 1.0, 0.3, color, { y: 3.6 }, 0.12);
  b.box(1.6, 0.8, 0.32, '#fff7e8', { y: 3.6 }, 0.08);
  g.add(b.mesh());
  const tex = textTexture(name, { w: 512, h: 256, bg: null, fg: color, font: '700 120px Fredoka, system-ui, sans-serif' });
  for (const z of [0.17, -0.17]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.material.userData.outlineParameters = { visible: false };
    m.position.set(0, 3.6, z);
    if (z < 0) m.rotation.y = Math.PI;
    g.add(m);
  }
  const bulbs = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16;
    let x, y;
    if (a < 0.25) { x = -0.9 + a * 4 * 1.8; y = 4.1; } else if (a < 0.5) { x = 0.9; y = 4.1 - (a - 0.25) * 4 * 1.0; } else if (a < 0.75) { x = 0.9 - (a - 0.5) * 4 * 1.8; y = 3.1; } else { x = -0.9; y = 3.1 + (a - 0.75) * 4 * 1.0; }
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 4), glowMat('#ffe08a'));
    l.material = l.material.clone();
    l.position.set(x, y, 0.17);
    g.add(l); bulbs.push(l);
  }
  return ticking(g, (dt, t) => bulbs.forEach((l, i) => { l.material.color.set(((Math.floor(t * 4) + i) % 3 === 0) ? '#fff6c8' : '#e0a030'); }));
}

export function spinnerSpot() {
  const b = new Builder();
  b.cyl(0.5, 0.55, 0.06, '#f2a65a', { y: 0.03 });
  b.cyl(0.08, 0.08, 0.4, '#e8505b', { x: 0.7, y: 0.2 });
  b.cone(0.15, 0.4, '#ff7a3d', { x: 0.7, y: 0.2 }, 8);
  b.flat(0.02, 0.4, 0.02, '#ffffff', { x: 0.7, y: 0.25 });
  return b.mesh();
}

export function ringLight() {
  const g = new THREE.Group();
  const b = new Builder();
  b.cyl(0.03, 0.03, 1.6, INK, { y: 0.8 });
  for (let i = 0; i < 3; i++) b.cyl(0.015, 0.015, 0.6, INK, { x: Math.cos(i * 2.1) * 0.25, y: 0.12, z: Math.sin(i * 2.1) * 0.25, rz: Math.cos(i * 2.1) * 0.6, rx: -Math.sin(i * 2.1) * 0.6 });
  g.add(b.mesh());
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 8, 24), glowMat('#fff6fb'));
  ring.position.y = 1.75;
  g.add(ring);
  return g;
}

/** The cardboard box someone onboards in (or a delivery crate for equipment). */
export function onboardingBox(equipment = false) {
  const b = new Builder();
  if (equipment) {
    b.box(1.0, 0.9, 0.9, '#d9b48f', { y: 0.45 }, 0.03);
    for (const y of [0.15, 0.75]) b.flat(1.02, 0.08, 0.92, '#b58a5e', { y });
    b.flat(0.5, 0.18, 0.02, '#e8505b', { y: 0.45, z: 0.46 });
  } else {
    b.box(0.8, 0.7, 0.7, '#e5c9a3', { y: 0.35 }, 0.03);
    b.flat(0.82, 0.1, 0.1, '#ff8fab', { y: 0.55 });
    b.flat(0.1, 0.72, 0.72, '#ff8fab', { y: 0.36 });
    b.sphere(0.12, '#ff8fab', { y: 0.75, sx: 1.5, sy: 0.7 });
  }
  return b.mesh();
}

export const STATION_PROPS = {
  managerDesk, barTaps, espresso, register, busStation, hostStand, serverStation,
  fryer, stove, oven, potSink, dishSink, crates, prepTable, plating, swingStation,
  freezer, luckyCat, softServe, poleSign, spinnerSpot, ringLight,
};

/** Equipment structs are the prop itself (no critter). */
export const PROP_IS_STRUCT = new Set(['freezer', 'luckyCat', 'softServe', 'poleSign']);

export { VC };
