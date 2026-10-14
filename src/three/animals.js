/**
 * Critter builder. Big heads, small bodies, stubby limbs: everyone is about
 * 1.2 units tall and reads clearly from the overhead camera.
 *
 * buildCritter({ species, outfit, seed }) → { root, body, head, eyes, armL,
 * armR, legL, legR, tail, handL, handR, hat } — a small rig the Character
 * class animates procedurally.
 */
import * as THREE from 'three';
import { Builder, VC, blobShadow } from './toon.js';
import { rng } from '../lexicon/names.js';

const INK = '#2b2024';
const BLUSH = '#ff9eb0';

export const PALETTES = {
  cat: [
    { fur: '#f4b26b', belly: '#fff1dc', inner: '#ffb7b2', nose: '#ff8fa3', stripe: '#e08f45' },
    { fur: '#a3a3b3', belly: '#f4f4f8', inner: '#ffc2c7', nose: '#ff8fa3', stripe: '#7e7e90' },
    { fur: '#3e3a44', belly: '#f2f0f5', inner: '#ff9fb1', nose: '#ff8fa3' },
    { fur: '#fff6ea', belly: '#ffffff', inner: '#ffc2c7', nose: '#ff8fa3', patch: '#f4b26b' },
  ],
  dog: [
    { fur: '#d9a066', belly: '#fff3e0', inner: '#a8703d', nose: INK, ear: '#a8703d' },
    { fur: '#f4e3c3', belly: '#ffffff', inner: '#d8b98b', nose: INK, ear: '#c99b63' },
    { fur: '#8a5a3c', belly: '#e9cba7', inner: '#5e3b26', nose: INK, ear: '#5e3b26' },
    { fur: '#f7f7f2', belly: '#ffffff', inner: '#2e2a2e', nose: INK, ear: '#2e2a2e', patch: '#2e2a2e' },
  ],
  bunny: [
    { fur: '#ffffff', belly: '#fff5f8', inner: '#ffc2d1', nose: '#ff8fa3' },
    { fur: '#e9d3bf', belly: '#fff8ef', inner: '#ffc2d1', nose: '#ff8fa3' },
    { fur: '#c9c3d6', belly: '#f5f2fa', inner: '#ffc2d1', nose: '#ff8fa3' },
  ],
  bear: [
    { fur: '#a8754a', belly: '#e8c8a0', inner: '#7a5232', nose: INK },
    { fur: '#6e4a33', belly: '#c9a27a', inner: '#4a3122', nose: INK },
    { fur: '#f7f2ea', belly: '#ffffff', inner: '#e1d6c6', nose: INK },
  ],
  fox: [
    { fur: '#f08a3c', belly: '#fff6ea', inner: '#3a2a2a', nose: INK, tip: '#3a2a2a' },
    { fur: '#c9c3bd', belly: '#ffffff', inner: '#4a4048', nose: INK, tip: '#4a4048' },
  ],
  panda: [{ fur: '#fbfbf8', belly: '#ffffff', inner: '#26232a', nose: INK, dark: '#26232a' }],
  frog: [
    { fur: '#7cc96b', belly: '#e9f7c9', inner: '#5aa64b', nose: '#5aa64b' },
    { fur: '#56c3b4', belly: '#d9f7ef', inner: '#3a9d90', nose: '#3a9d90' },
  ],
  pig: [{ fur: '#ffb6c1', belly: '#ffd6dd', inner: '#f28ca0', nose: '#f28ca0' }, { fur: '#e8c4a8', belly: '#f6e2d0', inner: '#d39a7a', nose: '#d39a7a' }],
  duck: [{ fur: '#ffe066', belly: '#fff3b0', inner: '#ffb703', nose: '#ff9f1c' }, { fur: '#fbfbf8', belly: '#ffffff', inner: '#ffb703', nose: '#ff9f1c' }],
  raccoon: [{ fur: '#8d8c95', belly: '#e6e3ea', inner: '#3a3840', nose: INK, dark: '#3a3840' }],
  mouse: [{ fur: '#c8c2bc', belly: '#f3ece6', inner: '#ffb3c1', nose: '#ff8fa3' }, { fur: '#f3e9e0', belly: '#ffffff', inner: '#ffb3c1', nose: '#ff8fa3' }],
  koala: [{ fur: '#a9adb5', belly: '#eceef2', inner: '#f2f2f5', nose: '#3d3a44' }],
  sheep: [{ fur: '#fffaf0', belly: '#fffaf0', inner: '#4f4038', nose: '#3a2f2a', face: '#5a4a42' }, { fur: '#f2e6d8', belly: '#f2e6d8', inner: '#2f2725', nose: '#1f1a19', face: '#2f2725' }],
  penguin: [{ fur: '#2f3346', belly: '#ffffff', inner: '#2f3346', nose: '#ff9f1c' }],
  hamster: [{ fur: '#f2c38b', belly: '#fffaf2', inner: '#ffb3c1', nose: '#ff8fa3' }, { fur: '#d9b48f', belly: '#ffffff', inner: '#ffb3c1', nose: '#ff8fa3' }],
};

const HEAD_R = 0.31;
const HEAD_Y = 0.86;

export function paletteFor(species, seed) {
  const list = PALETTES[species] || PALETTES.cat;
  return list[Math.floor(rng(seed + ':pal')() * list.length)];
}

function buildHead(species, pal, outfit) {
  const b = new Builder();
  const R = HEAD_R;
  const face = pal.face || pal.fur;
  // skull
  if (species === 'sheep') {
    b.sphere(R * 0.9, face, { sy: 0.95, sz: 0.95 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      b.sphere(R * 0.36, pal.fur, { x: Math.cos(a) * R * 0.72, y: R * 0.45 + Math.sin(a * 2) * 0.03, z: Math.sin(a) * R * 0.62 - 0.04 });
    }
    b.sphere(R * 0.5, pal.fur, { y: R * 0.7 });
  } else if (species === 'frog') {
    b.sphere(R, pal.fur, { sy: 0.82, sx: 1.08 });
    b.sphere(R * 0.85, pal.belly, { y: -0.08, z: 0.06, sy: 0.55, sx: 1.0 });
  } else if (species === 'penguin') {
    b.sphere(R, pal.fur, { sy: 0.96 });
    b.sphere(R * 0.78, pal.belly, { z: 0.08, y: -0.03, sx: 1.05, sy: 0.85 });
  } else if (species === 'hamster') {
    b.sphere(R * 1.03, pal.fur, { sx: 1.1, sy: 0.92 });
    b.sphere(R * 0.75, pal.belly, { z: 0.1, y: -0.08, sx: 1.15, sy: 0.7 });
  } else {
    b.sphere(R, face, { sx: 1.04, sy: 0.94 });
  }

  // ears
  const earPair = (fn) => { fn(1); fn(-1); };
  switch (species) {
    case 'cat':
      earPair((s) => {
        b.cone(0.1, 0.2, pal.fur, { x: s * 0.17, y: 0.25, z: -0.02, rz: -s * 0.32 }, 4);
        b.cone(0.06, 0.13, pal.inner, { x: s * 0.165, y: 0.235, z: 0.03, rz: -s * 0.32 }, 4);
      });
      if (pal.stripe) for (let i = -1; i <= 1; i++) b.box(0.03, 0.09, 0.02, pal.stripe, { x: i * 0.06, y: 0.25, z: 0.1, rx: -0.6 }, 0.008);
      if (pal.patch) b.sphere(0.11, pal.patch, { x: 0.13, y: 0.13, z: 0.17, sz: 0.5 });
      break;
    case 'fox':
      earPair((s) => {
        b.cone(0.11, 0.24, pal.fur, { x: s * 0.17, y: 0.26, z: -0.03, rz: -s * 0.28 }, 4);
        b.cone(0.05, 0.08, pal.tip, { x: s * 0.215, y: 0.375, z: -0.03, rz: -s * 0.28 }, 4);
        b.cone(0.06, 0.14, pal.belly, { x: s * 0.165, y: 0.24, z: 0.02, rz: -s * 0.28 }, 4);
      });
      break;
    case 'dog':
      earPair((s) => b.sphere(0.13, pal.ear || pal.inner, { x: s * 0.28, y: 0.02, z: -0.02, sx: 0.42, sy: 1.15, sz: 0.75, rz: s * 0.25 }));
      if (pal.patch) b.sphere(0.12, pal.patch, { x: -0.13, y: 0.1, z: 0.17, sz: 0.5 });
      break;
    case 'pig':
      earPair((s) => b.cone(0.09, 0.15, pal.inner, { x: s * 0.18, y: 0.24, z: 0.04, rz: -s * 0.5, rx: 0.5 }, 3));
      break;
    case 'bunny':
      earPair((s) => {
        b.capsule(0.065, 0.3, pal.fur, { x: s * 0.1, y: 0.42, z: -0.03, rz: -s * 0.12 });
        b.capsule(0.035, 0.24, pal.inner, { x: s * 0.1, y: 0.42, z: 0.015, rz: -s * 0.12 });
      });
      break;
    case 'bear': case 'panda': case 'raccoon': case 'hamster':
      earPair((s) => {
        const r = species === 'hamster' ? 0.07 : 0.095;
        b.sphere(r, species === 'panda' ? pal.dark : pal.fur, { x: s * 0.21, y: 0.22, z: -0.02, sz: 0.6 });
        b.sphere(r * 0.6, species === 'panda' ? pal.dark : pal.inner, { x: s * 0.21, y: 0.22, z: 0.02, sz: 0.4 });
      });
      break;
    case 'mouse':
      earPair((s) => {
        b.sphere(0.15, pal.fur, { x: s * 0.24, y: 0.24, z: -0.03, sz: 0.35 });
        b.sphere(0.1, pal.inner, { x: s * 0.24, y: 0.24, z: 0.0, sz: 0.3 });
      });
      break;
    case 'koala':
      earPair((s) => {
        b.sphere(0.15, pal.fur, { x: s * 0.29, y: 0.16, z: -0.02, sz: 0.5 });
        b.sphere(0.1, pal.inner, { x: s * 0.29, y: 0.16, z: 0.03, sz: 0.4 });
      });
      break;
    case 'duck':
      b.sphere(0.05, pal.fur, { y: 0.32, z: 0.02 });
      b.sphere(0.04, pal.fur, { y: 0.34, z: -0.03, x: 0.03 });
      break;
    default: break;
  }

  // muzzle / beak / snout
  switch (species) {
    case 'duck': case 'penguin':
      b.sphere(0.11, pal.nose, { y: -0.06, z: 0.27, sx: 1.1, sy: 0.4, sz: 0.85 });
      break;
    case 'pig':
      b.cyl(0.09, 0.095, 0.07, pal.inner, { y: -0.06, z: 0.29, rx: Math.PI / 2 });
      b.sphere(0.018, '#b5616f', { x: -0.03, y: -0.06, z: 0.33 });
      b.sphere(0.018, '#b5616f', { x: 0.03, y: -0.06, z: 0.33 });
      break;
    case 'frog':
      b.torus(0.12, 0.012, '#3d6b33', { y: -0.09, z: 0.2, rx: Math.PI / 2 + 0.25 }, Math.PI);
      break;
    case 'fox':
      b.sphere(0.12, pal.belly, { y: -0.07, z: 0.24, sx: 1.15, sy: 0.75, sz: 1.0 });
      b.cone(0.07, 0.16, pal.belly, { y: -0.07, z: 0.33, rx: Math.PI / 2 });
      b.sphere(0.035, pal.nose, { y: -0.06, z: 0.41 });
      break;
    case 'sheep':
      b.sphere(0.09, '#e8dccb', { y: -0.08, z: 0.22, sx: 1.2, sy: 0.8 });
      b.sphere(0.025, pal.nose, { y: -0.05, z: 0.3 });
      break;
    case 'koala':
      b.sphere(0.075, pal.nose, { y: -0.03, z: 0.29, sx: 0.9, sy: 1.2, sz: 0.7 });
      break;
    case 'dog': case 'bear':
      b.sphere(0.13, pal.belly, { y: -0.08, z: 0.22, sx: 1.15, sy: 0.82 });
      b.sphere(0.05, pal.nose, { y: -0.03, z: 0.34, sx: 1.2, sy: 0.8 });
      break;
    case 'panda': case 'raccoon':
      b.sphere(0.11, pal.belly, { y: -0.08, z: 0.23, sx: 1.15, sy: 0.8 });
      b.sphere(0.04, pal.nose, { y: -0.04, z: 0.33, sx: 1.2, sy: 0.8 });
      break;
    case 'hamster': case 'mouse': case 'bunny': case 'cat':
      b.sphere(0.085, pal.belly, { x: -0.045, y: -0.08, z: 0.25, sy: 0.8 });
      b.sphere(0.085, pal.belly, { x: 0.045, y: -0.08, z: 0.25, sy: 0.8 });
      b.sphere(0.028, pal.nose, { y: -0.04, z: 0.31, sx: 1.3, sy: 0.9 });
      if (species === 'bunny') b.flat(0.05, 0.035, 0.01, '#ffffff', { y: -0.13, z: 0.3 });
      break;
    default: break;
  }

  // eye patches & masks (behind the eyes)
  if (species === 'panda') {
    b.sphere(0.075, pal.dark, { x: -0.11, y: 0.0, z: 0.215, sx: 0.9, sy: 1.2, sz: 0.5, rz: -0.5 });
    b.sphere(0.075, pal.dark, { x: 0.11, y: 0.0, z: 0.215, sx: 0.9, sy: 1.2, sz: 0.5, rz: 0.5 });
  }
  if (species === 'raccoon') b.sphere(0.2, pal.dark, { y: 0.01, z: 0.15, sx: 1.4, sy: 0.42, sz: 0.5 });
  if (species === 'frog') {
    b.sphere(0.1, pal.fur, { x: -0.13, y: 0.2, z: 0.1 });
    b.sphere(0.1, pal.fur, { x: 0.13, y: 0.2, z: 0.1 });
  }

  // cheeks
  if (!['penguin', 'sheep'].includes(species)) {
    b.sphere(0.05, BLUSH, { x: -0.19, y: -0.06, z: 0.21, sz: 0.4, sy: 0.7 });
    b.sphere(0.05, BLUSH, { x: 0.19, y: -0.06, z: 0.21, sz: 0.4, sy: 0.7 });
  }

  // mask for the germaphobe
  if (outfit.mask) b.box(0.26, 0.11, 0.06, '#e0fbfc', { y: -0.08, z: 0.28 }, 0.03);

  return b;
}

function buildEyes(species) {
  const b = new Builder();
  const frog = species === 'frog';
  const y = frog ? 0.22 : 0.02, z = frog ? 0.19 : 0.28, x = frog ? 0.13 : 0.11;
  for (const s of [-1, 1]) {
    b.sphere(0.042, INK, { x: s * x, y, z, sy: 1.25, sz: 0.6 }, 10);
    b.sphere(0.014, '#ffffff', { x: s * x + 0.012, y: y + 0.02, z: z + 0.024 }, 6);
  }
  return b;
}

function buildHat(outfit) {
  const b = new Builder();
  const c = outfit.hatColor || '#ffffff';
  const top = HEAD_R * 0.86;
  switch (outfit.hat) {
    case 'toque':
      b.cyl(0.2, 0.2, 0.22, c, { y: top + 0.08 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.sphere(0.11, c, { x: Math.cos(a) * 0.12, y: top + 0.25, z: Math.sin(a) * 0.12 }); }
      b.sphere(0.14, c, { y: top + 0.3 });
      break;
    case 'toqueShort':
      b.cyl(0.2, 0.2, 0.12, c, { y: top + 0.03 });
      b.sphere(0.21, c, { y: top + 0.12, sy: 0.55 });
      break;
    case 'skullcap': case 'hairnet':
      b.sphere(HEAD_R * 1.04, c, { y: 0.06, sy: 0.75, sz: 1.0 });
      break;
    case 'beanie':
      b.sphere(HEAD_R * 1.05, c, { y: 0.08, sy: 0.8 });
      b.cyl(HEAD_R * 1.06, HEAD_R * 1.06, 0.06, '#ffffff', { y: 0.06 });
      b.sphere(0.06, '#ffffff', { y: top + 0.17 });
      break;
    case 'paper':
      b.box(0.42, 0.14, 0.2, c, { y: top + 0.04, rx: 0 }, 0.02);
      b.cone(0.21, 0.13, c, { y: top + 0.17, sz: 0.45 }, 4);
      b.flat(0.43, 0.035, 0.205, '#e63946', { y: top + 0.0 });
      break;
    case 'baker':
      b.cyl(0.24, 0.2, 0.08, c, { y: top + 0.03 });
      b.sphere(0.25, c, { y: top + 0.12, sy: 0.45 });
      break;
    case 'beret':
      b.cyl(0.26, 0.24, 0.07, c, { y: top + 0.04, rz: 0.2, x: 0.03 });
      b.sphere(0.03, c, { y: top + 0.1, x: 0.05 });
      break;
    case 'visor':
      b.torus(HEAD_R * 0.98, 0.03, c, { y: 0.12, rx: Math.PI / 2 });
      b.cyl(0.17, 0.2, 0.02, c, { y: 0.11, z: 0.27, sx: 1.2, sz: 0.9 });
      break;
    case 'cap':
      b.sphere(HEAD_R * 1.03, c, { y: 0.07, sy: 0.72 });
      b.cyl(0.18, 0.19, 0.02, c, { y: 0.14, z: 0.26, sz: 0.85 });
      break;
    case 'capBack':
      b.sphere(HEAD_R * 1.03, c, { y: 0.07, sy: 0.72 });
      b.cyl(0.18, 0.19, 0.02, c, { y: 0.14, z: -0.26, sz: 0.85 });
      break;
    case 'bandana':
      b.sphere(HEAD_R * 1.04, c, { y: 0.07, sy: 0.7 });
      b.sphere(0.06, c, { y: 0.0, z: -0.3 });
      b.cone(0.05, 0.12, c, { y: -0.06, z: -0.33, rx: 0.6 }, 4);
      break;
    case 'fedora':
      b.cyl(0.35, 0.35, 0.02, c, { y: top + 0.0 });
      b.cyl(0.19, 0.22, 0.17, c, { y: top + 0.09 });
      b.cyl(0.225, 0.225, 0.04, '#c9184a', { y: top + 0.03 });
      break;
    default: return null;
  }
  return b;
}

function buildTorso(species, pal, o) {
  const b = new Builder();
  const shirt = o.shirt || '#9ad0ec';
  b.capsule(0.2, 0.16, shirt, { y: 0.38, sx: 1.05, sz: 0.92 });
  if (species === 'penguin' || species === 'duck') b.sphere(0.16, pal.belly, { y: 0.36, z: 0.09, sz: 0.6 });
  if (o.overalls) { b.capsule(0.205, 0.08, o.overalls, { y: 0.31, sz: 0.94 }); b.flat(0.05, 0.22, 0.02, o.overalls, { x: -0.1, y: 0.47, z: 0.17 }); b.flat(0.05, 0.22, 0.02, o.overalls, { x: 0.1, y: 0.47, z: 0.17 }); }
  if (o.blazer || o.lapel) {
    b.cone(0.07, 0.24, o.lapel || '#ffffff', { y: 0.46, z: 0.17, rx: Math.PI }, 3);
  }
  if (o.jacket) { b.capsule(0.212, 0.14, o.jacket, { y: 0.39, sz: 0.94 }); b.flat(0.12, 0.3, 0.05, shirt, { y: 0.4, z: 0.17 }); }
  if (o.vest) { b.capsule(0.206, 0.12, o.vest, { y: 0.39, sz: 0.93 }); b.cone(0.08, 0.2, shirt, { y: 0.48, z: 0.16, rx: Math.PI }, 3); }
  if (o.buttons) for (const y of [0.32, 0.4, 0.48]) { b.sphere(0.017, o.buttons, { x: -0.06, y, z: 0.19 }); b.sphere(0.017, o.buttons, { x: 0.06, y, z: 0.19 }); }
  if (o.trim) b.flat(0.36, 0.03, 0.4, o.trim, { y: 0.56 });
  if (o.apron) {
    if (o.apronStyle === 'full') {
      b.box(0.3, 0.36, 0.04, o.apron, { y: 0.34, z: 0.17 }, 0.03);
      b.flat(0.02, 0.12, 0.02, o.apron, { x: -0.1, y: 0.55, z: 0.13, rx: -0.3 });
      b.flat(0.02, 0.12, 0.02, o.apron, { x: 0.1, y: 0.55, z: 0.13, rx: -0.3 });
      b.box(0.14, 0.07, 0.02, o.apron, { y: 0.31, z: 0.195 }, 0.01);
    } else {
      b.box(0.36, 0.17, 0.04, o.apron, { y: 0.24, z: 0.16 }, 0.03);
    }
    b.torus(0.205, 0.015, o.apron, { y: 0.32, rx: Math.PI / 2 });
  }
  if (o.badge) b.box(0.07, 0.04, 0.02, '#ffd23f', { x: 0.09, y: 0.46, z: 0.18 }, 0.01);
  switch (o.neck) {
    case 'bowtie':
      b.cone(0.045, 0.07, o.neckColor, { x: -0.035, y: 0.56, z: 0.16, rz: Math.PI / 2 }, 4);
      b.cone(0.045, 0.07, o.neckColor, { x: 0.035, y: 0.56, z: 0.16, rz: -Math.PI / 2 }, 4);
      b.sphere(0.02, o.neckColor, { y: 0.56, z: 0.17 });
      break;
    case 'tie':
      b.box(0.05, 0.2, 0.02, o.neckColor, { y: 0.46, z: 0.18 }, 0.01);
      b.cone(0.032, 0.05, o.neckColor, { y: 0.34, z: 0.18, rx: Math.PI }, 4);
      break;
    case 'neckerchief':
      b.torus(0.14, 0.04, o.neckColor, { y: 0.56, rx: Math.PI / 2 });
      b.cone(0.06, 0.1, o.neckColor, { y: 0.51, z: 0.15, rx: Math.PI }, 3);
      break;
    case 'scarf':
      b.torus(0.15, 0.05, o.neckColor, { y: 0.56, rx: Math.PI / 2 });
      b.box(0.07, 0.18, 0.04, o.neckColor, { x: 0.07, y: 0.46, z: 0.17, rz: 0.15 }, 0.02);
      break;
    default: break;
  }
  return b;
}

function buildArm(pal, o) {
  const b = new Builder();
  b.capsule(0.062, 0.14, o.sleeves || o.shirt || pal.fur, { y: -0.1 });
  b.sphere(0.07, o.gloves || pal.fur, { y: -0.22 });
  return b;
}

function buildLeg(pal, o) {
  const b = new Builder();
  b.capsule(0.07, 0.06, o.pants || pal.fur, { y: -0.06 });
  b.sphere(0.08, pal.fur, { y: -0.15, z: 0.03, sy: 0.7, sz: 1.2 });
  return b;
}

function buildTail(species, pal) {
  const b = new Builder();
  switch (species) {
    case 'cat': case 'mouse': case 'raccoon':
      for (let i = 0; i < 6; i++) {
        const c = species === 'raccoon' && i % 2 ? pal.dark : pal.fur;
        b.sphere(species === 'mouse' ? 0.022 : 0.05, species === 'mouse' ? pal.inner : c, { y: i * 0.06, z: -Math.sin(i * 0.35) * 0.08 - i * 0.03 });
      }
      break;
    case 'fox':
      b.sphere(0.12, pal.fur, { y: 0.08, z: -0.1, sy: 1.5 });
      b.sphere(0.08, pal.belly, { y: 0.24, z: -0.16, sy: 1.2 });
      break;
    case 'dog': b.capsule(0.04, 0.12, pal.fur, { y: 0.06, z: -0.04, rx: -0.6 }); break;
    case 'pig': b.torus(0.04, 0.014, pal.inner, { y: 0.02, z: -0.04, ry: Math.PI / 2 }, Math.PI * 1.6); break;
    case 'bunny': case 'sheep': case 'bear': case 'panda': case 'koala': case 'hamster':
      b.sphere(species === 'bunny' ? 0.07 : 0.05, species === 'panda' ? pal.dark : pal.fur, { y: 0.0, z: -0.02 });
      break;
    case 'duck': case 'penguin': b.cone(0.07, 0.1, pal.fur, { y: 0, z: -0.04, rx: -1.2 }, 5); break;
    default: return null;
  }
  return b;
}

function buildGlasses(kind) {
  if (!kind) return null;
  const b = new Builder();
  const z = 0.285, y = 0.03;
  if (kind === 'sun') { b.box(0.13, 0.07, 0.02, '#1b1b22', { x: -0.08, y, z }, 0.02); b.box(0.13, 0.07, 0.02, '#1b1b22', { x: 0.08, y, z }, 0.02); b.flat(0.05, 0.015, 0.015, '#1b1b22', { y: y + 0.01, z }); }
  else if (kind === 'heart') { for (const s of [-1, 1]) { b.sphere(0.04, '#ff4d8d', { x: s * 0.1 - 0.02, y: y + 0.015, z, sz: 0.4 }); b.sphere(0.04, '#ff4d8d', { x: s * 0.1 + 0.02, y: y + 0.015, z, sz: 0.4 }); b.cone(0.055, 0.06, '#ff4d8d', { x: s * 0.1, y: y - 0.03, z, rx: Math.PI, sz: 0.35 }, 4); } }
  else if (kind === 'round') { b.torus(0.055, 0.009, '#5a3b2a', { x: -0.1, y, z }); b.torus(0.055, 0.009, '#5a3b2a', { x: 0.1, y, z }); b.flat(0.05, 0.01, 0.01, '#5a3b2a', { y, z }); }
  else if (kind === 'monocle') { b.torus(0.06, 0.01, '#d4a017', { x: 0.11, y, z: z + 0.005 }); b.flat(0.006, 0.2, 0.006, '#d4a017', { x: 0.17, y: y - 0.12, z: z - 0.02 }); }
  return b;
}

/**
 * @param {{species:string, outfit:object, seed:string, scale?:number}} opts
 */
export function buildCritter({ species = 'cat', outfit = {}, seed = 'x', scale = 1 }) {
  const pal = paletteFor(species, seed);
  const root = new THREE.Group();
  root.name = 'critter';
  const shadow = blobShadow(0.36);
  root.add(shadow);

  const body = new THREE.Group();
  root.add(body);
  const torso = buildTorso(species, pal, outfit).mesh();
  body.add(torso);

  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  body.add(head);
  head.add(buildHead(species, pal, outfit).mesh());
  const eyes = buildEyes(species).mesh({ shadow: false });
  const eyeY = species === 'frog' ? 0.22 : 0.02;
  eyes.geometry.translate(0, -eyeY, 0);
  eyes.position.y = eyeY;
  head.add(eyes);
  const hatB = buildHat(outfit);
  let hat = null;
  if (hatB) { hat = hatB.mesh(); head.add(hat); }
  const glasses = buildGlasses(outfit.glasses);
  if (glasses) head.add(glasses.mesh({ shadow: false }));

  const mkArm = (s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.215, 0.5, 0.0);
    g.add(buildArm(pal, outfit).mesh());
    const hand = new THREE.Object3D();
    hand.position.set(0, -0.24, 0.04);
    g.add(hand);
    body.add(g);
    return [g, hand];
  };
  const [armL, handL] = mkArm(1);
  const [armR, handR] = mkArm(-1);

  const mkLeg = (s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.1, 0.19, 0);
    g.add(buildLeg(pal, outfit).mesh());
    body.add(g);
    return g;
  };
  const legL = mkLeg(1), legR = mkLeg(-1);

  let tail = null;
  const tb = buildTail(species, pal);
  if (tb) {
    tail = new THREE.Group();
    tail.position.set(0, 0.26, -0.17);
    tail.add(tb.mesh());
    body.add(tail);
  }

  root.scale.setScalar(scale);
  return { root, body, torso, head, eyes, hat, armL, armR, legL, legR, tail, handL, handR, shadow, palette: pal };
}

export const CRITTER_HEIGHT = 1.25;
