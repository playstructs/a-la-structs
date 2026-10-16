/**
 * Server — "Order Up!". A memory game on a top-down dining room. Tables raise
 * a hand; walk over (tap the table) and their order shows in a speech bubble
 * for a couple of seconds, then hides. Walk to the terminal and punch it in
 * from memory: table number + dishes. After a cook delay the plates come up at
 * the pass with a table ticket; carry them (two at a time) to that table.
 * Score = correct dishes served. A dish the table didn't order earns nothing
 * and a grumble.
 *
 * Rooms lay out with the kitchen on the left on wide screens and along the
 * top on phones. The server walks around tables on a coarse grid path.
 */
import { pointer, C, box, circle, text, lerp, clamp, inRect, dist, shuffle, Pops } from '../kit.js';
import { stage3d } from '../kit3d.js';
import { model, icon, defineModel } from '../models.js';
import * as THREE from 'three';
import { toonMat } from '../../three/toon.js';
import { table, chair, serverStation, steelCounter } from '../../three/props.js';
import { casualOutfit } from '../../three/outfits.js';

/** `ch` is the dish's id in the game logic (and for play-test bots); `kind` is its 3D model. */
export const MENU = [
  { ch: '🍔', name: 'Burger', kind: 'burger' }, { ch: '🍕', name: 'Pizza', kind: 'pizza' }, { ch: '🍝', name: 'Pasta', kind: 'server:pasta' },
  { ch: '🥗', name: 'Salad', kind: 'salad' }, { ch: '🍜', name: 'Ramen', kind: 'ramen' }, { ch: '🌮', name: 'Taco', kind: 'taco' },
];
const dishKind = (ch) => MENU.find((m) => m.ch === ch)?.kind || 'burger';
// Diners are picked by face (as before); each face is drawn as that species of critter.
const FACES = ['🐰', '🐻', '🦊', '🐱', '🐼', '🐸', '🐨', '🐯', '🐷', '🐮', '🐭', '🐹', '🦝', '🐶'];
const SPECIES_OF = { '🐰': 'bunny', '🐻': 'bear', '🦊': 'fox', '🐱': 'cat', '🐼': 'panda', '🐸': 'frog', '🐨': 'koala', '🐯': 'duck', '🐷': 'pig', '🐮': 'sheep', '🐭': 'mouse', '🐹': 'hamster', '🦝': 'raccoon', '🐶': 'dog' };
const SCALE = 50;            // view units per metre: a life-size dining room
const TOP = 0.8;             // table-top height (m)
const PASS_H = 0.62;         // the pass is a low counter, so it doesn't hide the terminal
const CK = 1;                // critter scale
const FOODK = 1.5;           // plates on the tables, a little larger than life
const TABLES = 6;
const SPEED = 270;           // view units / second
const SHOW = 2.6;            // seconds an order stays in the bubble
const SHOW_AGAIN = 1.4;      // …when you ask them to repeat it
const HANDS = 2;
const WAIT_ORDER = 28;       // patience with a raised hand
const WAIT_FOOD = 45;        // patience once they've ordered
const EAT = 5;
const COLD = 32;             // plates left on the pass go cold
const SR = 15;               // server radius

export const cookTime = (n) => 3 + n * 1.2;

export default function create(ctx) {
  const s3 = stage3d(ctx.el, { scale: SCALE, quality: ctx.quality });
  const st = s3.ui, view = s3.view, g = s3.g;
  const pops = new Pops();
  const L = {};
  let needBuild = true;      // the 3D room is (re)built lazily in draw()
  const dishIcon = (ch) => icon(s3.renderer, dishKind(ch));
  const server = { x: 0, y: 0, path: [], action: null, carry: [], face: '🐰', bob: 0 };
  let tables = Array.from({ length: TABLES }, (_, i) => ({ n: i + 1, state: 'empty', t: 0, wait: 0, order: [], got: [], served: 0, faces: [], show: 0, mood: 0 }));
  let tickets = [];          // { table, dishes, t, dur }
  let plates = [];           // on the pass: { dish, table, slot, age }
  const panel = { open: false, table: null, dishes: [], flash: 0 };
  let sent = new Map();      // table n -> number of tickets sent for the current party
  let stats = { right: 0, wrong: 0, walkouts: 0, taken: 0 };

  /* ── layout ─────────────────────────────────────────────────────── */
  function layout() {
    const { W, H } = view;
    L.portrait = view.portrait;
    if (L.portrait) {
      L.kitchen = { x: 0, y: 0, w: W, h: 150 };
      L.pass = { x: 12, y: 14, w: W * 0.6, h: 110 };
      L.term = { x: L.pass.x + L.pass.w + 22, y: 24, w: W - (L.pass.x + L.pass.w + 22) - 14, h: 90 };
      L.passSpot = { x: L.pass.x + L.pass.w / 2, y: L.kitchen.h + 26 };
      L.termSpot = { x: L.term.x + L.term.w / 2, y: L.kitchen.h + 26 };
      const cols = 2, rows = 3, top = L.kitchen.h + 64, cw = W / cols, ch = (H - top - 10) / rows;
      L.tr = clamp(Math.min(cw, ch) * 0.2, 26, 36);
      tables.forEach((t, i) => { t.x = cw * (i % cols + 0.5); t.y = top + ch * (Math.floor(i / cols) + 0.38); });
    } else {
      const kw = clamp(W * 0.2, 140, 180);
      L.kitchen = { x: 0, y: 0, w: kw, h: H };
      L.pass = { x: 12, y: 14, w: kw - 40, h: H * 0.6 };
      L.term = { x: 12, y: L.pass.y + L.pass.h + 22, w: kw - 40, h: H - (L.pass.y + L.pass.h + 22) - 14 };
      L.passSpot = { x: kw + 26, y: L.pass.y + L.pass.h / 2 };
      L.termSpot = { x: kw + 26, y: L.term.y + L.term.h / 2 };
      const cols = 3, rows = 2, left = kw + 60, cw = (W - left - 10) / cols, ch = (H - 10) / rows;
      L.tr = clamp(Math.min(cw, ch) * 0.2, 26, 36);
      tables.forEach((t, i) => { t.x = left + cw * (i % cols + 0.5); t.y = 8 + ch * (Math.floor(i / cols) + 0.4); });
    }
    // bigger rooms walk a little quicker, so a tall phone or a wide desktop plays the same
    L.speed = SPEED * clamp((L.portrait ? H - L.kitchen.h : W - L.kitchen.w) / 640, 0.9, 1.4);
    for (const t of tables) {
      t.spot = { x: t.x, y: t.y + L.tr + 40 };
      t.chairs = [0, 1, 2, 3].map((k) => { const a = -Math.PI / 2 + k * Math.PI / 2 + Math.PI / 4; return { x: t.x + Math.cos(a) * (L.tr + 14), y: t.y + Math.sin(a) * (L.tr + 14) }; });
    }
    // plate slots on the pass: 2×4 standing up, 4×2 lying down
    const pc = L.portrait ? 4 : 2, pr = L.portrait ? 2 : 4;
    const sw = L.pass.w / pc, sh = (L.pass.h - 16) / pr;
    L.slots = Array.from({ length: pc * pr }, (_, i) => ({ x: L.pass.x + sw * (i % pc + 0.5), y: L.pass.y + 20 + sh * (Math.floor(i / pc) + 0.5), r: Math.min(sw, sh) * 0.42 }));
    L.plateR = Math.min(24, L.slots[0].r);
    layoutPanel();
    if (!server.x) { server.x = L.passSpot.x; server.y = L.passSpot.y + (L.portrait ? 0 : 0); }
    server.path = []; server.action = null;
    server.x = clamp(server.x, SR, W - SR); server.y = clamp(server.y, SR, H - SR);
    if (blocked(server.x, server.y)) { server.x = L.passSpot.x; server.y = L.passSpot.y; }
    needBuild = true;
  }

  function layoutPanel() {
    const { W, H } = view;
    const pw = Math.min(W - 16, 560), ph = Math.min(H - 16, L.portrait ? 470 : 404);
    // over the dining room when there's space, so the kitchen stays in view
    const px = !L.portrait && W - L.kitchen.w - 16 >= pw ? L.kitchen.w + (W - L.kitchen.w - pw) / 2 : (W - pw) / 2;
    const P = { x: px, y: L.portrait ? H - ph - 8 : (H - ph) / 2, w: pw, h: ph };
    const pad = 14;
    P.close = { x: P.x + pw - 54, y: P.y + 8, w: 46, h: 46 };
    const tbW = (pw - pad * 2 - 5 * 8) / 6;
    P.tables = Array.from({ length: TABLES }, (_, i) => ({ n: i + 1, x: P.x + pad + i * (tbW + 8), y: P.y + 74, w: tbW, h: L.portrait ? 56 : 50 }));
    const dTop = P.tables[0].y + P.tables[0].h + 34;
    const bH = L.portrait ? 64 : 52;
    const dH = (P.y + ph - pad - bH - 12 - dTop - 8) / 2;
    const dW = (pw - pad * 2 - 2 * 10) / 3;
    P.dishes = MENU.map((m, i) => ({ i, x: P.x + pad + (i % 3) * (dW + 10), y: dTop + Math.floor(i / 3) * (dH + 8), w: dW, h: dH }));
    P.clear = { x: P.x + pad, y: P.y + ph - pad - bH, w: (pw - pad * 2) * 0.32, h: bH };
    P.send = { x: P.clear.x + P.clear.w + 10, y: P.clear.y, w: pw - pad * 2 - P.clear.w - 10, h: bH };
    L.panel = P;
  }

  /* ── walking ────────────────────────────────────────────────────── */
  function blocked(x, y) {
    if (x < SR || y < SR || x > view.W - SR || y > view.H - SR) return true;
    for (const t of tables) if (Math.hypot(x - t.x, y - t.y) < L.tr + 14 + SR) return true;
    for (const r of [L.pass, L.term]) if (x > r.x - SR && x < r.x + r.w + SR && y > r.y - SR && y < r.y + r.h + SR) return true;
    return false;
  }
  function clearLine(a, b) {
    const n = Math.ceil(dist(a, b) / 6);
    for (let i = 1; i < n; i++) if (blocked(lerp(a.x, b.x, i / n), lerp(a.y, b.y, i / n))) return false;
    return true;
  }
  function findPath(a, b) {
    if (clearLine(a, b)) return [b];
    const cs = 14, cols = Math.ceil(view.W / cs), rows = Math.ceil(view.H / cs);
    const id = (c, r) => r * cols + c;
    const cell = (p) => [clamp(Math.floor(p.x / cs), 0, cols - 1), clamp(Math.floor(p.y / cs), 0, rows - 1)];
    const ctr = (c, r) => ({ x: (c + 0.5) * cs, y: (r + 0.5) * cs });
    const [sc, sr] = cell(a), [gc, gr] = cell(b);
    const prev = new Int32Array(cols * rows).fill(-2);
    const q = [id(sc, sr)]; prev[q[0]] = -1;
    let found = false;
    for (let h = 0; h < q.length; h++) {
      const k = q[h], c = k % cols, r = (k - c) / cols;
      if (c === gc && r === gr) { found = true; break; }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const nk = id(nc, nr);
        if (prev[nk] !== -2) continue;
        const p = ctr(nc, nr);
        if (!(nc === gc && nr === gr) && blocked(p.x, p.y)) continue;
        if (dc && dr && (blocked(ctr(c + dc, r).x, ctr(c + dc, r).y) || blocked(ctr(c, r + dr).x, ctr(c, r + dr).y))) continue;
        prev[nk] = k; q.push(nk);
      }
    }
    if (!found) return [b];
    const cells = [];
    for (let k = id(gc, gr); k !== -1 && k !== id(sc, sr); k = prev[k]) { const c = k % cols; cells.unshift(ctr(c, (k - c) / cols)); }
    const pts = [a, ...cells.slice(0, -1), b];
    // string-pull: skip every corner we can see past
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !clearLine(pts[i], pts[j])) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }
  function walkTo(p, action) {
    server.path = findPath({ x: server.x, y: server.y }, p);
    server.action = action;
    // (looks only) who to face on arrival
    const T = L.term, Pp = L.pass;
    server.look = action?.kind === 'table' ? { x: action.t.x, y: action.t.y } : action?.kind === 'pass' ? { x: Pp.x + Pp.w / 2, y: Pp.y + Pp.h / 2 } : action?.kind === 'terminal' ? { x: T.x + T.w / 2, y: T.y + T.h / 2 } : null;
    if (panel.open && action?.kind !== 'terminal') panel.open = false;
    if (!server.path.length || dist(server, p) < 3) arrive();
  }
  function arrive() {
    const a = server.action; server.action = null; server.path = [];
    if (!a) return;
    if (a.kind === 'table') atTable(a.t);
    else if (a.kind === 'terminal') { panel.open = true; ctx.sfx.work('tap', { vol: 0.5 }); }
    else if (a.kind === 'pass') atPass(a.plate);
  }

  /* ── tables ─────────────────────────────────────────────────────── */
  function seat(t) {
    const n = Math.random() < 0.45 ? 3 : 2;
    t.order = shuffle(MENU.map((m) => m.ch)).slice(0, n);
    t.faces = shuffle(FACES).slice(0, n);
    t.got = []; t.served = 0; t.show = 0; t.state = 'hand'; t.wait = WAIT_ORDER; t.t = 0;
    sent.set(t.n, 0);
    ctx.sfx.work('tap', { vol: 0.4 });
  }
  function leave(t, happy) {
    t.state = 'empty'; t.t = 2.5 + Math.random() * 3.5; t.show = 0;
    if (happy) ctx.sfx.satisfied(); else { ctx.sfx.complain(); stats.walkouts++; pops.add('Left hungry…', t.x, t.y - L.tr - 20, C.berryD, 16); }
  }

  function atTable(t) {
    const mine = server.carry.filter((p) => p.table === t.n);
    if (mine.length) {
      server.carry = server.carry.filter((p) => p.table !== t.n);
      let good = 0;
      for (const p of mine) {
        if (t.state === 'ordered' && t.order.includes(p.dish) && !t.got.includes(p.dish)) { t.got.push(p.dish); good++; }
        else stats.wrong++;
        if (t.state === 'ordered') t.served++;
      }
      const bad = mine.length - good;
      me?.play('serve', 0.5);
      if (good) { ctx.add(good); stats.right += good; ctx.sfx.serve(); ctx.sfx.good(good); pops.add(`+${good}`, t.x, t.y - L.tr - 22, C.leafD, 22); }
      if (bad) { me?.wobble(0.8); ctx.sfx.complain(); pops.add(t.state === 'ordered' ? 'We didn’t order that!' : 'Nobody ordered this!', t.x, t.y - L.tr - (good ? 48 : 22), C.berryD, 15); t.mood = 0.6; }
      if (t.state === 'ordered' && (t.got.length >= t.order.length || t.served >= t.order.length)) { t.state = 'eating'; t.t = EAT; }
      return;
    }
    if (server.carry.length) { pops.add(`Not for table ${t.n}`, t.x, t.y - L.tr - 22, C.muted, 15); ctx.sfx.miss(); me?.wobble(0.5); return; }
    if (t.state === 'hand') {
      t.state = 'ordered'; t.show = SHOW; t.wait = WAIT_FOOD; stats.taken++;
      ctx.sfx.work('scribble', { dur: 0.5, vol: 0.6 });
      me?.play('write', SHOW);
    } else if (t.state === 'ordered' && t.show <= 0) {
      t.show = SHOW_AGAIN; ctx.sfx.work('scribble', { dur: 0.3, vol: 0.4 });
      pops.add('Again? Sure…', t.x, t.y - L.tr - 52, C.muted, 13);
    }
  }

  /* ── pass ───────────────────────────────────────────────────────── */
  const freeSlot = () => { for (let i = 0; i < L.slots.length; i++) if (!plates.some((p) => p.slot === i)) return i; return -1; };
  function atPass(plate) {
    if (plate && plates.includes(plate)) {
      plates = plates.filter((p) => p !== plate);
      // hands full: swap the first plate you're holding for this one
      if (server.carry.length >= HANDS) plates.push({ ...server.carry.shift(), slot: plate.slot, age: 0 });
      server.carry.push({ dish: plate.dish, table: plate.table });
      ctx.sfx.work('plate', { vol: 0.6 });
      return;
    }
    if (server.carry.length) {
      // set everything back down on the pass
      for (const c of server.carry) { const s = freeSlot(); if (s < 0) break; plates.push({ ...c, slot: s, age: 0 }); }
      server.carry = [];
      ctx.sfx.work('plate', { vol: 0.4 });
    }
  }

  /* ── terminal ───────────────────────────────────────────────────── */
  function sendTicket() {
    if (!panel.table) { pops.add('Pick a table number', L.panel.x + L.panel.w / 2, L.panel.tables[0].y - 12, C.berryD, 15); ctx.sfx.miss(); return; }
    if (!panel.dishes.length) { pops.add('Pick the dishes', L.panel.x + L.panel.w / 2, L.panel.dishes[0].y - 12, C.berryD, 15); ctx.sfx.miss(); return; }
    tickets.push({ table: panel.table, dishes: [...panel.dishes], t: 0, dur: cookTime(panel.dishes.length) });
    sent.set(panel.table, (sent.get(panel.table) || 0) + 1);
    ctx.sfx.work('register', { dur: 0.4, vol: 0.7 });
    pops.add(`Sent table ${panel.table}`, L.panel.send.x + L.panel.send.w / 2, L.panel.send.y - 10, C.leafD, 16);
    panel.table = null; panel.dishes = []; panel.flash = 0.4;
  }
  function panelTap(p) {
    const P = L.panel;
    if (!inRect(p, P)) return false;
    if (inRect(p, P.close)) { panel.open = false; ctx.sfx.click(); return true; }
    const tb = P.tables.find((b) => inRect(p, b));
    if (tb) { panel.table = tb.n; ctx.sfx.click(); return true; }
    const d = P.dishes.find((b) => inRect(p, b));
    if (d) {
      const ch = MENU[d.i].ch;
      if (panel.dishes.includes(ch)) panel.dishes = panel.dishes.filter((x) => x !== ch);
      else if (panel.dishes.length < 3) panel.dishes.push(ch);
      else { pops.add('Three dishes max', d.x + d.w / 2, d.y, C.muted, 14); ctx.sfx.miss(); return true; }
      ctx.sfx.pop(); return true;
    }
    if (inRect(p, P.clear)) { panel.table = null; panel.dishes = []; ctx.sfx.click(); return true; }
    if (inRect(p, P.send)) { sendTicket(); return true; }
    return true;
  }

  /* ── input ──────────────────────────────────────────────────────── */
  function tap(p) {
    if (ctx.over) return;
    if (panel.open) { if (panelTap(p)) return; panel.open = false; }
    const plate = plates.find((x) => dist(p, L.slots[x.slot]) < L.slots[x.slot].r + 6);
    if (plate) { ctx.sfx.click(); walkTo(L.passSpot, { kind: 'pass', plate }); return; }
    if (inRect(p, { x: L.pass.x - 10, y: L.pass.y - 10, w: L.pass.w + 20, h: L.pass.h + 20 })) { walkTo(L.passSpot, { kind: 'pass' }); return; }
    if (inRect(p, { x: L.term.x - 10, y: L.term.y - 10, w: L.term.w + 20, h: L.term.h + 20 })) { walkTo(L.termSpot, { kind: 'terminal' }); return; }
    const t = tables.find((x) => Math.hypot(p.x - x.x, p.y - x.y) < L.tr + 40);
    if (t) { walkTo(t.spot, { kind: 'table', t }); return; }
    if (!blocked(p.x, p.y)) walkTo({ x: p.x, y: p.y }, null);
  }
  const offPointer = pointer(st, { down: tap });

  layout();
  view.onResize = layout;

  /* ── update ─────────────────────────────────────────────────────── */
  function step(dt) {
    // walk
    if (server.path.length) {
      let left = L.speed * dt;
      while (left > 0 && server.path.length) {
        const n = server.path[0], d = dist(server, n);
        if (d <= left) { server.x = n.x; server.y = n.y; server.path.shift(); left -= d; }
        else { server.x += (n.x - server.x) / d * left; server.y += (n.y - server.y) / d * left; left = 0; }
      }
      server.bob += dt * 14;
      if (!server.path.length) arrive();
    }
    // tables
    for (const t of tables) {
      t.mood = Math.max(0, t.mood - dt);
      if (t.show > 0) t.show = Math.max(0, t.show - dt);
      if (t.state === 'empty') { t.t -= dt; if (t.t <= 0) seat(t); }
      else if (t.state === 'hand') { t.wait -= dt; if (t.wait <= 0) leave(t, false); }
      else if (t.state === 'ordered') { if (t.show <= 0) t.wait -= dt; if (t.wait <= 0) leave(t, false); }
      else if (t.state === 'eating') { t.t -= dt; if (t.t <= 0) leave(t, true); }
    }
    // kitchen
    for (const k of tickets) k.t += dt;
    for (const k of tickets) {
      if (k.t < k.dur) continue;
      let any = false;
      while (k.dishes.length) { const sl = freeSlot(); if (sl < 0) break; plates.push({ dish: k.dishes.shift(), table: k.table, slot: sl, age: 0 }); any = true; }
      if (any) { ctx.sfx.work('glass', { vol: 0.5 }); ctx.sfx.work('clank', { vol: 0.4 }); }
    }
    tickets = tickets.filter((k) => k.dishes.length);
    for (const p of plates) p.age += dt;
    const cold = plates.filter((p) => p.age > COLD);
    if (cold.length) { plates = plates.filter((p) => p.age <= COLD); const s = L.slots[cold[0].slot]; pops.add('Went cold', s.x, s.y - 20, C.muted, 14); }
    panel.flash = Math.max(0, panel.flash - dt);
    pops.update(dt);
  }

  /* ── 3D dining room ─────────────────────────────────────────────── */
  const world = new THREE.Group();
  s3.add(world);
  let me = null;                            // the player's critter, walking the room
  const tableSets = new Map();              // table → { group, base, food, sig }
  let passSlots = [];                       // plate meshes on the pass, per slot
  let carrySig = '', carryMeshes = [], heldNow = null;
  const fl = (x, y) => s3.under(x, y, TOP);
  const vr = rng(11);                       // looks only: never touches the game's own randomness

  function own(o) { o.traverse((m) => { if (m.isMesh) m.userData.ownGeometry = true; }); return o; }
  function clearWorld() {
    world.traverse((m) => { if (m.isMesh && m.userData.ownGeometry) m.geometry.dispose(); });
    world.clear();
  }
  function box3(w, h, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat({ color }));
    m.userData.ownGeometry = true; m.castShadow = m.receiveShadow = true;
    return m;
  }
  /** A plate with its dish, `k` times life size. */
  function plateWith(dish, k) {
    const g2 = new THREE.Group();
    g2.add(model('plate'));
    const d = model(dishKind(dish)); d.position.y = 0.02; g2.add(d);
    g2.scale.setScalar(k);
    return g2;
  }

  function build() {
    clearWorld();
    tableSets.clear();
    passSlots = [];
    const { W, H } = view, K = L.kitchen;
    world.add(s3.floor('wood', { a: '#d2a676', b: '#bf9062', size: 0.6 }));
    // kitchen tiles, with a steel strip where the dining room starts
    const kf = s3.floor('checker', { a: '#e7edf1', b: '#cfd9e1', size: 0.3 });
    const x0 = -4, x1 = L.portrait ? W / SCALE + 4 : K.w / SCALE;
    const z0 = s3.at(0, -400, 0).z, z1 = L.portrait ? s3.at(0, K.h, 0).z : s3.at(0, H + 400, 0).z;
    kf.scale.set((x1 - x0) / 60, (z1 - z0) / 60, 1);
    kf.material.map.repeat.set((x1 - x0) / 0.6, (z1 - z0) / 0.6);
    kf.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2);
    world.add(kf);
    const strip = L.portrait ? box3(W / SCALE + 8, 0.04, 0.08, '#9aa7b1') : box3(0.08, 0.04, z1 - z0, '#9aa7b1');
    strip.position.set(L.portrait ? W / SCALE / 2 : x1, 0.02, L.portrait ? z1 : (z0 + z1) / 2);
    world.add(strip);
    // the pass: a steel counter the plates come up on
    const Pp = L.pass, pc = s3.under(Pp.x + Pp.w / 2, Pp.y + Pp.h / 2, PASS_H);
    const pass = own(steelCounter(Pp.w / SCALE - 0.06, Pp.h / (SCALE * s3.sinE) - 0.06));
    pass.scale.y = PASS_H / 0.93;
    pass.position.copy(pc);
    world.add(pass);
    for (let i = 0; i < L.slots.length; i++) passSlots.push({ mesh: null, sig: '' });
    // the terminal: a server station, its screen facing the room
    const T = L.term, tk = Math.min(1.7, (T.w / SCALE) / 0.95, (T.h - 16) / (1.35 * s3.cosE * SCALE + 0.55 * s3.sinE * SCALE));
    const term = own(serverStation());
    term.scale.setScalar(tk);
    term.position.copy(s3.at(T.x + T.w / 2, T.y + T.h - 22 - 0.275 * tk * s3.sinE * SCALE, 0));
    world.add(term);
    // round tables with four chairs each
    const chairT = own(chair('#e88d67'));
    for (const t of tables) {
      const set = new THREE.Group(), base = fl(t.x, t.y);
      set.position.copy(base);
      const top = own(table(true, '#fff5f5'));
      top.scale.set(L.tr / SCALE / 0.66, 1, L.tr / SCALE / 0.66);
      set.add(top);
      for (const c of t.chairs) {
        const m = chairT.clone(), p = fl(c.x, c.y).sub(base);
        m.position.copy(p); m.rotation.y = Math.atan2(-p.x, -p.z);
        set.add(m);
      }
      const food = new THREE.Group(); set.add(food);
      world.add(set);
      tableSets.set(t, { group: set, base, food, sig: '', guests: [], mood: 0 });
    }
    // the server
    if (me) s3.dropCritter(me);
    me = s3.critter({ ...ctx.critter, scale: CK });
    carrySig = ''; carryMeshes = []; heldNow = ctx.critter?.outfit?.hold || null;
    const p = s3.at(server.x, server.y, 0); me.setPosition(p.x, 0, p.z);
    me.object.rotation.y = 0; me.targetHeading = 0;
    lastMe = null;
  }

  /* guests: a pool of critters per species, reused as tables turn over */
  const pool = new Map();
  let leavers = [];
  function guest(face) {
    const sp = SPECIES_OF[face] || 'cat';
    const free = pool.get(sp);
    if (free?.length) { const c = free.pop(); c.object.visible = true; return c; }
    const c = s3.critter({ species: sp, outfit: casualOutfit(vr), seed: 'diner' + vr() });
    own(c.object);
    c.rig.shadow.traverse((m) => { if (m.isMesh) m.userData.ownGeometry = false; });
    return c;
  }
  function release(c) {
    c.stop(); c.sit(false); c.loop(null); c.gesture = null; c.object.visible = false; c.object.scale.setScalar(1);
    if (!pool.has(c.species)) pool.set(c.species, []);
    pool.get(c.species).push(c);
  }

  let lastMe = null, lastNow = performance.now();
  function sync() {
    const now = performance.now(), wall = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
    // the server walks the room: legs and heading follow the logic position
    const p = s3.at(server.x, server.y, 0);
    const moving = server.path.length > 0;
    if (lastMe) {
      const dx = p.x - lastMe.x, dz = p.z - lastMe.z, d = Math.hypot(dx, dz);
      if (d > 1e-4) { me.targetHeading = Math.atan2(dx, dz); me.phase += d * 5; }
    }
    me.setPosition(p.x, 0, p.z);
    lastMe = p.clone();
    me.walking = moving;
    if (!moving && server.look) { const q = s3.at(server.look.x, server.look.y, 0); me.faceTowards(q); }
    // plates in hand
    const sig = server.carry.map((c) => c.dish + c.table).join();
    if (sig !== carrySig) {
      carrySig = sig;
      for (const m of carryMeshes) m.removeFromParent();
      carryMeshes = server.carry.map((c, i) => {
        const m = plateWith(c.dish, 2.1);
        m.rotation.x = Math.PI / 2; m.position.set(0, -0.03, 0.06);
        (i ? me.rig.handL : me.rig.handR).add(m);
        return m;
      });
    }
    const wantHold = server.carry.length ? null : (ctx.critter?.outfit?.hold || null);
    if (wantHold !== heldNow) { me.hold(wantHold); heldNow = wantHold; if (!wantHold) me.heldKind = null; }
    me.loop(panel.open ? 'type' : server.carry.length ? 'carry' : null);
    // tables: guests on their chairs, plates on the table
    for (const t of tables) {
      const v = tableSets.get(t);
      if (!v) continue;
      const seated = t.state !== 'empty';
      if (seated && !v.guests.length) {
        v.guests = t.faces.map((f, i) => {
          const c = guest(f), q = fl(t.chairs[i].x, t.chairs[i].y);
          c.setPosition(q.x, 0, q.z);
          const h = Math.atan2(v.base.x - q.x, v.base.z - q.z);
          c.object.rotation.y = h; c.face(h); c.sit(true, 0.5);
          c.object.scale.setScalar(CK);
          return c;
        });
      } else if (!seated && v.guests.length) {
        // off they go: happy or hungry
        const door = s3.at(L.portrait ? view.W / 2 : view.W + 40, L.portrait ? view.H + 60 : t.y, 0);
        v.guests.forEach((c) => {
          c.sit(false); c.loop(null);
          const away = c.position.clone().lerp(door, 0.18); away.y = 0;
          c.walkTo([away]);
          leavers.push({ c, t: 0, dur: 1.1, k: c.object.scale.x });
        });
        v.guests = [];
      }
      v.guests.forEach((c, i) => {
        let g2 = null;
        if (t.state === 'hand') g2 = i === 0 ? 'wave' : null;
        else if (t.state === 'ordered') g2 = t.show > 0 && i === 0 ? 'talk' : null;
        else if (t.state === 'eating') g2 = 'eat';
        c.loop(g2);
      });
      if (t.mood > v.mood + 0.05) v.guests.forEach((c) => { c.play('angry', 0.6); c.wobble(0.6); });
      v.mood = t.mood;
      // what's on the table: dishes that have arrived, in front of whoever ordered them
      const on = t.state === 'eating' ? t.order : t.state === 'ordered' ? t.got : [];
      const fsig = t.state + on.join();
      if (fsig !== v.sig) {
        v.sig = fsig;
        v.food.clear();
        for (const d of on) {
          const who = Math.max(0, t.order.indexOf(d)), c = t.chairs[who];
          const m = plateWith(d, FOODK);
          m.position.copy(fl(lerp(c.x, t.x, 0.6), lerp(c.y, t.y, 0.6)).sub(v.base)); m.position.y = TOP;
          v.food.add(m);
        }
      }
    }
    for (const l of leavers) { l.t += wall; l.c.object.scale.setScalar(l.k * Math.max(0.01, clamp((l.dur - l.t) / 0.35, 0, 1))); }
    for (const l of leavers) if (l.t >= l.dur) release(l.c);
    leavers = leavers.filter((l) => l.t < l.dur);
    // plates up at the pass
    const k = (L.plateR * 2 * 0.9) / (0.26 * SCALE);
    passSlots.forEach((ps, i) => {
      const pl = plates.find((x) => x.slot === i);
      const s2 = pl ? pl.dish : '';
      if (s2 !== ps.sig) {
        ps.sig = s2;
        ps.mesh?.removeFromParent(); ps.mesh = null;
        if (pl) { ps.mesh = plateWith(pl.dish, k); ps.mesh.position.copy(s3.at(L.slots[i].x, L.slots[i].y, PASS_H)); ps.mesh.rotation.y = -0.4; world.add(ps.mesh); }
      }
      if (ps.mesh && pl) ps.mesh.scale.setScalar(k * (pl.age > COLD - 6 ? 0.92 + 0.08 * Math.abs(Math.sin(pl.age * 5)) : 1));
    });
  }

  /* ── drawing: the overlay is bubbles, tickets, the terminal and notes ── */
  function drawTag(x, y, table, alpha = 1) {
    g.save(); g.globalAlpha *= alpha;
    box(g, x - 10, y - 9, 20, 18, { fill: C.butter, stroke: C.butterD, lw: 2, r: 5 });
    text(g, String(table), x, y + 1, { size: 13, weight: 800, color: C.ink });
    g.restore();
  }

  function drawTableUI(t) {
    const R = L.tr;
    // patience ring
    if (t.state === 'hand' || (t.state === 'ordered' && t.show <= 0)) {
      const k = clamp(t.wait / (t.state === 'hand' ? WAIT_ORDER : WAIT_FOOD), 0, 1);
      g.beginPath(); g.arc(t.x, t.y, R + 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      g.strokeStyle = k < 0.3 ? C.berry : k < 0.6 ? C.butter : 'rgba(95,194,147,.6)'; g.lineWidth = 4; g.stroke();
    }
    if (t.state !== 'eating') text(g, String(t.n), t.x, t.y + 1, { size: R * 0.95, weight: 800, color: '#fff', stroke: C.woodD });
    if (t.state === 'hand') {
      const by = t.y - R - 50 + Math.sin(performance.now() / 180 + t.n) * 3;
      circle(g, t.x + R * 0.7, by, 13, '#fff', C.ink, 2.5);
      text(g, '!', t.x + R * 0.7, by + 1, { size: 18, weight: 800, color: C.berryD });
    }
    if (t.state === 'ordered' && t.show <= 0) {
      const need = t.order.length - t.served, x = t.x + R + 26;
      box(g, x - 20, t.y - 12, 40, 24, { fill: '#8a6a55', stroke: '#fff', lw: 2, r: 12 });
      g.drawImage(icon(s3.renderer, 'plate'), x - 18, t.y - 10, 20, 20);
      text(g, String(need), x + 9, t.y + 1, { size: 14, color: '#fff', weight: 800 });
    }
  }

  function drawBubble(t) {
    const n = t.order.length, bw = n * 40 + 20, bh = 54;
    let bx = t.x - bw / 2, by = t.y - L.tr - bh - 18;
    bx = clamp(bx, 6, view.W - bw - 6); by = Math.max(6, by);
    const a = clamp(t.show / 0.25, 0, 1);
    g.save(); g.globalAlpha = a;
    box(g, bx, by, bw, bh, { fill: '#fff', stroke: C.ink, lw: 2.5, r: 16, shadow: 4 });
    g.beginPath(); g.moveTo(t.x - 8, by + bh - 1); g.lineTo(t.x, by + bh + 12); g.lineTo(t.x + 8, by + bh - 1); g.fillStyle = '#fff'; g.fill();
    t.order.forEach((d, i) => g.drawImage(dishIcon(d), bx + 30 + i * 40 - 21, by + bh / 2 - 23, 42, 42));
    // time left on the bubble
    box(g, bx + 12, by + bh - 7, (bw - 24) * clamp(t.show / SHOW, 0, 1), 3, { fill: C.lilac, r: 2 });
    g.restore();
  }

  function drawPanel() {
    const P = L.panel;
    g.save(); g.fillStyle = 'rgba(74,52,40,.25)'; g.fillRect(0, 0, view.W, view.H); g.restore();
    box(g, P.x, P.y, P.w, P.h, { fill: C.paper, stroke: C.ink, lw: 3, r: 20, shadow: 6 });
    text(g, 'Order terminal', P.x + 18, P.y + 30, { size: 19, weight: 800, align: 'left' });
    box(g, P.close.x, P.close.y, P.close.w, P.close.h, { fill: '#fff', stroke: C.line, r: 14 });
    text(g, '✕', P.close.x + P.close.w / 2, P.close.y + P.close.h / 2 + 1, { size: 22, weight: 800, color: C.muted });
    text(g, 'Table', P.x + 16, P.tables[0].y - 12, { size: 13, weight: 700, color: C.muted, align: 'left' });
    for (const b of P.tables) {
      const on = panel.table === b.n;
      box(g, b.x, b.y, b.w, b.h, { fill: on ? C.butter : '#fff', stroke: on ? C.butterD : C.line, r: 14, shadow: on ? 0 : 3 });
      text(g, String(b.n), b.x + b.w / 2, b.y + b.h / 2 + 1, { size: 24, weight: 800 });
      if (sent.get(b.n)) { circle(g, b.x + b.w - 10, b.y + 10, 7, C.leaf, '#fff', 1.5); text(g, '✓', b.x + b.w - 10, b.y + 10.5, { size: 10, weight: 800, color: '#fff' }); }
    }
    text(g, `Dishes ${panel.dishes.length ? `(${panel.dishes.length})` : ''}`, P.x + 16, P.dishes[0].y - 12, { size: 13, weight: 700, color: C.muted, align: 'left' });
    for (const b of P.dishes) {
      const m = MENU[b.i], on = panel.dishes.includes(m.ch), sz = Math.min(60, b.h * 0.66);
      box(g, b.x, b.y, b.w, b.h, { fill: on ? '#e4f6ec' : '#fff', stroke: on ? C.leaf : C.line, lw: on ? 4 : 3, r: 16, shadow: on ? 0 : 3 });
      g.drawImage(dishIcon(m.ch), b.x + b.w / 2 - sz / 2, b.y + b.h / 2 - 8 - sz / 2, sz, sz);
      text(g, m.name, b.x + b.w / 2, b.y + b.h - 13, { size: 13, weight: 700, color: C.muted });
      if (on) text(g, '✓', b.x + b.w - 14, b.y + 14, { size: 18, weight: 800, color: C.leafD });
    }
    box(g, P.clear.x, P.clear.y, P.clear.w, P.clear.h, { fill: '#fff', stroke: C.line, r: 16, shadow: 3 });
    text(g, 'Clear', P.clear.x + P.clear.w / 2, P.clear.y + P.clear.h / 2 + 1, { size: 17, weight: 700, color: C.muted });
    const ready = panel.table && panel.dishes.length;
    box(g, P.send.x, P.send.y, P.send.w, P.send.h, { fill: ready ? C.leaf : '#cfe9db', stroke: ready ? C.leafD : null, r: 16, shadow: 3 });
    text(g, panel.table ? `Send table ${panel.table} →` : 'Send to kitchen →', P.send.x + P.send.w / 2, P.send.y + P.send.h / 2 + 1, { size: 18, weight: 800, color: '#fff' });
    if (panel.flash > 0) { g.save(); g.globalAlpha = panel.flash; box(g, P.x, P.y, P.w, P.h, { fill: 'rgba(95,194,147,.25)', r: 20 }); g.restore(); }
  }

  const hand = new THREE.Vector3();
  function draw() {
    if (needBuild) { needBuild = false; build(); }
    sync();
    s3.render();

    const { W, H } = view;
    s3.begin2d();
    // pass and terminal labels
    const Pp = L.pass;
    text(g, tickets.length ? `The pass · ${tickets.length} cooking` : 'The pass', Pp.x + 10, Pp.y + 10, { size: 12, weight: 800, color: C.ink, align: 'left', stroke: '#fff' });
    for (let i = 0; i < L.slots.length; i++) if (!plates.some((p) => p.slot === i)) { const s = L.slots[i]; circle(g, s.x, s.y, L.plateR * 0.8, 'rgba(255,255,255,.3)'); }
    for (const p of plates) {
      const s = L.slots[p.slot];
      drawTag(s.x + L.plateR * 0.7, s.y - L.plateR * 0.75, p.table, p.age > COLD - 6 ? 0.55 + 0.45 * Math.abs(Math.sin(p.age * 5)) : 1);
    }
    const T = L.term;
    text(g, 'Terminal', T.x + T.w / 2, T.y + T.h - 9, { size: 13, weight: 800, color: C.ink, stroke: '#fff' });
    // tables
    for (const t of tables) drawTableUI(t);
    // table tags on the plates in hand
    carryMeshes.forEach((m, i) => {
      m.getWorldPosition(hand);
      const v = s3.toView(hand), side = Math.sign(v.x - server.x) || (i ? 1 : -1);
      drawTag(server.x + side * 30, v.y - 4, server.carry[i].table);
    });
    if (server.path.length) { const end = server.path[server.path.length - 1]; circle(g, end.x, end.y, 6, null, 'rgba(47,139,196,.5)', 2); }
    if (ctx.elapsed() < 7 && !panel.open && !stats.taken) {
      const a = 1 - Math.max(0, ctx.elapsed() - 5) / 2, y = L.portrait ? L.kitchen.h + 52 : H - 16, x = L.portrait ? W / 2 : (L.kitchen.w + W) / 2;
      g.save(); g.globalAlpha = a;
      box(g, x - 175, y - 13, 350, 26, { fill: 'rgba(255,250,240,.92)', r: 13 });
      g.restore();
      text(g, 'Tap a table with a raised paw to take their order', x, y, { size: 14, color: C.muted, weight: 700, alpha: a });
    }
    // bubbles on top
    for (const t of tables) if (t.show > 0) drawBubble(t);
    if (panel.open) drawPanel();
    pops.draw(g);
  }

  return {
    start() {
      tables.forEach((t, i) => { t.state = 'empty'; t.t = i < 2 ? 0.01 : 3 + (i - 2) * 4 + Math.random() * 2; });
    },
    update(dt) { if (!ctx.over) step(dt); else pops.update(dt); },
    draw,
    end() { panel.open = false; },
    /** For automated play-tests. `order` is the truth; a bot must "remember" it itself. */
    peek() {
      const P = L.panel;
      const mid = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
      return {
        view: { ...view },
        server: { x: server.x, y: server.y, moving: server.path.length > 0, carry: server.carry.map((c) => ({ ...c })) },
        tables: tables.map((t) => ({ n: t.n, state: t.state, x: t.x, y: t.y, show: t.show, order: [...t.order], got: [...t.got], served: t.served, wait: t.wait, sent: sent.get(t.n) || 0 })),
        pass: plates.map((p) => ({ dish: p.dish, table: p.table, x: L.slots[p.slot].x, y: L.slots[p.slot].y, age: p.age })),
        tickets: tickets.map((k) => ({ table: k.table, dishes: [...k.dishes], left: k.dur - k.t })),
        terminal: mid(L.term), passTap: { x: L.pass.x + 6, y: L.pass.y + 6 },
        panel: { open: panel.open, table: panel.table, dishes: [...panel.dishes], tables: P.tables.map(mid), dishBtns: P.dishes.map((d) => ({ ch: MENU[d.i].ch, ...mid(d) })), send: mid(P.send), clear: mid(P.clear), close: mid(P.close) },
        stats: { ...stats },
      };
    },
    destroy() { offPointer(); s3.destroy(); },
  };
}

/* ── models ──────────────────────────────────────────────────────────── */
defineModel('server:pasta', (b) => {
  for (let i = 0; i < 6; i++) b.torus(0.03, 0.009, '#f2c14e', { x: Math.cos(i * 1.1) * 0.03, y: 0.02 + i * 0.006, z: Math.sin(i * 1.1) * 0.03, rx: Math.PI / 2 + i * 0.3 });
  for (let i = 0; i < 3; i++) b.sphere(0.016, '#c0392b', { x: Math.cos(i * 2.1) * 0.025, y: 0.05, z: Math.sin(i * 2.1) * 0.025 });
  b.sphere(0.01, '#6aa84f', { y: 0.065 });
});

/** A tiny seeded random for looks (outfits), so drawing never shifts the game's own dice. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
