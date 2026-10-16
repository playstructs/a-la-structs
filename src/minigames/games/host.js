/**
 * Host — "Full House". Parties of one to six critters queue at the host
 * stand, each with a patience meter. Drag a party (or tap it, then tap a
 * table) onto a free table that seats them: 2-, 4- and 6-tops. A party can't
 * squeeze onto a table that's too small; a couple at a 6-top is allowed but
 * wastes seats. Seated parties eat for a while (bigger parties and
 * celebrations linger, coffee-and-cake folk are quick), then leave and the
 * table takes a moment to reset. Parties that wait too long walk out.
 * Score = guests who've eaten and left (counted as they leave).
 */
import { pointer, C, box, circle, text, rr, lerp, clamp, inRect, dist, pick, shuffle, Pops } from '../kit.js';
import { stage3d } from '../kit3d.js';
import { model, icon, defineModel } from '../models.js';
import * as THREE from 'three';
import { toonMat } from '../../three/toon.js';
import { table, chair, hostStand, plant, bench, rug } from '../../three/props.js';
import { itemMesh } from '../../three/items.js';
import { casualOutfit } from '../../three/outfits.js';

// Party members are picked by face (as before); each face is drawn as that species of critter.
const FACES = ['🐰', '🐻', '🦊', '🐱', '🐼', '🐸', '🐨', '🐯', '🐷', '🐮', '🐭', '🐹', '🦝', '🐶'];
const SPECIES_OF = { '🐰': 'bunny', '🐻': 'bear', '🦊': 'fox', '🐱': 'cat', '🐼': 'panda', '🐸': 'frog', '🐨': 'koala', '🐯': 'duck', '🐷': 'pig', '🐮': 'sheep', '🐭': 'mouse', '🐹': 'hamster', '🦝': 'raccoon', '🐶': 'dog' };
const KINDS = {
  quick: { model: 'mug', opts: { fill: '#8a5a3c' }, mult: 0.6, label: 'Quick bite' },
  normal: { model: 'host:dinner', opts: {}, mult: 1, label: 'Dinner' },
  feast: { model: 'host:cake', opts: {}, mult: 1.45, label: 'Celebration' },
};
const FOOD = ['host:pasta', 'ramen', 'pizza', 'host:stew', 'salad', 'burger', 'toast'];
const SCALE = 50;                          // view units per metre: a life-size dining room
const TOP = 0.79;                          // table-top height (m)
const CK = 1;                              // critters at the tables and the host
const QK = 0.82;                           // critters waiting in the queue
const FOODK = 1.6;                         // plates and food, a little larger than life
const CAPS = [2, 4, 6, 2, 4, 2, 6, 4];   // grid order, so sizes are spread over the floor
const QUEUE_MAX = 6;
const RESET = 1.6;                         // seconds to clear and re-lay a table
const SIZES = [1, 2, 2, 2, 3, 3, 4, 4, 4, 5, 5, 6, 6];

export const eatTime = (size, kind) => (3.5 + size * 1.0) * KINDS[kind].mult;

export default function create(ctx) {
  const s3 = stage3d(ctx.el, { scale: SCALE, quality: ctx.quality });
  const st = s3.ui, view = s3.view, g = s3.g;
  const pops = new Pops();
  const L = {};
  let needBuild = true;                     // the 3D room is (re)built lazily in draw()
  let queue = [];                           // waiting parties, oldest first
  let tables = CAPS.map((cap, i) => ({ id: i, cap, state: 'free', party: null, t: 0, dur: 0, food: pick(FOOD), shake: 0 }));
  let nextId = 1;
  let spawnIn = 0;
  let held = null;                          // { party, x, y, sx, sy, moved }
  let selected = null;                      // party picked by tap
  let leaving = [];                         // faces drifting off
  let walkouts = 0, seatedGuests = 0, servedGuests = 0, wasted = 0;

  /* ── layout ─────────────────────────────────────────────────────── */
  function layout() {
    const { W, H } = view;
    L.portrait = view.portrait;
    if (L.portrait) {
      const cols = 3, gap = 8, cw = (W - 24 - gap * (cols - 1)) / cols, ch = 70;
      L.stand = { x: 8, y: 8, w: W - 16, h: 30 + 2 * ch + gap + 12 };
      L.slots = Array.from({ length: QUEUE_MAX }, (_, i) => ({ x: 12 + (i % cols) * (cw + gap), y: 38 + Math.floor(i / cols) * (ch + gap), w: cw, h: ch }));
      L.floor = { x: 8, y: L.stand.y + L.stand.h + 10, w: W - 16, h: H - (L.stand.y + L.stand.h + 10) - 8 };
    } else {
      const qw = clamp(W * 0.24, 150, 190), ch = 54, gap = 6;
      L.stand = { x: 8, y: 8, w: qw + 8, h: H - 16 };
      L.slots = Array.from({ length: QUEUE_MAX }, (_, i) => ({ x: 12, y: 36 + i * (ch + gap), w: qw, h: ch }));
      L.floor = { x: L.stand.x + L.stand.w + 10, y: 8, w: W - (L.stand.x + L.stand.w + 10) - 8, h: H - 16 };
    }
    // Pick the grid that gives the roomiest cells.
    const f = L.floor;
    let best = null;
    for (const cols of [2, 3, 4]) {
      const rows = Math.ceil(CAPS.length / cols), cell = Math.min(f.w / cols, f.h / rows * 1.25);
      if (!best || cell > best.cell) best = { cols, rows, cell };
    }
    const { cols, rows } = best, cw = f.w / cols, chh = f.h / rows;
    L.plants = [];
    for (let i = CAPS.length; i < cols * rows; i++) L.plants.push({ x: f.x + (i % cols + 0.5) * cw, y: f.y + (Math.floor(i / cols) + 0.5) * chh });
    tables.forEach((t, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      t.cell = { x: f.x + c * cw + 3, y: f.y + r * chh + 3, w: cw - 6, h: chh - 6 };
      t.cx = t.cell.x + t.cell.w / 2; t.cy = t.cell.y + t.cell.h / 2 + 4;
      const s = Math.min(t.cell.w, t.cell.h);
      // table top size grows with seats
      const k = t.cap === 2 ? 0.34 : t.cap === 4 ? 0.42 : 0.5;
      t.tw = Math.min(t.cell.w * (t.cap === 6 ? 0.62 : 0.5), s * k * (t.cap === 6 ? 1.5 : 1));
      t.th = s * (t.cap === 6 ? 0.34 : k);
      t.seats = seatSpots(t, s);
    });
    needBuild = true;   // the 3D room is rebuilt on the next frame
  }
  function seatSpots(t, s) {
    const out = [], pad = clamp(s * 0.13, 14, 22);
    const { cx, cy, tw, th, cap } = t;
    if (cap === 2) { out.push({ x: cx - tw / 2 - pad, y: cy }, { x: cx + tw / 2 + pad, y: cy }); }
    else if (cap === 4) { out.push({ x: cx - tw / 2 - pad, y: cy }, { x: cx + tw / 2 + pad, y: cy }, { x: cx, y: cy - th / 2 - pad }, { x: cx, y: cy + th / 2 + pad }); }
    else { for (const sy of [-1, 1]) for (const k of [-1, 0, 1]) out.push({ x: cx + k * tw * 0.32, y: cy + sy * (th / 2 + pad) }); }
    return out;
  }
  layout();
  view.onResize = layout;

  /* ── parties ────────────────────────────────────────────────────── */
  function newParty() {
    const size = pick(SIZES);
    const r = Math.random();
    const kind = r < 0.25 ? 'quick' : r < 0.82 ? 'normal' : 'feast';
    const pat = lerp(20, 15, clamp(ctx.elapsed() / ctx.seconds, 0, 1));
    const faces = shuffle(FACES).slice(0, size);
    return { id: nextId++, size, kind, faces, patience: pat, maxPatience: pat, born: 0, t: 0 };
  }
  function spawn() {
    if (queue.length >= QUEUE_MAX) return;
    queue.push(newParty());
    ctx.sfx.work('tap', { vol: 0.5 });
  }
  function slotOf(p) { return L.slots[queue.indexOf(p)]; }

  function trySeat(p, t) {
    if (!p || !t || ctx.over) return false;
    if (t.state !== 'free') {
      pops.add(t.state === 'reset' ? 'Still clearing' : 'Table’s taken', t.cx, t.cy - 30, C.muted, 15);
      ctx.sfx.miss(); t.shake = 0.3; host?.wobble(0.8); return false;
    }
    if (p.size > t.cap) {
      pops.add(`Only seats ${t.cap}!`, t.cx, t.cy - 30, C.berryD, 16);
      ctx.sfx.miss(); t.shake = 0.3; host?.wobble(0.8); return false;
    }
    queue = queue.filter((x) => x !== p);
    if (selected === p) selected = null;
    p.seatedAt = t;
    t.state = 'eating'; t.party = p; t.t = 0; t.dur = eatTime(p.size, p.kind); t.food = pick(FOOD); t.pop = 0;
    seatedGuests += p.size; wasted += t.cap - p.size;
    ctx.sfx.pop(); ctx.sfx.work('scribble', { dur: 0.3, vol: 0.5 });
    if (t.cap - p.size >= 4) pops.add('Lots of empty seats…', t.cx, t.cy - 34, C.muted, 14);
    else if (t.cap === p.size) { pops.add('Perfect fit!', t.cx, t.cy - 34, C.leafD, 15); host?.hop(0.6); }
    host?.play('point', 0.6);
    return true;
  }

  function tableAt(pt) { return tables.find((t) => inRect(pt, t.cell)); }
  function partyAt(pt) { return queue.find((p) => inRect(pt, slotOf(p))); }

  /* ── input ──────────────────────────────────────────────────────── */
  const offPointer = pointer(st, {
    down: (pt) => {
      if (ctx.over) return;
      const p = partyAt(pt);
      if (p) { held = { party: p, x: pt.x, y: pt.y, sx: pt.x, sy: pt.y, moved: false }; ctx.sfx.click(); return; }
      const t = tableAt(pt);
      if (t && selected) { trySeat(selected, t); return; }
      if (t && t.state === 'free' && !selected) pops.add('Pick a party first', t.cx, t.cy - 30, C.muted, 14);
    },
    move: (pt) => {
      if (!held) return;
      held.x = pt.x; held.y = pt.y;
      if (dist(pt, { x: held.sx, y: held.sy }) > 10) held.moved = true;
    },
    up: (pt) => {
      if (!held) return;
      const h = held; held = null;
      if (!queue.includes(h.party)) return;
      if (h.moved) {
        const t = tableAt(pt);
        if (t) trySeat(h.party, t);
      } else selected = selected === h.party ? null : h.party;
    },
  });

  /* ── update ─────────────────────────────────────────────────────── */
  function step(dt) {
    const k = clamp(ctx.elapsed() / ctx.seconds, 0, 1);
    spawnIn -= dt;
    if (spawnIn <= 0) { spawn(); spawnIn = lerp(1.9, 0.95, k) * (0.75 + Math.random() * 0.5); }
    for (const p of [...queue]) {
      p.t += dt;
      if (held?.party === p) continue;     // the party you're holding doesn't tick away
      p.patience -= dt;
      if (p.patience <= 0) {
        queue = queue.filter((x) => x !== p);
        if (selected === p) selected = null;
        walkouts++;
        const s = L.slots[0];
        pops.add('Walked out!', s.x + s.w / 2, s.y + 12, C.berryD, 16);
        ctx.sfx.complain();
        host?.play('sad', 1);
      }
    }
    for (const t of tables) {
      t.shake = Math.max(0, t.shake - dt);
      t.pop = (t.pop || 0) + dt;
      if (t.state === 'eating') {
        t.t += dt;
        if (t.t >= t.dur) {
          const p = t.party;
          ctx.add(p.size); servedGuests += p.size;
          pops.add(`+${p.size}`, t.cx, t.cy - 30, C.leafD, 22);
          ctx.sfx.coin(); if (p.size >= 4) ctx.sfx.satisfied();
          t.seats.slice(0, p.size).forEach((s, i) => leaving.push({ ch: p.faces[i], x: s.x, y: s.y, t: 0 }));
          t.state = 'reset'; t.t = 0; t.dur = RESET; t.party = null;
          ctx.sfx.work('wipe', { dur: 0.6, vol: 0.5 });
        }
      } else if (t.state === 'reset') {
        t.t += dt;
        if (t.t >= t.dur) { t.state = 'free'; ctx.sfx.work('plate', { vol: 0.4 }); }
      }
    }
    for (const f of leaving) f.t += dt;
    leaving = leaving.filter((f) => f.t < 0.8);
  }

  /* ── 3D dining room ─────────────────────────────────────────────── */
  const world = new THREE.Group();
  s3.add(world);
  let host = null, standMesh = null;
  const tableSets = new Map();              // table → { group, food, sig, party }
  const mats = [];                          // queue slot mats
  const fl = (x, y) => s3.under(x, y, TOP); // floor spot for a table set whose top shows at (x, y)
  const vr = rng(7);                        // looks only: never touches the game's own randomness

  function own(o) { o.traverse((m) => { if (m.isMesh) m.userData.ownGeometry = true; }); return o; }
  function clearWorld() {
    world.traverse((m) => { if (m.isMesh && m.userData.ownGeometry) m.geometry.dispose(); });
    world.clear();
  }
  function box3(w, h, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat({ color }));
    m.userData.ownGeometry = true; m.receiveShadow = true;
    return m;
  }

  function build() {
    clearWorld();
    tableSets.clear();
    mats.length = 0;
    world.add(s3.floor('wood', { a: '#d2a676', b: '#bf9062', size: 0.6 }));
    // the waiting area: a soft rug with a mat per place in the queue
    const s = L.stand, rc = s3.at(s.x + s.w / 2, s.y + s.h / 2, 0);
    const rugM = own(rug(s.w / SCALE, s.h / (SCALE * s3.sinE), '#b18cf2'));
    rugM.position.copy(rc); world.add(rugM);
    for (const r of L.slots) {
      const m = box3(r.w / SCALE - 0.04, 0.03, r.h / (SCALE * s3.sinE) - 0.04, '#fff7ec');
      m.position.copy(s3.at(r.x + r.w / 2, r.y + r.h / 2, 0.08)); m.position.y = 0.085;
      world.add(m); mats.push(m);
    }
    // tables and chairs, sized to each table's spot on the floor
    const chairT = own(chair('#e88d67'));
    for (const t of tables) {
      const set = new THREE.Group(), base = fl(t.cx, t.cy);
      set.position.copy(base);
      const top = own(table(t.cap !== 6, '#fff5f5'));
      if (t.cap === 6) top.scale.set(t.tw / SCALE / 1.2, 1, (t.th * 0.92) / (SCALE * s3.sinE) / 0.9);
      else top.scale.set(t.tw / SCALE / 1.32, 1, (t.th * 0.9) / (SCALE * s3.sinE) / 1.32);
      set.add(top);
      t.seats.forEach((st2) => {
        const c = chairT.clone(), p = fl(st2.x, st2.y).sub(base);
        c.position.copy(p); c.rotation.y = seatFace(t, st2);
        set.add(c);
      });
      const food = new THREE.Group(); set.add(food);
      const sponge = itemMesh('sponge'); sponge.scale.setScalar(2.2); sponge.position.y = TOP + 0.01; sponge.visible = false; set.add(sponge);
      world.add(set);
      tableSets.set(t, { group: set, base, food, sponge, sig: '', party: null });
    }
    // plants and a bench fill the spare spots
    for (const pl of L.plants) {
      const p1 = own(plant(1.3)); p1.position.copy(s3.at(pl.x - 34, pl.y + 24, 0)); world.add(p1);
      const b = own(bench()); b.position.copy(s3.at(pl.x + 22, pl.y + 26, 0)); world.add(b);
    }
    // the host at the stand by the front of the queue
    standMesh = own(hostStand());
    const hs = hostSpot();
    standMesh.position.copy(s3.at(hs.stand.x, hs.stand.y, 0)); standMesh.rotation.y = hs.face;
    world.add(standMesh);
    if (host) s3.dropCritter(host);
    host = s3.critter({ ...ctx.critter, scale: CK });
    const hp = s3.at(hs.me.x, hs.me.y, 0);
    host.setPosition(hp.x, 0, hp.z); host.object.rotation.y = hs.face; host.targetHeading = hs.face;
    // everyone already in the room takes their places again
    for (const p of known) if (p.cs) p.cs.forEach((c) => { c.sit(false); });
  }
  /** Stand and host: just inside the dining room, next to the front of the queue. */
  function hostSpot() {
    const f = L.floor;
    if (L.portrait) return { stand: { x: f.x + 30, y: f.y + 44 }, me: { x: f.x + 30, y: f.y + 30 }, face: 0.35 };
    return { stand: { x: f.x + 6, y: f.y + 86 }, me: { x: f.x + 6, y: f.y + 70 }, face: -0.55 };
  }
  /** Chairs face the table: side seats sideways, the rest front or back. */
  function seatFace(t, s) {
    if (Math.abs(s.x - t.cx) > t.tw / 2) return s.x < t.cx ? Math.PI / 2 : -Math.PI / 2;
    return s.y < t.cy ? 0 : Math.PI;
  }

  /* guests: a pool of critters per species, reused as parties come and go */
  const pool = new Map();                   // species → [Character]
  const known = new Set();                  // parties that have critters
  let leavers = [];                         // { c, t, dur }
  function guest(face) {
    const sp = SPECIES_OF[face] || 'cat';
    const free = pool.get(sp);
    if (free?.length) { const c = free.pop(); c.object.visible = true; return c; }
    const c = s3.critter({ species: sp, outfit: casualOutfit(vr), seed: 'guest' + vr(), shadow: true });
    own(c.object);
    c.rig.shadow.traverse((m) => { if (m.isMesh) m.userData.ownGeometry = false; });
    return c;
  }
  function release(c) {
    c.stop(); c.sit(false); c.loop(null); c.gesture = null; c.object.visible = false; c.object.scale.setScalar(1);
    if (!pool.has(c.species)) pool.set(c.species, []);
    pool.get(c.species).push(c);
  }
  function crittersFor(p) {
    if (!p.cs) { p.cs = p.faces.map((f) => guest(f)); known.add(p); }
    return p.cs;
  }
  /** Where a party's critters stand inside a queue card (feet, view units): one or two staggered rows. */
  function partySpots(n, r) {
    const br = Math.min(17, r.h * 0.3);
    const x0 = r.x + br * 2 + 12, x1 = r.x + r.w - 8, span = x1 - x0;
    const rows = n > 3 ? 2 : 1, cols = Math.ceil(n / rows), out = [];
    for (let i = 0; i < n; i++) {
      const row = i < cols ? 0 : 1, k = row ? i - cols : i;
      const w = span / (cols + (rows > 1 ? 0.5 : 0));
      out.push({ x: x0 + (k + 0.5 + row * 0.5) * w, y: rows > 1 ? r.y + r.h * (row ? 0.9 : 0.6) : r.y + r.h * 0.84 });
    }
    return out;
  }
  function placeParty(p, r, lift = 0) {
    const cs = crittersFor(p), spots = partySpots(cs.length, r);
    const urgent = p.patience / p.maxPatience < 0.3;
    cs.forEach((c, i) => {
      const q = s3.at(spots[i].x, spots[i].y, lift);
      c.setPosition(q.x, lift, q.z);
      if (c.sitting) c.sit(false);
      c.object.scale.setScalar(QK);
      c.face(lift ? 0 : 0.25);
      c.loop(lift ? null : urgent ? 'angry' : null);
    });
  }

  let lastSelected = null, lastNow = performance.now();
  function sync() {
    const now = performance.now(), wall = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
    const active = new Set();
    // the queue
    const dragging = held?.moved ? held.party : null;
    queue.forEach((p, i) => {
      active.add(p);
      if (p === dragging) {
        const r = L.slots[0];
        placeParty(p, { x: held.x - r.w / 2, y: held.y - r.h / 2, w: r.w, h: r.h }, 1.1);
      } else placeParty(p, L.slots[i]);
    });
    if (selected !== lastSelected) { selected?.cs?.forEach((c) => c.hop(0.5)); lastSelected = selected; }
    mats.forEach((m, i) => { m.material = toonMat({ color: queue[i] && queue[i] === selected ? '#ffe9a8' : '#fff7ec' }); });
    // the tables
    for (const t of tables) {
      const v = tableSets.get(t);
      if (!v) continue;
      v.group.position.x = v.base.x + (t.shake > 0 ? Math.sin(t.shake * 60) * 3 / SCALE : 0);
      const p = t.state === 'eating' ? t.party : null;
      if (p) {
        active.add(p);
        const pk = clamp(t.pop / 0.25, 0, 1);
        crittersFor(p).forEach((c, i) => {
          const s = t.seats[i], q = fl(s.x, s.y);
          c.setPosition(q.x + (v.group.position.x - v.base.x), 0, q.z);
          if (!c.sitting) { c.sit(true, 0.5); c.object.rotation.y = seatFace(t, s); c.loop(i % 3 === 1 ? 'talk' : 'eat'); }
          c.face(seatFace(t, s));
          c.object.scale.setScalar(CK * (0.6 + 0.4 * pk));
        });
      }
      // what's on the table
      const sig = t.state === 'eating' ? `${p.kind}:${t.food}:${p.size}` : t.state;
      if (sig !== v.sig) {
        v.sig = sig;
        v.food.clear();
        if (t.state === 'eating') {
          t.seats.slice(0, p.size).forEach((s, i) => {
            const at = { x: lerp(s.x, t.cx, 0.62), y: lerp(s.y, t.cy, 0.62) };
            const g2 = new THREE.Group();
            if (p.kind === 'quick') { const m = model('mug', { fill: '#8a5a3c' }); m.scale.setScalar(FOODK * 1.2); g2.add(m); }
            else { g2.add(model('plate')); if (p.kind === 'normal') { const d = model(t.food); d.position.y = 0.02; d.rotation.y = i * 1.7; g2.add(d); } g2.scale.setScalar(FOODK); }
            g2.position.copy(fl(at.x, at.y).sub(v.base)); g2.position.y = TOP;
            v.food.add(g2);
          });
          if (p.kind === 'feast') { const cake = model('host:cake'); cake.scale.setScalar(FOODK * 1.3); cake.position.y = TOP; v.food.add(cake); }
        } else if (t.state === 'reset') {
          for (const k of [-1, 1]) { const m = itemMesh('cleanPlate'); m.scale.setScalar(FOODK); m.position.set(k * 0.18, TOP, 0.05); v.food.add(m); }
        }
      }
      v.sponge.visible = t.state === 'reset';
      if (t.state === 'reset') v.sponge.position.x = Math.sin(t.t * 14) * t.tw * 0.25 / SCALE;
    }
    // anyone no longer waiting or eating heads for the door
    for (const p of [...known]) {
      if (active.has(p)) continue;
      known.delete(p);
      const angry = !p.seatedAt;
      const door = s3.at(L.portrait ? 0 : -20, L.portrait ? -40 : L.stand.y + 30, 0);
      (p.cs || []).forEach((c, i) => {
        c.sit(false); c.loop(null);
        if (angry) c.play('angry', 0.5);
        const away = c.position.clone().lerp(door, 0.25 + i * 0.03); away.y = 0;
        c.walkTo([away]);
        leavers.push({ c, t: 0, dur: 1.1, k: c.object.scale.x });
      });
      p.cs = null;
    }
    for (const l of leavers) {
      l.t += wall;
      const k = clamp((l.dur - l.t) / 0.35, 0, 1);
      l.c.object.scale.setScalar(l.k * Math.max(0.01, k));
    }
    for (const l of leavers) if (l.t >= l.dur) release(l.c);
    leavers = leavers.filter((l) => l.t < l.dur);
  }

  /* ── drawing: the overlay is cards, badges, timers and notes only ── */
  function drawCard(p, r, { ghost = false } = {}) {
    const urgent = p.patience / p.maxPatience < 0.3;
    const wob = urgent ? Math.sin(p.t * 18) * 1.2 : 0;
    const sel = selected === p;
    g.save();
    if (ghost) box(g, r.x, r.y, r.w, r.h, { fill: 'rgba(255,247,214,.35)', r: 14, shadow: 8 });
    rr(g, r.x + wob, r.y, r.w, r.h, 14);
    g.lineWidth = sel ? 4 : 3; g.strokeStyle = sel ? C.butterD : urgent ? C.berry : 'rgba(150,120,170,.55)'; g.stroke();
    // party-size badge, with what they've come for
    const br = Math.min(17, r.h * 0.3);
    const bx = r.x + wob + br + 7, by = r.y + r.h / 2 - 4;
    circle(g, bx, by, br, C.sea, C.seaD, 2);
    text(g, String(p.size), bx, by + 1, { size: br * 1.25, color: '#fff', weight: 800 });
    const ic = icon(s3.renderer, KINDS[p.kind].model, KINDS[p.kind].opts);
    circle(g, bx + br * 0.85, by + br * 0.85, 10, '#fff', C.line, 1.5);
    g.drawImage(ic, bx + br * 0.85 - 9, by + br * 0.85 - 9, 18, 18);
    // patience
    const k = clamp(p.patience / p.maxPatience, 0, 1);
    const px = r.x + wob + 8, pw = r.w - 16, py = r.y + r.h - 10;
    box(g, px, py, pw, 6, { fill: 'rgba(255,255,255,.85)', r: 3 });
    box(g, px, py, Math.max(6, pw * k), 6, { fill: k < 0.3 ? C.berry : k < 0.6 ? C.butter : C.leaf, r: 3 });
    g.restore();
  }

  function drawTableUI(t, hint) {
    // drop target glow
    if (hint) {
      g.save(); rr(g, t.cell.x, t.cell.y, t.cell.w, t.cell.h, 16);
      g.fillStyle = hint === 'ok' ? 'rgba(95,194,147,.2)' : 'rgba(120,90,60,.1)'; g.fill();
      if (hint === 'ok') { g.lineWidth = 3; g.setLineDash([8, 6]); g.strokeStyle = C.leaf; g.stroke(); g.setLineDash([]); }
      g.restore();
    }
    // seat-count tag (bottom left, clear of the host stand)
    const tx = t.cell.x + 8, ty = t.cell.y + t.cell.h - 22;
    box(g, tx, ty, 54, 18, { fill: 'rgba(255,250,240,.88)', r: 9 });
    text(g, `${t.cap} seats`, tx + 27, ty + 9.5, { size: 11, color: C.muted, weight: 800 });
    if (t.state === 'eating') {
      const k = clamp(t.t / t.dur, 0, 1), bw = Math.min(t.cell.w * 0.32, 70), bx = t.cell.x + t.cell.w - 10 - bw / 2, by = t.cell.y + 14;
      box(g, bx - bw / 2, by - 4, bw, 8, { fill: 'rgba(255,255,255,.85)', r: 4 });
      box(g, bx - bw / 2, by - 4, Math.max(8, bw * k), 8, { fill: C.lilac, r: 4 });
    } else if (t.state === 'reset') {
      text(g, 'Clearing…', t.cell.x + t.cell.w - 10, t.cell.y + 14, { size: 12, color: C.muted, weight: 700, align: 'right', stroke: '#fff' });
    }
  }

  function draw() {
    if (needBuild) { needBuild = false; build(); }
    sync();
    s3.render();

    s3.begin2d();
    const f = L.floor, s = L.stand;
    text(g, 'Host stand', s.x + 12, s.y + 15, { size: 14, color: C.ink, weight: 800, align: 'left', stroke: '#fff' });
    text(g, `${walkouts ? `${walkouts} walked out` : ''}`, s.x + s.w - 10, s.y + 15, { size: 12, color: C.berryD, weight: 800, align: 'right', stroke: '#fff' });
    L.slots.forEach((r, i) => { if (i >= queue.length) { rr(g, r.x, r.y, r.w, r.h, 14); g.setLineDash([6, 6]); g.strokeStyle = 'rgba(150,120,170,.55)'; g.lineWidth = 2; g.stroke(); g.setLineDash([]); } });
    const moving = held?.moved ? held.party : selected;
    for (const t of tables) drawTableUI(t, moving ? (t.state === 'free' && t.cap >= moving.size ? 'ok' : 'no') : null);
    queue.forEach((p, i) => { if (!(held?.moved && held.party === p)) drawCard(p, L.slots[i]); });
    if (held?.moved) {
      const r = L.slots[0];
      drawCard(held.party, { x: held.x - r.w / 2, y: held.y - r.h / 2, w: r.w, h: r.h }, { ghost: true });
    }
    pops.draw(g);
    if (ctx.elapsed() < 6) {
      const a = 1 - Math.max(0, ctx.elapsed() - 4) / 2;
      const hy = L.portrait ? f.y + f.h - 14 : f.y + f.h - 14;
      g.save(); g.globalAlpha = a;
      box(g, f.x + f.w / 2 - 170, hy - 13, 340, 26, { fill: 'rgba(255,250,240,.92)', r: 13 });
      g.restore();
      text(g, 'Drag a party onto a table with enough seats', f.x + f.w / 2, hy, { size: 14, color: C.muted, weight: 700, alpha: a });
    }
  }

  return {
    start() { spawn(); spawn(); spawnIn = 2; },
    update(dt) { if (!ctx.over) step(dt); pops.update(dt); },
    draw,
    end() { held = null; selected = null; },
    /** For automated play-tests. */
    peek() {
      return {
        view: { ...view },
        queue: queue.map((p) => { const r = slotOf(p); return { id: p.id, size: p.size, kind: p.kind, patience: p.patience, x: r.x + r.w / 2, y: r.y + r.h / 2 }; }),
        tables: tables.map((t) => ({ id: t.id, cap: t.cap, state: t.state, left: t.state === 'free' ? 0 : t.dur - t.t, x: t.cx, y: t.cy })),
        selected: selected?.id || null,
        stats: { walkouts, seatedGuests, servedGuests, wasted },
      };
    },
    destroy() { offPointer(); s3.destroy(); },
  };
}

/* ── models ──────────────────────────────────────────────────────────── */
defineModel('host:cake', (b) => {
  b.cyl(0.13, 0.11, 0.02, '#fbfaf5', { y: 0.01 });
  b.cyl(0.09, 0.09, 0.07, '#ffd1dc', { y: 0.055 });
  b.cyl(0.092, 0.092, 0.015, '#ffffff', { y: 0.09 });
  for (let i = 0; i < 6; i++) b.sphere(0.012, '#e63946', { x: Math.cos(i) * 0.07, y: 0.1, z: Math.sin(i) * 0.07 });
  b.cyl(0.006, 0.006, 0.05, '#7cc6f2', { y: 0.12 });
  b.sphere(0.01, '#ffd23f', { y: 0.15, sy: 1.5 });
});
defineModel('host:pasta', (b) => {
  for (let i = 0; i < 6; i++) b.torus(0.03, 0.009, '#f2c14e', { x: Math.cos(i * 1.1) * 0.03, y: 0.02 + i * 0.006, z: Math.sin(i * 1.1) * 0.03, rx: Math.PI / 2 + i * 0.3 });
  for (let i = 0; i < 3; i++) b.sphere(0.016, '#c0392b', { x: Math.cos(i * 2.1) * 0.025, y: 0.05, z: Math.sin(i * 2.1) * 0.025 });
});
defineModel('host:stew', (b) => {
  b.cyl(0.08, 0.05, 0.05, '#5a6b8c', { y: 0.025 });
  b.cyl(0.074, 0.074, 0.008, '#b5651d', { y: 0.048 });
  for (let i = 0; i < 4; i++) b.sphere(0.014, i % 2 ? '#f4a261' : '#81b29a', { x: Math.cos(i * 1.6) * 0.035, y: 0.054, z: Math.sin(i * 1.6) * 0.035 });
});
defineModel('host:dinner', (b) => {
  b.cyl(0.13, 0.1, 0.02, '#fbfaf5', { y: 0.01 });
  b.sphere(0.06, '#e07a5f', { y: 0.03, sy: 0.6 });
  b.sphere(0.035, '#81b29a', { x: 0.06, y: 0.035, sy: 0.6 });
});

/** A tiny seeded random for looks (outfits), so drawing never shifts the game's own dice. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
