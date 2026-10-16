/**
 * Baker — "Golden Brown". Juggle the oven trays: drag a raw tray from the
 * dough station into an empty oven (or tap a tray, then tap ovens — the pick
 * sticks), watch it brown through the oven window and tap the oven to pull it
 * the moment it's golden. Each bake has its own time. Pulled early it's
 * underbaked, late it's too dark (neither scores); left in, it burns (−1).
 * A customer always wants one kind: a golden tray of that kind is +1 extra.
 * Score = golden trays (plus order bonuses).
 */
import { pointer, C, box, circle, text, rr, lerp, clamp, inRect, pick, Pops } from '../kit.js';
import { stage3d } from '../kit3d.js';
import { model, defineModel, icon } from '../models.js';
import * as THREE from 'three';
import { toonMat, glowMat } from '../../three/toon.js';

const TYPES = [
  { kind: 'cookie', name: 'Cookies', bake: 3.6, gold: 1.1 },
  { kind: 'muffin', name: 'Muffins', bake: 5.0, gold: 1.25 },
  { kind: 'croissant', name: 'Croissants', bake: 6.4, gold: 1.4 },
  { kind: 'loaf', name: 'Loaves', bake: 8.0, gold: 1.6 },
];
const DARK = 2.0;          // seconds of "too dark" after golden, then it burns
const OVENS = 3;
const CRITTERS = ['🐻', '🐰', '🦊', '🐼', '🐨', '🐱', '🐶', '🐹', '🦝', '🐯'];   // (kept: the pick keeps the random sequence as before)
const SCALE = 150;         // view units per metre
const TOPC = 0.9;          // dough counter height (m)

export default function create(ctx) {
  const s3 = stage3d(ctx.el, { scale: SCALE, quality: ctx.quality });
  const st = s3.ui, view = s3.view, g = s3.g;
  let needBuild = true;
  const pops = new Pops();
  const L = {};
  const ovens = Array.from({ length: OVENS }, () => ({ tray: null, x: 0, y: 0, w: 0, h: 0, shake: 0, puff: 0 }));
  let doughs = [];
  let selected = -1;
  let drag = null;           // { type, x, y, id, sx, sy, moved }
  let pointerAt = { x: 0, y: 0 };
  let flyers = [];           // trays flying to the rack or the bin
  let smoke = [];
  let rack = [];             // golden trays cooling (most recent last)
  let order = { type: 2, who: pick(CRITTERS), t: 0 };
  let streak = 0, golden = 0, burnt = 0;
  let hintT = 0;

  /* ── layout ─────────────────────────────────────────────────────────── */
  function layout() {
    const { W, H } = view;
    const P = view.portrait;
    L.P = P;
    if (P) {
      L.order = { x: 12, y: 10, w: W - 24, h: 58 };
      const top = 80, ow = (W - 24 - 2 * 10) / 3, dh = clamp(H * 0.13, 96, 124);
      const oh = clamp(H - top - 14 - 70 - 18 - 2 * dh - 8 - 70, 200, 300);
      ovens.forEach((o, i) => Object.assign(o, { x: 12 + i * (ow + 10), y: top, w: ow, h: oh }));
      L.rack = { x: 12, y: top + oh + 14, w: W - 24 - 84, h: 70 };
      L.bin = { x: W - 12 - 74, y: top + oh + 14, w: 74, h: 70 };
      const dy = L.rack.y + L.rack.h + 18, dw = (W - 24 - 10) / 2;
      L.station = { x: 4, y: dy - 8, w: W - 8, h: 2 * dh + 8 + 16 };
      doughs = TYPES.map((t, i) => ({ i, x: 12 + (i % 2) * (dw + 10), y: dy + Math.floor(i / 2) * (dh + 8), w: dw, h: dh }));
    } else {
      L.order = { x: 14, y: 8, w: Math.min(360, W * 0.5), h: 50 };
      const sideW = clamp(W * 0.2, 120, 190);
      const area = W - 28 - sideW - 14, ow = Math.min(190, (area - 2 * 12) / 3), oh = clamp(H * 0.5, 190, 240);
      const ox = 14 + (area - (3 * ow + 2 * 12)) / 2;
      ovens.forEach((o, i) => Object.assign(o, { x: ox + i * (ow + 12), y: 66, w: ow, h: oh }));
      L.rack = { x: W - 14 - sideW, y: 66, w: sideW, h: oh - 86 };
      L.bin = { x: W - 14 - sideW, y: 66 + oh - 74, w: sideW, h: 74 };
      const dy = 66 + oh + 18, dh = clamp(H - dy - 10, 80, 120), dw = Math.min(150, (W - 28 - 3 * 12) / 4);
      const dx = (W - (4 * dw + 3 * 12)) / 2;
      L.station = { x: 0, y: dy - 8, w: W, h: H - dy + 8 };
      doughs = TYPES.map((t, i) => ({ i, x: dx + i * (dw + 12), y: dy, w: dw, h: dh }));
    }
    for (const o of ovens) {
      o.win = { x: o.x + 10, y: o.y + 38, w: o.w - 20, h: L.P ? o.h - 92 : Math.min(o.h - 92, (o.w - 20) * 0.75) };
      o.bar = { x: o.x + 12, y: o.win.y + o.win.h + 14, w: o.w - 24, h: 10 };
    }
    needBuild = true;   // the 3D set is rebuilt on the next frame
  }
  layout();
  view.onResize = layout;

  /* ── baking ─────────────────────────────────────────────────────────── */
  const prog = () => clamp(ctx.elapsed() / ctx.seconds, 0, 1);
  /** 0..1 raw, 1..2 golden, 2..3 too dark, 3 burnt */
  function doneness(tr) {
    const T = TYPES[tr.type];
    if (tr.t < T.bake) return tr.t / T.bake;
    if (tr.t < T.bake + tr.gold) return 1 + (tr.t - T.bake) / tr.gold;
    return Math.min(3, 2 + (tr.t - T.bake - tr.gold) / DARK);
  }

  function load(o, type) {
    if (ctx.over || o.tray) return false;
    o.tray = { type, t: 0, gold: TYPES[type].gold * lerp(1, 0.8, prog()), dinged: false };
    o.shake = 0.25;
    ctx.sfx.work('clank', { vol: 0.6 });
    lookAt(o);
    return true;
  }

  function pull(o) {
    if (ctx.over || !o.tray) return;
    const tr = o.tray, d = doneness(tr), T = TYPES[tr.type];
    o.tray = null; o.shake = 0.2;
    const from = { x: o.win.x + o.win.w / 2, y: o.win.y + o.win.h * 0.62 };
    const cx = o.x + o.w / 2;
    if (d >= 1 && d < 2) {
      golden++; streak++;
      lookAt(o); me?.hop(0.7);
      const bonus = tr.type === order.type ? 1 : 0;
      ctx.add(1 + bonus);
      ctx.sfx.good(streak); ctx.sfx.work('thud', { vol: 0.4 });
      if (bonus) {
        ctx.sfx.satisfied();
        pops.add(`Order up! +${1 + bonus}`, cx, o.y - 8, C.leafD);
        newOrder();
      } else pops.add(streak >= 4 ? `${streak} golden in a row!` : 'Golden! +1', cx, o.y - 8, C.leafD);
      flyers.push({ type: tr.type, d, x0: from.x, y0: from.y, to: 'rack', t: 0 });
    } else {
      streak = 0; ctx.sfx.miss();
      lookAt(o); me?.wobble(0.7);
      pops.add(d < 1 ? 'Underbaked!' : 'Too dark!', cx, o.y - 8, C.berryD, 18);
      flyers.push({ type: tr.type, d, x0: from.x, y0: from.y, to: 'bin', t: 0 });
    }
    void T;
  }

  function burn(o) {
    const tr = o.tray;
    o.tray = null; o.puff = 1.2;
    burnt++; streak = 0;
    ctx.add(-1); ctx.sfx.miss(); ctx.sfx.work('sizzle', { dur: 0.6, vol: 0.6 });
    lookAt(o); me?.wobble(1);
    pops.add('Burnt! −1', o.x + o.w / 2, o.y - 8, C.berryD);
    for (let i = 0; i < 10; i++) smoke.push({ x: o.x + o.w * (0.2 + Math.random() * 0.6), y: o.win.y + Math.random() * 20, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 40, r: 10 + Math.random() * 10, t: 0, life: 1.2 + Math.random() * 0.6 });
    flyers.push({ type: tr.type, d: 3, x0: o.win.x + o.win.w / 2, y0: o.win.y + o.win.h * 0.6, to: 'bin', t: 0 });
  }

  function newOrder() {
    let t; do t = Math.floor(Math.random() * TYPES.length); while (t === order.type);
    order = { type: t, who: pick(CRITTERS), t: 0 };
  }

  function step(dt) {
    pops.update(dt);
    hintT += dt;
    for (const f of flyers) f.t += dt;
    for (const f of flyers) if (f.t >= 0.45 && f.to === 'rack' && !f.done) { f.done = true; rack.push(f.type); if (rack.length > 12) rack.shift(); }
    flyers = flyers.filter((f) => f.t < 0.45);
    for (const s of smoke) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.r += dt * 10; }
    smoke = smoke.filter((s) => s.t < s.life);
    order.t += dt;
    for (const o of ovens) {
      o.shake = Math.max(0, o.shake - dt); o.puff = Math.max(0, o.puff - dt);
      if (!o.tray || ctx.over) continue;
      o.tray.t += dt;
      const d = doneness(o.tray);
      if (d >= 1 && !o.tray.dinged) { o.tray.dinged = true; ctx.sfx.pop(); }
      if (d >= 2 && Math.random() < dt * 4) smoke.push({ x: o.win.x + o.win.w * (0.2 + Math.random() * 0.6), y: o.win.y + 6, vx: (Math.random() - 0.5) * 16, vy: -24 - Math.random() * 20, r: 5 + Math.random() * 5 * (d - 2 + 0.5), t: 0, life: 0.9 });
      if (d >= 3) burn(o);
    }
  }

  /* ── input ──────────────────────────────────────────────────────────── */
  const ovenAt = (p) => ovens.find((o) => inRect(p, { x: o.x - 4, y: o.y - 4, w: o.w + 8, h: o.h + 8 }));
  const offPointer = pointer(st, {
    down: (p) => {
      if (ctx.over) return;
      pointerAt = p;
      const di = doughs.findIndex((d) => inRect(p, d));
      if (di >= 0) {
        selected = di; ctx.sfx.click();
        if (!drag) drag = { type: di, x: p.x, y: p.y, sx: p.x, sy: p.y, id: p.id, moved: false };
        return;
      }
      const o = ovenAt(p);
      if (!o) return;
      if (o.tray) pull(o);
      else if (selected >= 0) load(o, selected);
      else { pops.add('Pick a tray first ↓', o.x + o.w / 2, o.y + o.h / 2, C.muted, 15); ctx.sfx.miss(); }
    },
    move: (p) => {
      if (!drag || p.id !== drag.id) return;
      drag.x = p.x; drag.y = p.y;
      if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 12) drag.moved = true;
    },
    up: (p) => {
      if (!drag || p.id !== drag.id) return;
      const d = drag; drag = null;
      if (!d.moved) return;
      const o = ovenAt(p);
      if (o && !o.tray) load(o, d.type);
      else if (o) pops.add('That oven’s busy', o.x + o.w / 2, o.y + o.h / 2, C.muted, 15);
    },
  });

  /* ── the 3D bakery ──────────────────────────────────────────────────── */
  // Side-on mapping for the ovens (their fronts stand on an upright plane
  // whose foot is the ovens' bottom row, so every oven rect is its front face
  // and you look into the window), tabletop mapping for the dough counter in
  // front (and, on phones, the cooling rack and scrap bin on it).
  const world = new THREE.Group();
  s3.add(world);
  let P = null, me = null, restHeading = 0, lookUntil = -1;
  let ovenSets = [], doughSets = [], rackItems = [], rackSig = '', rackSpots = [];
  const flyMeshes = new Map();
  let dragMesh = null;
  const puffs = [];
  const deep = (u) => u / (SCALE * s3.sinE);

  function lookAt(o) {
    if (!me || !P) return;
    me.faceTowards(P.at(o.x + o.w / 2, o.y + o.h, 0));
    lookUntil = ctx.elapsed() + 1.2;
  }
  function box3(w, h, d, color, mat = null) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || toonMat({ color }));
    m.userData.ownGeometry = true; m.castShadow = m.receiveShadow = true;
    return m;
  }
  /** A level slab covering view rect r with its top at height `top`. */
  function slab(r, top, thick, color, mat) {
    const m = box3(r.w / SCALE, thick, deep(r.h), color, mat);
    m.position.copy(s3.at(r.x + r.w / 2, r.y + r.h / 2, top)); m.position.y = top - thick / 2;
    return m;
  }
  /** A point in the air at view (x, y): over the counter it floats just above it, higher up it stays in front of the ovens. */
  function air(x, y, out) {
    const z = Math.max(s3.at(x, y, TOPC + 0.15).z, P.z + 0.35);
    return out.copy(s3.atDepth(x, y, z));
  }
  function seeThrough(color, opacity) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    m.userData.outlineParameters = { visible: false };
    return m;
  }

  /** A sheet pan of bakes, `wUnits` wide on screen, the bakes `size` units across. */
  function trayGroup(type, d, wUnits, n, size) {
    const gp = new THREE.Group(), T = TYPES[type];
    const w = Math.round(wUnits / SCALE * 20) / 20;
    gp.add(model('baker:tray', { w, d: 0.34 }));
    const c = bakeColor(type, d), k = (size * 0.9 / SCALE) / BAKE_W[T.kind], step = size * 0.78 / SCALE;
    for (let i = 0; i < n; i++) {
      const m = model('baker:' + T.kind, { c });
      m.scale.setScalar(k); m.position.set((i - (n - 1) / 2) * step, 0.014, (i % 2) * 0.03 - 0.015); m.rotation.y = 0.3 - i * 0.4;
      gp.add(m);
    }
    gp.userData.sig = `${type}:${c}:${n}:${w}:${size}`;
    return gp;
  }
  /** Same as trayGroup, but reuses `old` when the look hasn't changed. */
  function trayFor(old, type, d, wUnits, n, size) {
    const w = Math.round(wUnits / SCALE * 20) / 20, sig = `${type}:${bakeColor(type, d)}:${n}:${w}:${size}`;
    if (old && old.userData.sig === sig) return old;
    const gp = trayGroup(type, d, wUnits, n, size);
    if (old) { gp.position.copy(old.position); old.removeFromParent(); }
    world.add(gp);
    return gp;
  }
  const traySize = (w, n) => Math.min(L.P ? 46 : 40, w / (n * 0.78 + 0.3));

  function build() {
    world.clear();
    flyMeshes.clear(); dragMesh = null; puffs.length = 0; rackItems = []; rackSig = '';
    const { W, H } = view, PH = L.P;
    const footY = ovens[0].y + ovens[0].h;
    P = s3.plane(footY);
    const DEPTH = 0.62, CAV = 0.42;
    world.add(s3.floor('checker', { size: 0.45 }));
    world.add(s3.wall({ y: footY - (DEPTH + 0.06) * s3.sinE * SCALE, a: '#f6ece0', b: '#e7d8c6' }));

    // ovens
    ovenSets = ovens.map((o) => {
      const grp = new THREE.Group(); world.add(grp);
      const cx = (o.x + o.w / 2) / SCALE, fw = o.w / SCALE, z0 = P.z, w = o.win;
      const hTop = P.height(o.y), hWT = P.height(w.y - 4), hWB = P.height(w.y + w.h + 4);
      const cream = '#e9d8c6';
      const back = box3(fw, hTop, DEPTH - CAV, cream); back.position.set(cx, hTop / 2, z0 - CAV - (DEPTH - CAV) / 2); grp.add(back);
      const bot = box3(fw, hWB, CAV, cream); bot.position.set(cx, hWB / 2, z0 - CAV / 2); grp.add(bot);
      const top = box3(fw, hTop - hWT, CAV, cream); top.position.set(cx, (hTop + hWT) / 2, z0 - CAV / 2); grp.add(top);
      const lw = (w.x - 4 - o.x) / SCALE, rw = (o.x + o.w - (w.x + w.w + 4)) / SCALE;
      const left = box3(lw, hWT - hWB, CAV, cream); left.position.set(o.x / SCALE + lw / 2, (hWT + hWB) / 2, z0 - CAV / 2); grp.add(left);
      const right = box3(rw, hWT - hWB, CAV, cream); right.position.set((o.x + o.w) / SCALE - rw / 2, (hWT + hWB) / 2, z0 - CAV / 2); grp.add(right);
      // the inside: dark floor, a back wall that glows while baking, a heating element, a wire shelf
      const ww = (w.w + 8) / SCALE;
      const floor = box3(ww, 0.01, CAV, '#3b3438'); floor.position.set(cx, hWB + 0.005, z0 - CAV / 2); grp.add(floor);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(ww, hTop - hWB), glowMat('#3b3438').clone());
      glow.userData.ownGeometry = true; glow.position.set(cx, (hTop + hWB) / 2, z0 - CAV + 0.002); grp.add(glow);
      const element = box3(ww - 0.08, 0.02, 0.02, '#6b4a3a', new THREE.MeshBasicMaterial({ color: '#6b4a3a' }));
      element.position.copy(P.at(o.x + o.w / 2, w.y + 9, CAV * 0.55)); grp.add(element);
      const shelfRow = w.y + w.h * 0.62;
      // a wire shelf: two rails and a few cross wires
      const sp = P.at(o.x + o.w / 2, shelfRow + 6, CAV * 0.5);
      for (const dz of [-(CAV - 0.08) / 2, (CAV - 0.08) / 2]) { const r = box3(ww - 0.02, 0.014, 0.014, '#7d8a96'); r.position.set(sp.x, sp.y - 0.008, sp.z + dz); grp.add(r); }
      for (let i = 0; i < 7; i++) { const r = box3(0.008, 0.008, CAV - 0.08, '#8e9ba8'); r.position.set(sp.x - ww / 2 + 0.06 + i * (ww - 0.12) / 6, sp.y - 0.006, sp.z); grp.add(r); }
      // bezel, glass, the control strip with its lamp, the door handle
      const bz = '#8e9ba8', bt = 0.035;
      for (const [bw2, bh2, bx, by] of [[ww, bt, cx, hWT - bt / 2], [ww, bt, cx, hWB + bt / 2], [bt, hWT - hWB, cx - ww / 2 + bt / 2, (hWT + hWB) / 2], [bt, hWT - hWB, cx + ww / 2 - bt / 2, (hWT + hWB) / 2]]) {
        const b = box3(bw2, bh2, 0.03, bz); b.position.set(bx, by, z0 + 0.012); grp.add(b);
      }
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww - 0.06, hWT - hWB - 0.06), seeThrough('#cfe9ff', 0.12));
      glass.userData.ownGeometry = true; glass.position.set(cx, (hWT + hWB) / 2, z0 + 0.008); grp.add(glass);
      const stripH = 24 / (s3.cosE * SCALE);
      const strip = box3(fw - 0.08, stripH, 0.03, '#5c6670'); strip.position.copy(P.at(o.x + o.w / 2, o.y + 18, -0.012)); grp.add(strip);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: '#8e9ba8' }));
      lamp.userData.ownGeometry = true; lamp.position.copy(P.at(o.x + 20, o.y + 18, -0.04)); grp.add(lamp);
      const handle = box3((o.w - 32) / SCALE, 9 / (s3.cosE * SCALE), 0.05, '#9aa7b1'); handle.position.copy(P.at(o.x + o.w / 2, o.y + o.h - 21.5, -0.03)); grp.add(handle);
      const feet = box3(fw - 0.06, 0.05, DEPTH - 0.04, '#7d8a96'); feet.position.set(cx, 0.025, z0 - DEPTH / 2); grp.add(feet);
      return { o, grp, glow, element, glass, lamp, tray: null, at: P.at(o.x + o.w / 2, shelfRow + 6, CAV * 0.5) };
    });

    // the dough counter (on phones it runs from the cooling rack down)
    const top = PH ? L.rack.y - 8 : L.station.y, bottom = PH ? L.station.y + L.station.h : H + 40;
    const cr = { x: -30, y: top, w: W + 60, h: bottom - top };
    world.add(slab(cr, TOPC - 0.05, TOPC - 0.05, '#c98f5a'));
    world.add(slab(cr, TOPC, 0.05, '#ecc995'));
    doughSets = doughs.map((dd, i) => {
      const mat = toonMat({ color: '#fffaf0' }).clone();
      const board = slab(dd, TOPC + 0.012, 0.012, null, mat); world.add(board);
      const ty = dd.y + dd.h * 0.38, tw = Math.max(40, Math.min(dd.w * 0.8, 120, (dd.y + dd.h - 50 - ty) / 0.12));
      const tray = trayGroup(i, 0, tw, 2, traySize(tw, 2));
      tray.position.copy(s3.at(dd.x + dd.w / 2, ty, TOPC + 0.012)); world.add(tray);
      return { mat, tray, base: tray.position.y };
    });

    // cooling rack and scrap bin
    const rk = L.rack, bn = L.bin;
    rackSpots = [];
    const per = PH ? Math.max(1, Math.floor((rk.w - 10) / 44)) : 3, rows = PH ? 1 : Math.max(1, Math.floor((rk.h - 26) / 36));
    for (let row = 0; row < rows; row++) for (let col = 0; col < per; col++) {
      const cx = rk.x + 26 + col * ((rk.w - 32) / per), cy = rk.y + 42 + row * 36;
      rackSpots.push(PH ? s3.at(cx, cy, TOPC + 0.07) : P.at(cx, cy + 16, 0.16));
    }
    if (PH) {
      world.add(slab({ x: rk.x, y: rk.y + 16, w: rk.w, h: rk.h - 18 }, TOPC + 0.06, 0.012, '#9aa7b1'));
      for (let x = rk.x + 10; x < rk.x + rk.w - 6; x += 14) world.add(slab({ x, y: rk.y + 16, w: 3, h: rk.h - 18 }, TOPC + 0.066, 0.008, '#7d8a96'));
      for (const lx of [rk.x + 8, rk.x + rk.w - 8]) world.add(slab({ x: lx - 3, y: rk.y + 18, w: 6, h: rk.h - 22 }, TOPC + 0.055, 0.055, '#7d8a96'));
      const bin = model('baker:bin', { r: 0.2, h: 0.36 }); bin.position.copy(s3.at(bn.x + bn.w / 2, bn.y + bn.h * 0.62, TOPC)); world.add(bin);
    } else {
      for (let row = 0; row < rows; row++) {
        const sy = rk.y + 42 + row * 36 + 16;
        // a wire shelf: front and back rails with cross wires
        const c = P.at(rk.x + rk.w / 2, sy, 0.16);
        for (const dz of [-0.13, 0.13]) { const r = box3(rk.w / SCALE - 0.04, 0.02, 0.02, '#7d8a96'); r.position.set(c.x, c.y - 0.01, c.z + dz); world.add(r); }
        for (let x = rk.x + 12; x < rk.x + rk.w - 8; x += 12) { const r = box3(0.008, 0.008, 0.26, '#9aa7b1'); r.position.set(x / SCALE, c.y - 0.012, c.z); world.add(r); }
      }
      for (const px of [rk.x + 6, rk.x + rk.w - 6]) {
        const h0 = P.height(rk.y + rk.h) - 0.17 * s3.sinE / s3.cosE, h1 = P.height(rk.y + 18) - 0.17 * s3.sinE / s3.cosE;
        const post = box3(0.03, h1 - h0, 0.03, '#7d8a96'); post.position.set(px / SCALE, (h0 + h1) / 2, P.z - 0.17); world.add(post);
      }
      const r = Math.min(bn.w * 0.5, 76) / 2 / SCALE, hb = Math.min(0.5, P.height(bn.y + 20));
      const bin = model('baker:bin', { r: Math.round(r * 100) / 100, h: Math.round(hb * 100) / 100 });
      const bp = P.at(bn.x + bn.w * 0.3, bn.y + bn.h, 0); bin.position.set(bp.x, 0, P.z - r - 0.02); world.add(bin);
    }

    // the baker, in their uniform: under the rack by the bin (wide screens), at the counter's front (phones)
    if (me) s3.dropCritter(me);
    me = s3.critter({ ...ctx.critter, scale: PH ? 0.8 : 0.82 });
    if (PH) {
      const p = s3.at(W - 58, Math.min(H - 10, L.station.y + L.station.h + 150), 0); me.setPosition(p.x, 0, p.z); restHeading = -0.5;
    } else {
      const p = P.at(Math.min(W - 40, bn.x + bn.w * 0.74), footY, 0); me.setPosition(p.x, 0, P.z + 0.28); restHeading = -0.45;
    }
    me.object.rotation.y = me.targetHeading = restHeading;
  }

  /** Smoke: soft grey puffs from a reused pool. */
  function syncSmoke() {
    while (puffs.length < smoke.length) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), seeThrough('#6b6670', 0.45));
      m.userData.ownGeometry = true; m.renderOrder = 5; world.add(m); puffs.push(m);
    }
    puffs.forEach((m, i) => {
      const s = smoke[i];
      m.visible = !!s;
      if (!s) return;
      m.position.copy(P.at(s.x, s.y, -0.12));
      m.scale.setScalar(s.r / SCALE);
      m.material.opacity = 0.45 * (1 - s.t / s.life);
    });
  }

  function draw() {
    if (needBuild) { needBuild = false; build(); }
    const now = ctx.elapsed();
    // ovens: shake, glow, lamp, the tray inside browning
    ovenSets.forEach((S) => {
      const o = S.o, tr = o.tray, d = tr ? doneness(tr) : 0;
      S.grp.position.x = o.shake > 0 ? Math.sin(o.shake * 80) * 2 / SCALE : 0;
      S.glow.material.color.set(tr ? (d >= 2 ? '#c8642a' : '#ff9a45') : '#3b3438');
      S.element.material.color.set(tr ? '#ff6a3d' : '#6b4a3a');
      S.lamp.material.color.set(tr ? (d >= 1 && d < 2 ? '#9ef0b6' : '#ffb347') : '#8e9ba8');
      S.glass.material.color.set(o.puff > 0 ? '#2a2a2a' : '#cfe9ff');
      S.glass.material.opacity = o.puff > 0 ? 0.12 + o.puff / 1.2 * 0.5 : 0.12;
      if (tr) {
        const w = o.win.w * 0.86, n = L.P ? 2 : 3;
        S.tray = trayFor(S.tray, tr.type, d, w, n, traySize(w, n));
        S.tray.position.copy(S.at); S.tray.position.x += S.grp.position.x;
      } else if (S.tray) { S.tray.removeFromParent(); S.tray = null; }
    });
    // dough boards: the picked one glows butter yellow and its tray lifts a little
    doughSets.forEach((D, i) => {
      D.mat.color.set(selected === i ? '#ffe7a3' : '#fffaf0');
      D.tray.position.y = D.base + (selected === i ? 0.05 + Math.sin(now * 6) * 0.015 : 0);
    });
    // cooling rack: the latest golden trays, one bake each
    const per = rackSpots.length, shown = rack.slice(-per), sig = shown.join(',');
    if (sig !== rackSig) {
      rackSig = sig;
      for (const m of rackItems) m.removeFromParent();
      rackItems = shown.map((t, j) => {
        const m = model('baker:' + TYPES[t].kind, { c: bakeColor(t, 1.4) });
        m.scale.setScalar((32 / SCALE) / BAKE_W[TYPES[t].kind]); m.position.copy(rackSpots[j]); m.rotation.y = 0.4 - (j % 3) * 0.3;
        world.add(m); return m;
      });
    }
    // trays in the air, and the one being dragged
    const live = new Set(flyers);
    for (const f of flyers) {
      const m = trayFor(flyMeshes.get(f), f.type, f.d, 90, 2, traySize(90, 2));
      flyMeshes.set(f, m);
      const k = f.t / 0.45, to = f.to === 'rack' ? { x: L.rack.x + L.rack.w / 2, y: L.rack.y + L.rack.h / 2 } : { x: L.bin.x + L.bin.w / 2, y: L.bin.y + 20 };
      air(lerp(f.x0, to.x, k), lerp(f.y0, to.y, k) - Math.sin(k * Math.PI) * 60, m.position);
      m.scale.setScalar(1 - 0.4 * k);
    }
    for (const [f, m] of flyMeshes) if (!live.has(f)) { m.removeFromParent(); flyMeshes.delete(f); }
    if (drag && drag.moved) {
      dragMesh = trayFor(dragMesh, drag.type, 0, 96, 2, traySize(96, 2));
      air(drag.x, drag.y - 10, dragMesh.position);
    } else if (dragMesh) { dragMesh.removeFromParent(); dragMesh = null; }
    syncSmoke();
    if (me && now > lookUntil) me.targetHeading = restHeading;
    s3.render();

    // 2D: the order, the oven strips and bake bars, labels, notes
    const { W } = view;
    s3.begin2d();
    const od = L.order, ot = TYPES[order.type];
    const pulse = order.t < 0.6 ? 1 + Math.sin(order.t * 20) * 0.04 * (1 - order.t / 0.6) : 1;
    g.save(); g.translate(od.x + od.w / 2, od.y + od.h / 2); g.scale(pulse, pulse); g.translate(-(od.x + od.w / 2), -(od.y + od.h / 2));
    box(g, od.x, od.y, od.w, od.h, { fill: '#fff', r: 14, shadow: 3 });
    text(g, 'Customer wants', od.x + 14, od.y + od.h / 2, { size: 14, color: C.muted, align: 'left', weight: 700 });
    const ic = Math.min(44, od.h - 6);
    g.drawImage(icon(s3.renderer, 'baker:' + ot.kind, { c: bakeColor(order.type, 1.4) }), od.x + 128, od.y + (od.h - ic) / 2, ic, ic);
    text(g, ot.name, od.x + 132 + ic, od.y + od.h / 2, { size: 16, align: 'left', weight: 800 });
    text(g, '+1 bonus', od.x + od.w - 12, od.y + od.h / 2, { size: 13, color: C.leafD, align: 'right', weight: 800 });
    g.restore();
    if (!L.P) text(g, `${golden} golden · ${burnt} burnt`, W - 16, od.y + od.h / 2, { size: 13, color: C.muted, align: 'right', weight: 700 });

    ovens.forEach((o, i) => {
      const sx = o.shake > 0 ? Math.sin(o.shake * 80) * 2 : 0, tr = o.tray, d = tr ? doneness(tr) : 0;
      g.save(); g.translate(sx, 0);
      text(g, tr ? TYPES[tr.type].name : 'Empty', o.x + o.w / 2 + 6, o.y + 18, { size: 12, color: '#fff', weight: 700 });
      text(g, String(i + 1), o.x + o.w - 16, o.y + 18, { size: 11, color: '#c9d3dc', weight: 700 });
      if (tr && d >= 1 && d < 2) text(g, '✨', o.win.x + o.win.w - 14, o.win.y + 22, { size: 16 });
      // bake bar: pale → golden window → dark → burnt
      const b = o.bar;
      box(g, b.x, b.y, b.w, b.h, { fill: '#fff', r: 5, stroke: 'rgba(90,70,60,.35)', lw: 1.5 });
      if (tr) {
        const T = TYPES[tr.type], total = T.bake + tr.gold + DARK;
        const gx = b.x + b.w * (T.bake / total), gw = b.w * (tr.gold / total);
        g.fillStyle = '#ffd166'; g.fillRect(gx, b.y, gw, b.h);
        g.fillStyle = '#c98a5a'; g.fillRect(gx + gw, b.y, b.x + b.w - gx - gw - 3, b.h);
        const k = clamp(tr.t / total, 0, 1);
        circle(g, b.x + b.w * k, b.y + b.h / 2, 8, d >= 2 ? C.berry : d >= 1 ? C.leaf : '#fff', C.ink, 2);
      }
      if (tr && d >= 1 && d < 2) {
        g.save(); g.globalAlpha = 0.5 + 0.4 * Math.sin(ctx.elapsed() * 10);
        rr(g, o.x - 3, o.y - 3, o.w + 6, o.h + 6, 16); g.strokeStyle = C.butter; g.lineWidth = 4; g.stroke(); g.restore();
      }
      g.restore();
    });

    const tag = (str, x, y, size = 12, align = 'center', color = '#fff') => text(g, str, x, y, { size, color, weight: 800, stroke: 'rgba(60,50,60,.55)', align });
    tag('Cooling rack', L.rack.x + 10, L.rack.y + 12, 11, 'left');
    doughs.forEach((dd, i) => {
      const T = TYPES[i], on = selected === i;
      if (on) { rr(g, dd.x, dd.y, dd.w, dd.h, 14); g.strokeStyle = C.butterD; g.lineWidth = 4; g.stroke(); }
      text(g, T.name, dd.x + dd.w / 2, dd.y + dd.h - 30, { size: 13, weight: 800, color: C.ink, stroke: '#fff' });
      text(g, `${T.bake.toFixed(T.bake % 1 ? 1 : 0)}s`, dd.x + dd.w / 2, dd.y + dd.h - 13, { size: 11, color: C.muted, weight: 700, stroke: '#fff' });
      if (i === order.type) text(g, '★', dd.x + dd.w - 12, dd.y + 13, { size: 15, color: C.butterD, weight: 800, stroke: '#fff' });
    });
    pops.draw(g);
    if (hintT < 7) {
      const below = L.station.y + L.station.h + 30;
      const hy = L.P ? (below < view.H - 16 ? below : L.rack.y + L.rack.h / 2) : L.station.y - 10;
      const msg = selected < 0 ? 'Drag a tray into an oven — or tap a tray, then tap ovens' : 'Tap an oven to pull the tray when it’s golden';
      g.save(); g.globalAlpha = 1 - Math.max(0, hintT - 5) / 2;
      if (L.P) box(g, 18, hy - 16, W - 36, 32, { fill: 'rgba(255,250,240,.95)', r: 12 });
      g.restore();
      text(g, msg, W / 2, hy, { size: L.P ? 13 : 14, color: L.P ? C.muted : C.ink, stroke: L.P ? null : '#fff', weight: 700, alpha: 1 - Math.max(0, hintT - 5) / 2 });
    }
  }

  return {
    start() { hintT = 0; },
    update(dt) { step(dt); },
    draw,
    /** For automated play-tests. */
    peek() {
      return {
        view: { ...view }, order: order.type, selected, golden, burnt,
        ovens: ovens.map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h, tray: o.tray && { type: o.tray.type, t: o.tray.t, bake: TYPES[o.tray.type].bake, gold: o.tray.gold, d: doneness(o.tray) } })),
        doughs: doughs.map((d) => ({ x: d.x, y: d.y, w: d.w, h: d.h })),
        types: TYPES,
      };
    },
    destroy() { offPointer(); s3.destroy(); },
  };
}

/* ── bakes: each browns from pale dough through golden to dark (`c`) ── */
const BAKE_W = { cookie: 0.11, muffin: 0.11, croissant: 0.17, loaf: 0.19 };
const RAW = ['#f3e0bb', '#f6e6c4', '#f5e1b4', '#f0dcae'];
const GOLD = ['#e3a34c', '#dc9b48', '#e8a23c', '#d68f3e'];
/** Bake colour for a doneness (0..1 raw, 1..2 golden, 2..3 too dark, 3 burnt), in quarter steps so meshes can be shared. */
function bakeColor(type, d) {
  const q = Math.round(clamp(d, 0, 3) * 4) / 4;
  if (q < 1) return mix(RAW[type], GOLD[type], q);
  if (q < 2) return mix(GOLD[type], '#c9802f', (q - 1) * 0.5);
  if (q < 3) return mix('#a8622a', '#4a2a16', q - 2);
  return '#2a1a10';
}
function mix(a, b, t) {
  t = clamp(t, 0, 1);
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}
defineModel('baker:cookie', (b, o) => {
  b.cyl(0.052, 0.055, 0.016, o.c, { y: 0.008 }, 18);
  b.sphere(0.05, o.c, { y: 0.014, sy: 0.22 });
  for (let i = 0; i < 5; i++) b.sphere(0.009, '#4a2a1a', { x: Math.cos(i * 1.9) * 0.028, y: 0.024, z: Math.sin(i * 1.9) * 0.028 });
});
defineModel('baker:muffin', (b, o) => {
  b.cyl(0.042, 0.034, 0.05, '#e8738a', { y: 0.025 }, 14);
  for (let i = 0; i < 8; i++) b.flat(0.006, 0.05, 0.006, '#d45d75', { x: Math.cos(i * 0.785) * 0.04, y: 0.025, z: Math.sin(i * 0.785) * 0.04 });
  b.sphere(0.05, o.c, { y: 0.056, sy: 0.72 });
});
defineModel('baker:croissant', (b, o) => {
  b.torus(0.052, 0.028, o.c, { y: 0.028, rx: Math.PI / 2, rz: -0.4 * Math.PI }, Math.PI * 1.25);
  b.sphere(0.036, o.c, { y: 0.03, z: 0.0, sx: 1.3 });
  for (const x of [-0.02, 0.02]) b.torus(0.03, 0.004, mix(o.c, '#ffffff', 0.25), { x, y: 0.03, ry: Math.PI / 2 }, Math.PI);
});
defineModel('baker:loaf', (b, o) => {
  b.box(0.18, 0.06, 0.1, o.c, { y: 0.03 }, 0.025);
  b.sphere(0.07, o.c, { y: 0.055, sx: 1.25, sy: 0.5, sz: 0.68 });
  for (let i = 0; i < 3; i++) b.flat(0.012, 0.008, 0.07, mix(o.c, '#fff4dc', 0.45), { x: -0.045 + i * 0.045, y: 0.09, ry: 0.5 });
});
defineModel('baker:tray', (b, o) => {
  const w = o.w, d = o.d;
  b.box(w, 0.012, d, '#a3aeb8', { y: 0.006 }, 0.004);
  for (const z of [-d / 2, d / 2]) b.flat(w, 0.024, 0.012, '#7d8a96', { y: 0.012, z });
  for (const x of [-w / 2, w / 2]) b.flat(0.012, 0.024, d, '#7d8a96', { x, y: 0.012 });
});
defineModel('baker:bin', (b, o) => {
  b.cyl(o.r, o.r * 0.86, o.h, '#8e9ba8', { y: o.h / 2 }, 18);
  for (let i = 0; i < 3; i++) b.torus(o.r * (0.88 + i * 0.05), 0.006, '#7d8a96', { y: o.h * (0.25 + i * 0.25), rx: Math.PI / 2 });
  b.cyl(o.r * 1.06, o.r * 1.06, 0.035, '#6c7a89', { y: o.h + 0.017 }, 18);
  b.box(0.1, 0.03, 0.04, '#5c6670', { y: o.h + 0.05 }, 0.01);
});
