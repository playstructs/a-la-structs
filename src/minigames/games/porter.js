/**
 * Kitchen Porter — "Back Door Delivery". Delivery crates land on the back
 * dock in batches; drag each into the walk-in (cold), the dry store or the
 * produce racks (+1). The wrong store bounces it back. The dock only holds
 * so many: when a new crate won't fit, the oldest one goes back on the van
 * (no penalty, but it's a point you didn't get). Stations post requests ("Need 🧀!"): drag a matching item from a
 * store, or straight off the dock, to the station before its timer runs out
 * (+2). Score = crates.
 *
 * Wide screens: dock on the left, stations along the top, stores below them.
 * Phones: stations on top, the three stores in the middle, the dock below.
 * Tap-tap works too: tap a crate to pick it up, tap where it goes.
 * Drawn in the restaurant's 3D toon style; labels, counts and request
 * bubbles are the 2D overlay.
 */
import { pointer, C, box, circle, text, rr, lerp, ease, clamp, inRect, pick, Pops } from '../kit.js';
import { stage3d } from '../kit3d.js';
import { model, defineModel, icon } from '../models.js';
import * as THREE from 'three';
import { toonMat } from '../../three/toon.js';
import { itemMesh } from '../../three/items.js';

const ZONES = [
  { key: 'cold', name: 'Walk-in', the: 'the walk-in', icon: '❄️', items: ['🥩', '🐟', '🧀', '🥛'], fill: '#e3f1fb', edge: C.seaD, head: C.sea },
  { key: 'dry', name: 'Dry store', the: 'the dry store', icon: '📦', items: ['🍚', '🥫', '🫘', '🧂'], fill: '#fbf0dc', edge: C.woodD, head: C.wood },
  { key: 'prod', name: 'Produce', the: 'the produce racks', icon: '🧺', items: ['🥕', '🥬', '🍎', '🧅'], fill: '#e6f6ea', edge: C.leafD, head: C.leaf },
];
const CAT = new Map(ZONES.flatMap((z) => z.items.map((ch) => [ch, z.key])));
const ALL = ZONES.flatMap((z) => z.items);
const STATIONS = [
  { key: 'line', name: 'Line', icon: '🔥' },
  { key: 'bar', name: 'Bar', icon: '🍸' },
  { key: 'bakery', name: 'Bakery', icon: '🥐' },
];
const SLOTS = 6;
const SORT = 1, REQUEST = 2;
const rand = (a, b) => a + Math.random() * (b - a);

/* 3D look */
const SCALE = 120;                 // view units per metre
const DOCK_H = 0.12;               // the dock platform
const LIFT = 0.6;                  // things in your hand float this high (in front of the counters)
const PORTER = 0.42;                // the porter critter's size
const ITEM_MODEL = {
  '🥩': 'porter:steak', '🐟': 'porter:fish', '🧀': 'cheese', '🥛': 'porter:milk',
  '🍚': 'porter:rice', '🥫': 'porter:can', '🫘': 'porter:beans', '🧂': 'porter:salt',
  '🥕': 'porter:carrot', '🥬': 'lettuce', '🍎': 'porter:apple', '🧅': 'onion',
};
const NAME = { '🥩': 'steak', '🐟': 'fish', '🧀': 'cheese', '🥛': 'milk', '🍚': 'rice', '🥫': 'tomato cans', '🫘': 'beans', '🧂': 'salt', '🥕': 'carrots', '🥬': 'lettuce', '🍎': 'apples', '🧅': 'onions' };
const LOOK = {
  cold: { floor: '#d6ecfa', head: '#8fc3e6', bin: '#c9d3da' },
  dry: { floor: '#f4e2c4', head: '#c98f5a', bin: '#e4b583' },
  prod: { floor: '#d8f0dd', head: '#5fc293', bin: '#c9a27a' },
};
const STATION_LOOK = {
  line: { body: '#8e9ba8', props: ['pan', 'pot'] },
  bar: { body: '#1f6f78', props: ['cocktail', 'shaker'] },
  bakery: { body: '#f7c6d0', props: ['croissant', 'cake'] },
};
defineModel('porter:steak', (b) => { b.box(0.14, 0.035, 0.1, '#d9455f', { y: 0.018 }, 0.016); b.box(0.14, 0.037, 0.022, '#ffe3e3', { y: 0.018, z: 0.045 }, 0.008); b.sphere(0.012, '#ff8fa3', { x: -0.03, y: 0.036, sy: 0.3 }); b.sphere(0.01, '#ff8fa3', { x: 0.03, y: 0.036, z: -0.02, sy: 0.3 }); });
defineModel('porter:fish', (b) => { b.sphere(0.05, '#8ecae6', { y: 0.035, sx: 1.7, sy: 0.7, sz: 0.6 }); b.sphere(0.04, '#e3f3ff', { y: 0.028, x: 0.01, sx: 1.6, sy: 0.45, sz: 0.62 }); b.cone(0.04, 0.05, '#5ab3e8', { x: -0.1, y: 0.035, rz: Math.PI / 2 }, 4); b.sphere(0.009, '#2b2d42', { x: 0.06, y: 0.045, z: 0.024 }); });
defineModel('porter:milk', (b) => { b.box(0.07, 0.12, 0.07, '#ffffff', { y: 0.06 }, 0.006); b.flat(0.074, 0.04, 0.074, '#5ab3e8', { y: 0.06 }); b.box(0.07, 0.035, 0.03, '#ffffff', { y: 0.13 }, 0.004); b.flat(0.03, 0.02, 0.03, '#5ab3e8', { y: 0.155 }); });
defineModel('porter:rice', (b) => { b.sphere(0.065, '#f4ead2', { y: 0.065, sy: 1.05 }); b.cyl(0.022, 0.035, 0.03, '#c9a27a', { y: 0.13 }); b.sphere(0.028, '#f4ead2', { y: 0.155 }); b.flat(0.07, 0.04, 0.02, '#e8505b', { y: 0.065, z: 0.058 }); });
defineModel('porter:can', (b) => { b.cyl(0.045, 0.045, 0.1, '#c9d3da', { y: 0.05 }); b.cyl(0.047, 0.047, 0.06, '#e8505b', { y: 0.05 }); b.sphere(0.018, '#ff8a80', { y: 0.05, z: 0.042, sz: 0.3 }); });
defineModel('porter:beans', (b) => { b.cyl(0.06, 0.045, 0.05, '#c98f5a', { y: 0.025 }); for (let i = 0; i < 9; i++) b.sphere(0.016, i % 2 ? '#7a3e22' : '#9c5a35', { x: Math.cos(i * 2.1) * 0.032 * (i % 3 ? 1 : 0.2), y: 0.055 + (i % 2) * 0.008, z: Math.sin(i * 2.1) * 0.032 * (i % 3 ? 1 : 0.2), sx: 1.4 }); });
defineModel('porter:salt', (b) => { b.cyl(0.04, 0.04, 0.12, '#5aa9e6', { y: 0.06 }); b.cyl(0.042, 0.042, 0.03, '#ffffff', { y: 0.065 }); b.cyl(0.043, 0.043, 0.02, '#ffffff', { y: 0.128 }); b.cyl(0.012, 0.012, 0.012, '#c9d3da', { y: 0.143 }); });
defineModel('porter:carrot', (b) => { b.cone(0.03, 0.16, '#f28c28', { x: 0.02, y: 0.03, rz: -Math.PI / 2 }, 8); for (const a of [-0.4, 0, 0.4]) b.cone(0.013, 0.06, '#5aa469', { x: -0.09, y: 0.035, rz: Math.PI / 2 + a }, 5); });
defineModel('porter:apple', (b) => { b.sphere(0.05, '#d62839', { y: 0.05, sy: 1.05 }); b.sphere(0.03, '#d62839', { y: 0.085, x: 0.018 }); b.sphere(0.03, '#d62839', { y: 0.085, x: -0.018 }); b.cyl(0.006, 0.006, 0.045, '#7a3e22', { y: 0.115, rz: 0.2 }); b.sphere(0.028, '#5aa469', { x: 0.03, y: 0.125, sx: 1.4, sy: 0.25, rz: 0.4 }); b.sphere(0.012, '#ff8a80', { x: -0.02, y: 0.07, z: 0.035 }); });
defineModel('porter:crate', (b) => {
  const c = '#c9a27a', d = '#b08968';
  b.box(0.4, 0.03, 0.3, d, { y: 0.015 }, 0.01);
  for (const z of [-0.135, 0.135]) b.box(0.4, 0.2, 0.03, c, { y: 0.1, z }, 0.01);
  for (const x of [-0.185, 0.185]) b.box(0.03, 0.2, 0.3, c, { x, y: 0.1 }, 0.01);
  for (const y of [0.06, 0.15]) b.flat(0.406, 0.022, 0.306, d, { y });
  b.box(0.34, 0.02, 0.24, '#f2d58a', { y: 0.14 }, 0.006);
});
defineModel('porter:bin', (b, o) => {
  const c = o.color || '#c9d3da';
  b.flat(1, 0.02, 1, c, { y: 0.01 });
  for (const z of [-0.48, 0.48]) b.flat(1, 0.07, 0.04, c, { y: 0.035, z });
  for (const x of [-0.48, 0.48]) b.flat(0.04, 0.07, 1, c, { x, y: 0.035 });
});
defineModel('porter:frost', (b) => { b.sphere(0.05, '#ffffff', { y: 0.02, sy: 0.4 }); b.sphere(0.03, '#eaf6ff', { x: 0.05, y: 0.02, sy: 0.5 }); });

export default function create(ctx) {
  const s3 = stage3d(ctx.el, { scale: SCALE, quality: ctx.quality });
  const st = s3.ui, view = s3.view, g = s3.g;
  const pops = new Pops();
  const L = { zones: [], stations: [], slots: [] };
  const stock = Object.fromEntries(ZONES.map((z) => [z.key, Object.fromEntries(z.items.map((ch) => [ch, 0]))]));
  const stations = STATIONS.map((s, i) => ({ ...s, req: null, cool: 3 + i * 5, shake: 0, happy: 0 }));
  let crates = [];                 // on the dock (or in hand / flying back)
  let flyers = [];                 // cosmetic: items flying into a store or back to a cell
  let held = null;                 // { item, x, y, sx, sy, moved, id }
  let selected = null;             // tap-tap: item waiting for a destination
  let nextBatch = 0, honk = 0, uid = 0, lost = 0, sorted = 0, filled = 0, wrong = 0, missedReq = 0;
  let firstReq = -1;

  /* ── layout ─────────────────────────────────────────────────────── */
  function layout() {
    const { W, H } = view;
    const pad = 10;
    if (view.portrait) {
      const stH = 96;
      L.stations = STATIONS.map((s, i) => { const w = (W - pad * 4) / 3; return { x: pad + i * (w + pad), y: pad, w, h: stH }; });
      const dockH = clamp(H * 0.36, 200, 300);
      L.dock = { x: pad, y: H - dockH - pad, w: W - pad * 2, h: dockH };
      const zTop = pad * 2 + stH, zH = L.dock.y - pad - zTop;
      L.zones = ZONES.map((z, i) => { const w = (W - pad * 4) / 3; return { x: pad + i * (w + pad), y: zTop, w, h: zH }; });
      L.door = { x: L.dock.x + 8, y: L.dock.y + 8, w: L.dock.w - 16, h: 40 };
      const cols = 3, rows = 2, top = L.door.y + L.door.h + 8, sw = (L.dock.w - 16) / cols, sh = (L.dock.y + L.dock.h - 8 - top) / rows;
      L.slots = Array.from({ length: SLOTS }, (_, i) => ({ x: L.dock.x + 8 + (i % cols) * sw + sw / 2, y: top + Math.floor(i / cols) * sh + sh / 2 }));
    } else {
      const dockW = clamp(W * 0.27, 190, 250);
      L.dock = { x: pad, y: pad, w: dockW, h: H - pad * 2 };
      L.door = { x: L.dock.x + 8, y: L.dock.y + 8, w: L.dock.w - 16, h: 44 };
      const cols = 2, rows = 3, top = L.door.y + L.door.h + 6, sw = (L.dock.w - 16) / cols, sh = (L.dock.y + L.dock.h - 6 - top) / rows;
      L.slots = Array.from({ length: SLOTS }, (_, i) => ({ x: L.dock.x + 8 + (i % cols) * sw + sw / 2, y: top + Math.floor(i / cols) * sh + sh / 2 }));
      const x0 = L.dock.x + L.dock.w + pad * 1.5, w = (W - x0 - pad * 3) / 3, stH = 96;
      L.stations = STATIONS.map((s, i) => ({ x: x0 + i * (w + pad), y: pad, w, h: stH }));
      L.zones = ZONES.map((z, i) => ({ x: x0 + i * (w + pad), y: pad * 2 + stH, w, h: H - stH - pad * 3 }));
    }
    // a 2 × 2 grid of item cells in each store
    for (const [i, z] of L.zones.entries()) {
      // tall, narrow stores (phones) stack their four cells; wide ones use a 2 × 2 grid
      const head = 34, cols = z.h - head > z.w * 2.2 ? 1 : 2, rows = 4 / cols;
      const cw = (z.w - 12 - (cols - 1) * 6) / cols, ch = Math.min(cols === 1 ? 84 : 70, (z.h - head - 8 - (rows - 1) * 6) / rows);
      const gy = z.y + head + Math.max(4, (z.h - head - 6 - ch * rows - (rows - 1) * 6) / 2);
      z.cells = ZONES[i].items.map((it, k) => ({ ch: it, x: z.x + 6 + (k % cols) * (cw + 6), y: gy + Math.floor(k / cols) * (ch + 6), w: cw, h: ch }));
    }
    for (const c of crates) if (c.state === 'dock') { const s = L.slots[c.slot]; c.x = s.x; c.y = s.y; }
    L.rev = (L.rev || 0) + 1;   // the 3D set is rebuilt on the next frame
  }
  layout();
  view.onResize = layout;
  const crateSize = () => { const s = L.slots; const dx = s.length > 1 ? Math.abs(s[1].x - s[0].x) : 80; return clamp(dx - 14, 56, 78); };

  /* ── deliveries ─────────────────────────────────────────────────── */
  const prog = () => clamp(ctx.elapsed() / ctx.seconds, 0, 1);
  const onDock = () => crates.filter((c) => c.state !== 'gone');

  function deliver(n, stagger = 0.3) {
    for (let k = 0; k < n; k++) {
      const ch = pick(ALL);
      const used = new Set(onDock().map((c) => c.slot));
      let slot = [...Array(SLOTS).keys()].find((i) => !used.has(i));
      if (slot === undefined) {
        // no room: the oldest crate that isn't in your hands goes back on the van
        const old = onDock().filter((c) => !(held && held.item.crate === c) && !(selected && selected.crate === c)).sort((a, b) => a.born - b.born)[0];
        if (!old) continue;
        slot = old.slot; old.state = 'gone';
        lost++;
        ctx.sfx.miss(); ctx.sfx.work('clank', { vol: 0.5 });
        honk = 1;
        pops.add('Honk! Back on the van', clamp(old.x, 90, view.W - 90), old.y - 30, C.berryD, 16);
      }
      const s = L.slots[slot];
      crates.push({ id: ++uid, ch, cat: CAT.get(ch), slot, x: s.x, y: s.y, state: 'dock', born: ctx.elapsed() + k * 0.01, arrive: -k * stagger });
    }
    crates = crates.filter((c) => c.state !== 'gone');
    ctx.sfx.work('thud', { vol: 0.5 });
  }
  deliver(3, 0);
  for (const c of crates) c.arrive = 1;

  /* ── requests ───────────────────────────────────────────────────── */
  function post(s) {
    const inStock = ALL.filter((ch) => stock[CAT.get(ch)][ch] > 0);
    const docked = crates.map((c) => c.ch).filter((ch) => !stations.some((o) => o.req?.ch === ch));
    const pool = Math.random() < 0.75 && inStock.length ? inStock : Math.random() < 0.7 && docked.length ? docked : ALL;
    const ch = pick(pool);
    const time = lerp(13, 9, prog());
    s.req = { ch, left: time, time };
    if (firstReq < 0) firstReq = ctx.elapsed();
    ctx.sfx.pop();
  }

  /* ── moving things around ───────────────────────────────────────── */
  function itemAt(p) {
    const half = crateSize() / 2 + 4;
    for (const c of [...crates].reverse()) if (c.state === 'dock' && Math.abs(p.x - c.x) < half && Math.abs(p.y - c.y) < half) return { ch: c.ch, cat: c.cat, from: 'dock', crate: c };
    for (const [i, z] of L.zones.entries()) for (const cell of z.cells) {
      if (inRect(p, cell) && stock[ZONES[i].key][cell.ch] > 0) return { ch: cell.ch, cat: ZONES[i].key, from: 'store', cell };
    }
    return null;
  }

  function take(item) {
    if (item.from === 'dock') item.crate.state = 'held';
    else stock[item.cat][item.ch]--;
  }

  function putBack(item, from) {
    if (item.from === 'dock') { const c = item.crate; c.state = 'back'; c.fx = from.x; c.fy = from.y; c.bt = 0; }
    else { stock[item.cat][item.ch]++; flyers.push({ ch: item.ch, x0: from.x, y0: from.y, x1: item.cell.x + item.cell.w / 2, y1: item.cell.y + item.cell.h / 2, t: 0 }); }
  }

  function remove(item) { if (item.from === 'dock') { item.crate.state = 'gone'; crates = crates.filter((c) => c !== item.crate); } }

  const grow = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 });

  function dropAt(item, p) {
    const si = L.stations.findIndex((r) => inRect(p, grow(r, 8)));
    if (si >= 0) {
      const s = stations[si], r = L.stations[si];
      if (s.req && s.req.ch === item.ch) {
        remove(item);
        s.req = null; s.cool = rand(lerp(9, 6, prog()), lerp(14, 10, prog())); s.happy = 0.8;
        filled++;
        ctx.add(REQUEST);
        cheer = 1;
        ctx.sfx.serve(); ctx.sfx.good(filled);
        pops.add(`Thanks! +${REQUEST}`, r.x + r.w / 2, r.y + r.h + 14, C.leafD, 18);
        return;
      }
      putBack(item, p);
      s.shake = 0.4; wrong++;
      oops = 1;
      ctx.sfx.miss();
      pops.add(s.req ? `${s.name} needs ${NAME[s.req.ch]}` : `${s.name} didn’t ask`, clamp(r.x + r.w / 2, 80, view.W - 80), r.y + r.h + 14, C.berryD, 15);
      return;
    }
    const zi = L.zones.findIndex((r) => inRect(p, grow(r, 6)));
    if (zi >= 0 && item.from === 'dock') {
      const z = ZONES[zi], r = L.zones[zi];
      if (z.key === item.cat) {
        remove(item);
        stock[z.key][item.ch]++;
        sorted++;
        ctx.add(SORT);
        cheer = 0.7;
        ctx.sfx.work(z.key === 'cold' ? 'clank' : 'thud', { vol: 0.55 }); ctx.sfx.good(Math.min(6, sorted % 7));
        const cell = r.cells.find((c) => c.ch === item.ch);
        flyers.push({ ch: item.ch, x0: p.x, y0: p.y, x1: cell.x + cell.w / 2, y1: cell.y + cell.h / 2, t: 0 });
        pops.add(`+${SORT}`, cell.x + cell.w / 2, cell.y, C.leafD, 18);
        return;
      }
      putBack(item, p);
      wrong++;
      oops = 1;
      ctx.sfx.miss();
      pops.add(`That goes in ${ZONES.find((x) => x.key === item.cat).the}`, clamp(r.x + r.w / 2, 110, view.W - 110), r.y + 50, C.berryD, 14);
      return;
    }
    putBack(item, p);
  }

  const offPointer = pointer(st, {
    down: (p) => {
      if (ctx.over || held) return;
      const it = itemAt(p);
      if (it) {
        if (selected) { putBack(selected, selected.at); selected = null; }
        take(it);
        held = { item: it, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: 0, id: p.id };
        ctx.sfx.pop();
        return;
      }
      if (selected) { const s = selected; selected = null; dropAt(s, p); }
    },
    move: (p) => {
      if (!held || held.id !== p.id) return;
      held.moved = Math.max(held.moved, Math.hypot(p.x - held.sx, p.y - held.sy));
      held.x = p.x; held.y = p.y;
    },
    up: (p) => {
      if (!held || held.id !== p.id) return;
      const h = held; held = null;
      if (h.moved < 12) {
        // a tap: keep it picked up and wait for a second tap on where it goes
        selected = { ...h.item, at: { x: h.sx, y: h.sy } };
        if (selected.from === 'dock') selected.crate.state = 'held';
        return;
      }
      dropAt(h.item, p);
    },
  });

  /* ── update ─────────────────────────────────────────────────────── */
  function step(dt) {
    nextBatch -= dt;
    if (nextBatch <= 0) {
      deliver(3 + (Math.random() < 0.3 + prog() * 0.5 ? 1 : 0) + (Math.random() < prog() * 0.4 ? 1 : 0));
      nextBatch = rand(lerp(5.5, 3.2, prog()), lerp(6.5, 4, prog()));
    }
    for (const s of stations) {
      s.shake = Math.max(0, s.shake - dt); s.happy = Math.max(0, s.happy - dt);
      if (s.req) {
        s.req.left -= dt;
        if (s.req.left <= 0) {
          missedReq++;
          const r = L.stations[stations.indexOf(s)];
          pops.add('Never mind…', r.x + r.w / 2, r.y + r.h + 14, C.muted, 14);
          ctx.sfx.complain();
          s.req = null; s.cool = rand(6, 10);
        }
      } else if (ctx.elapsed() > 4) {
        s.cool -= dt;
        if (s.cool <= 0 && stations.filter((o) => o.req).length < (prog() < 0.35 ? 1 : 2)) post(s);
      }
    }
    for (const c of crates) {
      if (c.arrive < 1) c.arrive += dt / 0.4;
      if (c.state === 'back') { c.bt += dt / 0.22; if (c.bt >= 1) c.state = 'dock'; }
    }
    for (const f of flyers) f.t += dt / 0.25;
    flyers = flyers.filter((f) => f.t < 1);
    honk = Math.max(0, honk - dt);
  }


  /* ── the 3D back of house ───────────────────────────────────────── */
  const world = new THREE.Group();
  s3.add(world);
  const S = SCALE, sinE = s3.sinE, cosE = s3.cosE;
  const depth = (units) => units / (S * sinE);
  const rise = (units) => units / (S * cosE);      // metres of height that cover `units` of screen
  let builtRev = -1, me = null, van = null, vanX = 0;
  let cheer = 0, oops = 0;                         // cosmetic: reactions requested by the logic
  const crateMeshes = new Map(), flyerMeshes = new Map(), cellViews = [], stationViews = [];
  let heldMesh = null, heldKey = null;

  function box3(w, h, d, color, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat({ color }));
    m.userData.ownGeometry = true; m.castShadow = shadow; m.receiveShadow = true;
    return m;
  }
  /** A flat slab whose top shows exactly over rect r at height `top`. */
  function slab(r, top, thick, color, inset = 0) {
    const m = box3(r.w / S - inset, thick, depth(r.h) - inset, color, false);
    m.position.copy(s3.at(r.x + r.w / 2, r.y + r.h / 2, top)); m.position.y = top - thick / 2;
    world.add(m);
    return m;
  }
  /** Item models: a few of the thing, for a crate or a shelf bin. */
  function items(ch, n, k = 1) {
    const grp = new THREE.Group(), kind = ITEM_MODEL[ch];
    const spots = n === 1 ? [[0, 0, 0]] : n === 2 ? [[-0.07, 0, 0.3], [0.07, 0, -0.4]] : [[-0.09, -0.04, 0.4], [0.09, -0.05, -0.5], [0, 0.06, 1.6]];
    for (const [x, z, ry] of spots) { const m = model(kind); m.scale.setScalar(k); m.position.set(x * k * 0.9, 0, z * k * 0.9); m.rotation.y = ry; grp.add(m); }
    return grp;
  }
  const crateK = () => crateSize() / S / 0.4;
  /** A crate with three of its item inside, base at the origin. */
  function crateMesh(ch) {
    const grp = new THREE.Group(), c = model('porter:crate'), it = items(ch, 3, 1.25);
    it.position.y = 0.15; grp.add(c, it);
    grp.scale.setScalar(crateK());
    return grp;
  }
  /** Floor spot so a crate's top shows centred a little above view (x, y). */
  function crateSpot(x, y, h = DOCK_H) {
    const cs = crateSize(), p = s3.under(x, y - cs * 0.17, h + 0.2 * crateK());
    p.y = h;
    return p;
  }

  function build() {
    builtRev = L.rev;
    world.clear();
    crateMeshes.clear(); flyerMeshes.clear(); cellViews.length = 0; stationViews.length = 0; heldMesh = null; heldKey = null;
    world.add(s3.floor('checker', { size: 0.45, a: '#f6efe4', b: '#e6dccd' }));
    const cs = crateSize();
    // the dock: a raised plank platform with a yellow bumper and painted crate spots
    const d = L.dock;
    slab(d, DOCK_H, DOCK_H, '#cbb59a');
    for (let y = d.y + 22; y < d.y + d.h - 4; y += 22) slab({ x: d.x + 2, y, w: d.w - 4, h: 1.6 }, DOCK_H + 0.003, 0.004, '#b39a7c');
    const bump = box3(d.w / S, 0.1, 0.08, '#ffd166'); bump.position.copy(s3.at(d.x + d.w / 2, d.y + d.h, 0.05)); bump.position.y = 0.05; world.add(bump);
    for (const s of L.slots) {
      const x0 = s.x - cs / 2 - 3, y0 = s.y - cs / 2 - 3, w = cs + 6, h = cs * 0.86 + 6, t = 2.5;
      for (const r of [{ x: x0, y: y0, w, h: t }, { x: x0, y: y0 + h - t, w, h: t }, { x: x0, y: y0, w: t, h }, { x: x0 + w - t, y: y0, w: t, h }]) slab(r, DOCK_H + 0.004, 0.006, '#a88c6c');
    }
    // the delivery van backed up to the door, rear doors open
    const door = L.door, vw = door.w * 0.7;
    van = new THREE.Group();
    const vh = rise(door.h + 6), vd = depth(14);
    const body = box3(vw / S, vh, vd, '#f4f1ea'); body.position.y = vh / 2; van.add(body);
    const stripe = box3(vw / S + 0.01, vh * 0.12, vd + 0.01, '#e8505b'); stripe.position.y = vh * 0.8; van.add(stripe);
    const hold = box3(vw / S * 0.8, vh * 0.62, 0.02, '#4a3f4c'); hold.position.set(0, vh * 0.38, vd / 2 + 0.005); van.add(hold);
    for (const sx of [-1, 1]) {
      const lamp = box3(0.06, 0.1, 0.03, '#ff5a5f'); lamp.position.set(sx * (vw / S / 2 - 0.06), vh * 0.55, vd / 2 + 0.01); van.add(lamp);
      const flap = box3(0.04, vh * 0.62, vw / S * 0.4, '#e9e4da'); flap.position.set(sx * (vw / S / 2 + 0.02), vh * 0.38, vd / 2 + vw / S * 0.2); van.add(flap);
    }
    for (let i = 0; i < 3; i++) { const c = model('crate'); c.scale.setScalar(0.7); c.position.set((i - 1) * vw / S * 0.26, 0.02 + (i === 1 ? 0.18 : 0), vd / 2 - 0.1); van.add(c); }
    const bumper = box3(vw / S + 0.04, 0.06, 0.08, '#6d7f8f'); bumper.position.set(0, 0.04, vd / 2 + 0.03); van.add(bumper);
    vanX = door.x + vw / 2 + 4;
    van.position.copy(s3.under(vanX, door.y + door.h, DOCK_H)); van.position.y = DOCK_H;
    world.add(van);
    // the stores: a tinted bay each, a sign board across the top, a bin per item
    L.zones.forEach((r, i) => {
      const z = ZONES[i], look = LOOK[z.key];
      slab(r, 0.03, 0.03, look.floor);
      const head = { x: r.x, y: r.y, w: r.w, h: 32 };
      const hb = box3(r.w / S, rise(30), 0.1, look.head); hb.position.copy(s3.at(r.x + r.w / 2, head.y + head.h, 0)); hb.position.y = rise(30) / 2; hb.position.z -= 0.05; world.add(hb);
      if (z.key === 'cold') {
        // the walk-in: a steel door top with a big handle, frost along the bay
        const handle = box3(0.5, 0.05, 0.06, '#9aa7b1'); handle.position.copy(hb.position); handle.position.z += 0.08; handle.position.y = 0.05; world.add(handle);
        for (let k = 0; k < 6; k++) { const f = model('porter:frost'); f.position.copy(s3.at(r.x + 14 + ((k * 53) % (r.w - 24)), r.y + r.h - 10 - (k % 3) * 8, 0.03)); world.add(f); }
      }
      if (z.key === 'dry') for (const yy of [0.25, 0.5]) { const b = box3(r.w / S, 0.025, 0.12, '#9c6a3f'); b.position.copy(hb.position); b.position.y = rise(30) * yy; b.position.z += 0.06; world.add(b); }
      if (z.key === 'prod') for (let k = 0; k < 6; k++) { const s = box3(r.w / S / 6 - 0.01, 0.03, 0.03, k % 2 ? '#ffffff' : '#5fc293'); s.position.copy(hb.position); s.position.x += (k - 2.5) * r.w / S / 6; s.position.y = rise(30) - 0.02; s.position.z += 0.07; world.add(s); }
      for (const cell of r.cells) {
        const bin = model('porter:bin', { color: look.bin });
        bin.scale.set(cell.w / S - 0.04, 1, depth(cell.h) - 0.04);
        bin.position.copy(s3.at(cell.x + cell.w / 2, cell.y + cell.h / 2, 0.03)); bin.position.y = 0.03;
        world.add(bin);
        const holder = new THREE.Group(); holder.position.copy(bin.position); holder.position.y = 0.05; world.add(holder);
        cellViews.push({ zone: z.key, cell, holder, sig: -1 });
      }
    });
    // stations: a little counter each, with what they make on it
    L.stations.forEach((r, i) => {
      const s = STATIONS[i], look = STATION_LOOK[s.key];
      const top = { y: r.y + 32, h: r.h - 32 - 26 }, hc = rise(25);
      const grp = new THREE.Group();
      const body = box3(r.w / S - 0.06, hc, depth(top.h), look.body); body.position.y = hc / 2; grp.add(body);
      const slabTop = box3(r.w / S - 0.03, 0.04, depth(top.h) + 0.03, '#e4b583'); slabTop.position.y = hc; grp.add(slabTop);
      const props = look.props.map((k, j) => { const m = itemMesh(k); m.scale.setScalar(0.85); m.position.set((j ? 1 : -1) * (r.w / S / 2 - 0.14), hc + 0.02, -depth(top.h) / 2 + 0.1); grp.add(m); return m; });
      const at = s3.under(r.x + r.w / 2, top.y + top.h / 2, hc); grp.position.set(at.x, 0, at.z);
      world.add(grp);
      stationViews.push({ grp, slabTop, x: at.x, props });
    });
    // the porter, on the dock beside the van
    if (me) s3.dropCritter(me);
    me = s3.critter({ ...ctx.critter, scale: PORTER });
    const p = s3.at(door.x + door.w - 24, door.y + door.h + 4, DOCK_H); me.setPosition(p.x, DOCK_H, p.z);
    me.object.rotation.y = 0.5; me.face(0.5);
    world.add(me.object);
  }

  function syncCrates(cs, door) {
    for (const c of crates) {
      let m = crateMeshes.get(c);
      if (!m) { m = crateMesh(c.ch); crateMeshes.set(c, m); world.add(m); }
      const inHand = held && held.item.crate === c;
      if (inHand) {
        m.visible = true;
        m.position.copy(s3.at(held.x, held.y + cs * 0.2, LIFT));
        m.rotation.z = Math.sin(performance.now() / 160) * 0.05;
        continue;
      }
      m.rotation.z = 0;
      if (c.state === 'held' && !(selected && selected.crate === c)) { m.visible = false; continue; }
      let x = c.x, y = c.y;
      if (c.arrive < 1) { const k = ease(clamp(c.arrive, 0, 1)); x = lerp(door.x + 26, c.x, k); y = lerp(door.y + door.h / 2, c.y, k); }
      if (c.state === 'back') { const k = ease(c.bt); x = lerp(c.fx, c.x, k); y = lerp(c.fy, c.y, k); }
      m.visible = c.arrive >= 0;
      m.position.copy(crateSpot(x, y));
      if (c.arrive < 1) m.position.y += Math.sin(clamp(c.arrive, 0, 1) * Math.PI) * 0.25;
      if (selected && selected.crate === c) m.position.y += 0.06 + Math.abs(Math.sin(performance.now() / 180)) * 0.05;
    }
    for (const [c, m] of crateMeshes) if (!crates.includes(c)) { m.removeFromParent(); crateMeshes.delete(c); }
  }

  function syncCells() {
    for (const v of cellViews) {
      const n = Math.min(3, stock[v.zone][v.cell.ch]);
      const sel = selected && selected.from === 'store' && selected.cell === v.cell;
      v.holder.position.y = 0.05 + (sel ? 0.08 : 0);
      if (v.sig === n) continue;
      v.sig = n; v.holder.clear();
      if (n) { const k = Math.min(1.7, (v.cell.h / S) / 0.32); v.holder.add(items(v.cell.ch, n, k)); }
    }
  }

  function syncHeld(cs) {
    const key = held && held.item.from === 'store' ? held : null;
    if (key !== heldKey) {
      heldMesh?.removeFromParent(); heldMesh = null; heldKey = key;
      if (key) { heldMesh = items(key.item.ch, 1, 2.2); world.add(heldMesh); }
    }
    if (heldMesh) heldMesh.position.copy(s3.at(held.x, held.y + 10, LIFT));
  }

  function syncFlyers() {
    for (const f of flyers) {
      let m = flyerMeshes.get(f);
      if (!m) { m = items(f.ch, 1, 2); flyerMeshes.set(f, m); world.add(m); }
      const k = ease(f.t);
      m.position.copy(s3.at(lerp(f.x0, f.x1, k), lerp(f.y0, f.y1, k) - Math.sin(k * Math.PI) * 30, 0.4 + Math.sin(k * Math.PI) * 0.3));
    }
    for (const [f, m] of flyerMeshes) if (!flyers.includes(f)) { m.removeFromParent(); flyerMeshes.delete(f); }
  }

  function syncStations(t) {
    stations.forEach((s, i) => {
      const v = stationViews[i];
      v.grp.position.x = v.x + (s.shake ? Math.sin(s.shake * 50) * 4 : 0) / S;
      v.slabTop.material = toonMat({ color: s.happy ? '#9ad7b6' : s.req ? '#ffd98a' : '#e4b583' });
      v.props.forEach((m, j) => { m.position.y = rise(25) + 0.04 + (s.happy ? Math.abs(Math.sin(t * 12 + j)) * 0.06 : 0); });
    });
  }

  function syncPorter() {
    if (cheer) { me.hop(cheer); cheer = 0; }
    if (oops) { me.wobble(oops); oops = 0; }
    const p = held || (selected && selected.at);
    if (p) me.faceTowards(s3.at(held ? held.x : view.W / 2, held ? held.y : view.H / 2, 0));
    else me.face(0.5);
  }

  function drawCrateRing(x, y, cs, color, lw = 4) {
    rr(g, x - cs / 2 - 5, y - cs * 0.55, cs + 10, cs * 1.05, 14); g.lineWidth = lw; g.strokeStyle = color; g.stroke();
  }

  function drawZone(i) {
    const z = ZONES[i], r = L.zones[i];
    const hot = (held || selected) && (held?.item.from === 'dock' || selected?.from === 'dock');
    text(g, z.name, r.x + r.w / 2, r.y + 16, { size: r.w < 130 ? 13 : 15, color: '#fff', weight: 800, stroke: 'rgba(60,50,60,.45)' });
    for (const cell of r.cells) {
      const n = stock[z.key][cell.ch];
      const wanted = stations.some((s) => s.req?.ch === cell.ch);
      if (wanted && n) { rr(g, cell.x, cell.y, cell.w, cell.h, 12); g.lineWidth = 3; g.strokeStyle = C.butterD; g.stroke(); }
      if (!n) { const sz = Math.min(46, cell.h * 0.62, cell.w * 0.62); g.save(); g.globalAlpha = 0.3; g.drawImage(icon(s3.renderer, ITEM_MODEL[cell.ch]), cell.x + cell.w / 2 - sz / 2, cell.y + cell.h / 2 - sz / 2, sz, sz); g.restore(); }
      else {
        const bx = cell.x + cell.w - 13, by = cell.y + 13;
        circle(g, bx, by, 11, z.edge, '#fff', 2);
        text(g, String(n), bx, by + 1, { size: 12, color: '#fff', weight: 800 });
      }
    }
    if (hot) { rr(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, 18); g.setLineDash([8, 6]); g.lineWidth = 3; g.strokeStyle = z.edge; g.stroke(); g.setLineDash([]); }
  }

  function drawStation(i) {
    const s = stations[i], r = L.stations[i];
    const dx = s.shake ? Math.sin(s.shake * 50) * 4 : 0;
    text(g, s.name, r.x + r.w / 2 + dx, r.y + 18, { size: 14, color: C.ink, weight: 800, stroke: '#fff' });
    const cx = r.x + r.w / 2 + dx, cy = r.y + r.h / 2 + 14;
    if (s.req) {
      const k = s.req.left / s.req.time;
      const rad = Math.min(28, r.h * 0.3);
      circle(g, cx, cy, rad, '#fff', C.line, 2);
      g.beginPath(); g.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      g.strokeStyle = k < 0.3 ? C.berry : k < 0.6 ? C.butterD : C.leaf; g.lineWidth = 5; g.stroke();
      const sz = rad * 1.5;
      g.drawImage(icon(s3.renderer, ITEM_MODEL[s.req.ch]), cx - sz / 2, cy - sz / 2, sz, sz);
      if (r.w > 160) text(g, 'Need', cx - rad - 22, cy, { size: 12, color: C.ink, weight: 800, stroke: '#fff' }), text(g, '!', cx + rad + 10, cy, { size: 16, color: C.berryD, weight: 800, stroke: '#fff' });
    } else if (s.happy) text(g, '✓', cx, cy, { size: 30, color: C.leafD, weight: 800, stroke: '#fff' });
    else text(g, 'All set', cx, cy, { size: 12, color: C.muted, weight: 700, stroke: '#fff' });
  }

  function draw() {
    if (builtRev !== L.rev) build();
    const { W, H } = view;
    const cs = crateSize(), door = L.door, t = performance.now() / 1000;
    van.position.x = (vanX + (honk > 0 ? Math.sin(honk * 40) * 3 : 0)) / S;
    syncCrates(cs, door);
    syncCells();
    syncHeld(cs);
    syncFlyers();
    syncStations(t);
    syncPorter();
    s3.render();

    // 2D: labels, counts, request bubbles, highlights, notes
    s3.begin2d();
    const n = onDock().length;
    text(g, 'BACK DOOR', door.x + door.w * 0.35 + 4, door.y + door.h / 2 - 8, { size: 12, color: '#fff', weight: 800, stroke: 'rgba(60,50,60,.6)' });
    text(g, `${n}/${SLOTS}`, door.x + door.w * 0.35 + 4, door.y + door.h / 2 + 8, { size: 12, color: n >= SLOTS - 1 ? C.butter : '#fff', weight: 800, stroke: 'rgba(60,50,60,.6)' });
    if (honk > 0.4) text(g, 'HONK!', door.x + door.w / 2, door.y + door.h + 14, { size: 18, color: C.berryD, weight: 800, stroke: '#fff' });
    L.zones.forEach((_, i) => drawZone(i));
    L.stations.forEach((_, i) => drawStation(i));
    const oldest = onDock().filter((c) => c.state === 'dock').sort((a, b) => a.born - b.born)[0];
    for (const c of crates) {
      if (c.state !== 'dock' && !(selected && selected.crate === c)) continue;
      if (selected && selected.crate === c) drawCrateRing(c.x, c.y, cs, C.butterD);
      else if (n >= SLOTS && c === oldest) drawCrateRing(c.x, c.y, cs, `rgba(222,84,104,${0.55 + 0.35 * Math.sin(ctx.elapsed() * 10)})`);
    }
    if (selected && selected.from === 'store') { const c = selected.cell; rr(g, c.x - 3, c.y - 3, c.w + 6, c.h + 6, 14); g.lineWidth = 4; g.strokeStyle = C.butterD; g.stroke(); }
    pops.draw(g);

    const e = ctx.elapsed();
    const hint = (msg, a) => {
      const w = Math.min(W - 20, 360), hx = view.portrait ? W / 2 : L.zones[1].x + L.zones[1].w / 2, hy = view.portrait ? L.door.y + L.door.h / 2 : H - 34;
      box(g, hx - w / 2, hy - 17, w, 34, { fill: `rgba(74,52,40,${0.82 * a})`, r: 17 });
      text(g, msg, hx, hy, { size: 14, color: '#fff', weight: 700, alpha: a });
    };
    if (e < 6) hint(view.portrait ? 'Drag each crate up into its store' : '← Drag each crate into its store', 1 - Math.max(0, e - 4.5) / 1.5);
    else if (firstReq >= 0 && e - firstReq < 5) hint('A station needs something — drag it over!', 1 - Math.max(0, e - firstReq - 3.5) / 1.5);
  }

  return {
    update(dt) { if (!ctx.over && dt > 0) step(dt); pops.update(dt); },
    draw,
    end() {
      if (held) { putBack(held.item, held); held = null; }
      if (selected) { putBack(selected, selected.at); selected = null; }
    },
    /** For automated play-tests: everything in view units. */
    peek() {
      return {
        view: { ...view },
        dock: crates.filter((c) => c.state === 'dock' || c.state === 'back').map((c) => ({ id: c.id, ch: c.ch, cat: c.cat, x: c.x, y: c.y, born: c.born, ready: c.state === 'dock' && c.arrive >= 1 })),
        zones: ZONES.map((z, i) => ({ key: z.key, rect: { x: L.zones[i].x, y: L.zones[i].y, w: L.zones[i].w, h: L.zones[i].h }, cells: L.zones[i].cells.map((c) => ({ ...c, n: stock[z.key][c.ch] })) })),
        stations: stations.map((s, i) => ({ key: s.key, rect: { ...L.stations[i] }, req: s.req ? { ch: s.req.ch, left: s.req.left } : null })),
        cat: Object.fromEntries(CAT), held: !!held, selected: !!selected,
        stats: { sorted, filled, lost, wrong, missedReq },
      };
    },
    destroy() { offPointer(); s3.destroy(); },
  };
}
