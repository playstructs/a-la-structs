/**
 * Little things that get carried, served and thrown: plates, cups, crates,
 * clipboards, phones… Built once per kind and shared.
 */
import * as THREE from 'three';
import { Builder, VC, glowMat } from './toon.js';

const cache = new Map();
const W = '#fbfaf5', CREAM = '#fff1d6', BROWN = '#8a5a3c', DARK = '#3b2f2f';

const BUILDERS = {
  plate(b) { b.cyl(0.13, 0.11, 0.025, W, { y: 0 }); b.sphere(0.06, '#e07a5f', { y: 0.035, sy: 0.6 }); b.sphere(0.035, '#81b29a', { x: 0.05, y: 0.04, sy: 0.6 }); },
  cleanPlate(b) { for (let i = 0; i < 4; i++) b.cyl(0.13, 0.11, 0.022, i % 2 ? '#eef6ff' : W, { y: i * 0.025 }); b.sphere(0.02, '#ffffff', { x: 0.06, y: 0.11 }); },
  steak(b) { b.cyl(0.13, 0.11, 0.025, W); b.box(0.13, 0.04, 0.09, '#8d4a2b', { y: 0.035, ry: 0.4 }, 0.02); b.sphere(0.025, '#6a994e', { x: 0.07, y: 0.04 }); },
  cocktail(b) { b.cyl(0.01, 0.01, 0.1, '#e9f5ff', { y: 0.05 }); b.cone(0.08, 0.08, '#ff7aa2', { y: 0.13, rx: Math.PI }); b.sphere(0.02, '#a8e063', { x: 0.05, y: 0.17 }); b.cyl(0.05, 0.05, 0.01, '#e9f5ff', { y: 0 }); },
  coffee(b) { b.cyl(0.06, 0.05, 0.1, W, { y: 0.05 }); b.cyl(0.055, 0.055, 0.01, '#8a5a3c', { y: 0.1 }); b.torus(0.03, 0.012, W, { x: 0.065, y: 0.055, ry: Math.PI / 2 }); },
  cup(b) { b.cyl(0.055, 0.045, 0.12, '#ffffff', { y: 0.06 }); b.cyl(0.058, 0.058, 0.03, '#2f7d5a', { y: 0.06 }); b.cyl(0.05, 0.055, 0.02, '#ffffff', { y: 0.13 }); },
  receipt(b) { b.flat(0.1, 0.16, 0.005, W, { y: 0.08 }); for (let i = 0; i < 4; i++) b.flat(0.07, 0.008, 0.007, '#aaa', { y: 0.04 + i * 0.03 }); },
  napkin(b) { b.box(0.14, 0.03, 0.14, W, { ry: 0.6 }, 0.01); },
  pudding(b) { b.cyl(0.07, 0.09, 0.08, '#ffd166', { y: 0.04 }); b.cyl(0.07, 0.07, 0.02, '#8b4513', { y: 0.085 }); b.sphere(0.02, '#e63946', { y: 0.11 }); b.cyl(0.11, 0.1, 0.015, W); },
  fries(b) { b.box(0.11, 0.1, 0.07, '#e63946', { y: 0.05 }, 0.01); for (let i = 0; i < 7; i++) b.flat(0.016, 0.1, 0.016, '#ffd23f', { x: -0.04 + i * 0.013, y: 0.12, rz: (i - 3) * 0.08 }); },
  croissant(b) { b.torus(0.06, 0.035, '#e9a23b', { rx: Math.PI / 2 }, Math.PI * 1.2); b.sphere(0.04, '#f2b45a', { y: 0, x: 0.0, z: -0.04 }); },
  pot(b) { b.cyl(0.11, 0.1, 0.12, '#b8c4cc', { y: 0.06 }); b.flat(0.12, 0.02, 0.03, DARK, { x: 0.15, y: 0.1 }); b.sphere(0.03, '#ffffff', { y: 0.13, x: 0.03 }); },
  spoon(b) { b.flat(0.015, 0.16, 0.01, '#d9dee3', { y: 0.08 }); b.sphere(0.035, '#d9dee3', { y: 0.17, sz: 0.4 }); },
  crate(b) { b.box(0.26, 0.16, 0.18, '#c9a27a', { y: 0.08 }, 0.015); b.sphere(0.04, '#e63946', { x: -0.06, y: 0.17 }); b.sphere(0.04, '#8ac926', { x: 0.03, y: 0.17 }); b.sphere(0.035, '#ff9f1c', { x: 0.08, y: 0.17, z: 0.03 }); },
  cake(b) { b.cyl(0.11, 0.1, 0.015, W); b.box(0.12, 0.08, 0.1, '#ffd1dc', { y: 0.05 }, 0.02); b.box(0.12, 0.02, 0.1, '#ffffff', { y: 0.1 }, 0.01); b.sphere(0.022, '#e63946', { y: 0.125 }); },
  clipboard(b) { b.flat(0.16, 0.22, 0.012, BROWN, { y: 0.11 }); b.flat(0.13, 0.17, 0.014, W, { y: 0.1 }); b.flat(0.06, 0.03, 0.02, '#c0c0c0', { y: 0.21 }); },
  notepad(b) { b.flat(0.1, 0.13, 0.015, '#fff7b3', { y: 0.065 }); b.flat(0.1, 0.02, 0.02, '#e85d75', { y: 0.135 }); },
  notebook(b) { b.flat(0.12, 0.15, 0.03, '#3a2e39', { y: 0.075 }); b.flat(0.012, 0.15, 0.032, '#c9184a', { x: -0.045, y: 0.075 }); },
  phone(b) { b.box(0.07, 0.13, 0.015, '#2b2d42', { y: 0.065 }, 0.012); },
  arrowSign(b) {
    b.flat(0.03, 0.5, 0.03, '#8a5a3c', { y: 0.0 });
    b.box(0.7, 0.2, 0.03, '#ffd23f', { y: 0.32, x: 0.18 }, 0.03);
    b.cone(0.16, 0.22, '#ffd23f', { x: 0.62, y: 0.32, rz: -Math.PI / 2 }, 3);
    b.flat(0.5, 0.05, 0.035, '#e63946', { x: 0.14, y: 0.32 });
  },
  sponge(b) { b.box(0.1, 0.05, 0.07, '#ffe066', { y: 0.025 }, 0.015); b.box(0.1, 0.02, 0.07, '#43aa8b', { y: 0.06 }, 0.008); },
  rollingPin(b) { b.cyl(0.03, 0.03, 0.26, '#e0b98a', { rz: Math.PI / 2 }); b.cyl(0.015, 0.015, 0.42, '#c69c6d', { rz: Math.PI / 2 }); },
  spatula(b) { b.flat(0.015, 0.18, 0.015, DARK, { y: 0.09 }); b.flat(0.07, 0.09, 0.01, '#c0c7cc', { y: 0.2 }); },
  whisk(b) { b.flat(0.02, 0.1, 0.02, DARK, { y: 0.05 }); b.sphere(0.045, '#d9dee3', { y: 0.15, sy: 1.4 }); },
  pan(b) { b.cyl(0.11, 0.1, 0.03, '#3a3a44', { y: 0.015 }); b.flat(0.16, 0.02, 0.03, DARK, { x: 0.17, y: 0.02 }); b.sphere(0.04, '#f4a261', { y: 0.04, sy: 0.5 }); },
  basket(b) { b.box(0.16, 0.08, 0.12, '#c0c7cc', { y: 0.04 }, 0.01); b.flat(0.18, 0.02, 0.02, DARK, { x: 0.15, y: 0.06 }); for (let i = 0; i < 5; i++) b.flat(0.015, 0.06, 0.015, '#ffd23f', { x: -0.05 + i * 0.025, y: 0.09 }); },
  tub(b) { b.box(0.3, 0.12, 0.2, '#6c7a89', { y: 0.06 }, 0.02); b.cyl(0.08, 0.07, 0.01, W, { y: 0.13, x: -0.05 }); b.cyl(0.03, 0.03, 0.08, '#e9f5ff', { y: 0.15, x: 0.07 }); },
  menus(b) { b.flat(0.14, 0.2, 0.03, '#6d55a3', { y: 0.1 }); b.flat(0.1, 0.03, 0.035, '#ffd23f', { y: 0.15 }); },
  shaker(b) { b.cyl(0.04, 0.045, 0.14, '#d9dee3', { y: 0.07 }); b.cyl(0.03, 0.04, 0.05, '#c0c7cc', { y: 0.165 }); },
  cone(b) { b.cone(0.04, 0.12, '#e0a96d', { y: 0.06, rx: Math.PI }); b.sphere(0.05, '#ffc8dd', { y: 0.14 }); b.sphere(0.035, '#ffffff', { y: 0.19 }); },
  fork(b) { b.flat(0.014, 0.16, 0.01, '#d9dee3', { y: 0.08 }); for (let i = -1; i <= 1; i++) b.flat(0.008, 0.05, 0.008, '#d9dee3', { x: i * 0.015, y: 0.18 }); },
  broom(b) { b.flat(0.02, 0.7, 0.02, '#c69c6d', { y: 0.2 }); b.box(0.16, 0.14, 0.05, '#e9c46a', { y: -0.18 }, 0.02); },
  box(b) { b.box(0.32, 0.22, 0.24, '#c9a27a', { y: 0.11 }, 0.01); b.flat(0.33, 0.03, 0.05, '#e5c9a3', { y: 0.2 }); b.sphere(0.05, '#ffffff', { x: -0.06, y: 0.24 }); b.cyl(0.03, 0.02, 0.12, '#4caf50', { x: 0.07, y: 0.28 }); },
  recipe(b) { b.flat(0.16, 0.2, 0.01, '#fff1d6', { y: 0.1 }); b.flat(0.12, 0.02, 0.012, '#e85d75', { y: 0.17 }); for (let i = 0; i < 3; i++) b.flat(0.1, 0.01, 0.012, '#b08968', { y: 0.12 - i * 0.03 }); },
  coin(b) { b.cyl(0.07, 0.07, 0.02, '#ffd23f', { rx: Math.PI / 2 }); b.cyl(0.05, 0.05, 0.024, '#f4b400', { rx: Math.PI / 2 }); },
};

/** A shared mesh for an item kind. Returns a fresh Mesh sharing geometry. */
export function itemMesh(kind) {
  if (!kind || !BUILDERS[kind]) return null;
  if (!cache.has(kind)) {
    const b = new Builder();
    BUILDERS[kind](b);
    cache.set(kind, b.geometry());
  }
  const m = new THREE.Mesh(cache.get(kind), VC());
  m.castShadow = true;
  m.name = 'item:' + kind;
  return m;
}

export const ITEM_KINDS = Object.keys(BUILDERS);

/** Things that glow (phone screens, ring light). */
export function phoneFlash() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), glowMat('#fffbe6'));
  m.visible = false;
  return m;
}
