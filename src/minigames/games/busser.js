/**
 * Busser — "Bus Run". A follow-camera run around a dining room that's bigger
 * than the screen. Diners finish and leave their dishes behind; walk into a
 * dirty table to scoop its dishes into your tub (up to three tables' worth —
 * a fuller tub is slower), then carry them back to the dish pit. Bumping into
 * a guest or a waiter while carrying smashes the lot: those tables stay
 * cleared but don't score. Score = tables' dishes delivered to the dish pit.
 *
 * Steering: hold anywhere and the busser walks toward your finger (or the
 * mouse); WASD / arrow keys on a keyboard. Drawn in the restaurant's 3D toon
 * style under a follow camera; arrows, the tub gauge and notes are the overlay.
 */
import { pointer, C, box, circle, text, lerp, clamp, inRect, dist, pick, Pops } from '../kit.js';
import { stage3d } from '../kit3d.js';
import { model, defineModel, icon, sign } from '../models.js';
import * as THREE from 'three';
import { toonMat } from '../../three/toon.js';
import * as P from '../../three/props.js';
import { itemMesh } from '../../three/items.js';
import { OUTFITS, casualOutfit } from '../../three/outfits.js';
import { rng } from '../../lexicon/names.js';

const WORLD = { w: 1000, h: 790 };
const COLS = 4, ROWS = 3, CELL_W = 220, CELL_H = 200, X0 = 60, Y0 = 150;
const WALL_Y = 98;                 // the kitchen wall along the top
const TABLE_R = 40, TABLE_HIT = 52;
const AISLE_X = [60, 280, 500, 720, 940];
const AISLE_Y = [150, 350, 550, 750];
const DOOR = { x: 500, y: WORLD.h + 20 };
const PASS = { x: 880, y: 150 };
const MAT = { x: 24, y: WALL_Y, w: 196, h: 56 };   // drop-off mat in front of the dish pit
const CAP = 3;                     // tables' worth of dishes in the tub
const SPEED = 215;                 // empty-handed walking speed
const SLOW = 0.1;                  // speed lost per table carried
const BR = 16, NR = 15;            // busser / other critter radius
const GUESTS = ['🐻', '🐼', '🐨', '🐰', '🦊', '🐱', '🐶', '🐸', '🐷', '🐮', '🐯', '🐵'];
const WAITERS = ['🐧', '🦉', '🐹'];
const FOODS = ['🍝', '🍲', '🥗', '🍛', '🍜', '🥘'];
const rand = (a, b) => a + Math.random() * (b - a);

/* 3D look */
const SCALE = 65;                  // view (world) units per metre
const WALL_VIS = 80;               // foot of the kitchen wall; the dish pit and pass stand between it and WALL_Y
const TABLE_K = 0.8;              // table size
const CHAIR_R = 0.76;              // chairs sit this far (m) from a table's centre
const CHAIR_COLORS = ['#e88d67', '#7cc6a4', '#f2c14e', '#9fb7ff'];
const SEAT_ORDER = [0, 2, 1, 3];   // a pair sits across the table
const DISH = 2.0;                  // dishes drawn larger than life
const CRITTER = 0.85;
const FOOD_MODEL = ['pizza', 'ramen', 'salad', 'taco', 'burger', 'toast'];
const SPECIES_OF = { '🐻': 'bear', '🐼': 'panda', '🐨': 'koala', '🐰': 'bunny', '🦊': 'fox', '🐱': 'cat', '🐶': 'dog', '🐸': 'frog', '🐷': 'pig', '🐮': 'sheep', '🐯': 'cat', '🐵': 'mouse', '🐧': 'penguin', '🦉': 'duck', '🐹': 'hamster' };
const W_ = '#fbfaf5';
defineModel('busser:mess', (b, o) => {
  const v = o.v || 0;
  b.cyl(0.13, 0.1, 0.02, W_, { x: -0.06, y: 0.01 }); b.sphere(0.05, '#c98d5a', { x: -0.07, y: 0.025, sy: 0.3 }); b.sphere(0.022, '#e07a5f', { x: -0.02, y: 0.03, z: 0.03, sy: 0.5 });
  b.cyl(0.11, 0.085, 0.018, '#eef6ff', { x: 0.1, y: 0.009, z: -0.06 }); b.sphere(0.03, '#8ac926', { x: 0.11, y: 0.022, z: -0.07, sy: 0.4 });
  b.cyl(0.035, 0.03, 0.11, '#cfe8ff', { x: 0.08, y: 0.035, z: 0.08, rz: 1.35, ry: v });
  b.flat(0.012, 0.006, 0.15, '#9aa7b1', { x: 0.0, y: 0.004, z: 0.12, ry: 0.6 + v });
  b.sphere(0.035, '#ffffff', { x: -0.14, y: 0.02, z: 0.1, sy: 0.6 });
  for (let i = 0; i < 4; i++) b.sphere(0.008, '#c98d5a', { x: -0.12 + i * 0.07, y: 0.006, z: -0.12 + (i % 2) * 0.03 });
});
defineModel('busser:dish', (b) => { b.cyl(0.13, 0.1, 0.02, W_, { y: 0.01 }); b.sphere(0.045, '#c98d5a', { x: 0.02, y: 0.022, sy: 0.25 }); });
defineModel('busser:tub', (b) => {
  const c = '#6c7a89';
  b.box(0.44, 0.03, 0.32, c, { y: 0.015 }, 0.01);
  for (const z of [-0.1475, 0.1475]) b.box(0.44, 0.16, 0.025, c, { y: 0.08, z }, 0.008);
  for (const x of [-0.2075, 0.2075]) b.box(0.025, 0.16, 0.32, c, { x, y: 0.08 }, 0.008);
});
defineModel('busser:shard', (b, o) => { b.cyl(0.05, 0.05, 0.008, o.color || W_, { y: 0.004 }, 3); });
defineModel('busser:sponge', (b) => { b.box(0.1, 0.05, 0.07, '#ffe066', { y: 0.025 }, 0.015); b.box(0.1, 0.02, 0.07, '#43aa8b', { y: 0.06 }, 0.008); b.sphere(0.022, '#cfe8ff', { x: -0.03, y: 0.085 }); b.sphere(0.016, '#e3f3ff', { x: 0.02, y: 0.09, z: 0.01 }); });

export default function create(ctx) {
  const s3 = stage3d(ctx.el, { scale: SCALE, quality: ctx.quality });
  const st = s3.ui, view = s3.view, g = s3.g;
  const pops = new Pops();
  const cam = { x: 0, y: 0 };
  const b = { x: 122, y: 150, vx: 0, vy: 0, load: [], stun: 0, inv: 0, face: 1, walk: 0 };
  let tables = [], npcs = [], shards = [];
  let hold = null;                 // { x, y, id } pointer in view units
  const keys = new Set();
  let fullNote = 0, bumps = 0, smashed = 0, delivered = 0, dirtied = 0, idle = 0, t = 0;

  /* ── the room ─────────────────────────────────────────────────────── */
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    tables.push({ i: tables.length, x: X0 + CELL_W * (c + 0.5), y: Y0 + CELL_H * (r + 0.5), state: 'clean', cool: 0, party: [], seated: 0, dine: 0, food: pick(FOODS), mess: 0 });
  }
  // A lived-in room at the whistle: a few dirty tables, some eating, the rest about to fill.
  {
    const order = [...tables].sort(() => Math.random() - 0.5);
    order.forEach((tb, k) => {
      if (k < 3) { tb.state = 'dirty'; tb.mess = Math.random(); }
      else if (k < 8) { tb.state = 'dining'; tb.party = Array.from({ length: 1 + (Math.random() < 0.6 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0) }, () => pick(GUESTS)); tb.seated = tb.party.length; tb.dine = rand(3, 16); }
      else tb.cool = rand(0.5, 4);
    });
    // never start with a dirty table right on top of you
    tables.filter((tb) => tb.state === 'dirty' && dist(tb, b) < 140).forEach((tb) => { tb.state = 'clean'; tb.cool = rand(1, 3); });
  }

  function layout() { snapCam(); }
  view.onResize = layout;

  /* ── routing: everyone walks the aisles ──────────────────────────── */
  const spotOf = (tb, side) => ({ x: tb.x, y: tb.y + side * (CELL_H / 2) });
  function route(p, q) {
    if (Math.abs(p.y - q.y) < 1) return [{ ...q }];
    let xv = AISLE_X[0], best = Infinity;
    for (const x of AISLE_X) { const d = Math.abs(p.x - x) + Math.abs(x - q.x); if (d < best) { best = d; xv = x; } }
    return [{ x: xv, y: p.y }, { x: xv, y: q.y }, { ...q }];
  }
  const fromDoor = (q) => [{ x: DOOR.x, y: AISLE_Y[3] }, ...route({ x: DOOR.x, y: AISLE_Y[3] }, q)];
  const toDoor = (p) => [...route(p, { x: DOOR.x, y: AISLE_Y[3] }), { ...DOOR }];
  const lane = (path, o) => path.map((pt) => ({ x: pt.x + o, y: pt.y + o * 0.8 }));

  function addGuest(ch, path, wait, onArrive) {
    const o = rand(-16, 16);
    npcs.push({ kind: 'guest', ch, x: path[0].x + o, y: path[0].y + o, path: lane(path, o), speed: rand(78, 98), wait, pause: 0, vx: 0, vy: 0, onArrive, step: Math.random() * 6, hidden: wait > 0 });
  }

  function seatParty(tb) {
    tb.state = 'reserved';
    tb.party = Array.from({ length: 1 + (Math.random() < 0.6 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0) }, () => pick(GUESTS));
    tb.seated = 0; tb.food = pick(FOODS);
    const side = Math.random() < 0.5 ? -1 : 1;
    const start = { x: DOOR.x, y: DOOR.y };
    tb.party.forEach((ch, k) => addGuest(ch, [start, ...fromDoor(spotOf(tb, side))], k * 0.8, () => {
      tb.seated++;
      if (tb.seated >= tb.party.length) { tb.state = 'dining'; tb.dine = rand(lerp(11, 6, prog()), lerp(16, 10, prog())); }
    }));
  }

  function leave(tb) {
    tb.state = 'dirty'; tb.mess = Math.random(); dirtied++;
    const side = Math.random() < 0.5 ? -1 : 1, s = spotOf(tb, side);
    tb.party.forEach((ch, k) => addGuest(ch, [{ x: tb.x + (k - 0.5) * 20, y: tb.y + side * 52 }, s, ...toDoor(s)], k * 0.5, null));
    tb.party = []; tb.seated = 0;
  }

  function addWaiter(k) {
    npcs.push({ kind: 'waiter', ch: WAITERS[k % WAITERS.length], x: PASS.x - 40 * k, y: PASS.y, path: [], speed: rand(118, 138), wait: rand(0.3, 2.5) + k, pause: 0, vx: 0, vy: 0, tray: true, home: true, step: Math.random() * 6 });
  }
  addWaiter(0); addWaiter(1);
  let waiters = 2;

  function waiterNext(n) {
    if (n.home) {
      const busy = tables.filter((tb) => tb.state === 'dining' || tb.state === 'reserved');
      const tb = busy.length ? pick(busy) : pick(tables);
      const s = spotOf(tb, Math.random() < 0.5 ? -1 : 1);
      const o = rand(-14, 14);
      n.path = lane(route({ x: n.x, y: PASS.y }, s), o);
      n.home = false; n.tray = true; n.at = tb;
    } else {
      n.path = lane(route({ x: Math.round(n.x / 10) * 10, y: nearestAisleY(n.y) }, PASS), rand(-12, 12));
      n.home = true; n.tray = false;
    }
  }
  const nearestAisleY = (y) => AISLE_Y.reduce((a, v) => (Math.abs(v - y) < Math.abs(a - y) ? v : a), AISLE_Y[0]);

  const prog = () => clamp(ctx.elapsed() / ctx.seconds, 0, 1);

  /* ── input ───────────────────────────────────────────────────────── */
  const offPointer = pointer(st, {
    down: (p) => { if (!ctx.over) hold = p; },
    move: (p) => { if (hold && hold.id === p.id) hold = p; },
    up: (p) => { if (hold && hold.id === p.id) hold = null; },
  });
  const KEYMAP = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
  const keyOf = (e) => KEYMAP[e.code] || KEYMAP[e.key] || ({ w: 'u', s: 'd', a: 'l', d: 'r', W: 'u', S: 'd', A: 'l', D: 'r' })[e.key];
  const onKey = (e) => { const k = keyOf(e); if (!k) return; e.preventDefault(); keys.add(k); };
  const onKeyUp = (e) => { const k = keyOf(e); if (k) keys.delete(k); };
  const onBlur = () => { keys.clear(); hold = null; };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  function wanted() {
    let dx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0), dy = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0);
    if (dx || dy) { const m = Math.hypot(dx, dy); return { x: dx / m, y: dy / m }; }
    if (hold) {
      const tx = cam.x + hold.x - b.x, ty = cam.y + hold.y - b.y, d = Math.hypot(tx, ty);
      if (d < 12) return { x: 0, y: 0 };
      const k = clamp((d - 12) / 50, 0, 1);
      return { x: (tx / d) * k, y: (ty / d) * k };
    }
    return { x: 0, y: 0 };
  }

  /* ── busser ──────────────────────────────────────────────────────── */
  const speed = () => SPEED * (1 - SLOW * b.load.length);

  function moveBusser(dt) {
    const w = b.stun > 0 ? { x: 0, y: 0 } : wanted();
    const s = speed(), k = clamp(dt * (b.stun > 0 ? 3 : 12), 0, 1);
    b.vx = lerp(b.vx, w.x * s, k); b.vy = lerp(b.vy, w.y * s, k);
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.abs(b.vx) > 8) b.face = b.vx > 0 ? 1 : -1;
    b.walk += Math.hypot(b.vx, b.vy) * dt;
    // tables are solid: slide round them
    for (const tb of tables) {
      const d = dist(b, tb), min = TABLE_HIT + BR;
      if (d < min && d > 0.001) { const nx = (b.x - tb.x) / d, ny = (b.y - tb.y) / d; b.x = tb.x + nx * min; b.y = tb.y + ny * min; const vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= vn * nx; b.vy -= vn * ny; } }
    }
    b.x = clamp(b.x, BR + 4, WORLD.w - BR - 4);
    b.y = clamp(b.y, WALL_Y + BR, WORLD.h - BR - 6);
  }

  function smash(n) {
    const lost = b.load.length;
    b.load = [];
    smashed += lost;
    ctx.sfx.smash(3 + lost * 2);
    for (let i = 0; i < 10 + lost * 6; i++) {
      const a = Math.random() * Math.PI * 2, v = rand(60, 230);
      shards.push({ x: b.x, y: b.y - 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 60, z: rand(10, 30), vz: rand(80, 200), rot: Math.random() * 6, vr: rand(-10, 10), t: 0, col: pick(['#ffffff', '#eaf3fb', '#cfe3f3', '#f4ead2']), s: rand(3, 7) });
    }
    wob = 1.3;
    pops.add(lost > 1 ? `Smash! ${lost} tables lost` : 'Smash!', b.x, b.y - 54, C.berryD, 20);
    pops.add(n.kind === 'waiter' ? 'Watch it!' : 'Eek!', n.x, n.y - 40, C.muted, 14);
  }

  function collide(n) {
    if (b.inv > 0) return;
    const d = dist(b, n);
    if (d >= BR + NR) return;
    const nx = d > 0.01 ? (b.x - n.x) / d : 1, ny = d > 0.01 ? (b.y - n.y) / d : 0;
    if (b.load.length) { smash(n); b.inv = 1.3; b.stun = 0.55; } else {
      bumps++;
      ctx.sfx.work('thud', { vol: 0.5 });
      pops.add(n.kind === 'waiter' ? 'Coming through!' : 'Pardon me!', n.x, n.y - 40, C.muted, 14);
      b.inv = 0.6; b.stun = 0.3;
      wob = 0.6;
    }
    b.vx = nx * 240; b.vy = ny * 240;
    n.pause = Math.max(n.pause, 0.6);
  }

  function pickups(dt) {
    if (fullNote > 0) fullNote -= dt;
    for (const tb of tables) {
      if (tb.state !== 'dirty' || dist(b, tb) > TABLE_HIT + BR + 16) continue;
      if (b.load.length >= CAP) {
        if (fullNote <= 0) { pops.add('Tub’s full — dish pit!', b.x, b.y - 54, C.berryD, 15); fullNote = 2; }
        continue;
      }
      b.load.push(tb.i);
      tb.state = 'clean'; tb.cool = rand(lerp(4, 2, prog()), lerp(7, 4, prog()));
      ctx.sfx.work('clank', { vol: 0.6 });
      ctx.sfx.pop();
      pops.add(b.load.length >= CAP ? 'Tub full!' : `Dishes ${b.load.length}/${CAP}`, tb.x, tb.y - 50, C.seaD, 16);
    }
    if (b.load.length && inRect(b, { x: MAT.x - 6, y: MAT.y - 10, w: MAT.w + 12, h: MAT.h + 16 })) {
      const n = b.load.length;
      b.load = [];
      delivered += n;
      ctx.add(n);
      hopReq = 0.8;
      ctx.sfx.good(Math.min(6, delivered));
      ctx.sfx.work('slosh', { dur: 0.4, vol: 0.5 });
      pops.add(`+${n} ${n > 1 ? 'tables' : 'table'}`, MAT.x + MAT.w / 2, MAT.y + 16, C.leafD, 20);
    }
  }

  /* ── the room ticking over ──────────────────────────────────────── */
  function stepRoom(dt) {
    t += dt;
    if (waiters < 3 && ctx.elapsed() > 25) addWaiter(waiters++);
    for (const tb of tables) {
      if (tb.state === 'clean') { tb.cool -= dt; if (tb.cool <= 0) seatParty(tb); }
      else if (tb.state === 'dining') { tb.dine -= dt; if (tb.dine <= 0) leave(tb); }
    }
    for (const n of npcs) {
      n.vx = 0; n.vy = 0;
      if (n.wait > 0) { n.wait -= dt; if (n.kind === 'guest') continue; }
      n.hidden = false;
      if (n.pause > 0) { n.pause -= dt; continue; }
      if (n.wait > 0) continue;
      if (!n.path.length) {
        if (n.kind === 'waiter') { if (n.home) n.wait = rand(0.8, 2.2); waiterNext(n); continue; }
        n.done = true; n.onArrive?.(); continue;
      }
      const q = n.path[0], dx = q.x - n.x, dy = q.y - n.y, d = Math.hypot(dx, dy), s = n.speed * dt;
      if (d <= s) { n.x = q.x; n.y = q.y; n.path.shift(); if (!n.path.length && n.kind === 'waiter' && !n.home) n.pause = 1.1; }
      else { n.x += (dx / d) * s; n.y += (dy / d) * s; n.vx = (dx / d) * n.speed; n.vy = (dy / d) * n.speed; }
      n.step += s;
    }
    npcs = npcs.filter((n) => !n.done);
  }

  function snapCam() { const c = camGoal(); cam.x = c.x; cam.y = c.y; }
  function camGoal() {
    const { W, H } = view;
    const cx = WORLD.w <= W ? (WORLD.w - W) / 2 : clamp(b.x + b.vx * 0.35 - W / 2, -20, WORLD.w - W + 20);
    const cy = WORLD.h + 10 <= H ? (WORLD.h - H) / 2 : clamp(b.y + b.vy * 0.35 - H / 2, -10, WORLD.h - H + 20);
    return { x: cx, y: cy };
  }
  snapCam();

  function step(dt) {
    stepRoom(dt);
    if (!b.load.length && !tables.some((tb) => tb.state === 'dirty')) idle += dt;
    if (b.stun > 0) b.stun -= dt;
    if (b.inv > 0) b.inv -= dt;
    moveBusser(dt);
    for (const n of npcs) if (!n.hidden) collide(n);
    pickups(dt);
    const c = camGoal(), k = clamp(dt * 6, 0, 1);
    cam.x = lerp(cam.x, c.x, k); cam.y = lerp(cam.y, c.y, k);
    for (const s of shards) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vz -= 600 * dt; s.z = Math.max(0, s.z + s.vz * dt); if (s.z === 0) { s.vx *= 0.8; s.vy *= 0.8; s.vr *= 0.8; } s.rot += s.vr * dt; }
    shards = shards.filter((s) => s.t < 3);
  }


  /* ── the 3D dining room ──────────────────────────────────────────── */
  // Everything lives in `room`, laid out in WORLD units as if the camera sat
  // at (0, 0); each frame the group shifts by the camera offset, so a thing at
  // world (x, y) appears at view (x − cam.x, y − cam.y), where the logic and
  // the overlay expect it.
  const room = new THREE.Group();
  s3.add(room);
  const S = SCALE, sinE = s3.sinE, cosE = s3.cosE;
  const wallAt = (x, h) => { const p = s3.at(x, WALL_VIS, 0); p.y = h; return p; };
  let built = false, me = null, tubGroup = null, tubDishes = [], matMesh = null;
  const tableViews = [];
  const npcViews = new Map();      // npc → { c, tray }
  const shardMeshes = new Map();
  let wob = 0, hopReq = 0;         // cosmetic: reactions requested by the logic

  function box3(w, h, d, color, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat({ color }));
    m.userData.ownGeometry = true; m.castShadow = shadow; m.receiveShadow = true;
    return m;
  }
  const depth = (units) => units / (S * sinE);
  function place(obj, x, y, h = 0, ry = 0) { obj.position.copy(s3.at(x, y, h)); obj.rotation.y = ry; room.add(obj); return obj; }

  function build() {
    built = true;
    room.clear();
    // floorboards, a rug under each row of tables, the kitchen wall along the top
    const floor = s3.floor('wood', { size: 0.55, a: '#ecd5b3', b: '#d9bd96' }); room.add(floor);
    for (const y of [250, 450, 650]) place(P.rug((WORLD.w - 72) / S, depth(148), '#f2b8b5'), WORLD.w / 2, y);
    const wall = s3.wall({ y: WALL_VIS, height: 4.5, a: '#efe1cc', b: '#dcc7ab', size: 0.4 }); room.add(wall);
    const rail = box3(WORLD.w / S + 1, 0.9, 0.06, '#b07a4a'); rail.position.copy(wallAt(WORLD.w / 2, 0.45)); rail.position.z += 0.03; room.add(rail);
    // side walls and a low front wall with the door gap
    const zTop = s3.at(0, WALL_VIS).z, zBot = s3.at(0, WORLD.h + 14).z;
    for (const x of [-12, WORLD.w + 12]) { const w = box3(0.25, 1.1, zBot - zTop, '#c9a27a'); w.position.set(x / S, 0.55, (zTop + zBot) / 2); room.add(w); }
    for (const [a, c] of [[-12, DOOR.x - 62], [DOOR.x + 62, WORLD.w + 12]]) {
      const w = box3((c - a) / S, 0.45, 0.25, '#c9a27a'); w.position.copy(s3.at((a + c) / 2, WORLD.h + 14, 0.225)); w.position.y = 0.225; room.add(w);
    }
    const doormat = box3(118 / S, 0.03, depth(26), '#5fc293', false); doormat.position.copy(s3.at(DOOR.x, WORLD.h + 2, 0.015)); room.add(doormat);
    // the dish pit: sink and bus cart against the wall, a rubber mat in front
    const sink = P.dishSink(); sink.scale.setScalar(0.8); place(sink, MAT.x + 62, WALL_VIS + depth(0) + 0.36 * S * sinE);
    const cart = P.busStation(); cart.scale.setScalar(0.95); place(cart, MAT.x + MAT.w - 36, WALL_VIS + 0.3 * S * sinE);
    matMesh = box3(MAT.w / S - 0.08, 0.04, depth(MAT.h) - 0.08, '#9ad7b6', false);
    matMesh.position.copy(s3.at(MAT.x + MAT.w / 2, MAT.y + MAT.h / 2, 0.02)); room.add(matMesh);
    const pit = sign('DISH PIT', { w: 1.5, h: 0.36, bg: '#4a5a4f', fg: '#ffffff' }); pit.position.copy(wallAt(MAT.x + MAT.w / 2 - 20, 1.55)); pit.position.z += 0.04; room.add(pit);
    // the pass: a steel counter under the heat lamps with plates waiting
    const passC = P.steelCounter(2.6, 0.55); place(passC, PASS.x, WALL_VIS + 0.3 * S * sinE);
    const lamps = P.passWindow(2.6); lamps.position.copy(passC.position); lamps.position.y = 0.45; lamps.position.z -= 0.05; room.add(lamps);
    for (const [i, k] of ['steak', 'plate', 'steak'].entries()) { const m = itemMesh(k); m.scale.setScalar(1.6); m.position.copy(passC.position); m.position.x += (i - 1) * 0.8; m.position.y = 0.93; room.add(m); }
    const passSign = sign('THE PASS', { w: 1.5, h: 0.36, bg: '#4a5a4f', fg: '#ffffff' }); passSign.position.copy(passC.position); passSign.position.y = 0.5; passSign.position.z += 0.3; room.add(passSign);
    // menu board and plants along the wall
    const mb = P.menuBoard(); mb.position.copy(wallAt(500, 1.4)); mb.position.z += 0.06; room.add(mb);
    for (const x of [330, 680]) { const p = P.plant(0.9); place(p, x, WALL_VIS + 18); }
    // the tables
    tableViews.length = 0;
    for (const tb of tables) {
      const v = { seats: [], party: null };
      const ring = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), new THREE.MeshBasicMaterial({ color: '#ff7a8a', transparent: true, opacity: 0.25, depthWrite: false }));
      ring.material.userData.outlineParameters = { visible: false };
      ring.userData.ownGeometry = true; ring.rotation.x = -Math.PI / 2; ring.scale.set(1, 1.15, 1);
      ring.position.copy(s3.at(tb.x, tb.y, 0.07)); ring.position.y = 0.1; room.add(ring); v.ring = ring;
      const t = P.table(true, tb.i % 2 ? '#fff5f5' : '#f1fbff'); t.scale.setScalar(TABLE_K); place(t, tb.x, tb.y);
      v.top = s3.at(tb.x, tb.y); v.top.y = 0.8 * TABLE_K;
      v.chairs = [];
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + k * Math.PI / 2, cx = v.top.x + Math.cos(a) * CHAIR_R, cz = v.top.z + Math.sin(a) * CHAIR_R;
        const face = Math.atan2(-Math.cos(a), -Math.sin(a));
        const ch = P.chair(CHAIR_COLORS[(tb.i + k) % 4]); ch.position.set(cx, 0, cz); ch.rotation.y = face; room.add(ch);
        v.chairs.push({ x: cx, z: cz, face });
      }
      // what's on the table: lunch, the mess they left, or a reserved card
      v.food = new THREE.Group();
      const plate = model('plate'), dish = model(FOOD_MODEL[tb.i % FOOD_MODEL.length]);
      dish.position.y = 0.02; v.food.add(plate, dish); v.food.scale.setScalar(DISH); v.food.position.copy(v.top); room.add(v.food);
      v.dirty = model('busser:mess', { v: tb.i % 3 }); v.dirty.scale.setScalar(DISH); v.dirty.position.copy(v.top); room.add(v.dirty);
      v.reserved = sign('Reserved', { w: 0.95, h: 0.28, bg: '#fff7e8', fg: '#8b7464', border: '#e3c9a8' });
      v.reserved.position.copy(v.top); v.reserved.position.y += 0.12; v.reserved.position.z += 0.1; v.reserved.rotation.x = -0.35; room.add(v.reserved);
      tableViews.push(v);
    }
    // the busser, in the uniform their role wears, carrying the tub
    me = s3.critter({ ...ctx.critter, scale: CRITTER });
    me.hold(null, 'R'); me.hold(null, 'L');
    me.loop('carry');
    room.add(me.object);
    tubGroup = new THREE.Group();
    const tub = model('busser:tub'); tubGroup.add(tub);
    tubDishes = [];
    for (let i = 0; i < CAP * 2; i++) {
      const d = model('busser:dish'); d.position.set((i % 2 ? 0.03 : -0.03), 0.04 + i * 0.03, (i % 3 - 1) * 0.02); d.rotation.y = i * 1.7; d.visible = false;
      tubGroup.add(d); tubDishes.push(d);
    }
    tubGroup.position.set(0, 0.6 * CRITTER, 0.36 * CRITTER);
    me.object.add(tubGroup);
    for (const [, v] of npcViews) s3.dropCritter(v.c);
    npcViews.clear(); shardMeshes.clear();
  }

  /** Walk a critter to its logic spot: real walk cycle, heading from its velocity. */
  function drive(c, x, y, vx, vy, moving) {
    const p = s3.at(x, y, 0), o = c.object.position;
    const moved = Math.hypot(p.x - o.x, p.z - o.z);
    if (moving && moved < 0.5) c.phase += moved * 7.5;
    c.walking = moving;
    o.set(p.x, 0, p.z);
    if (moving) c.face(Math.atan2(vx / S, vy / (S * sinE)));
  }

  function npcView(n) {
    let v = npcViews.get(n);
    if (v) return v;
    const seed = 'bus' + Math.round(n.speed * 1000) + n.ch;
    const outfit = n.kind === 'waiter' ? (n.ch === WAITERS[2] ? OUTFITS.busser : OUTFITS.server) : casualOutfit(rng(seed));
    const c = s3.critter({ species: SPECIES_OF[n.ch] || 'cat', outfit: { ...outfit, hold: null }, seed, scale: CRITTER * (n.kind === 'waiter' ? 1 : 0.95) });
    room.add(c.object);
    v = { c, tray: null };
    npcViews.set(n, v);
    return v;
  }

  function diner(ch, seed) {
    const c = s3.critter({ species: SPECIES_OF[ch] || 'cat', outfit: { ...casualOutfit(rng(seed)), hold: null }, seed, scale: CRITTER * 0.95 });
    room.add(c.object);
    return c;
  }

  function syncTables(t) {
    tables.forEach((tb, i) => {
      const v = tableViews[i], dirty = tb.state === 'dirty';
      v.ring.visible = dirty;
      if (dirty) v.ring.material.opacity = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(t * 5 + tb.i));
      v.dirty.visible = dirty;
      v.dirty.rotation.y = tb.mess * 6;
      v.food.visible = tb.state === 'dining';
      v.reserved.visible = tb.state === 'reserved';
      // the diners in their chairs
      if (v.party !== tb.party) { for (const c of v.seats) s3.dropCritter(c); v.seats = []; v.party = tb.party; }
      const want = tb.state === 'dining' || tb.state === 'reserved' ? Math.min(tb.seated, 4) : 0;
      while (v.seats.length < want) {
        const k = v.seats.length, ch = v.chairs[SEAT_ORDER[k]];
        const c = diner(tb.party[k], `diner${tb.i}-${k}-${tb.food}-${tb.party.length}`);
        c.setPosition(ch.x, 0, ch.z); c.object.rotation.y = ch.face; c.face(ch.face);
        c.sit(true, 0.5);
        v.seats.push(c);
      }
      while (v.seats.length > want) s3.dropCritter(v.seats.pop());
      v.seats.forEach((c, k) => c.loop(tb.state === 'dining' ? ((tb.i + k) % 2 ? 'eat' : 'talk') : 'talk'));
    });
  }

  function syncNpcs() {
    for (const n of npcs) {
      const v = npcView(n);
      v.c.object.visible = !n.hidden;
      if (n.hidden) { v.c.setPosition(...s3.at(n.x, n.y, 0).toArray()); continue; }
      drive(v.c, n.x, n.y, n.vx, n.vy, Math.hypot(n.vx, n.vy) > 1);
      if (n.kind === 'waiter') {
        const tray = n.tray ? 'plate' : null;
        if (v.tray !== tray) { v.c.hold(tray, 'R'); v.tray = tray; }
      }
    }
    for (const [n, v] of npcViews) if (!npcs.includes(n)) { s3.dropCritter(v.c); npcViews.delete(n); }
  }

  function syncMe(t) {
    const moving = Math.hypot(b.vx, b.vy) > 20;
    drive(me, b.x, b.y, b.vx, b.vy, moving);
    me.object.visible = !(b.inv > 0 && Math.floor(b.inv * 12) % 2 === 0);
    if (wob) { me.wobble(wob); wob = 0; }
    if (hopReq) { me.hop(hopReq); hopReq = 0; }
    // the tub, with a stack that sways more the fuller and faster you go
    const n = b.load.length, sway = n ? Math.sin(t * 9) * (0.04 + 0.05 * n) * clamp(Math.hypot(b.vx, b.vy) / SPEED, 0.2, 1) : 0;
    tubGroup.rotation.z = sway;
    tubDishes.forEach((d, i) => { d.visible = i < n * 2; });
  }

  function syncShards() {
    for (const s of shards) {
      let m = shardMeshes.get(s);
      if (!m) { m = model('busser:shard', { color: s.col }); m.rotation.set(Math.random() * 3, s.rot, Math.random() * 3); shardMeshes.set(s, m); room.add(m); }
      const p = s3.at(s.x, s.y, 0);
      m.position.set(p.x, 0.012 + s.z / (S * cosE), p.z);
      m.rotation.y = s.rot;
      if (s.z === 0) { m.rotation.x = 0; m.rotation.z = 0; }
      m.scale.setScalar((s.s / 2.2) * clamp(3 - s.t, 0, 1));
    }
    for (const [s, m] of shardMeshes) if (!shards.includes(s)) { m.removeFromParent(); shardMeshes.delete(s); }
  }

  /** Arrow badges at the screen edge for things you can't see. */
  function marker(p, img, color, big) {
    const { W, H } = view, m = big ? 34 : 28;
    const sx = p.x - cam.x, sy = p.y - cam.y;
    if (sx > 10 && sx < W - 10 && sy > 10 && sy < H - 10) return;
    const cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy;
    const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6));
    const x = cx + dx * k, y = cy + dy * k, a = Math.atan2(dy, dx);
    g.save(); g.translate(x, y); g.rotate(a);
    g.beginPath(); g.moveTo(m - 4, 0); g.lineTo(m - 16, -9); g.lineTo(m - 16, 9); g.closePath(); g.fillStyle = color; g.fill();
    g.restore();
    const r = big ? 21 : 17;
    circle(g, x, y, r, '#fff', color, 3);
    g.drawImage(img, x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
  }

  function draw() {
    if (!built) build();
    const { W, H } = view;
    const now = performance.now() / 1000;
    room.position.copy(s3.at(cam.x, cam.y, 0)).negate();
    syncTables(now);
    syncNpcs();
    syncMe(now);
    syncShards();
    const carrying = b.load.length > 0, pulse = 0.5 + 0.5 * Math.sin(t * 6);
    matMesh.material = toonMat({ color: carrying ? (pulse > 0.5 ? '#7fd3a6' : '#5fc293') : '#f3d58a' });
    s3.render();

    // 2D: labels in the room, notes, then the HUD
    s3.begin2d();
    g.save(); g.translate(-cam.x, -cam.y);
    text(g, carrying ? 'Drop off here' : 'Dish drop', MAT.x + MAT.w / 2, MAT.y + MAT.h / 2 + 2, { size: 13, color: carrying ? C.leafD : C.muted, weight: 800, stroke: '#fff' });
    text(g, 'FRONT DOOR', DOOR.x, WORLD.h + 2, { size: 11, color: '#fff', weight: 800, stroke: 'rgba(60,50,60,.55)' });
    pops.draw(g);
    g.restore();

    // where to go
    const full = b.load.length >= CAP;
    if (!full) {
      const dirty = tables.filter((tb) => tb.state === 'dirty').sort((p, q) => dist(p, b) - dist(q, b)).slice(0, 4);
      for (const tb of dirty) marker(tb, icon(s3.renderer, 'busser:mess', { v: 0 }), C.berry, false);
    }
    if (b.load.length) marker({ x: MAT.x + MAT.w / 2, y: MAT.y + MAT.h / 2 }, icon(s3.renderer, 'busser:sponge'), C.leafD, true);

    // the tub gauge
    const gw = 132;
    box(g, 10, H - 50, gw, 40, { fill: 'rgba(255,250,240,.92)', stroke: C.line, r: 14, lw: 2 });
    text(g, 'Tub', 32, H - 30, { size: 13, color: C.muted, weight: 800 });
    for (let i = 0; i < CAP; i++) {
      const x = 66 + i * 26, on = i < b.load.length;
      circle(g, x, H - 30, 11, on ? '#eaf3fb' : '#fff', on ? C.seaD : C.line, 2);
      if (on) g.drawImage(icon(s3.renderer, 'busser:dish'), x - 10, H - 40, 20, 20);
    }
    if (full) text(g, 'Full!', gw + 30, H - 30, { size: 14, color: C.berryD, weight: 800, stroke: '#fff' });

    const e = ctx.elapsed();
    if (e < 7) {
      const a = 1 - Math.max(0, e - 5) / 2;
      const msg1 = view.portrait ? 'Hold & drag to walk' : 'Hold the mouse to walk, or use WASD / arrows';
      const hy = H - 120;
      box(g, W / 2 - Math.min(W - 24, 380) / 2, hy, Math.min(W - 24, 380), 54, { fill: `rgba(74,52,40,${0.85 * a})`, r: 16 });
      text(g, msg1, W / 2, hy + 18, { size: 15, color: '#fff', weight: 700, alpha: a });
      text(g, 'Grab dishes from dirty tables → dish pit', W / 2, hy + 38, { size: 13, color: '#fff', weight: 600, alpha: a * 0.9 });
    }
    if (hold && !ctx.over) {
      circle(g, hold.x, hold.y, 18, 'rgba(255,255,255,.25)', 'rgba(255,255,255,.8)', 2);
    }
  }

  return {
    update(dt) { if (!ctx.over && dt > 0) step(dt); pops.update(dt); },
    draw,
    end() { hold = null; keys.clear(); },
    /** For automated play-tests (world units; screen = world − cam). */
    peek() {
      return {
        b: { x: b.x, y: b.y, vx: b.vx, vy: b.vy, load: b.load.length, stun: b.stun, inv: b.inv, r: BR }, cap: CAP, speed: speed(),
        tables: tables.map((tb) => ({ i: tb.i, x: tb.x, y: tb.y, state: tb.state, r: TABLE_HIT })),
        npcs: npcs.filter((n) => !n.hidden).map((n) => ({ x: n.x, y: n.y, vx: n.vx, vy: n.vy, r: NR, kind: n.kind })),
        mat: { ...MAT }, cam: { ...cam }, view: { ...view },
        aisles: { x: AISLE_X, y: AISLE_Y }, world: { ...WORLD }, stats: { bumps, smashed, delivered, dirtied, idle: Math.round(idle) },
      };
    },
    destroy() {
      offPointer();
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur);
      s3.destroy();
    },
  };
}
