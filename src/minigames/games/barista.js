/**
 * Barista — "Pull the Shot". Order tickets line up across the top; build a
 * drink by tapping the stations in the order its recipe calls for, then
 * serve it. A step that doesn't belong in any waiting drink sends the cup
 * down the drain. Espresso shots take a moment to pull and milk a moment to
 * steam. New drinks show their recipe until you've made them once; after
 * that the Recipes button brings the cards back (it takes a second to read).
 * Orders that wait too long leave. Score = drinks served.
 *
 * Drawn in the restaurant's 3D toon style: a coffee bar counter with the
 * stations' kit on it, a big glass mug that fills in layers in front of the
 * espresso machine, and the barista behind the counter. Tickets, labels and
 * buttons are the 2D overlay (with little pictures of the 3D models).
 */
import { pointer, C, box, circle, text, rr, lerp, ease, clamp, inRect, pick, Pops } from '../kit.js';
import { stage3d } from '../kit3d.js';
import { model, defineModel, icon, sign } from '../models.js';
import * as THREE from 'three';
import { toonMat } from '../../three/toon.js';
import { espresso as espressoProp } from '../../three/props.js';

const ING = {
  shot:    { name: 'Espresso', short: 'Shot', color: '#4a2a17', h: 15, busy: 0.9, sound: 'espresso' },
  water:   { name: 'Hot water', short: 'Water', color: '#b07d52', h: 26, sound: 'pour' },
  milk:    { name: 'Steamed milk', short: 'Steamed', color: '#f1dfc2', h: 22, busy: 0.45, sound: 'sizzle' },
  foam:    { name: 'Foam', short: 'Foam', color: '#fffaf2', h: 13, sound: 'whoosh' },
  cold:    { name: 'Cold milk', short: 'Cold milk', color: '#eef3f7', h: 24, sound: 'pour' },
  ice:     { name: 'Ice', short: 'Ice', color: '#d6eefa', h: 20, sound: 'glass' },
  choc:    { name: 'Chocolate', short: 'Choc', color: '#5b3426', h: 10, sound: 'pour' },
  vanilla: { name: 'Vanilla syrup', short: 'Vanilla', color: '#f2dc9a', h: 9, sound: 'pour' },
  caramel: { name: 'Caramel', short: 'Caramel', color: '#d48a2c', h: 6, sound: 'pour' },
  cream:   { name: 'Whipped cream', short: 'Cream', color: '#ffffff', h: 16, sound: 'whoosh' },
};
const STATIONS = ['shot', 'water', 'milk', 'foam', 'cold', 'ice', 'choc', 'vanilla', 'caramel', 'cream'];

const DRINKS = [
  { name: 'Espresso', recipe: ['shot'], at: 0 },
  { name: 'Americano', recipe: ['shot', 'water'], at: 0 },
  { name: 'Cortado', recipe: ['shot', 'milk'], at: 0 },
  { name: 'Latte', recipe: ['shot', 'milk', 'milk', 'foam'], at: 0 },
  { name: 'Doppio', recipe: ['shot', 'shot'], at: 9 },
  { name: 'Macchiato', recipe: ['shot', 'foam'], at: 9 },
  { name: 'Cappuccino', recipe: ['shot', 'milk', 'foam', 'foam'], at: 9 },
  { name: 'Mocha', recipe: ['choc', 'shot', 'milk', 'cream'], at: 20 },
  { name: 'Iced Latte', recipe: ['ice', 'shot', 'cold'], iced: true, at: 20 },
  { name: 'Flat White', recipe: ['shot', 'shot', 'milk'], at: 20 },
  { name: 'Long Black', recipe: ['water', 'shot'], at: 32 },
  { name: 'Vanilla Latte', recipe: ['vanilla', 'shot', 'milk', 'foam'], at: 32 },
  { name: 'Caramel Macchiato', recipe: ['vanilla', 'milk', 'shot', 'caramel'], at: 32 },
  { name: 'Iced Mocha', recipe: ['ice', 'choc', 'shot', 'cold', 'cream'], iced: true, at: 42 },
];
const MAX_ORDERS = 3;
const HINT_SHOW = 4;      // seconds the recipe cards stay up
const HINT_READ = 0.9;    // seconds the stations wait while you read them

const SCALE = 150;        // view units per metre
const TOP = 0.72;         // counter height (m): low, so the barista shows over it

/* ── models: the stations' kit (also the pictures on the tickets) ───────── */
const STEEL = '#c9d3da', STEEL_D = '#8e9ba8', INK = '#3b2f2f', W = '#fbfaf5';
const bottle = (b, glass, label, cap) => {
  b.cyl(0.05, 0.05, 0.2, glass, { y: 0.1 });
  b.cyl(0.05, 0.03, 0.04, glass, { y: 0.22 });
  b.cyl(0.051, 0.051, 0.07, label, { y: 0.1 });
  b.cyl(0.018, 0.018, 0.05, cap, { y: 0.26 });
  b.flat(0.012, 0.035, 0.012, cap, { y: 0.3 });
  b.flat(0.05, 0.012, 0.014, cap, { x: 0.02, y: 0.315 });
};
const MODELS = {
  /** A little espresso machine with a shot glass under the group head. */
  shot(b) {
    b.box(0.22, 0.2, 0.16, '#b23a48', { y: 0.12 }, 0.03);
    b.box(0.23, 0.025, 0.17, STEEL, { y: 0.23 }, 0.008);
    b.flat(0.2, 0.02, 0.07, STEEL_D, { y: 0.01, z: 0.11 });
    b.cyl(0.025, 0.025, 0.035, STEEL_D, { y: 0.115, z: 0.09 });
    b.flat(0.025, 0.018, 0.08, INK, { x: 0.04, y: 0.105, z: 0.12, ry: -0.5 });
    b.cyl(0.028, 0.022, 0.045, W, { y: 0.045, z: 0.12 });
    b.cyl(0.024, 0.024, 0.005, '#4a2a17', { y: 0.066, z: 0.12 });
    b.sphere(0.022, '#ffd66b', { x: -0.07, y: 0.17, z: 0.08, sz: 0.4 });
  },
  /** Kettle for hot water. */
  water(b) {
    b.sphere(0.1, '#4fbfa8', { y: 0.09, sy: 0.85 });
    b.cyl(0.07, 0.08, 0.02, '#3b9f8a', { y: 0.01 });
    b.cone(0.025, 0.1, '#4fbfa8', { x: 0.11, y: 0.12, rz: -1.0 }, 8);
    b.torus(0.06, 0.012, INK, { y: 0.19, rx: 0 }, Math.PI);
    b.sphere(0.02, INK, { y: 0.18 });
  },
  /** Steel milk jug, steaming. */
  milk(b) {
    b.cyl(0.065, 0.075, 0.16, STEEL, { y: 0.08 });
    b.cone(0.03, 0.05, STEEL, { x: 0.065, y: 0.155, rz: -1.2 }, 6);
    b.torus(0.04, 0.011, STEEL_D, { x: -0.08, y: 0.09, rz: Math.PI / 2 }, Math.PI);
    b.flat(0.13, 0.012, 0.012, '#e85d75', { y: 0.06, z: 0.072 });
    for (let i = 0; i < 3; i++) b.sphere(0.03 - i * 0.004, '#ffffff', { x: -0.02 + i * 0.025, y: 0.2 + i * 0.04 });
  },
  /** A dome of milk foam in a little bowl. */
  foam(b) {
    b.cyl(0.09, 0.06, 0.07, '#f2c6a8', { y: 0.035 });
    b.sphere(0.085, '#fffaf2', { y: 0.075, sy: 0.75 });
    for (let i = 0; i < 6; i++) b.sphere(0.03, '#fffdf8', { x: Math.cos(i) * 0.06, y: 0.09, z: Math.sin(i) * 0.06 });
    b.sphere(0.035, '#ffffff', { y: 0.14 });
  },
  /** Milk carton, cold from the fridge. */
  cold(b) {
    b.box(0.1, 0.17, 0.1, '#ffffff', { y: 0.085 }, 0.008);
    b.flat(0.102, 0.06, 0.102, '#5aa9e6', { y: 0.07 });
    b.geom(new THREE.CylinderGeometry(0, 0.072, 0.06, 4, 1), '#ffffff', { y: 0.2, ry: Math.PI / 4 });
    b.flat(0.07, 0.03, 0.02, '#ffffff', { y: 0.24 });
    b.sphere(0.018, '#5aa9e6', { y: 0.12, z: 0.051, sz: 0.3 });
  },
  /** Ice bucket full of cubes. */
  ice(b) {
    b.cyl(0.11, 0.085, 0.13, '#7cc6f2', { y: 0.065 });
    b.torus(0.105, 0.01, STEEL_D, { y: 0.13, rx: Math.PI / 2 });
    for (let i = 0; i < 6; i++) b.box(0.05, 0.05, 0.05, '#e9f7ff', { x: Math.cos(i * 1.1) * 0.05, y: 0.13 + (i % 2) * 0.02, z: Math.sin(i * 1.1) * 0.05, ry: i, rx: i * 0.4 }, 0.01);
  },
  /** A bar of chocolate leaning on a little pot of sauce. */
  choc(b) {
    b.cyl(0.07, 0.06, 0.08, '#e9e2d6', { y: 0.04 });
    b.cyl(0.062, 0.062, 0.01, '#5b3426', { y: 0.08 });
    b.box(0.13, 0.2, 0.025, '#6b3d2a', { x: 0.03, y: 0.1, z: 0.07, rx: -0.2, rz: -0.15 }, 0.006);
    for (let i = 0; i < 3; i++) b.flat(0.13, 0.008, 0.03, '#4d2a1c', { x: 0.03, y: 0.05 + i * 0.05, z: 0.075, rx: -0.2, rz: -0.15 });
    b.flat(0.135, 0.08, 0.028, '#e8505b', { x: 0.03, y: 0.05, z: 0.072, rx: -0.2, rz: -0.15 });
  },
  vanilla(b) { bottle(b, '#f2dc9a', '#fff7e0', '#5c6670'); b.sphere(0.02, '#ffffff', { y: 0.1, z: 0.05, sz: 0.3 }); },
  caramel(b) { bottle(b, '#d48a2c', '#fff1d6', '#5c6670'); b.sphere(0.02, '#a8641c', { y: 0.1, z: 0.05, sz: 0.3 }); },
  /** Whipped cream can. */
  cream(b) {
    b.cyl(0.045, 0.045, 0.2, '#e8505b', { y: 0.1 });
    b.cyl(0.046, 0.046, 0.06, '#ffffff', { y: 0.12 });
    b.sphere(0.045, '#d9dee3', { y: 0.2, sy: 0.5 });
    b.cone(0.016, 0.06, '#ffffff', { y: 0.25, rx: 0.4, z: 0.01 }, 6);
  },
  /** Finished drinks for the tickets: a mug of coffee, or an iced glass with a straw. */
  drink(b, o) {
    if (o.iced) {
      b.cyl(0.05, 0.04, 0.15, '#cfe9f7', { y: 0.075 });
      b.cyl(0.046, 0.038, 0.12, o.fill || '#b98a62', { y: 0.065 });
      b.box(0.03, 0.03, 0.03, '#ffffff', { x: -0.015, y: 0.14, ry: 0.5 }, 0.006);
      b.flat(0.012, 0.16, 0.012, '#e85d75', { x: 0.02, y: 0.17, rz: -0.2 });
    } else {
      b.cyl(0.11, 0.1, 0.012, W, { y: 0.006 });
      b.cyl(0.06, 0.048, 0.1, W, { y: 0.06 });
      b.torus(0.03, 0.01, W, { x: 0.065, y: 0.065, ry: Math.PI / 2 });
      b.cyl(0.056, 0.056, 0.01, o.fill || '#8a5a3c', { y: 0.106 });
      b.sphere(0.02, '#fffaf2', { y: 0.11, sy: 0.25 });
    }
  },
  /** Counter bell for "Serve". */
  bell(b) {
    b.cyl(0.08, 0.09, 0.02, '#5c6670', { y: 0.01 });
    b.geom(new THREE.SphereGeometry(0.07, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#ffd23f', { y: 0.02 });
    b.cyl(0.008, 0.008, 0.03, '#5c6670', { y: 0.1 });
    b.sphere(0.014, '#5c6670', { y: 0.12 });
  },
  /** A mug tipping out, for "Tip out". */
  tip(b) {
    b.cyl(0.05, 0.04, 0.1, W, { y: 0.06, rz: 1.1, x: -0.02 });
    b.sphere(0.04, '#8a5a3c', { x: 0.07, y: 0.02, sy: 0.25, sx: 1.6 });
    b.cyl(0.06, 0.05, 0.03, '#9aa7b1', { x: 0.07, y: 0.0 });
  },
  /** A wall shelf of mugs and jars of beans. */
  shelf(b) {
    b.box(2.2, 0.05, 0.22, '#9c6a3f', { y: 0 }, 0.01);
    for (const x of [-0.95, 0.95]) b.flat(0.04, 0.14, 0.18, '#7a5032', { x, y: -0.08 });
    const mugs = ['#e85d75', '#4fbfa8', '#ffd66b', '#b18cf2', '#5aa9e6', '#fbfaf5'];
    for (let i = 0; i < 6; i++) { const x = -0.85 + i * 0.22; b.cyl(0.06, 0.05, 0.12, mugs[i], { x, y: 0.085 }); b.torus(0.03, 0.01, mugs[i], { x: x + 0.065, y: 0.09, ry: Math.PI / 2 }); }
    for (let i = 0; i < 2; i++) { const x = 0.55 + i * 0.25; b.cyl(0.08, 0.08, 0.22, '#e8f6ff', { x, y: 0.135 }); b.cyl(0.075, 0.075, 0.15, '#5b3426', { x, y: 0.1 }); b.cyl(0.085, 0.085, 0.03, '#9c6a3f', { x, y: 0.26 }); }
  },
  /** A recipe book. */
  book(b) {
    b.box(0.16, 0.03, 0.2, '#6d55a3', { y: 0.015 }, 0.006);
    b.flat(0.15, 0.022, 0.19, '#fff7e8', { y: 0.025, x: 0.004 });
    b.box(0.16, 0.012, 0.2, '#6d55a3', { y: 0.042, rz: 0.04 }, 0.004);
    b.flat(0.03, 0.004, 0.08, '#ffd23f', { y: 0.05, x: 0.02 });
  },
};
for (const [k, fn] of Object.entries(MODELS)) defineModel('barista:' + k, fn);
const mk = (k, o) => model('barista:' + k, o);
const pic = (renderer, k, o = {}) => icon(renderer, 'barista:' + k, o);

export default function create(ctx) {
  const s3 = stage3d(ctx.el, { scale: SCALE, quality: ctx.quality });
  const st = s3.ui, view = s3.view, g = s3.g;
  let needBuild = true;    // the 3D set is (re)built on the next frame
  const pops = new Pops();
  const learned = new Set();
  let orders = [];
  let cup = [];             // ingredient keys in the order added
  let pourT = 1;            // 0→1 grow animation of the newest layer
  let busy = null;          // { ing, t, dur }
  let drain = null;         // { layers, t }
  let served = [];          // little cups flying to a ticket
  let spawnT = 0, nextId = 1, streak = 0;
  let hintT = 0, readT = 0;
  let pressed = null;
  let started = false;
  const L = {};
  let stations = [];

  /* layout */
  function layout() {
    const { W, H } = view;
    L.wide = W >= 640 && !view.portrait;
    const pad = 12, gap = 10;
    if (L.wide) {
      L.tickets = { x: pad, y: 10, w: W - pad * 2, h: 120 };
      const cupW = clamp(W * 0.36, 280, 380);
      L.cupArea = { x: pad, y: 140, w: cupW, h: H - 140 - 72 };
      const bw = 64, by = H - 64;
      L.drain = { x: pad + 4, y: by, w: bw, h: 52 };
      L.hint = { x: pad + cupW - bw - 4, y: by, w: bw, h: 52 };
      L.serve = { x: L.drain.x + bw + gap, y: by, w: L.hint.x - gap - (L.drain.x + bw + gap), h: 52 };
      const gx = pad + cupW + 16, gw = W - pad - gx, cols = 5, rows = 2;
      const sw = (gw - (cols - 1) * gap) / cols, gy = 150, sh = Math.min(116, (H - 12 - gy - (rows - 1) * gap) / rows);
      stations = STATIONS.map((k, i) => ({ key: k, x: gx + (i % cols) * (sw + gap), y: gy + Math.floor(i / cols) * (sh + gap), w: sw, h: sh }));
    } else {
      const tH = clamp(H * 0.17, 118, 150);
      L.tickets = { x: pad, y: 10, w: W - pad * 2, h: tH };
      const cols = 4, rows = 3, rowH = clamp(H * 0.088, 58, 82);
      const gridTop = H - 12 - rows * rowH - (rows - 1) * gap;
      const sw = (W - pad * 2 - (cols - 1) * gap) / cols;
      const cell = (i) => ({ x: pad + (i % cols) * (sw + gap), y: gridTop + Math.floor(i / cols) * (rowH + gap), w: sw, h: rowH });
      stations = STATIONS.map((k, i) => ({ key: k, ...cell(i) }));
      L.drain = cell(10); L.hint = cell(11);
      const sy = gridTop - 64;
      L.serve = { x: W * 0.2, y: sy, w: W * 0.6, h: 52 };
      L.cupArea = { x: pad, y: 10 + tH + 8, w: W - pad * 2, h: sy - (10 + tH + 8) - 8 };
    }
    const a = L.cupArea;
    L.cupH = clamp(a.h * (L.wide ? 0.72 : 0.6), 90, 180);
    L.cupW = L.cupH * 0.8;
    L.cupX = a.x + a.w / 2;
    L.cupBottom = L.wide ? a.y + a.h / 2 + L.cupH / 2 + 4 : a.y + a.h - 16;
    needBuild = true;
  }
  layout();
  view.onResize = layout;

  /* orders */
  function pool() { return DRINKS.filter((d) => d.at <= ctx.elapsed()); }
  function spawn() {
    const p = pool();
    const fresh = p.filter((d) => !learned.has(d.name) && !orders.some((o) => o.drink === d));
    const waiting = orders.map((o) => o.drink);
    let d = fresh.length && Math.random() < 0.55 ? pick(fresh) : pick(p);
    if (waiting.includes(d) && Math.random() < 0.7) d = pick(p);
    const patience = 15 + d.recipe.length * 4;
    orders.push({ id: nextId++, drink: d, left: patience, patience, gone: 0, born: 0 });
  }
  const isPrefix = (a, b) => a.length <= b.length && a.every((x, i) => x === b[i]);
  const fits = () => orders.some((o) => !o.gone && isPrefix(cup, o.drink.recipe));
  const ready = () => orders.find((o) => !o.gone && o.drink.recipe.length === cup.length && isPrefix(cup, o.drink.recipe));

  function ticketRect(i, n = MAX_ORDERS) {
    const t = L.tickets, gap = 10, w = Math.min(L.wide ? 220 : 999, (t.w - (n - 1) * gap) / n);
    const total = n * w + (n - 1) * gap;
    return { x: t.x + (t.w - total) / 2 + i * (w + gap), y: t.y, w, h: t.h };
  }

  /* actions */
  function addStep(k) {
    if (ctx.over || !started || drain) return;
    if (readT > 0) { pops.add('Reading…', L.cupX, L.cupBottom - L.cupH - 12, C.muted, 14); return; }
    if (busy) return;
    const ing = ING[k];
    pressed = { k, t: 0 };
    if (ing.busy) { busy = { ing: k, t: 0, dur: ing.busy }; ctx.sfx.work(ing.sound, { dur: ing.busy, vol: k === 'milk' ? 0.3 : 0.6 }); return; }
    ctx.sfx.work(ing.sound, { dur: 0.3, vol: 0.5 });
    commit(k);
  }
  function commit(k) {
    cup.push(k); pourT = 0;
    if (!fits()) {
      streak = 0;
      ctx.sfx.miss();
      ctx.sfx.work('slosh', { dur: 0.5, vol: 0.5 });
      pops.add(`No ${ING[k].name.toLowerCase()} there! Down the drain`, L.cupX, L.cupBottom - L.cupH - 20, C.berryD, 15);
      drain = { layers: cup, t: 0 };
      cup = [];
      barista?.wobble(1);
    }
  }
  function serve() {
    if (ctx.over || !started || drain || busy) return;
    const o = ready();
    if (!o) {
      if (cup.length) pops.add('Not finished yet', L.serve.x + L.serve.w / 2, L.serve.y - 12, C.muted, 14);
      return;
    }
    const i = orders.indexOf(o), r = ticketRect(i);
    served.push({ x0: L.cupX, y0: L.cupBottom - L.cupH / 2, x1: r.x + r.w / 2, y1: r.y + r.h / 2, t: 0, iced: o.drink.iced });
    o.gone = 1; o.ok = true;
    learned.add(o.drink.name);
    streak++;
    ctx.add(1);
    ctx.sfx.good(streak); ctx.sfx.serve();
    pops.add(streak >= 4 ? `${streak} in a row!` : `${o.drink.name}! +1`, r.x + r.w / 2, r.y + r.h + 16, C.leafD, 17);
    cup = []; pourT = 1;
    barista?.hop(0.8); barista?.play('serve', 0.8);
  }
  function dump() {
    if (ctx.over || !started || drain || busy || !cup.length) return;
    ctx.sfx.work('slosh', { dur: 0.4, vol: 0.5 });
    drain = { layers: cup, t: 0 }; cup = [];
    barista?.wobble(0.6);
  }
  function hint() {
    if (ctx.over || !started) return;
    if (hintT > 0) { hintT = 0; return; }
    hintT = HINT_SHOW; readT = HINT_READ;
    ctx.sfx.work('scribble', { dur: 0.4, vol: 0.4 });
  }

  /* input */
  const offPointer = pointer(st, {
    down: (p) => {
      const s = stations.find((b) => inRect(p, b));
      if (s) { addStep(s.key); return; }
      if (inRect(p, L.serve)) { pressed = { k: 'serve', t: 0 }; serve(); return; }
      if (inRect(p, L.drain)) { pressed = { k: 'drain', t: 0 }; dump(); return; }
      if (inRect(p, L.hint)) { pressed = { k: 'hint', t: 0 }; hint(); return; }
      // tapping the tickets also brings up the recipes
      if (inRect(p, L.tickets) && learnedAll()) hint();
    },
  });
  const learnedAll = () => orders.every((o) => learned.has(o.drink.name));
  const onKey = (e) => {
    if (e.key >= '0' && e.key <= '9') { e.preventDefault(); addStep(STATIONS[(Number(e.key) + 9) % 10]); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); serve(); }
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); dump(); }
    else if (e.key === 'h' || e.key === 'H' || e.key === '?') hint();
  };
  window.addEventListener('keydown', onKey);

  /* update */
  function step(dt) {
    if (busy) {
      busy.t += dt;
      if (busy.t >= busy.dur) { const k = busy.ing; busy = null; commit(k); }
    }
    pourT = Math.min(1, pourT + dt / 0.25);
    if (drain) { drain.t += dt; if (drain.t > 0.6) drain = null; }
    hintT = Math.max(0, hintT - dt); readT = Math.max(0, readT - dt);
    for (const o of orders) {
      if (o.gone) { o.gone += dt; continue; }
      o.born += dt;
      o.left -= dt;
      if (o.left <= 0) {
        o.gone = 1; o.ok = false; streak = 0;
        ctx.sfx.complain();
        const r = ticketRect(orders.indexOf(o));
        pops.add('Got tired of waiting', r.x + r.w / 2, r.y + r.h + 16, C.berryD, 14);
        // the cup may no longer suit anyone
        if (cup.length && !fits()) { drain = { layers: cup, t: 0 }; cup = []; }
      }
    }
    orders = orders.filter((o) => !o.gone || o.gone < 1.45);
    const live = orders.filter((o) => !o.gone).length;
    spawnT -= dt;
    if (live < MAX_ORDERS && orders.length < MAX_ORDERS + 1 && (spawnT <= 0 || live === 0)) {
      // keep the slots: a gone ticket frees its place once it has faded
      if (orders.length < MAX_ORDERS) { spawn(); spawnT = live === 0 ? 1.2 : 3.2; }
    }
    for (const s of served) s.t += dt;
    served = served.filter((s) => s.t < 0.5);
    if (pressed) pressed.t += dt;
    pops.update(dt);
  }

  /* ── the 3D coffee bar ──────────────────────────────────────────────── */
  const world = new THREE.Group();
  s3.add(world);

  let barista = null, machine = null, steamKids = [], head = null, stream = null, puffs = [];
  let cupGroup = null, shell = null, handle = null, layerGroup = null, layerSig = '', layerMeshes = [];
  let props = [];           // station kit, by station index
  const D = {};             // 3D dimensions worked out in build()
  /** World depth (m) covering `u` units of screen height on a level surface. */
  const depth = (u) => u / (SCALE * s3.sinE);

  function box3(w, h, d, color, round = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat({ color }));
    m.userData.ownGeometry = true; m.castShadow = m.receiveShadow = true;
    return m;
  }
  function own(geo, mat) { const m = new THREE.Mesh(geo, mat); m.userData.ownGeometry = true; m.castShadow = m.receiveShadow = true; return m; }
  /** A counter whose top (height TOP) covers view x0..x1, from row `back` to below the screen. */
  function counter(x0, x1, back) {
    const front = view.H + 60, c = s3.at((x0 + x1) / 2, (back + front) / 2, TOP), d = depth(front - back);
    const body = box3((x1 - x0) / SCALE, TOP, d, '#9c6a3f'); body.position.set(c.x, TOP / 2, c.z); world.add(body);
    const top = box3((x1 - x0) / SCALE + 0.02, 0.05, d + 0.02, '#e4b583'); top.position.set(c.x, TOP - 0.02, c.z); world.add(top);
  }

  function build() {
    world.clear();
    props = []; puffs = []; layerMeshes = []; layerSig = '';
    const { W } = view, a = L.cupArea;
    // sizes: the mug (a bit narrower than the 2D one so the machine fits beside it)
    D.hm = (L.cupH * 0.7) / (SCALE * s3.cosE);
    D.r1 = (L.cupW / 2) * 0.8 / SCALE; D.r0 = D.r1 * 0.8;
    // the espresso machine (slimmed down) to the right of the cup, a little behind it
    const k = L.wide ? 1.25 : 1.6, slim = 0.6;
    const mx = L.cupX + D.r1 * SCALE + 0.46 * slim * k * SCALE + 4, mRow = L.cupBottom - 14;
    // the counter's back edge: just behind the machine; on wide screens the
    // stations' side runs further back, leaving a nook where the barista stands
    D.back = mRow - 0.26 * slim * k * SCALE * s3.sinE - 8;
    const wallY = L.wide ? 150 : D.back - 12;
    world.add(s3.floor('wood', { size: 0.5 }));
    world.add(s3.wall({ y: wallY, a: '#fbefe0', b: '#ead6bd' }));
    if (L.wide) {
      const split = a.x + a.w + 8;
      counter(-60, split, D.back);
      counter(split, W + 60, stations[0].y - 10);
    } else counter(-60, W + 60, D.back);
    // a shelf of mugs and a sign on the wall (seen on phones, where there's wall to see)
    if (!L.wide) {
      const shelf = mk('shelf'); shelf.scale.setScalar(1.3);
      const foot = s3.at(W / 2, wallY, 0);
      shelf.position.set(foot.x, (wallY - (a.y + (D.back - a.y) * 0.52)) / (SCALE * s3.cosE), foot.z + 0.12);
      world.add(shelf);
      const board = sign('Coffee', { w: 1.3, h: 0.4, bg: '#2f3d36', fg: '#f7f3e3' });
      board.position.set(foot.x, (wallY - (a.y + (D.back - a.y) * 0.2)) / (SCALE * s3.cosE), foot.z + 0.05);
      world.add(board);
    }

    // the cup: a big glass mug on a saucer, filling in layers
    cupGroup = new THREE.Group();
    cupGroup.position.copy(s3.at(L.cupX, L.cupBottom, TOP));
    const glass = toonMat({ color: '#dff1fb', transparent: true, opacity: 0.38, depthWrite: false });
    const rimMat = toonMat({ color: '#cfe6f2' });
    const shellGeo = new THREE.CylinderGeometry(D.r1, D.r0, D.hm, 32, 1, true); shellGeo.translate(0, D.hm / 2 + 0.04, 0);
    shell = own(shellGeo, glass); shell.castShadow = false;
    const base = own(new THREE.CylinderGeometry(D.r0, D.r0 * 0.96, 0.05, 32), rimMat); base.position.y = 0.045;
    const rim = own(new THREE.TorusGeometry(D.r1, 0.018, 8, 40), rimMat); rim.rotation.x = Math.PI / 2; rim.position.y = D.hm + 0.04;
    const saucer = own(new THREE.CylinderGeometry(D.r1 * 1.4, D.r1 * 1.25, 0.04, 36), toonMat({ color: '#fbfaf5' })); saucer.position.y = 0.02;
    handle = own(new THREE.TorusGeometry(D.hm * 0.2, 0.04, 10, 24, Math.PI), rimMat);
    handle.rotation.z = -Math.PI / 2; handle.rotation.y = 0.5; handle.position.set(D.r1 * 0.8, D.hm * 0.55, D.r1 * 0.45);
    layerGroup = new THREE.Group(); layerGroup.position.y = 0.07;
    cupGroup.add(saucer, base, layerGroup, shell, rim, handle);
    world.add(cupGroup);

    machine = new THREE.Group();
    const inner = espressoProp(); inner.position.y = -0.9;
    inner.traverse((o) => { if (o.isMesh && o.material?.isMeshBasicMaterial) o.userData.ownGeometry = true; });
    steamKids = inner.children.slice(1);
    const tick = inner.userData.tick; inner.userData.tick = (dt, t) => { tick(dt, t); for (const s of steamKids) s.visible = !!busy; };
    machine.add(inner); machine.scale.set(k * slim, k, k * slim);
    machine.position.copy(s3.at(mx, mRow, TOP));
    world.add(machine);
    // its group head on an arm over the cup
    D.headY = TOP + D.hm + 0.26;
    head = new THREE.Group();
    const gh = own(new THREE.CylinderGeometry(0.09, 0.07, 0.1, 20), toonMat({ color: '#9aa7b1' }));
    const spout = own(new THREE.CylinderGeometry(0.03, 0.02, 0.06, 10), toonMat({ color: '#5c6670' })); spout.position.y = -0.07;
    const reach = machine.position.x - cupGroup.position.x, mTop = TOP + 0.62 * k;
    const arm = box3(reach, 0.07, 0.09, '#c9d3da'); arm.position.set(reach / 2, 0.02, 0);
    const post = box3(0.09, D.headY - mTop, 0.09, '#c9d3da'); post.position.set(reach, 0.02 - (D.headY - mTop) / 2, 0);
    const knob = own(new THREE.SphereGeometry(0.05, 10, 8), toonMat({ color: '#e8505b' })); knob.position.set(reach * 0.5, 0.08, 0);
    head.add(gh, spout, arm, post, knob);
    head.position.set(cupGroup.position.x, D.headY, cupGroup.position.z);
    world.add(head);
    stream = own(new THREE.CylinderGeometry(0.022, 0.022, 1, 10), toonMat({ color: '#4a2a17' }));
    stream.castShadow = false; stream.visible = false;
    world.add(stream);
    const puffMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false });
    puffMat.userData.outlineParameters = { visible: false };
    for (let i = 0; i < 5; i++) { const p = own(new THREE.SphereGeometry(0.06, 8, 6), puffMat.clone()); p.castShadow = false; p.visible = false; puffs.push(p); world.add(p); }

    // each station's kit on a mat on the counter
    stations.forEach((s) => {
      const mat = box3((s.w - 6) / SCALE, 0.02, depth(s.h - 6), '#fff3e0');
      mat.position.copy(s3.at(s.x + s.w / 2, s.y + s.h / 2, TOP + 0.01)); world.add(mat);
      const m = mk(s.key);
      m.geometry.computeBoundingBox();
      const sz = m.geometry.boundingBox.getSize(new THREE.Vector3());
      const kk = Math.min((s.w * 0.6) / SCALE / sz.x, (s.h * 0.62) / (sz.y * SCALE * s3.cosE + sz.z * SCALE * s3.sinE));
      m.scale.setScalar(kk);
      m.rotation.y = -0.35;
      m.position.copy(s3.at(s.x + s.w / 2, s.y + s.h * 0.66, TOP + 0.02));
      m.userData.y = m.position.y;
      world.add(m); props.push(m);
    });

    // the barista, behind the counter left of the cup
    if (barista) s3.dropCritter(barista);
    barista = s3.critter({ ...ctx.critter, scale: L.wide ? 0.95 : 1.1 });
    const bx = Math.max(a.x + 40, Math.min(L.cupX - D.r1 * SCALE - 46, a.x + a.w * 0.2));
    const spot = s3.under(bx, D.back - 30, TOP);
    barista.setPosition(spot.x, 0, spot.z);
    barista.object.rotation.y = 0.3; barista.face(0.3);
  }

  /** Rebuild the liquid layers when the cup's contents change. */
  function syncLayers(layers) {
    const sig = layers.join(',');
    if (sig === layerSig) return;
    layerSig = sig;
    for (const m of layerMeshes) { m.removeFromParent(); m.traverse((o) => o.geometry?.dispose()); }
    layerMeshes = [];
    const total = layers.reduce((s, k) => s + ING[k].h, 0);
    const sc = Math.min(L.cupH / 92, (L.cupH * 0.94) / Math.max(1, total));
    const rAt = (y) => (D.r0 + (D.r1 - D.r0) * clamp(y / D.hm, 0, 1)) * 0.93;
    let y = 0;
    layers.forEach((k, i) => {
      const ing = ING[k], h = Math.max(0.01, (ing.h * sc / L.cupH) * D.hm * 0.96);
      const geo = new THREE.CylinderGeometry(rAt(y + h), rAt(y), h, 28); geo.translate(0, h / 2, 0);
      const mat = k === 'ice' ? toonMat({ color: '#cfeaf8', transparent: true, opacity: 0.7 }) : toonMat({ color: ing.color });
      const m = own(geo, mat); m.castShadow = false;
      m.position.y = y;
      if (k === 'ice') {
        for (let j = 0; j < 4; j++) {
          const c = own(new THREE.BoxGeometry(h * 0.7, h * 0.7, h * 0.7), toonMat({ color: '#f4fbff' }));
          const ang = j * 1.7 + 0.4; c.position.set(Math.cos(ang) * rAt(y) * 0.5, h * 0.5, Math.sin(ang) * rAt(y) * 0.5); c.rotation.set(j, j * 0.7, 0);
          m.add(c);
        }
      }
      if (k === 'foam' || k === 'cream') {
        const r = rAt(y + h), n = k === 'cream' ? 7 : 9, br = k === 'cream' ? r * 0.36 : r * 0.2;
        for (let j = 0; j < n; j++) {
          const b = own(new THREE.SphereGeometry(br, 10, 8), toonMat({ color: k === 'cream' ? '#ffffff' : '#fff6ea' }));
          const ang = (j / n) * Math.PI * 2; b.position.set(Math.cos(ang) * r * 0.55, h, Math.sin(ang) * r * 0.55); b.scale.y = 0.7;
          m.add(b);
        }
        if (k === 'cream') { const tip = own(new THREE.SphereGeometry(r * 0.42, 12, 8), toonMat({ color: '#ffffff' })); tip.position.y = h + r * 0.25; m.add(tip); }
      }
      if (k === 'caramel') {
        const ring = own(new THREE.TorusGeometry(rAt(y + h) * 0.6, 0.015, 6, 24), toonMat({ color: '#a8641c' })); ring.rotation.x = Math.PI / 2; ring.position.y = h + 0.01; m.add(ring);
      }
      layerGroup.add(m); layerMeshes.push(m);
      y += h;
    });
    D.fillTop = y;
  }

  function draw() {
    if (needBuild) { needBuild = false; build(); }
    const now = performance.now() / 1000;
    const layers = drain ? drain.layers : cup;
    syncLayers(layers);
    const tilt = drain ? ease(drain.t / 0.5) : 0;
    layerMeshes.forEach((m, i) => { m.scale.y = i === layerMeshes.length - 1 && !drain ? Math.max(0.02, ease(pourT)) : 1; });
    layerGroup.scale.y = Math.max(0.001, 1 - tilt);
    cupGroup.rotation.z = -tilt * 0.9;
    const iced = cup[0] === 'ice' || (drain && drain.layers[0] === 'ice');
    handle.visible = !iced;
    // the stream from the group head while a step pours in
    const top = layers.length ? layerMeshes.reduce((s, m) => s + m.geometry.parameters.height * m.scale.y, 0) : 0;
    const surface = TOP + 0.07 + top * layerGroup.scale.y;
    const pouringKey = busy ? busy.ing : (!drain && pourT < 1 && cup.length && ['water', 'cold', 'choc', 'vanilla', 'caramel'].includes(cup[cup.length - 1]) ? cup[cup.length - 1] : null);
    stream.visible = !!pouringKey;
    if (pouringKey) {
      const yTop = D.headY - 0.09, len = Math.max(0.02, yTop - surface);
      stream.material = toonMat({ color: ING[pouringKey].color === '#ffffff' ? '#f1e8dc' : ING[pouringKey].color });
      stream.scale.set(1, len, 1);
      stream.position.set(head.position.x, surface + len / 2, head.position.z);
    }
    // steam over the cup while a shot pulls or the milk steams
    puffs.forEach((p, i) => {
      p.visible = !!busy;
      if (!busy) return;
      const k = (now * 0.9 + i / puffs.length) % 1;
      p.position.set(cupGroup.position.x + Math.sin(now * 2 + i * 2) * D.r1 * 0.5, surface + 0.1 + k * 0.7, cupGroup.position.z + Math.cos(i * 1.3) * D.r1 * 0.3);
      p.scale.setScalar(0.7 + k * 1.4);
      p.material.opacity = 0.65 * (1 - k);
    });
    props.forEach((m, i) => {
      const s = stations[i], down = pressed && pressed.k === s.key && pressed.t < 0.12, working = busy && busy.ing === s.key;
      m.position.y = m.userData.y - (down ? 0.03 : 0) + (working ? Math.abs(Math.sin(now * 18)) * 0.02 : 0);
    });
    if (barista && busy && !barista.gesture) barista.play('pour', busy.dur);
    s3.render();

    // 2D overlay: tickets, station labels, buttons, notes
    const { W } = view, a = L.cupArea;
    s3.begin2d();
    orders.forEach(drawTicket);
    if (!orders.length) text(g, 'Waiting for orders…', L.tickets.x + L.tickets.w / 2, L.tickets.y + L.tickets.h / 2, { size: 16, color: C.ink, weight: 700, stroke: '#fff' });
    stations.forEach((s, i) => {
      const ing = ING[s.key];
      const down = pressed && pressed.k === s.key && pressed.t < 0.12;
      const working = busy && busy.ing === s.key;
      g.save();
      rr(g, s.x + 2, s.y + 2, s.w - 4, s.h - 4, 14);
      if (busy && !working) { g.fillStyle = 'rgba(246,239,228,.4)'; g.fill(); }
      if (down) { g.fillStyle = 'rgba(255,214,107,.35)'; g.fill(); }
      g.lineWidth = working ? 4 : 2; g.strokeStyle = working ? C.leaf : 'rgba(156,106,63,.45)'; g.stroke();
      g.restore();
      fitText(ing.short, s.x + s.w / 2, s.y + s.h - Math.min(11, s.h * 0.15), s.w - 8, Math.min(13, s.h * 0.19), { color: C.ink, weight: 800, stroke: '#fff' });
      if (L.wide) text(g, String((i + 1) % 10), s.x + 13, s.y + 14, { size: 11, color: C.muted, weight: 800, stroke: '#fff' });
      if (working) { const k = clamp(busy.t / busy.dur, 0, 1); box(g, s.x + 8, s.y + s.h - 6, (s.w - 16) * k, 4, { fill: C.leaf, r: 2 }); }
    });
    const can = !!ready() && !busy && !drain;
    const pk = (k) => pressed && pressed.k === k && pressed.t < 0.12;
    drawButton(L.serve, { label: can ? 'Serve it!' : 'Serve', pic: 'bell', fill: can ? C.leaf : '#fff', stroke: can ? C.leafD : C.line, color: can ? '#fff' : C.muted, on: can, down: pk('serve') });
    drawButton(L.drain, { label: 'Tip out', pic: 'tip', on: cup.length > 0 && !busy, down: pk('drain') });
    drawButton(L.hint, { label: hintT > 0 ? 'Hide' : 'Recipes', pic: 'book', fill: hintT > 0 ? C.paper2 : '#fff', down: pk('hint') });
    // what's going into the cup
    if (busy) {
      const k = clamp(busy.t / busy.dur, 0, 1), bx = L.cupX + L.cupW * 0.5 + 40, by = L.cupBottom - L.cupH * 0.55;
      circle(g, bx, by, 22, '#fff', C.line, 2);
      g.drawImage(pic(s3.renderer, busy.ing), bx - 17, by - 17, 34, 34);
      g.beginPath(); g.arc(bx, by, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.strokeStyle = C.leaf; g.lineWidth = 4; g.stroke();
    }
    if (readT > 0) text(g, 'Reading the recipes…', L.cupX, a.y + 10, { size: 13, color: C.seaD, weight: 700, stroke: '#fff' });
    // drinks flying to the tickets
    for (const s of served) {
      const k = ease(s.t / 0.45), sz = 44 - 18 * k;
      g.drawImage(pic(s3.renderer, 'drink', { iced: !!s.iced }), lerp(s.x0, s.x1, k) - sz / 2, lerp(s.y0, s.y1, k) - Math.sin(k * Math.PI) * 40 - sz / 2, sz, sz);
    }
    pops.draw(g);
    const el = ctx.elapsed();
    if (started && el < 7) {
      const msg = cup.length ? 'Keep following the recipe, then Serve' : 'Tap the stations in the order on the ticket';
      text(g, msg, L.cupX, a.y + (L.wide ? 2 : 4), { size: 13, color: C.ink, weight: 700, alpha: 1 - Math.max(0, el - 5) / 2, stroke: '#fff' });
    }
  }

  function fitText(s, x, y, maxW, size, opts = {}) {
    g.font = `${opts.weight || 700} ${size}px Fredoka, Nunito, system-ui, sans-serif`;
    const w = g.measureText(s).width;
    text(g, s, x, y, { ...opts, size: w > maxW ? Math.max(9, size * maxW / w) : size });
  }

  function drawTicket(o, i) {
    const r = ticketRect(i);
    const fade = o.gone ? clamp(o.gone - 1, 0, 0.45) / 0.45 : 0;
    const enter = ease(o.born / 0.3);
    g.save();
    g.globalAlpha = (1 - fade) * (o.gone ? 1 : enter);
    const dy = o.gone ? -fade * 30 : (1 - enter) * -20;
    g.translate(0, dy);
    const k = o.left / o.patience;
    const match = !o.gone && cup.length && isPrefix(cup, o.drink.recipe);
    box(g, r.x, r.y, r.w, r.h, { fill: o.gone ? (o.ok ? '#e6f7ee' : '#fde7ea') : C.paper, stroke: match ? C.leaf : C.line, lw: match ? 4 : 3, r: 12, shadow: 4 });
    // ticket pin + name
    circle(g, r.x + r.w / 2, r.y + 2, 5, C.berry);
    g.drawImage(pic(s3.renderer, 'drink', { iced: !!o.drink.iced }), r.x + 4, r.y + 6, 30, 30);
    fitText(o.drink.name, r.x + r.w / 2 + 10, r.y + 23, r.w - 50, 16, { weight: 700, color: C.ink });
    // the recipe, or how many steps it has
    const show = !learned.has(o.drink.name) || hintT > 0;
    const steps = o.drink.recipe, n = steps.length;
    const sz = Math.min(24, (r.w - 16) / n - 2), sp = sz + 2;
    const rowY = r.y + r.h * 0.55;
    steps.forEach((s, j) => {
      const x = r.x + r.w / 2 + (j - (n - 1) / 2) * sp;
      const done = match && j < cup.length;
      circle(g, x, rowY, sz / 2 + 1, done ? '#dff3e7' : '#fff', done ? C.leaf : C.line, 2);
      if (show || done) { const is = sz * 0.95; g.drawImage(pic(s3.renderer, s), x - is / 2, rowY - is / 2, is, is); }
      else text(g, '?', x, rowY + 1, { size: sz * 0.6, color: C.muted, weight: 800 });
    });
    if (show && !learned.has(o.drink.name) && !o.gone) text(g, 'New recipe', r.x + r.w / 2, rowY + sz / 2 + 10, { size: 10, color: C.seaD, weight: 700 });
    // patience
    const bx = r.x + 10, bw = r.w - 20, by = r.y + r.h - 16;
    box(g, bx, by, bw, 8, { fill: C.line, r: 4 });
    if (!o.gone) box(g, bx, by, Math.max(8, bw * k), 8, { fill: k > 0.5 ? C.leaf : k > 0.25 ? C.butter : C.berry, r: 4 });
    if (o.gone) text(g, o.ok ? '✓' : '✗', r.x + r.w - 16, r.y + 22, { size: 22, color: o.ok ? C.leafD : C.berryD, weight: 800 });
    g.restore();
  }

  function drawButton(r, { label, pic: p, fill = '#fff', stroke = C.line, color = C.muted, on = true, down = false }) {
    const dy = down ? 3 : 0;
    g.save(); if (!on) g.globalAlpha = 0.55;
    box(g, r.x, r.y + dy, r.w, r.h, { fill, r: 14, shadow: down ? 0 : 4, stroke });
    const es = Math.min(38, r.h * 0.62);
    if (p) g.drawImage(pic(s3.renderer, p), r.x + r.w / 2 - es / 2, r.y + r.h / 2 - (label ? r.h * 0.14 : 0) - es / 2 + dy, es, es);
    if (label) fitText(label, r.x + r.w / 2, r.y + r.h - Math.min(11, r.h * 0.16) + dy, r.w - 8, Math.min(12, r.h * 0.18), { color, weight: 700 });
    g.restore();
  }

  return {
    start() { started = true; spawn(); spawn(); spawnT = 4; },
    update(dt) { if (!ctx.over && started) step(dt); else pops.update(dt); },
    draw,
    /** For automated play-tests. */
    peek() {
      return {
        view: { ...view }, L, stations: stations.map((s) => ({ ...s })),
        orders: orders.filter((o) => !o.gone).map((o) => ({ id: o.id, name: o.drink.name, recipe: [...o.drink.recipe], left: o.left, shown: !learned.has(o.drink.name) || hintT > 0 })),
        cup: [...cup], busy: busy ? { ...busy } : null, draining: !!drain, reading: readT, hint: hintT, ready: !!ready(),
      };
    },
    destroy() { offPointer(); window.removeEventListener('keydown', onKey); s3.destroy(); },
  };
}
