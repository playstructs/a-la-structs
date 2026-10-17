/**
 * Dishwasher — "Rack & Roll". A packing puzzle: batches of dirty dishes land
 * in the bin, each with its own footprint (a cup is one cell, a plate stands
 * two tall, a bowl takes a 2×2 square…). Drag them into the rack — tap one to
 * turn it — and send the rack into the washer. A cycle takes a while; load
 * the next rack meanwhile. Score = dishes that come out clean before time's up.
 *
 * Wide screens: bin | rack | washer. Phones: washer on top, rack, bin below.
 * Drawn in the restaurant's 3D toon style: a wire rack and a bus tub on a
 * steel counter seen from above, a hood-type washer with the dishwasher by
 * it; the button, labels and the cycle readout are the 2D overlay.
 */
import { pointer, C, box, circle, text, lerp, ease, clamp, inRect, dist, Pops } from '../kit.js';
import { stage3d } from '../kit3d.js';
import { model, defineModel } from '../models.js';
import * as THREE from 'three';
import { Builder, toonMat, glowMat } from '../../three/toon.js';

const COLS = 5, ROWS = 5;
const BIN_SLOTS = 8;
const WASH = 8;                    // seconds per cycle
const KINDS = [
  // pts: what a dish is worth once washed — size, plus a bonus for the long and awkward ones
  { key: 'cup', ch: '☕', name: 'Cup', pts: 1, cells: [[0, 0]], w: 3, fill: '#ffdcbf', rim: '#e09a62' },
  { key: 'glass', ch: '🥛', name: 'Glass', pts: 1, cells: [[0, 0]], w: 3, fill: '#d3f0fd', rim: '#6cb8e0' },
  { key: 'cutlery', ch: '🍴', name: 'Cutlery', pts: 1, cells: [[0, 0]], w: 2, fill: '#e6ebf0', rim: '#8e9ba8' },
  { key: 'plate', ch: '🍽️', name: 'Plate', pts: 2, cells: [[0, 0], [0, 1]], w: 4, fill: '#ffffff', rim: '#c4ac94' },
  { key: 'tray', ch: '🍱', name: 'Tray', pts: 4, cells: [[0, 0], [0, 1], [0, 2]], w: 2, fill: '#ffe3a3', rim: '#e3a826' },
  { key: 'bowl', ch: '🥣', name: 'Bowl', pts: 5, cells: [[0, 0], [1, 0], [0, 1], [1, 1]], w: 2, fill: '#cdeedb', rim: '#4fb383' },
  { key: 'pan', ch: '🍳', name: 'Pan', pts: 5, cells: [[0, 0], [0, 1], [1, 1]], w: 2, fill: '#d9dee6', rim: '#6c7682' },
];
const BAG = KINDS.flatMap((k) => Array(k.w).fill(k));
const TAP = 9;                     // view units of wiggle that still count as a tap
const SCALE = 150;                 // view units per metre
const TOP = 0.42;                  // counter height (m)

/** Turn a footprint a quarter clockwise and shift it back to (0,0). */
function turn(cells) {
  const t = cells.map(([x, y]) => [-y, x]);
  const mx = Math.min(...t.map((c) => c[0])), my = Math.min(...t.map((c) => c[1]));
  return t.map(([x, y]) => [x - mx, y - my]);
}
const sizeOf = (cells) => ({ w: Math.max(...cells.map((c) => c[0])) + 1, h: Math.max(...cells.map((c) => c[1])) + 1 });

/* ── 3D models (cell units: one rack cell is 1 across; a dish is centred on its unturned footprint) ── */
const RACK_FLOOR = 0.05;           // dishes sit this high on the rack's wires (cells)
const MUCK = ['#a0703f', '#8c6034', '#c48a4a', '#7a5a3a'];
/** Bits of leftover food on a dirty dish; `o.dirty` picks one of a few arrangements. */
function muck(b, o, spots) {
  if (o.dirty == null) return;
  const v = o.dirty;
  spots.forEach(([x, y, z, r], i) => {
    if ((i + v) % 3 === 2) return;
    b.sphere(r, MUCK[(i + v) % MUCK.length], { x: x + (((v * 7 + i * 3) % 5) - 2) * 0.03, y, z: z + (((v * 5 + i * 2) % 5) - 2) * 0.03, sy: 0.3 });
  });
}
defineModel('dishwasher:rack', (b) => {
  const wire = '#55606b', rim = 0.16;
  for (const z of [0, ROWS]) b.box(COLS + 0.08, rim, 0.08, wire, { x: COLS / 2, y: rim / 2, z }, 0.03);
  for (const x of [0, COLS]) b.box(0.08, rim, ROWS + 0.08, wire, { x, y: rim / 2, z: ROWS / 2 }, 0.03);
  for (let j = 1; j < ROWS; j++) b.flat(COLS, 0.035, 0.035, wire, { x: COLS / 2, y: 0.03, z: j });
  for (let i = 1; i < COLS; i++) b.flat(0.035, 0.035, ROWS, wire, { x: i, y: 0.03, z: ROWS / 2 });
  // tines standing up round the frame
  for (let i = 0; i <= COLS; i++) for (const z of [0, ROWS]) b.cyl(0.03, 0.03, 0.3, wire, { x: i, y: 0.15, z });
  for (let j = 1; j < ROWS; j++) for (const x of [0, COLS]) b.cyl(0.03, 0.03, 0.3, wire, { x, y: 0.15, z: j });
});
defineModel('dishwasher:cup', (b, o) => {
  b.cyl(0.28, 0.22, 0.34, '#ffdcbf', { y: 0.17 });
  b.torus(0.27, 0.025, '#e09a62', { y: 0.34, rx: Math.PI / 2 });
  b.cyl(0.25, 0.25, 0.01, o.dirty == null ? '#fff3e8' : '#6b4226', { y: 0.335 });
  b.torus(0.09, 0.035, '#e09a62', { x: 0.31, y: 0.19 });
  muck(b, o, [[0.12, 0.345, 0.1, 0.06], [-0.1, 0.345, -0.08, 0.05], [0.05, 0.345, -0.14, 0.04]]);
});
defineModel('dishwasher:glass', (b, o) => {
  b.cyl(0.25, 0.2, 0.52, '#d3f0fd', { y: 0.26 });
  b.torus(0.245, 0.024, '#6cb8e0', { y: 0.52, rx: Math.PI / 2 });
  b.cyl(0.22, 0.22, 0.01, o.dirty == null ? '#eef9ff' : '#efe0bf', { y: 0.515 });
  muck(b, o, [[0.1, 0.52, 0.08, 0.05], [-0.12, 0.52, -0.02, 0.045], [0.0, 0.52, -0.14, 0.04]]);
});
defineModel('dishwasher:cutlery', (b, o) => {
  b.box(0.74, 0.3, 0.6, '#8e9ba8', { y: 0.15 }, 0.06);
  b.flat(0.64, 0.01, 0.5, '#4a5560', { y: 0.302 });
  const tools = [[-0.22, -0.12, 'f'], [-0.05, 0.12, 's'], [0.1, -0.1, 'k'], [0.24, 0.1, 'f'], [-0.22, 0.13, 's'], [0.25, -0.15, 's']];
  for (const [x, z, t] of tools) {
    b.flat(0.05, 0.32, 0.05, '#e6ebf0', { x, y: 0.44, z });
    if (t === 's') b.sphere(0.075, '#e6ebf0', { x, y: 0.62, z, sz: 0.55 });
    else if (t === 'f') { b.flat(0.12, 0.08, 0.035, '#e6ebf0', { x, y: 0.62, z }); for (const dx of [-0.045, 0, 0.045]) b.flat(0.02, 0.09, 0.02, '#e6ebf0', { x: x + dx, y: 0.7, z }); }
    else b.box(0.06, 0.18, 0.035, '#e6ebf0', { x, y: 0.66, z }, 0.015);
  }
  muck(b, o, [[-0.22, 0.66, -0.12, 0.05], [-0.05, 0.66, 0.12, 0.05], [0.24, 0.66, 0.1, 0.045]]);
});
defineModel('dishwasher:plate', (b, o) => {        // 1 × 2: an oval platter
  b.cyl(0.44, 0.36, 0.08, '#ffffff', { y: 0.04, sz: 2.05 });
  b.torus(0.4, 0.028, '#c4ac94', { y: 0.08, rx: Math.PI / 2, sy: 2.05 });
  b.cyl(0.32, 0.32, 0.01, '#f4efe8', { y: 0.081, sz: 2.1 });
  muck(b, o, [[0.1, 0.09, 0.3, 0.1], [-0.12, 0.09, -0.25, 0.08], [0.05, 0.09, -0.6, 0.07], [-0.08, 0.09, 0.62, 0.06]]);
});
defineModel('dishwasher:tray', (b, o) => {         // 1 × 3: a sectioned tray
  b.box(0.9, 0.03, 2.88, '#e3a826', { y: 0.015 }, 0.01);
  b.box(0.86, 0.1, 2.84, '#ffe3a3', { y: 0.06 }, 0.05);
  b.box(0.72, 0.02, 2.68, '#fff3d4', { y: 0.105 }, 0.01);
  for (const z of [-0.47, 0.47]) b.flat(0.74, 0.06, 0.05, '#e3a826', { y: 0.12, z });
  muck(b, o, [[0.1, 0.12, -1, 0.1], [-0.12, 0.12, 0.05, 0.09], [0.08, 0.12, 0.95, 0.08], [-0.15, 0.12, -0.8, 0.06], [0.15, 0.12, 0.3, 0.06]]);
});
defineModel('dishwasher:bowl', (b, o) => {         // 2 × 2: a deep serving bowl
  b.cyl(0.3, 0.36, 0.06, '#4fb383', { y: 0.03 });
  b.geom(new THREE.SphereGeometry(0.86, 22, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#cdeedb', { y: 0.56, sy: 0.62 });
  b.torus(0.85, 0.045, '#4fb383', { y: 0.56, rx: Math.PI / 2 });
  b.cyl(0.8, 0.62, 0.02, o.dirty == null ? '#eefaf3' : '#ecd2a4', { y: 0.5 });
  muck(b, o, [[0.25, 0.52, 0.2, 0.14], [-0.3, 0.52, -0.1, 0.12], [0.05, 0.52, -0.38, 0.1], [-0.15, 0.52, 0.4, 0.09]]);
});
defineModel('dishwasher:pan', (b, o) => {          // L of 3: the pan in the corner cell, its handle up one arm, its lid in the other
  const X = -0.5, Z = 0.5;
  b.cyl(0.47, 0.4, 0.14, '#6c7682', { x: X, z: Z, y: 0.07 });
  b.cyl(0.4, 0.4, 0.01, '#d9dee6', { x: X, z: Z, y: 0.141 });
  b.torus(0.455, 0.03, '#4b525c', { x: X, z: Z, y: 0.14, rx: Math.PI / 2 });
  b.box(0.13, 0.07, 0.74, '#2b2b30', { x: X, y: 0.12, z: -0.34 }, 0.03);
  b.geom(new THREE.SphereGeometry(0.37, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#9aa4ae', { x: 0.5, z: 0.5, sy: 0.45 });
  b.torus(0.36, 0.025, '#6c7682', { x: 0.5, z: 0.5, y: 0.01, rx: Math.PI / 2 });
  b.sphere(0.07, '#2b2b30', { x: 0.5, z: 0.5, y: 0.18 });
  muck(b, o, [[X + 0.15, 0.15, Z + 0.1, 0.09], [X - 0.12, 0.15, Z - 0.1, 0.08], [X + 0.05, 0.15, Z - 0.2, 0.06]]);
});

export default function create(ctx) {
  const s3 = stage3d(ctx.el, { scale: SCALE, quality: ctx.quality });
  const st = s3.ui, view = s3.view, g = s3.g;
  let needBuild = true;             // the 3D set is (re)built on the next frame
  const pops = new Pops();
  const L = {};
  let nextId = 1;
  let pieces = [];                 // { id, kind, cells, rot, where: 'bin'|'rack'|'held'|'wash', slot, col, row, seed, drop }
  let queue = [];                  // kinds waiting for room in the bin
  let batchT = 0, feedT = 0;
  let held = null;                 // { piece, id, from, gx, gy, x, y, sx, sy, moved }
  let lastTouched = null;
  const washer = { load: null, t: 0, clean: null, cleanT: 0, door: 0 }; // load = pieces in the cycle
  let sending = null;              // { items, t } a rack sliding into the washer
  let rackIn = 1;                  // the fresh rack sliding into place (0 → 1)
  let bubbles = [];
  let shake = 0, binFullT = 0, washed = 0;

  /* ── layout ─────────────────────────────────────────────────────────── */
  function layout() {
    const { W, H } = view;
    L.wide = W / H >= 1.3;
    const pad = 14;
    if (L.wide) {
      const side = Math.max(130, (W - 2 * pad) * 0.25);
      L.cell = Math.min(64, (H - 104) / ROWS, (W - 2 * pad - 2 * side - 40) / COLS);
      const rw = L.cell * COLS, rh = L.cell * ROWS;
      L.rack = { x: (W - rw) / 2, y: 32, w: rw, h: rh };
      L.btn = { x: L.rack.x + rw * 0.1, y: L.rack.y + rh + 14, w: rw * 0.8, h: 46 };
      const bx = pad, bw = L.rack.x - 22 - pad;
      const sw = Math.min(96, (bw - 8) / 2), sh = Math.min(sw, (H - 30 - 26 - 14 - 3 * 8) / 4);
      L.bin = { x: bx, y: 30, w: bw, h: H - 44 };
      L.slots = [...Array(BIN_SLOTS)].map((_, i) => ({ x: bx + (bw - (2 * sw + 8)) / 2 + (i % 2) * (sw + 8), y: 56 + Math.floor(i / 2) * (sh + 8), w: sw, h: sh }));
      const wx = L.rack.x + rw + 22, ww = W - pad - wx;
      L.washer = { x: wx, y: 30, w: ww, h: Math.min(H - 44, ww * 1.45) };
    } else {
      const wh = clamp(H * 0.15, 84, 128);
      L.washer = { x: pad, y: 10, w: W - 2 * pad, h: wh };
      const avail = H - wh - 10 - 22 - 46 - 12 - 10;      // below the washer, minus the button
      // Bin below the rack (phones), or beside it when there's width to spare.
      const swBelow = clamp((avail - 16 - 36 - 5 * 64) / 2, 58, Math.min(100, (W - 2 * pad - 24) / 4));
      const cellBelow = Math.min(76, (W - 2 * pad - 10) / COLS, (avail - 16 - 36 - 2 * swBelow) / ROWS);
      const swSide = Math.min(92, (avail - 30 - 24) / 4);
      const cellSide = Math.min(76, avail / ROWS, (W - 2 * pad - 2 * swSide - 8 - 20 - 20) / COLS);
      L.beside = cellSide > cellBelow + 4;
      L.cell = L.beside ? cellSide : cellBelow;
      const rw = L.cell * COLS, rh = L.cell * ROWS;
      const bw = Math.max(240, rw * 0.8);
      if (L.beside) {
        const binW = 2 * swSide + 8 + 20, total = rw + 26 + binW, x0 = (W - total) / 2;
        L.rack = { x: x0, y: wh + 32, w: rw, h: rh };
        L.btn = { x: x0 + rw / 2 - Math.min(bw, rw) / 2, y: L.rack.y + rh + 14, w: Math.min(bw, rw), h: 46 };
        const bx = x0 + rw + 26;
        L.bin = { x: bx, y: L.rack.y - 10, w: binW, h: 4 * swSide + 24 + 34 };
        L.slots = [...Array(BIN_SLOTS)].map((_, i) => ({ x: bx + 10 + (i % 2) * (swSide + 8), y: L.bin.y + 26 + Math.floor(i / 2) * (swSide + 8), w: swSide, h: swSide }));
      } else {
        const cols = 4, sw = swBelow;
        L.rack = { x: (W - rw) / 2, y: wh + 32, w: rw, h: rh };
        L.btn = { x: W / 2 - Math.min(bw, W - 40) / 2, y: L.rack.y + rh + 14, w: Math.min(bw, W - 40), h: 46 };
        const by = L.btn.y + L.btn.h + 14;
        L.bin = { x: pad, y: by, w: W - 2 * pad, h: Math.max(2 * sw + 8 + 32, H - by - 8) };
        const left = (W - (cols * sw + (cols - 1) * 8)) / 2;
        L.slots = [...Array(BIN_SLOTS)].map((_, i) => ({ x: left + (i % cols) * (sw + 8), y: by + 24 + Math.floor(i / cols) * (sw + 8), w: sw, h: sw }));
      }
    }
    needBuild = true;
  }
  layout();
  view.onResize = layout;

  /* ── dishes ─────────────────────────────────────────────────────────── */
  function makePiece(kind) {
    let cells = kind.cells, rot = 0;
    const turns = Math.floor(Math.random() * 4);
    for (let i = 0; i < turns; i++) { cells = turn(cells); rot++; }
    return { id: nextId++, kind, cells, rot: rot % 4, where: 'queue', slot: -1, col: 0, row: 0, seed: Math.random() * 1000, drop: 0 };
  }
  function batch(n) { for (let i = 0; i < n; i++) queue.push(makePiece(BAG[Math.floor(Math.random() * BAG.length)])); }
  function freeSlot() {
    const used = new Set(pieces.filter((p) => p.where === 'bin' || (p.where === 'held' && held?.from === 'bin')).map((p) => p.slot));
    for (let i = 0; i < BIN_SLOTS; i++) if (!used.has(i)) return i;
    return -1;
  }
  function feed() {
    if (!queue.length) return false;
    const s = freeSlot();
    if (s < 0) return false;
    const p = queue.shift();
    p.where = 'bin'; p.slot = s; p.drop = 1;
    pieces.push(p);
    ctx.sfx.work(p.kind.key === 'glass' ? 'glass' : 'plate', { vol: 0.35 });
    return true;
  }

  /* ── rack ───────────────────────────────────────────────────────────── */
  const inRack = () => pieces.filter((p) => p.where === 'rack');
  function grid(skip) {
    const occ = [...Array(ROWS)].map(() => Array(COLS).fill(0));
    for (const p of inRack()) if (p !== skip) for (const [x, y] of p.cells) occ[p.row + y][p.col + x] = p.id;
    return occ;
  }
  function fits(cells, col, row, skip) {
    const occ = grid(skip);
    return cells.every(([x, y]) => { const c = col + x, r = row + y; return c >= 0 && r >= 0 && c < COLS && r < ROWS && !occ[r][c]; });
  }
  /** Where the held dish would land: the cell under its top-left corner. */
  function target(h = held) {
    if (!h) return null;
    const { w, h: hh } = sizeOf(h.piece.cells);
    const left = h.x - h.gx * L.cell, top = h.y - h.gy * L.cell;
    const col = Math.round((left - L.rack.x) / L.cell), row = Math.round((top - L.rack.y) / L.cell);
    const over = h.x > L.rack.x - L.cell * 0.6 && h.x < L.rack.x + L.rack.w + L.cell * 0.6 && h.y > L.rack.y - L.cell * 0.6 && h.y < L.rack.y + L.rack.h + L.cell * 0.6;
    if (!over) return null;
    // Nudge a piece hanging just off an edge back onto the rack.
    const c = clamp(col, 0, COLS - w), r = clamp(row, 0, ROWS - hh);
    if (Math.abs(c - col) > 1 || Math.abs(r - row) > 1) return null;
    return { col: c, row: r, ok: fits(h.piece.cells, c, r, h.piece) };
  }

  function rotatePiece(p, h = null) {
    const turned = turn(p.cells);
    if (p.where === 'rack') {
      // Turn in place; if it doesn't fit, try a nearby spot.
      const tries = [[0, 0], [-1, 0], [0, -1], [-1, -1], [1, 0], [0, 1], [-2, 0], [0, -2]];
      const spot = tries.find(([dx, dy]) => fits(turned, p.col + dx, p.row + dy, p));
      if (!spot) { pops.add('No room to turn', L.rack.x + (p.col + 0.5) * L.cell, L.rack.y + p.row * L.cell, C.berryD, 14); ctx.sfx.miss(); crew?.wobble(0.6); return; }
      p.col += spot[0]; p.row += spot[1];
    }
    if (h) { const s = sizeOf(turned); const gx = h.gx, gy = h.gy; h.gx = s.w - gy; h.gy = gx; h.gx = clamp(h.gx, 0, s.w); h.gy = clamp(h.gy, 0, s.h); }
    p.cells = turned; p.rot = (p.rot + 1) % 4;
    ctx.sfx.click();
  }

  function send() {
    if (ctx.over) return;
    const items = inRack();
    const bx = L.btn.x + L.btn.w / 2, by = L.btn.y;
    if (washer.load) { pops.add(`Washer’s busy — ${Math.ceil(WASH - washer.t)}s`, bx, by - 8, C.berryD, 15); ctx.sfx.miss(); return; }
    if (!items.length) { pops.add('Load some dishes first', bx, by - 8, C.muted, 15); ctx.sfx.miss(); return; }
    if (held?.piece.where === 'held' && held.from === 'rack') return;
    for (const p of items) p.where = 'wash';
    washer.load = items; washer.t = 0;
    if (washer.clean) { washer.clean = null; }
    sending = { items, t: 0 };
    rackIn = 0;
    ctx.sfx.work('whoosh', { dur: 0.5, vol: 0.7 });
    ctx.sfx.work('slosh', { dur: 1, vol: 0.5 });
    crew?.play('point', 0.6);
  }

  function finishWash() {
    const items = washer.load;
    washer.load = null; washer.clean = items; washer.cleanT = 0;
    pieces = pieces.filter((p) => !items.includes(p));
    washed += items.length;
    const pts = items.reduce((n, p) => n + p.kind.pts, 0);
    ctx.add(pts);
    ctx.sfx.good(Math.min(6, pts / 4)); ctx.sfx.work('glass', { vol: 0.7 });
    const W = L.washer;
    pops.add(`+${pts} clean!`, W.x + W.w / 2, W.y + W.h * (L.wide ? 0.25 : 0.4), C.leafD, 22);
    crew?.hop(1);
  }

  /* ── input ──────────────────────────────────────────────────────────── */
  function pieceAt(p) {
    for (const x of inRack()) for (const [cx, cy] of x.cells) {
      if (inRect(p, { x: L.rack.x + (x.col + cx) * L.cell, y: L.rack.y + (x.row + cy) * L.cell, w: L.cell, h: L.cell })) return { piece: x, gx: (p.x - L.rack.x) / L.cell - x.col, gy: (p.y - L.rack.y) / L.cell - x.row };
    }
    for (const x of pieces) if (x.where === 'bin' && inRect(p, L.slots[x.slot])) {
      const s = sizeOf(x.cells);
      return { piece: x, gx: s.w / 2, gy: s.h / 2 };
    }
    return null;
  }

  const offPointer = pointer(st, {
    down: (p) => {
      if (ctx.over) return;
      if (held) { if (p.id !== held.id) rotatePiece(held.piece, held); return; } // second finger turns it
      if (inRect(p, L.btn) || inRect(p, L.washer)) { send(); return; }
      const hit = pieceAt(p);
      if (!hit) return;
      const pc = hit.piece;
      held = { piece: pc, id: p.id, from: pc.where, gx: hit.gx, gy: hit.gy, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, home: { col: pc.col, row: pc.row } };
      pc.where = 'held';
      lastTouched = pc;
      ctx.sfx.pop();
    },
    move: (p) => {
      if (!held || p.id !== held.id) return;
      held.x = p.x; held.y = p.y;
      if (!held.moved && dist(p, { x: held.sx, y: held.sy }) > TAP) held.moved = true;
    },
    up: (p) => {
      if (!held || p.id !== held.id) return;
      const h = held, pc = h.piece;
      h.x = p.x; h.y = p.y;
      held = null;
      if (!h.moved) { pc.where = h.from; rotatePiece(pc); return; }
      const t = target(h);
      if (t?.ok) {
        pc.where = 'rack'; pc.col = t.col; pc.row = t.row; pc.slot = -1;
        ctx.sfx.work(pc.kind.key === 'glass' ? 'glass' : pc.kind.key === 'pan' ? 'clank' : 'plate', { vol: 0.6 });
        return;
      }
      if (h.from === 'rack') {
        const s = inRect(p, L.bin) ? freeSlot() : -1;
        if (s >= 0) { pc.where = 'bin'; pc.slot = s; ctx.sfx.work('plate', { vol: 0.3 }); return; }
        pc.where = 'rack'; pc.col = h.home.col; pc.row = h.home.row;
      } else pc.where = 'bin';
      if (t && !t.ok) { pops.add('Doesn’t fit there', p.x, p.y - 30, C.berryD, 14); ctx.sfx.miss(); crew?.wobble(0.6); }
    },
  });
  const onKey = (e) => {
    if (ctx.over) return;
    const k = e.key.toLowerCase();
    if (k === 'r') { const pc = held?.piece || lastTouched; if (pc && pieces.includes(pc) && pc.where !== 'wash') { e.preventDefault(); rotatePiece(pc, held); } }
    else if (k === ' ' || k === 'enter' || k === 'w') { e.preventDefault(); send(); }
  };
  window.addEventListener('keydown', onKey);

  /* ── update ─────────────────────────────────────────────────────────── */
  const batchGap = () => lerp(3.4, 2.6, clamp(ctx.elapsed() / ctx.seconds, 0, 1));
  function step(dt) {
    batchT -= dt;
    if (batchT <= 0) { batch(3 + Math.floor(Math.random() * 3)); batchT = batchGap(); }
    feedT -= dt;
    if (feedT <= 0 && feed()) feedT = 0.18;
    binFullT = queue.length && freeSlot() < 0 ? binFullT + dt : 0;
    if (washer.load) {
      washer.t += dt;
      if (Math.random() < dt * 14) bubbles.push({ x: Math.random(), y: 1, r: 3 + Math.random() * 6, t: 0 });
      if (washer.t >= WASH) finishWash();
    }
    if (washer.clean) { washer.cleanT += dt; if (washer.cleanT > 1.4) washer.clean = null; }
    washer.door = lerp(washer.door, washer.clean ? 1 : 0, clamp(dt * 10, 0, 1));
    if (sending) { sending.t += dt; if (sending.t > 0.45) sending = null; }
    rackIn = Math.min(1, rackIn + dt / 0.45);
    for (const b of bubbles) { b.t += dt; b.y -= dt * 0.35; }
    bubbles = bubbles.filter((b) => b.y > 0);
    for (const p of pieces) p.drop = Math.max(0, p.drop - dt * 4);
    shake = binFullT > 0 ? Math.sin(binFullT * 30) * 1.5 : 0;
  }

  /* ── 3D ─────────────────────────────────────────────────────────────── */
  const world = new THREE.Group();
  s3.add(world);
  const { sinE, cosE } = s3;
  const v3 = new THREE.Vector3();
  let rackMesh = null, sendRack = null, cleanRack = null, tub = null, hood = null, glass = null, water = null, led = null, crew = null;
  let M = null;                    // the washer as drawn: its view rect plus world sizes
  const dishMeshes = new Map();    // piece → { outer, inner, sig, rot, turns, ang }
  const cleanMeshes = new Map();
  const steam = [], bubbleMeshes = [];
  let lastNow = performance.now(), frameDt = 0, clock = 0;

  function box3(w, h, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat({ color }));
    m.userData.ownGeometry = true; m.castShadow = m.receiveShadow = true;
    return m;
  }
  /** World depth (m) of a span of screen rows on a level surface. */
  const deep = (units) => units / (SCALE * sinE);
  function own(b, opts) { const m = b.mesh(opts); m.userData.ownGeometry = true; return m; }

  /** The dish pit: a steel counter with the rack and the bus tub on it, the washer on the floor beside it, the dishwasher by the washer. */
  function build() {
    world.clear();
    dishMeshes.clear(); cleanMeshes.clear(); steam.length = 0; bubbleMeshes.length = 0;
    const { W, H } = view, Wr = L.washer;
    world.add(s3.floor('checker', { size: 0.45 }));
    // the counter
    const cr = L.wide ? { x: -60, y: -80, w: Wr.x - 11 + 60, h: H + 90 } : { x: -60, y: Wr.y + Wr.h + 6, w: W + 120, h: H - (Wr.y + Wr.h + 6) + 10 };
    const cw = cr.w / SCALE, cd = deep(cr.h), cc = s3.at(cr.x + cr.w / 2, cr.y + cr.h / 2, TOP);
    const body = box3(cw, TOP, cd, '#8e9ba8'); body.position.set(cc.x, TOP / 2, cc.z); world.add(body);
    const slab = box3(cw + 0.03, 0.04, cd + 0.03, '#c9d3da'); slab.position.set(cc.x, TOP - 0.02, cc.z); world.add(slab);

    // the bus tub of dirty dishes, with a mat per slot
    const B = L.bin, tb = new Builder(), wall = 0.13, th = 0.05, bw = B.w / SCALE, bd = deep(B.h);
    tb.box(bw, 0.03, bd, '#7a8693', { x: bw / 2, y: 0.015, z: bd / 2 }, 0.01);
    for (const z of [th / 2, bd - th / 2]) tb.box(bw, wall, th, '#7b8794', { x: bw / 2, y: wall / 2, z }, 0.02);
    for (const x of [th / 2, bw - th / 2]) tb.box(th, wall, bd, '#7b8794', { x, y: wall / 2, z: bd / 2 }, 0.02);
    for (const s of L.slots) tb.box(s.w / SCALE * 0.92, 0.012, deep(s.h) * 0.92, '#8a96a2', { x: (s.x + s.w / 2 - B.x) / SCALE, y: 0.034, z: deep(s.y + s.h / 2 - B.y) }, 0.01);
    tub = new THREE.Group(); tub.add(own(tb, { receive: true })); world.add(tub);

    // racks: the one you load, one sliding into the washer, one coming out clean
    rackMesh = model('dishwasher:rack'); sendRack = model('dishwasher:rack'); cleanRack = model('dishwasher:rack');
    world.add(rackMesh, sendRack, cleanRack);

    // the washer: a hood-type machine; the hood lifts when a rack comes out clean
    M = L.wide ? { x: Wr.x, y: Wr.y, w: Wr.w, h: Math.min(Wr.h, H - 112 - Wr.y) } : { x: Wr.x, y: Wr.y, w: Wr.w - 118, h: Wr.h };
    const fh = M.h * 0.64, Hm = fh / (cosE * SCALE), D = (M.h - fh) / (sinE * SCALE), Wd = M.w / SCALE;
    const foot = s3.at(M.x + M.w / 2, M.y + M.h, 0);
    const baseH = Hm * 0.36, hoodH = Hm - baseH;
    Object.assign(M, { front: foot.z, baseH, hoodH, Wd, D, foot });
    const mb = new Builder();
    mb.box(Wd, baseH, D, '#aab5bf', { y: baseH / 2, z: -D / 2 }, 0.03);
    mb.box(Wd * 0.9, baseH * 0.62, 0.02, '#c3ccd5', { y: baseH * 0.52, z: 0.005 }, 0.01);
    mb.flat(Wd * 0.94, 0.05, 0.02, '#5c6670', { y: 0.03, z: 0.006 });
    const base = own(mb, { receive: true }); base.position.set(foot.x, 0, foot.z); world.add(base);
    hood = new THREE.Group(); hood.position.set(foot.x, baseH, foot.z);
    const hb = new Builder(), gw = Wd * 0.7, gh = hoodH * 0.56, gy = hoodH * 0.58;
    hb.box(Wd * 0.97, hoodH, D * 0.94, '#e3e9ee', { y: hoodH / 2, z: -D * 0.47 }, 0.04);
    hb.box(Wd * 0.8, 0.03, D * 0.3, '#4a4650', { y: hoodH + 0.01, z: -D * 0.22 }, 0.01);       // control strip
    hb.box(Wd * 0.3, 0.07, D * 0.2, '#aab6c2', { y: hoodH + 0.03, z: -D * 0.72 }, 0.02);       // steam vent
    hb.cyl(0.025, 0.025, Wd * 0.7, '#5c6670', { y: hoodH * 0.12, z: 0.04, rz: Math.PI / 2 });   // handle
    hb.box(gw + 0.06, gh + 0.06, 0.02, '#5c6670', { y: gy, z: 0.01 }, 0.01);                     // window frame
    hood.add(own(hb));
    glass = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), toonMat({ color: '#43505c' })); glass.userData.ownGeometry = true;
    glass.position.set(0, gy, 0.022); hood.add(glass);
    const wg = new THREE.PlaneGeometry(gw, gh); wg.translate(0, gh / 2, 0);
    water = new THREE.Mesh(wg, glowMat('#6fc0ea')); water.userData.ownGeometry = true;
    water.position.set(0, gy - gh / 2, 0.024); hood.add(water);
    Object.assign(M, { gw, gh, gy });
    const bub = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(bub, glowMat('#f4fbff')); m.visible = false; hood.add(m); bubbleMeshes.push(m); }
    led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), glowMat(C.butter)); led.userData.ownGeometry = true;
    led.position.set(-Wd * 0.33, hoodH + 0.04, -D * 0.22); hood.add(led);
    const puff = new THREE.SphereGeometry(1, 10, 8), puffMat = toonMat({ color: '#ffffff', transparent: true, opacity: 0.8, outline: false });
    for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(puff, puffMat); m.visible = false; hood.add(m); steam.push(m); }
    world.add(hood);
    // own geometries shared by pooled meshes: let the first carry the flag
    bubbleMeshes[0].userData.ownGeometry = true; steam[0].userData.ownGeometry = true;

    // the dishwasher, by the machine
    if (crew) s3.dropCritter(crew);
    crew = s3.critter({ ...ctx.critter, scale: L.wide ? 0.8 : 0.6 });
    const cs = L.wide ? { x: M.x + M.w * 0.42, y: Math.min(H - 10, M.y + M.h + 104) } : { x: Wr.x + Wr.w - 58, y: Wr.y + Wr.h - 4 };
    const cp = s3.at(cs.x, cs.y, 0);
    crew.setPosition(cp.x, 0, cp.z);
    crew.object.rotation.y = L.wide ? -0.7 : -0.9; crew.targetHeading = crew.object.rotation.y;
  }

  /* dish meshes: the model is built in cell units for its unturned footprint, centred on it */
  function dishMesh(map, p, clean) {
    const kind = `dishwasher:${p.kind.key}`, opts = clean ? {} : { dirty: p.id % 3 }, sig = kind + JSON.stringify(opts);
    let e = map.get(p);
    if (!e || e.sig !== sig) {
      e?.outer.removeFromParent();
      const outer = new THREE.Group(), inner = model(kind, opts);
      outer.add(inner); world.add(outer);
      e = { outer, inner, sig, rot: p.rot, turns: p.rot, ang: -p.rot * Math.PI / 2 };
      map.set(p, e);
    }
    if (e.rot !== p.rot) { e.turns += (p.rot - e.rot + 4) % 4; e.rot = p.rot; }
    return e;
  }
  /** Size a dish to `cell` view units per cell (squashed in depth so its footprint matches the grid) and turn it smoothly. */
  function setDish(e, pos, cell) {
    const k = cell / SCALE, target = -e.turns * Math.PI / 2;
    e.outer.visible = true;
    e.outer.position.copy(pos);
    e.outer.scale.set(k, k, k / sinE);
    e.ang = Math.abs(e.ang - target) < 0.01 ? target : lerp(e.ang, target, clamp(frameDt * 18, 0, 1));
    e.inner.rotation.y = e.ang;
  }
  const centre = (p, ox, oy, cell) => { const s = sizeOf(p.cells); return { x: ox + s.w * cell / 2, y: oy + s.h * cell / 2 }; };
  function setRack(m, pos, cell) { const k = cell / SCALE; m.visible = true; m.position.copy(pos); m.scale.set(k, k, k / sinE); }
  /** Centre of the washer's window on screen. */
  const winView = () => s3.toView(v3.set(M.foot.x, hood.position.y + M.gy, M.front));

  function draw() {
    if (needBuild) { needBuild = false; build(); }
    const now = performance.now();
    frameDt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now; clock += frameDt;
    const { W } = view, k = L.cell / SCALE;
    // the rack slides in fresh after one goes into the washer
    setRack(rackMesh, s3.at(L.rack.x + (1 - ease(rackIn)) * -L.rack.w * 0.3, L.rack.y, TOP), L.cell);
    tub.position.copy(s3.at(L.bin.x + shake, L.bin.y, TOP));
    const seen = new Set();
    for (const p of pieces) {
      if (p.where === 'bin') {
        const s = L.slots[p.slot], sz = sizeOf(p.cells);
        const c = Math.min((s.w - 14) / Math.max(1.5, sz.w), (s.h - 14) / Math.max(1.5, sz.h));
        const pos = s3.at(s.x + s.w / 2 + shake, s.y + s.h / 2, TOP + 0.047); pos.y += p.drop * 0.45;
        setDish(dishMesh(dishMeshes, p, false), pos, c);
      } else if (p.where === 'rack') {
        const q = centre(p, L.rack.x + p.col * L.cell, L.rack.y + p.row * L.cell, L.cell);
        setDish(dishMesh(dishMeshes, p, false), s3.at(q.x, q.y, TOP + RACK_FLOOR * k), L.cell);
      } else if (p.where === 'held' && held) {
        const c = L.cell, h = held, q = centre(p, h.x - h.gx * c, h.y - h.gy * c - (h.moved ? 6 : 0), c);
        setDish(dishMesh(dishMeshes, p, false), s3.at(q.x, q.y, TOP + (h.moved ? 0.32 : 0.1)), c);
      } else continue;
      seen.add(p);
    }
    // a loaded rack slides into the washer and shrinks through the door
    if (sending) {
      const kk = ease(sending.t / 0.45), sc = lerp(1, 0.3, kk), wv = winView();
      const x = lerp(L.rack.x, wv.x - L.rack.w * 0.15, kk), y = lerp(L.rack.y, wv.y - L.rack.h * 0.15, kk);
      const pt = (vx, vy, h) => s3.at(vx, vy, h).lerp(s3.atDepth(vx, vy, M.front + 0.3), kk);
      setRack(sendRack, pt(x, y, TOP), L.cell * sc);
      for (const p of sending.items) {
        const c = L.cell * sc, q = centre(p, x + p.col * c, y + p.row * c, c);
        setDish(dishMesh(dishMeshes, p, false), pt(q.x, q.y, TOP + RACK_FLOOR * k * sc), c);
        seen.add(p);
      }
    } else sendRack.visible = false;
    for (const [p, e] of dishMeshes) {
      if (seen.has(p)) continue;
      if (pieces.includes(p)) e.outer.visible = false;
      else { e.outer.removeFromParent(); dishMeshes.delete(p); }
    }
    // the washer
    const busy = !!washer.load;
    hood.position.y = M.baseH + washer.door * M.hoodH * 0.3;
    glass.material = washer.clean ? glowMat('#c9f2dc') : busy ? toonMat({ color: '#2f5f80' }) : toonMat({ color: '#43505c' });
    water.visible = busy;
    water.scale.y = clamp(0.42 + Math.sin(washer.t * 5) * 0.06, 0.05, 1);
    led.material = glowMat(busy ? C.sea : washer.clean ? C.leaf : C.butter);
    bubbleMeshes.forEach((m, i) => {
      const b = busy ? bubbles[i] : null;
      m.visible = !!b;
      if (b) { m.position.set((b.x - 0.5) * M.gw * 0.92, M.gy - M.gh / 2 + (1 - b.y) * M.gh * 0.95, 0.03); m.scale.setScalar(b.r * 0.55 / SCALE); }
    });
    steam.forEach((m, i) => {
      const ph = (clock * 0.55 + i / steam.length) % 1;
      m.visible = busy;
      m.position.set(Math.sin(i * 2.3 + clock) * M.Wd * 0.08, M.hoodH + 0.08 + ph * 0.55, -M.D * 0.72);
      m.scale.setScalar(0.05 + Math.sin(ph * Math.PI) * 0.09);
    });
    // a clean rack pops out of the washer
    let cleanAt = null;
    if (washer.clean) {
      const t = washer.cleanT, wv = winView();
      const sc = Math.min(0.36, (M.w * 0.8) / L.rack.w, (M.h * 0.85) / L.rack.h) * ease(clamp(t / 0.3, 0, 1)) * (t > 1.2 ? Math.max(0.05, 1 - (t - 1.2) / 0.2) : 1);
      const c = L.cell * Math.max(0.01, sc), x = wv.x - COLS * c / 2, y = wv.y - ROWS * c / 2 - t * (L.wide ? 10 : 3);
      const pt = (vx, vy) => s3.atDepth(vx, vy, M.front + 0.35);
      setRack(cleanRack, pt(x, y), c);
      for (const p of washer.clean) { const q = centre(p, x + p.col * c, y + p.row * c, c); setDish(dishMesh(cleanMeshes, p, true), pt(q.x, q.y), c); }
      cleanAt = { x: x + COLS * c / 2, y: y + ROWS * c / 2, r: COLS * c * 0.6, t };
    } else {
      cleanRack.visible = false;
      for (const e of cleanMeshes.values()) e.outer.removeFromParent();
      cleanMeshes.clear();
    }
    s3.render();

    // 2D: labels, the drop ghost, the wash button, the cycle readout, notes
    s3.begin2d();
    const B = L.bin, full = binFullT > 0;
    const binLabel = full ? `Bin’s full! ${queue.length} more waiting` : queue.length ? `${queue.length} on the way` : 'Dirty dishes';
    text(g, binLabel, B.x + B.w / 2 + shake, B.y + 13, { size: L.wide ? 12 : 13, color: full ? C.berryD : C.ink, weight: 800, stroke: '#fff' });
    // what each waiting dish is worth: the big and awkward ones pay more
    for (const p of pieces) {
      if (p.where !== 'bin' || p.slot < 0) continue;
      const sl = L.slots[p.slot], big = p.kind.pts >= 4;
      circle(g, sl.x + sl.w - 9 + shake, sl.y + 9, 10, big ? C.butter : '#fff', big ? C.butterD : C.line, 2);
      text(g, `${p.kind.pts}`, sl.x + sl.w - 9 + shake, sl.y + 9.5, { size: 12, color: big ? '#6a4a10' : C.muted, weight: 800 });
    }
    const t = target();
    if (held && held.moved && t) {
      for (const [x, y] of held.piece.cells) box(g, L.rack.x + (t.col + x) * L.cell + 3, L.rack.y + (t.row + y) * L.cell + 3, L.cell - 6, L.cell - 6, { fill: t.ok ? 'rgba(95,194,147,.4)' : 'rgba(255,122,138,.4)', r: 8 });
    }
    // the cycle: status by the light on the control strip, progress on the cabinet front
    const lv = s3.toView(led.getWorldPosition(v3));
    text(g, busy ? `Washing ${Math.ceil(WASH - washer.t)}s` : washer.clean ? 'Clean!' : 'Ready', lv.x + 10, lv.y, { size: L.wide ? 13 : 12, color: '#fff', weight: 800, align: 'left', stroke: 'rgba(40,36,48,.85)' });
    const bl = s3.toView(v3.set(M.foot.x - M.Wd * 0.4, M.baseH * 0.52, M.front + 0.02)), br = s3.toView(v3.set(M.foot.x + M.Wd * 0.4, M.baseH * 0.52, M.front + 0.02));
    box(g, bl.x, bl.y - 5, br.x - bl.x, 10, { fill: '#5c6670', r: 5 });
    if (busy) box(g, bl.x, bl.y - 5, (br.x - bl.x) * clamp(washer.t / WASH, 0, 1), 10, { fill: C.sea, r: 5 });
    if (cleanAt) {
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + cleanAt.t * 2, rr2 = cleanAt.r * (0.7 + 0.35 * Math.sin(i * 1.7 + cleanAt.t * 3));
        star(cleanAt.x + Math.cos(a) * rr2, cleanAt.y + Math.sin(a) * rr2 * 0.7, 5 + 3 * Math.abs(Math.sin(i + cleanAt.t * 5)), clamp(1.4 - cleanAt.t, 0, 1));
      }
    }
    if (L.wide) text(g, 'Washer', M.x + M.w / 2, M.y - 9, { size: 12, color: C.muted, weight: 800, stroke: '#fff' });
    // wash button
    const n = inRack().length, can = n && !busy;
    const bt = L.btn;
    box(g, bt.x, bt.y, bt.w, bt.h, { fill: can ? C.sea : '#c9d3dc', r: 23, shadow: can ? 4 : 0 });
    text(g, busy ? (n ? `Next rack: ${n} ready` : 'Load the next rack') : n ? `Wash ${n} dish${n === 1 ? '' : 'es'}` : 'Rack is empty', bt.x + bt.w / 2, bt.y + bt.h / 2, { size: 17, color: can ? '#fff' : C.muted, weight: 800 });
    pops.draw(g);
    const e = ctx.elapsed(), hy = L.wide ? 16 : L.rack.y - 13;
    if (e < 7) text(g, 'Drag dishes into the rack · tap one to turn it (R)', W / 2, hy, { size: 14, color: C.ink, weight: 700, alpha: 1 - Math.max(0, e - 5) / 2, stroke: '#fff' });
    else if (L.wide) text(g, `${washed} washed`, W / 2, hy, { size: 13, color: C.ink, weight: 800, stroke: '#fff' });
    if (!L.wide) { const sv = s3.toView(v3.set(M.foot.x + M.Wd * 0.38, hood.position.y + M.hoodH + 0.04, -M.D * 0.22 + M.front)); text(g, `${washed} washed`, sv.x, sv.y, { size: 11, color: '#e8e2da', weight: 800, align: 'right' }); }
  }
  /** A little four-point twinkle. */
  function star(x, y, r, alpha) {
    if (alpha <= 0) return;
    g.save(); g.globalAlpha = alpha; g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, d = i % 2 ? r * 0.32 : r; g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
    g.closePath(); g.fillStyle = '#fff6c2'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#e3a826'; g.stroke(); g.restore();
  }

  batch(5);
  for (let i = 0; i < 5; i++) feed();
  for (const p of pieces) p.drop = 0;
  batchT = 3.5;

  return {
    update(dt) { if (!ctx.over) step(dt); pops.update(dt); },
    draw,
    end() { held = null; },
    /** For automated play-tests. */
    peek() {
      return {
        view: { ...view }, L, COLS, ROWS,
        occ: grid(null),
        pieces: pieces.map((p) => ({ id: p.id, key: p.kind.key, pts: p.kind.pts, where: p.where, slot: p.slot, col: p.col, row: p.row, cells: p.cells.map((c) => [...c]), size: sizeOf(p.cells) })),
        washer: { busy: !!washer.load, t: washer.t, dur: WASH }, queue: queue.length, washed,
      };
    },
    destroy() { offPointer(); window.removeEventListener('keydown', onKey); s3.destroy(); },
  };
}
