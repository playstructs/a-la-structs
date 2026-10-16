/**
 * Pot Washer — "Elbow Grease". Rub the grime off each pot: drag the sponge
 * back and forth and the muck under it wears away with every stroke. Burnt-on
 * black spots take a lot more scrubbing. When the pot is spotless it slides
 * onto the clean rack (+1) and the next one comes off the dirty pile. The pile
 * keeps growing; let it get past six and it topples (−1).
 *
 * The grime is a little float field (how much muck is left at each spot)
 * painted into an offscreen canvas and stretched over the pot, so it wears
 * away smoothly along the sponge's path. (An 8-bit canvas erased with
 * destination-out can't take the tiny bites burnt-on spots need — the alpha
 * stops changing — so the field is the source of truth and the canvas is
 * just how it's drawn.)
 *
 * Drawn in the restaurant's 3D toon style: the field is a texture on the
 * pot's floor in a steel sink, laid so it covers the pot's square on screen
 * exactly; the pile and the clean rack are stacks of pots, the pot washer
 * scrubs at the sink. The meter, labels and notes are the 2D overlay.
 */
import { pointer, C, box, text, lerp, ease, clamp, Pops } from '../kit.js';
import { stage3d } from '../kit3d.js';
import { model, defineModel } from '../models.js';
import * as THREE from 'three';
import { Builder, toonMat } from '../../three/toon.js';

const N = 72;                     // grime field resolution across the pot
const SPONGE = 0.12;              // sponge radius, as a fraction of the pot size
const STAMP = 0.045;              // muck removed per stamp at the sponge's centre
const STEP = 4;                   // view units between stamps along a stroke
const HARD = 5.5;                 // burnt-on spots take this many times the scrubbing
const DONE = 0.95;                // clean enough
const PILE_MAX = 6;
const PILE_AFTER = 3;             // what's left standing after a topple

/** Pot shapes. inside(u, v) over the pot's unit square: where grime can be. */
const POTS = [
  { key: 'pan', name: 'Frying pan', inside: (u, v) => (u - 0.5) ** 2 + (v - 0.5) ** 2 < 0.44 ** 2, body: '#4b4f57', floor: '#6b7079', handle: 'long' },
  { key: 'stock', name: 'Stockpot', inside: (u, v) => (u - 0.5) ** 2 + (v - 0.5) ** 2 < 0.42 ** 2, body: '#b9c3cc', floor: '#dfe5ea', handle: 'ears' },
  { key: 'wok', name: 'Wok', inside: (u, v) => (u - 0.5) ** 2 + (v - 0.5) ** 2 < 0.46 ** 2, body: '#3d3a3a', floor: '#5d5856', handle: 'long' },
  { key: 'tray', name: 'Sheet tray', inside: (u, v) => u > 0.06 && u < 0.94 && v > 0.2 && v < 0.8, body: '#aeb8c2', floor: '#d5dce2', handle: 'none', rect: true },
  { key: 'sauce', name: 'Saucepan', inside: (u, v) => (u - 0.5) ** 2 + (v - 0.5) ** 2 < 0.36 ** 2, body: '#c98a5a', floor: '#e3b48c', handle: 'long' },
  { key: 'dish', name: 'Casserole', inside: (u, v) => u > 0.1 && u < 0.9 && v > 0.12 && v < 0.88 && !((u < 0.18 || u > 0.82) && (v < 0.2 || v > 0.8)), body: '#e9775f', floor: '#f4e6d8', handle: 'ears', rect: true },
];

/* ── 3D models ── */
const SCALE = 150;                // view units per metre
const SINK_H = 0.5;               // the water in the sink (m)
const STAND = 0.12;               // the pile cart and the clean rack (m)
const D_IN = 0.05;                // how deep the pot is inside, as a fraction of its size (shallow, so the front rim never hides grime)
const HANDLE = { sauce: '#5b3a29' };
const ROUND = { pan: 0.48, stock: 0.47, wok: 0.5, sauce: 0.41 };
const RECT = { tray: [0.96, 0.68], dish: [0.88, 0.84] };
/**
 * The pot in the sink, in pot units (its square is 1 × 1, floor at y = 0, centred): open walls (drawn
 * both sides, so the inside shows), a floor for the grime to sit on, a rim and handles. Plus a floor-shaped
 * patch for the spotless shine.
 */
const potCache = new Map();
function potParts(type) {
  if (potCache.has(type.key)) return potCache.get(type.key);
  const b = new Builder(), d = D_IN, below = 0.12, hc = HANDLE[type.key] || '#2b2b30';
  let shine, half;
  if (ROUND[type.key]) {
    const R = ROUND[type.key];
    b.geom(new THREE.CylinderGeometry(R, R * 0.93, d + below, 48, 1, true), type.body, { y: (d - below) / 2 });
    b.disc(R * 0.99, type.floor, {}, 48);
    b.geom(new THREE.TorusGeometry(R, 0.014, 6, 48), type.body, { y: d, rx: Math.PI / 2 });
    shine = new THREE.CircleGeometry(R * 0.97, 48).rotateX(-Math.PI / 2);
    half = R;
  } else {
    const [w, dz] = RECT[type.key], t = 0.02, hgt = d + below;
    for (const z of [-(dz / 2 - t / 2), dz / 2 - t / 2]) b.box(w, hgt, t, type.body, { y: (d - below) / 2, z }, 0.008);
    for (const x of [-(w / 2 - t / 2), w / 2 - t / 2]) b.box(t, hgt, dz, type.body, { y: (d - below) / 2, x }, 0.008);
    b.flat(w - 2 * t, 0.004, dz - 2 * t, type.floor, { y: -0.002 });
    shine = new THREE.PlaneGeometry(w - 2 * t, dz - 2 * t).rotateX(-Math.PI / 2);
    half = w / 2;
  }
  if (type.handle === 'long') b.box(0.26, 0.035, 0.08, hc, { x: half + 0.12, y: d + 0.004 }, 0.015);
  else if (type.handle === 'ears') for (const sx of [-1, 1]) b.geom(new THREE.TorusGeometry(0.06, 0.016, 6, 16), type.body, { x: sx * (half + 0.045), y: d, rx: Math.PI / 2 });
  const parts = { geo: b.geometry(), shine };
  potCache.set(type.key, parts);
  return parts;
}
/** Stacked pots (pile and rack): 1 across, 1 tall; the game scales them to the stack. */
for (const type of POTS) {
  defineModel(`potWasher:stack:${type.key}`, (b, o) => {
    const hc = HANDLE[type.key] || '#2b2b30', top = o.dirty ? '#8a5a2e' : type.floor;
    if (ROUND[type.key]) {
      b.cyl(0.5, 0.44, 0.82, type.body, { y: 0.41 });
      b.cyl(0.52, 0.52, 0.12, type.body, { y: 0.8 });
      b.cyl(0.43, 0.43, 0.02, top, { y: 0.865 });
    } else {
      b.box(1, 0.82, 0.8, type.body, { y: 0.41 }, 0.06);
      b.flat(0.88, 0.02, 0.66, top, { y: 0.825 });
    }
    if (type.handle === 'long') b.box(0.38, 0.14, 0.12, hc, { x: 0.66, y: 0.72 }, 0.04);
    else if (type.handle === 'ears') for (const sx of [-1, 1]) b.box(0.12, 0.14, 0.22, type.body, { x: sx * 0.55, y: 0.72 }, 0.04);
    if (o.dirty) for (let i = 0; i < 4; i++) b.sphere(0.1 + (i % 2) * 0.05, i % 2 ? '#5a3a22' : '#a0703f', { x: Math.cos(i * 1.9) * 0.22, y: 0.88, z: Math.sin(i * 1.9) * 0.2, sy: 0.25 });
  });
}
/** The sponge, 1 unit = the sponge radius: yellow foam with a green scouring pad on top. */
defineModel('potWasher:sponge', (b) => {
  b.box(1.9, 0.42, 1.24, '#ffd166', { y: 0.21 }, 0.12);
  b.box(1.9, 0.16, 1.24, '#5fc293', { y: 0.5 }, 0.06);
  for (let i = 0; i < 6; i++) b.sphere(0.07, '#e3a826', { x: -0.6 + (i % 3) * 0.6, y: 0.26, z: 0.63, sz: 0.4 });
});

export default function create(ctx) {
  const s3 = stage3d(ctx.el, { scale: SCALE, quality: ctx.quality });
  const st = s3.ui, view = s3.view, g = s3.g;
  let needBuild = true;            // the 3D set is (re)built on the next frame
  const pops = new Pops();
  const L = {};

  // grime
  const level = new Float32Array(N * N), burnt = new Uint8Array(N * N), tone = new Float32Array(N * N), mask = new Uint8Array(N * N);
  const off = document.createElement('canvas'); off.width = N; off.height = N;
  const og = off.getContext('2d');
  const img = og.createImageData(N, N);
  let total = 1, left = 1, clean = 0, painted = false, changed = false, measureT = 0;

  let pot = null;                 // { type, n, state: 'in'|'scrub'|'shine'|'out'|'none', t }
  let potsDone = 0, potNo = 0;
  let pile = 3, pileT = 0, wobble = 0, toppled = null;
  let rack = [];                  // pot types on the clean rack (last few)
  let sponge = null;              // { id, x, y, lx, ly }
  let spongeAt = null;
  let scrubSound = 0, moving = 0, suds = [], sparkles = [];
  let carry = 0;                  // stroke distance carried between stamps

  /* ── layout ─────────────────────────────────────────────────────────── */
  function layout() {
    const { W, H } = view;
    L.wide = W / H >= 1.2;
    const pad = 14;
    if (L.wide) {
      const side = clamp(W * 0.2, 120, 190);
      L.S = Math.min(H - 128, W - 2 * side - 2 * pad - 110);
      L.pot = { x: (W - L.S) / 2, y: 72 + (H - 72 - 34 - L.S) / 2, w: L.S, h: L.S };
      L.meter = { x: L.pot.x + L.S * 0.1, y: 22, w: L.S * 0.8, h: 18 };
      L.pile = { x: pad, y: 40, w: side, h: H - 54 };
      L.rack = { x: W - pad - side, y: 40, w: side, h: H - 54 };
    } else {
      const top = clamp(H * 0.22, 140, 190);
      L.pile = { x: pad, y: 12, w: (W - 3 * pad) / 2, h: top };
      L.rack = { x: L.pile.x + L.pile.w + pad, y: 12, w: L.pile.w, h: top };
      L.meter = { x: W * 0.12, y: top + 34, w: W * 0.76, h: 18 };
      L.S = Math.min(W - 96, H - top - 80 - 40);
      L.pot = { x: (W - L.S) / 2, y: top + 70 + (H - top - 70 - 20 - L.S) / 2, w: L.S, h: L.S };
    }
    L.sink = { x: L.pot.x - 22, y: L.pot.y - 22, w: L.S + 44, h: L.S + 44 };
    L.R = L.S * SPONGE;
    needBuild = true;
  }
  layout();
  view.onResize = layout;

  /* ── pots ───────────────────────────────────────────────────────────── */
  function noise(i) { const s = Math.sin(i * 12.9898 + potNo * 78.233) * 43758.5453; return s - Math.floor(s); }

  function newPot() {
    potNo++;
    const type = POTS[(potNo * 5 + Math.floor(Math.random() * 3)) % POTS.length];
    pot = { type, state: 'in', t: 0 };
    level.fill(0); burnt.fill(0);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      mask[k] = type.inside((i + 0.5) / N, (j + 0.5) / N) ? 1 : 0;
      tone[k] = clamp(0.5 + 0.3 * Math.sin(i * 0.31 + potNo * 1.7) * Math.cos(j * 0.27 + potNo * 2.3) + (noise(k) - 0.5) * 0.35, 0, 1);
    }
    // Greasy blobs, then a few burnt-on spots (more as the shift goes on).
    const hard = clamp(ctx.elapsed() / ctx.seconds, 0, 1);
    const blobs = 4 + Math.floor(Math.random() * 3) + Math.round(hard * 2);
    const inside = () => { for (let n = 0; n < 40; n++) { const u = 0.12 + Math.random() * 0.76, v = 0.12 + Math.random() * 0.76; if (type.inside(u, v)) return [u, v]; } return [0.5, 0.5]; };
    for (let b = 0; b < blobs; b++) {
      const [u, v] = inside(), r = 0.07 + Math.random() * 0.1;
      const lobes = [...Array(3)].map(() => [u + (Math.random() - 0.5) * r, v + (Math.random() - 0.5) * r, r * (0.55 + Math.random() * 0.45)]);
      stampBlob(lobes, 0);
    }
    const spots = (potNo <= 1 ? 1 : 1 + Math.floor(Math.random() * 2)) + Math.round(hard * 1.5);
    for (let b = 0; b < spots; b++) {
      const [u, v] = inside(), r = 0.045 + Math.random() * 0.04;
      stampBlob([[u, v, r], [u + (Math.random() - 0.5) * r, v + (Math.random() - 0.5) * r, r * 0.7]], 1);
    }
    total = 0;
    for (let k = 0; k < N * N; k++) { if (!mask[k]) level[k] = 0; total += level[k] * (burnt[k] ? 2 : 1); }
    total = Math.max(total, 1e-6);
    left = total; clean = 0; painted = false;
  }
  function stampBlob(lobes, isBurnt) {
    for (const [u, v, r] of lobes) {
      const i0 = Math.max(0, Math.floor((u - r) * N)), i1 = Math.min(N - 1, Math.ceil((u + r) * N));
      const j0 = Math.max(0, Math.floor((v - r) * N)), j1 = Math.min(N - 1, Math.ceil((v + r) * N));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * N + i, d = Math.hypot((i + 0.5) / N - u, (j + 0.5) / N - v) / r;
        if (d >= 1) continue;
        const a = clamp((1 - d) * 2.4 + (tone[k] - 0.5) * 0.5, 0, 1);
        if (isBurnt) { if (a > 0.1) { burnt[k] = 1; level[k] = Math.max(level[k] * (burnt[k] ? 1 : 0), Math.min(1, a * 1.6)); } }
        else if (!burnt[k]) level[k] = Math.max(level[k], a);
      }
    }
  }

  function measure() {
    let s = 0;
    for (let k = 0; k < N * N; k++) if (level[k] > 0) s += level[k] * (burnt[k] ? 2 : 1);
    left = s; clean = clamp(1 - left / total, 0, 1);
  }

  /* ── scrubbing ──────────────────────────────────────────────────────── */
  function stamp(x, y) {
    const u = (x - L.pot.x) / L.S, v = (y - L.pot.y) / L.S, r = SPONGE;
    if (u < -r || v < -r || u > 1 + r || v > 1 + r) return 0;
    const i0 = Math.max(0, Math.floor((u - r) * N)), i1 = Math.min(N - 1, Math.ceil((u + r) * N));
    const j0 = Math.max(0, Math.floor((v - r) * N)), j1 = Math.min(N - 1, Math.ceil((v + r) * N));
    let got = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * N + i;
      if (level[k] <= 0) continue;
      const d2 = (((i + 0.5) / N - u) ** 2 + ((j + 0.5) / N - v) ** 2) / (r * r);
      if (d2 >= 1) continue;
      const bite = STAMP * (1 - d2 * 0.7) / (burnt[k] ? HARD : 1);
      const was = level[k];
      level[k] = was - bite < 0.02 ? 0 : was - bite;
      got += was - level[k];
    }
    return got;
  }
  function scrub(ax, ay, bx, by) {
    if (!pot || pot.state !== 'scrub' || ctx.over) return;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.01) return;
    let got = 0, d = STEP - carry;
    for (; d <= len; d += STEP) got += stamp(lerp(ax, bx, d / len), lerp(ay, by, d / len));
    carry = len - (d - STEP);
    moving += len;
    if (got > 0) {
      painted = false; changed = true;
      if (Math.random() < Math.min(1, len / 30)) suds.push({ x: bx + (Math.random() - 0.5) * L.R, y: by + (Math.random() - 0.5) * L.R, r: 3 + Math.random() * 6, t: 0 });
    }
  }

  const offPointer = pointer(st, {
    down: (p) => {
      if (ctx.over || sponge) return;
      sponge = { id: p.id, x: p.x, y: p.y };
      spongeAt = { x: p.x, y: p.y };
      carry = 0;
    },
    move: (p) => {
      spongeAt = { x: p.x, y: p.y };
      if (!sponge || p.id !== sponge.id) return;
      scrub(sponge.x, sponge.y, p.x, p.y);
      sponge.x = p.x; sponge.y = p.y;
    },
    up: (p) => { if (sponge && p.id === sponge.id) sponge = null; },
  });

  /* ── update ─────────────────────────────────────────────────────────── */
  const pileGap = () => lerp(4.4, 3.0, clamp(ctx.elapsed() / ctx.seconds, 0, 1));
  function nextPot() {
    if (pile > 0) { pile--; newPot(); ctx.sfx.work('clank', { vol: 0.6 }); }
    else pot = null;
  }
  function step(dt) {
    // the dirty pile
    pileT += dt;
    if (pileT >= pileGap()) {
      pileT = 0;
      if (!pot) { newPot(); ctx.sfx.work('clank', { vol: 0.6 }); }
      else {
        pile++;
        ctx.sfx.work('clank', { vol: 0.35 });
        if (pile > PILE_MAX) {
          toppled = { t: 0, n: pile };
          pile = PILE_AFTER;
          ctx.add(-1);
          ctx.sfx.smash(6);
          pops.add('Crash! The pile toppled −1', L.pile.x + L.pile.w / 2, L.pile.y + L.pile.h * 0.4, C.berryD, 17);
          crew?.wobble(1);
        }
      }
    }
    wobble += dt * (pile >= PILE_MAX - 1 ? 9 : 3);
    if (toppled) { toppled.t += dt; if (toppled.t > 1.4) toppled = null; }

    if (pot) {
      pot.t += dt;
      if (pot.state === 'in' && pot.t > 0.35) { pot.state = 'scrub'; pot.t = 0; }
      else if (pot.state === 'scrub') {
        measureT -= dt;
        if (changed && measureT <= 0) { measure(); changed = false; measureT = 0.08; }
        if (clean >= DONE) {
          pot.state = 'shine'; pot.t = 0;
          ctx.sfx.satisfied();
          for (let i = 0; i < 9; i++) sparkles.push({ x: Math.random(), y: Math.random(), t: -i * 0.05 });
        }
      } else if (pot.state === 'shine') {
        // the last specks fade away
        for (let k = 0; k < N * N; k++) if (level[k] > 0) level[k] = Math.max(0, level[k] - dt * 2.5);
        painted = false;
        if (pot.t > 0.55) { pot.state = 'out'; pot.t = 0; ctx.sfx.work('whoosh', { dur: 0.4, vol: 0.6 }); }
      } else if (pot.state === 'out' && pot.t > 0.4) {
        potsDone++;
        ctx.add(1); ctx.sfx.good(Math.min(6, potsDone)); ctx.sfx.work('clank', { vol: 0.8 });
        rack.push(pot.type); if (rack.length > 8) rack.shift();
        pops.add('Spotless! +1', L.rack.x + L.rack.w / 2, L.rack.y + L.rack.h * 0.55, C.leafD, 18);
        crew?.hop(0.8);
        nextPot();
      }
    }
    // scrubbing sound while the sponge is moving over the pot
    scrubSound -= dt;
    if (moving > 18 && scrubSound <= 0 && pot?.state === 'scrub') { ctx.sfx.work('scrub', { dur: 0.22, vol: 0.55 }); scrubSound = 0.2; }
    moving = Math.max(0, moving - dt * 400);
    for (const s of suds) s.t += dt;
    suds = suds.filter((s) => s.t < 0.9);
    if (suds.length > 60) suds.splice(0, suds.length - 60);
    for (const s of sparkles) s.t += dt;
    sparkles = sparkles.filter((s) => s.t < 1);
  }

  /* ── drawing ────────────────────────────────────────────────────────── */
  function paint() {
    const d = img.data;
    for (let k = 0; k < N * N; k++) {
      const a = level[k], o = k * 4;
      if (a <= 0) { d[o + 3] = 0; continue; }
      if (burnt[k]) { d[o] = 40 + tone[k] * 18; d[o + 1] = 26 + tone[k] * 10; d[o + 2] = 18; d[o + 3] = 255 * Math.min(1, a * 1.15); }
      else { d[o] = 128 + tone[k] * 44; d[o + 1] = 84 + tone[k] * 30; d[o + 2] = 40 + tone[k] * 14; d[o + 3] = 255 * Math.min(0.95, a * 1.05); }
    }
    og.putImageData(img, 0, 0);
    painted = true;
  }

  /* ── 3D ─────────────────────────────────────────────────────────────── */
  const world = new THREE.Group();
  s3.add(world);
  const { sinE, cosE } = s3;
  const grimeTex = new THREE.CanvasTexture(off);
  grimeTex.colorSpace = THREE.SRGBColorSpace; grimeTex.generateMipmaps = false; grimeTex.minFilter = THREE.LinearFilter;
  const grimeMat = new THREE.MeshBasicMaterial({ map: grimeTex, transparent: true, depthWrite: false });
  grimeMat.userData.outlineParameters = { visible: false };
  const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
  shineMat.userData.outlineParameters = { visible: false };
  const unitPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  let potG = null, potKey = '', grimePlane = null, shinePlane = null, sponge3 = null, crew = null;
  const pileMeshes = [], rackMeshes = [], fallMeshes = [], sudsMeshes = [];
  let STK = null;                  // stack sizes (view units) for the pile and the rack
  let lastNow = performance.now(), frameDt = 0;

  function box3(w, h, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat({ color }));
    m.userData.ownGeometry = true; m.castShadow = m.receiveShadow = true;
    return m;
  }
  const deep = (units) => units / (SCALE * sinE);
  /** A box standing on the floor whose top covers view rect r at height h. */
  function slab(r, h, color, top) {
    const c = s3.at(r.x + r.w / 2, r.y + r.h / 2, h), g = new THREE.Group();
    const body = box3(r.w / SCALE, h, deep(r.h), color); body.position.set(c.x, h / 2, c.z); g.add(body);
    if (top) { const t = box3(r.w / SCALE + 0.02, 0.03, deep(r.h) + 0.02, top); t.position.set(c.x, h - 0.012, c.z); g.add(t); }
    return g;
  }

  /** The pot pit: the sink with its faucet, the dirty pile on a cart, the clean rack, the pot washer at the sink. */
  function build() {
    world.clear();
    pileMeshes.length = 0; rackMeshes.length = 0; fallMeshes.length = 0; sudsMeshes.length = 0; potG = null; potKey = '';
    const { H } = view;
    world.add(s3.floor('checker', { size: 0.45 }));
    // the sink: a steel cabinet full of soapy water, a rim round it
    const K = L.sink, out = { x: K.x - 12, y: K.y - 12, w: K.w + 24, h: K.h + 24 };
    world.add(slab(out, SINK_H - 0.01, '#9aa7b1'));
    const doors = Math.max(2, Math.round(out.w / 110)), dw = out.w / doors, front = s3.at(0, out.y + out.h, SINK_H).z;
    for (let d = 0; d < doors; d++) {
      const door = box3(dw / SCALE - 0.05, SINK_H - 0.12, 0.02, '#b7c2cc');
      door.position.set((out.x + d * dw + dw / 2) / SCALE, (SINK_H - 0.12) / 2 + 0.04, front + 0.01); world.add(door);
    }
    const water = new THREE.Mesh(unitPlane, toonMat({ color: '#a6d3ea' }));
    water.scale.set(K.w / SCALE, 1, deep(K.h)); water.position.copy(s3.at(K.x + K.w / 2, K.y + K.h / 2, SINK_H)); water.receiveShadow = true;
    world.add(water);
    const rimB = new Builder(), rw = out.w / SCALE, rd = deep(out.h), t = 12 / SCALE, td = deep(12);
    for (const z of [td / 2, rd - td / 2]) rimB.box(rw, 0.06, td, '#c9d3da', { x: rw / 2, y: 0.03, z }, 0.015);
    for (const x of [t / 2, rw - t / 2]) rimB.box(t, 0.06, rd, '#c9d3da', { x, y: 0.03, z: rd / 2 }, 0.015);
    // suds clinging round the edge of the water
    for (let i = 0; i < 26; i++) {
      const side = i % 4, f = (i * 0.618) % 1;
      const [x, z] = side === 0 ? [f * rw, td] : side === 1 ? [f * rw, rd - td] : side === 2 ? [t, f * rd] : [rw - t, f * rd];
      rimB.sphere(0.03 + 0.03 * ((i * 7) % 3) / 2, '#ffffff', { x, y: -0.005, z });
    }
    const rim = rimB.mesh({ receive: true }); rim.userData.ownGeometry = true;
    rim.position.copy(s3.at(out.x, out.y, SINK_H - 0.01)); world.add(rim);
    // faucet on the back rim
    const fx = L.wide ? K.x + K.w - 30 : K.x + K.w * 0.28, fb = s3.at(fx, out.y + 6, SINK_H + 0.05);
    const fau = new Builder();
    fau.cyl(0.035, 0.045, 0.32, '#9aa7b1', { y: 0.16 });
    fau.torus(0.1, 0.025, '#9aa7b1', { y: 0.32, z: 0.1, ry: Math.PI / 2 }, Math.PI);
    fau.cyl(0.03, 0.025, 0.06, '#7d8a96', { y: 0.29, z: 0.2 });
    fau.box(0.12, 0.04, 0.05, '#e8505b', { x: 0.09, y: 0.24 }, 0.015);
    const fm = fau.mesh(); fm.userData.ownGeometry = true; fm.position.copy(fb); world.add(fm);

    // the dirty pile sits on a cart, the clean rack on a wire shelf
    const P = L.pile, R = L.rack;
    world.add(slab(P, STAND, '#b08968', '#c9a27a'));
    world.add(slab(R, STAND, '#8e9ba8', '#c9d3da'));
    const rails = new Builder(), rrw = R.w / SCALE, rrd = deep(R.h);
    for (let i = 0; i <= 6; i++) rails.flat(rrw - 0.04, 0.02, 0.015, '#5c6670', { x: rrw / 2, y: 0.01, z: (i / 6) * (rrd - 0.04) + 0.02 });
    const rl = rails.mesh(); rl.userData.ownGeometry = true; rl.position.copy(s3.at(R.x, R.y, STAND)); world.add(rl);
    const room = P.h - 40, ph = Math.min(26, room / (PILE_MAX + 0.5));
    const rows = L.wide ? 4 : 2, cw = (R.w - 20) / 2, rph = Math.min(30, (R.h - 50) / (rows + 0.5));
    STK = { ph, pw: Math.min(P.w * 0.7, ph * 4.2), base: P.y + P.h - 14, rows, cw, rph, rpw: Math.min(cw * 0.85, rph * 3.4), rbase: R.y + R.h - 14 };

    // the sponge, and suds for it to leave behind
    sponge3 = new THREE.Group(); const sp = model('potWasher:sponge'); sp.rotation.y = 0.25; sponge3.add(sp); world.add(sponge3);
    const sg = new THREE.SphereGeometry(1, 8, 6), sm = toonMat({ color: '#ffffff', transparent: true, opacity: 0.9, outline: false });
    for (let i = 0; i < 60; i++) { const m = new THREE.Mesh(sg, sm); m.visible = false; world.add(m); sudsMeshes.push(m); }
    sudsMeshes[0].userData.ownGeometry = true;

    // the pot washer, at the sink
    if (crew) s3.dropCritter(crew);
    if (L.wide) {
      crew = s3.critter({ ...ctx.critter, scale: 0.78 });
      const gx = Math.max(P.x + P.w - 10, (P.x + P.w + out.x) / 2), p = s3.at(gx, L.pot.y + L.S * 0.62, 0);
      crew.setPosition(p.x, 0, p.z); crew.object.rotation.y = 1.0;
    } else {
      // behind the sink, far enough back to show over the rim (there's room under the meter)
      crew = s3.critter({ ...ctx.critter, scale: 0.95 });
      const back = clamp((out.y - L.meter.y - L.meter.h - 70) / (sinE * SCALE), 0.2, 0.9);
      const p = s3.under(K.x + K.w * 0.68, out.y - 2, SINK_H + 0.05);
      crew.setPosition(p.x, 0, p.z - back); crew.object.rotation.y = 0;
    }
    crew.targetHeading = crew.object.rotation.y;
  }

  /** The pot in the sink: built in pot units (1 = the pot's square), squashed in depth so it covers L.pot on screen exactly. */
  function syncPot() {
    const key = pot ? pot.type.key : '';
    if (key !== potKey) {
      potG?.removeFromParent(); potG = null; potKey = key;
      if (pot) {
        potG = new THREE.Group();
        const parts = potParts(pot.type);
        const m = new THREE.Mesh(parts.geo, toonMat({ side: THREE.DoubleSide })); m.castShadow = m.receiveShadow = true;
        grimePlane = new THREE.Mesh(unitPlane, grimeMat); grimePlane.position.y = 0.002; grimePlane.renderOrder = 2;
        shinePlane = new THREE.Mesh(parts.shine, shineMat); shinePlane.position.y = 0.004; shinePlane.renderOrder = 3;
        potG.add(m, grimePlane, shinePlane);
        world.add(potG);
      }
    }
    if (!pot) return;
    if (!painted) { paint(); grimeTex.needsUpdate = true; }
    let cx = L.pot.x + L.S / 2, cy = L.pot.y + L.S / 2, sc = 1, lift = 0;
    if (pot.state === 'in') {
      const e = ease(pot.t / 0.35);
      cx = lerp(L.pile.x + L.pile.w / 2, cx, e); cy = lerp(L.pile.y - L.S * 0.3 + L.S / 2, cy, e); lift = Math.sin(e * Math.PI) * 0.3; sc = lerp(0.5, 1, e);
    } else if (pot.state === 'out') {
      const e = ease(pot.t / 0.4);
      cx = lerp(cx, L.rack.x + L.rack.w / 2, e); cy = lerp(cy, L.rack.y + L.S / 2, e); sc = lerp(1, 0.3, e); lift = Math.sin(e * Math.PI) * 0.3;
    }
    const k = L.S / SCALE * sc;
    potG.position.copy(s3.at(cx, cy, SINK_H + 0.012)); potG.position.y += lift;
    potG.scale.set(k, k, k / sinE);
    shineMat.opacity = pot.state === 'shine' ? 0.5 * Math.sin(Math.PI * clamp(pot.t / 0.55, 0, 1)) : 0;
  }

  /** One pot in a stack (pile or rack): a mesh per slot, swapped when the pot type changes. */
  function stackPot(list, i, type, dirty) {
    const kind = `potWasher:stack:${type.key}`, opts = dirty ? { dirty: 1 } : {}, sig = kind + dirty;
    let m = list[i];
    if (!m || m.userData.sig !== sig) {
      m?.removeFromParent();
      m = model(kind, opts); m.userData.sig = sig; world.add(m); list[i] = m;
    }
    m.visible = true;
    return m;
  }
  function syncStacks() {
    const P = L.pile, hh = STK.ph / (cosE * SCALE), cx0 = P.x + P.w / 2;
    const shakeAmt = pile >= PILE_MAX ? 3 : pile >= PILE_MAX - 1 ? 1.5 : 0.4;
    let n = 0;
    for (let i = 0; i < pile; i++, n++) {
      const sway = Math.sin(wobble + i * 0.8) * shakeAmt * (i / PILE_MAX) * 2;
      const m = stackPot(pileMeshes, n, POTS[(i * 3 + 1) % POTS.length], true);
      const p = s3.under(cx0 + sway + ((i * 37) % 9 - 4), STK.base, STAND);
      m.position.set(p.x, STAND + i * hh, p.z); m.rotation.set(0, 0, -sway * 0.03);
      m.scale.set(STK.pw / SCALE, hh * 0.98, STK.pw / SCALE * 0.7);
    }
    // a topple: the top of the pile tips over and tumbles to the floor
    if (toppled) {
      const k = toppled.t;
      for (let i = 0; i < toppled.n - PILE_AFTER; i++, n++) {
        const m = stackPot(pileMeshes, n, POTS[(i * 2) % POTS.length], true), dir = i % 2 ? 1 : -1;
        const tip = Math.min(1, k / 0.25), fall = Math.max(0, k - 0.15);
        const x = cx0 + (i - 1.5) * 26 * fall * 2 + tip * (PILE_AFTER + i) * 6;
        const p = s3.under(x, STK.base, STAND);
        const h = Math.max(0, STAND + (PILE_AFTER + i) * hh - fall * fall * 500 / (cosE * SCALE));
        m.position.set(p.x, h, p.z + (h === 0 ? 0.1 + i * 0.05 : 0));
        m.rotation.set(0, 0, -tip * 0.5 + (h === 0 ? dir * 1.4 : fall * dir * 4));
        const s = k > 1.1 ? Math.max(0.01, 1 - (k - 1.1) / 0.3) : 1;
        m.scale.set(STK.pw / SCALE * s, hh * 0.98 * s, STK.pw / SCALE * 0.7 * s);
      }
    }
    for (let i = n; i < pileMeshes.length; i++) if (pileMeshes[i]) pileMeshes[i].visible = false;
    // the clean rack: two stacks of the last few pots
    const R = L.rack, show = rack.slice(-STK.rows * 2), rh = STK.rph / (cosE * SCALE);
    show.forEach((t, i) => {
      const m = stackPot(rackMeshes, i, t, false), col = i % 2, lvl = Math.floor(i / 2);
      const p = s3.under(R.x + 10 + col * STK.cw + STK.cw / 2, STK.rbase, STAND);
      m.position.set(p.x, STAND + 0.02 + lvl * rh, p.z); m.rotation.set(0, 0, 0);
      m.scale.set(STK.rpw / SCALE, rh * 0.98, STK.rpw / SCALE * 0.7);
    });
    for (let i = show.length; i < rackMeshes.length; i++) if (rackMeshes[i]) rackMeshes[i].visible = false;
  }

  function draw() {
    if (needBuild) { needBuild = false; build(); }
    const now = performance.now(); frameDt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
    const { W } = view;
    syncPot();
    syncStacks();
    // the sponge follows the pointer, pressed onto the pot while rubbing
    const sp = sponge || (spongeAt && !ctx.over ? spongeAt : null);
    sponge3.visible = !!sp;
    if (sp) {
      sponge3.position.copy(s3.at(sp.x, sp.y, SINK_H + 0.012 + (sponge ? 0.004 : 0.12)));
      const r = L.R / SCALE;
      sponge3.scale.set(r, r, r / sinE);
      sponge3.rotation.y = sponge ? Math.sin(now / 60) * Math.min(0.12, moving / 300) : 0;
    }
    if (crew) { const rub = !!sponge && moving > 5 && pot?.state === 'scrub'; if (rub && crew.gesture?.name !== 'scrub') crew.play('scrub', Infinity); else if (!rub && crew.gesture?.name === 'scrub') crew.gesture = null; }
    sudsMeshes.forEach((m, i) => {
      const s = suds[i]; m.visible = !!s;
      if (s) { m.position.copy(s3.at(s.x, s.y - s.t * 14, SINK_H + 0.03)); m.scale.setScalar(s.r * 0.8 * (1 + s.t * 0.5) * (1 - (s.t / 0.9) ** 3) / SCALE); }
    });
    s3.render();

    // 2D: labels, the danger line, the meter, sparkles, notes
    s3.begin2d();
    const P = L.pile, R = L.rack;
    text(g, `Dirty pile ${pile}/${PILE_MAX}`, P.x + P.w / 2, P.y + 15, { size: 13, color: pile >= PILE_MAX ? C.berryD : C.ink, weight: 800, stroke: '#fff' });
    const ly = STK.base - PILE_MAX * STK.ph;
    g.save(); g.setLineDash([6, 5]); g.strokeStyle = 'rgba(222,84,104,.75)'; g.lineWidth = 2; g.beginPath(); g.moveTo(P.x + 10, ly); g.lineTo(P.x + P.w - 10, ly); g.stroke(); g.restore();
    text(g, `Clean rack · ${potsDone}`, R.x + R.w / 2, R.y + 15, { size: 13, color: C.ink, weight: 800, stroke: '#fff' });
    const M = L.meter;
    box(g, M.x, M.y, M.w, M.h, { fill: '#fff', stroke: C.line, r: 9 });
    const k = pot && pot.state !== 'in' ? (pot.state === 'scrub' ? clean / DONE : 1) : 0;
    if (k > 0) box(g, M.x + 2, M.y + 2, (M.w - 4) * clamp(k, 0, 1), M.h - 4, { fill: k >= 1 ? C.leaf : C.sea, r: 7 });
    text(g, pot ? (pot.state === 'scrub' ? `${Math.floor(clamp(clean / DONE, 0, 1) * 100)}% clean` : 'Spotless!') : 'Waiting for a pot…', M.x + M.w / 2, M.y + M.h / 2 + 1, { size: 12, color: C.ink, weight: 800 });
    if (pot) { if (pot.state === 'scrub' && ctx.elapsed() < 1 && potNo === 1) text(g, pot.type.name, L.pot.x + L.S / 2, L.pot.y + L.S + 14, { size: 13, color: C.ink, weight: 700, stroke: '#fff' }); }
    else text(g, 'All clear! Next pot soon…', L.pot.x + L.S / 2, L.pot.y + L.S / 2, { size: 18, color: C.ink, weight: 700, stroke: '#fff' });
    for (const s of sparkles) if (s.t > 0) star(L.pot.x + s.x * L.S, L.pot.y + s.y * L.S - s.t * 20, 11 * (1 - s.t * 0.4), 1 - s.t);
    pops.draw(g);
    const e = ctx.elapsed();
    if (e < 6) text(g, 'Rub back and forth to scrub the grime off', W / 2, L.pot.y + L.S + (L.wide ? 10 : 22), { size: 15, color: C.ink, weight: 700, alpha: 1 - Math.max(0, e - 4) / 2, stroke: '#fff' });
  }
  /** A little four-point twinkle. */
  function star(x, y, r, alpha) {
    if (alpha <= 0) return;
    g.save(); g.globalAlpha = alpha; g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, d = i % 2 ? r * 0.32 : r; g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
    g.closePath(); g.fillStyle = '#fff6c2'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#e3a826'; g.stroke(); g.restore();
  }

  newPot();

  return {
    update(dt) { if (!ctx.over) step(dt); pops.update(dt); },
    draw,
    end() { sponge = null; },
    /** For automated play-tests: the pot, how clean it is, and where the muck is (8×8 blocks, view units). */
    peek() {
      const B = 8, cs = N / B, blocks = [];
      for (let bj = 0; bj < B; bj++) for (let bi = 0; bi < B; bi++) {
        let s = 0, hard = 0;
        for (let j = bj * cs; j < (bj + 1) * cs; j++) for (let i = bi * cs; i < (bi + 1) * cs; i++) { const k = j * N + i; s += level[k]; if (burnt[k] && level[k] > 0) hard++; }
        if (s > 0.05) blocks.push({ x: L.pot.x + (bi + 0.5) * L.S / B, y: L.pot.y + (bj + 0.5) * L.S / B, amt: s, hard });
      }
      return { view: { ...view }, L, pot: pot ? { key: pot.type.key, state: pot.state } : null, clean, pile, potsDone, blocks, R: L.R };
    },
    destroy() { offPointer(); grimeTex.dispose(); s3.destroy(); },
  };
}
