/**
 * Bartender — "Slide Down the Bar". Patrons sit along a long bar, each
 * wanting a drink. Tap their drink and a ready-poured glass appears at the
 * pour spot (tap another to swap it), then flick it down the bar: the
 * flick's speed sets how far it slides before friction stops it. It has to
 * come to rest in front of someone who ordered that drink (they'll reach out
 * and catch one that's nearly stopped). Too hard and it sails off the end.
 * Score = drinks delivered.
 *
 * The bar runs left → right on wide screens and bottom → top on phones; all
 * the physics works in `s`, the distance down the bar from the pour spot.
 * Drawn in the restaurant's 3D toon style: the bar top is a tabletop at bar
 * height, patrons are critters on stools, the bartender stands by the taps.
 * Order bubbles, the drink buttons and notes are the 2D overlay.
 */
import { pointer, C, box, circle, text, rr, lerp, ease, clamp, inRect, pick, Pops } from '../kit.js';
import { stage3d } from '../kit3d.js';
import { model, defineModel, icon } from '../models.js';
import * as THREE from 'three';
import { toonMat } from '../../three/toon.js';
import { stool as stoolProp } from '../../three/props.js';
import { SPECIES } from '../../lexicon/names.js';
import { casualOutfit } from '../../three/outfits.js';

const DRINKS = [
  { key: 'beer', name: 'Beer', line: 0.8, color: '#f2b33d', head: '#fff8e6', glass: 'mug' },
  { key: 'wine', name: 'Wine', line: 0.5, color: '#a3264a', glass: 'wine' },
  { key: 'soda', name: 'Soda', line: 0.75, color: '#7a3b1e', head: '#d9b99b', glass: 'tall' },
  { key: 'cocktail', name: 'Cocktail', line: 0.62, color: '#ff8a5c', glass: 'coupe' },
];
const CRITTERS = ['🐻', '🐰', '🦊', '🐼', '🐨', '🐯', '🐸', '🐷', '🐮', '🐹', '🦝', '🐱', '🐶', '🦉'];
const DAMP = 1.35;       // friction: dv/dt = −(DAMP·v + DRAG)
const DRAG = 60;
const CATCH_V = 180;     // a patron grabs their drink when it's this slow…
const REACH = 40;        // …and this close (also the "stopped in front of" window)
const LAUNCH = 90;       // how far you can push the glass before it's away
const VMAX = 1700;

const SCALE = 150;       // view units per metre
const BAR_H = 0.85;      // bar top height (m)
const GLASS = 3;         // glasses are drawn larger than life
const BAR_HALF = 24;     // half the bar top's width across, in view units

/** How far a glass launched at v slides (for the bots and the aim guide). */
export function slideDistance(v) {
  let s = 0;
  const dt = 1 / 120;
  while (v > 0) { s += v * dt; v -= (DAMP * v + DRAG) * dt; }
  return s;
}

/* ── models ─────────────────────────────────────────────────────────────── */
/**
 * Each glass: the liquid's bottom `y0` and full height `h` (metres, before
 * GLASS scaling) and how the liquid grows: 'up' (stretch in height) or
 * 'cone' (grow from the tip, for the coupe).
 */
const GLASSES = {
  mug: { y0: 0.014, h: 0.11, r: 0.04, rb: 0.04, grow: 'up' },
  wine: { y0: 0.075, h: 0.08, r: 0.042, rb: 0.024, grow: 'up' },
  tall: { y0: 0.012, h: 0.16, r: 0.034, rb: 0.03, grow: 'up' },
  coupe: { y0: 0.085, h: 0.05, r: 0.06, rb: 0, grow: 'cone' },
};
const GLASS_TINT = '#d9eef8';
function glassShell(b, kind) {
  if (kind === 'mug') {
    b.cyl(0.046, 0.046, 0.13, GLASS_TINT, { y: 0.065 }, 18);
    b.torus(0.032, 0.01, GLASS_TINT, { x: 0.055, y: 0.065, rz: -Math.PI / 2 }, Math.PI);
  } else if (kind === 'wine') {
    b.cyl(0.032, 0.036, 0.006, GLASS_TINT, { y: 0.003 });
    b.cyl(0.006, 0.006, 0.07, GLASS_TINT, { y: 0.038 });
    b.cyl(0.046, 0.026, 0.09, GLASS_TINT, { y: 0.115 }, 18);
  } else if (kind === 'tall') {
    b.cyl(0.038, 0.034, 0.17, GLASS_TINT, { y: 0.085 }, 18);
  } else {
    b.cyl(0.032, 0.036, 0.006, GLASS_TINT, { y: 0.003 });
    b.cyl(0.006, 0.006, 0.085, GLASS_TINT, { y: 0.045 });
    b.cone(0.064, 0.055, GLASS_TINT, { y: 0.112, rx: Math.PI }, 18);
  }
}
const MODELS = {
  /** An empty glass shell (drawn see-through in the scene). */
  shell(b, o) { glassShell(b, o.kind); },
  /** A full glass, for the overlay pictures: the drink shows as the glass's lower part. */
  full(b, o) {
    const d = DRINKS.find((x) => x.key === o.drink), G = GLASSES[d.glass], lvl = Math.min(0.85, d.line + 0.1);
    const r = (f) => G.rb + (G.r - G.rb) * f, y1 = G.y0 + G.h * lvl, top = G.y0 + G.h;
    if (d.glass === 'wine' || d.glass === 'coupe') { b.cyl(0.032, 0.036, 0.006, GLASS_TINT, { y: 0.003 }); b.cyl(0.006, 0.006, G.y0, GLASS_TINT, { y: G.y0 / 2 }); }
    if (d.glass === 'mug') b.torus(0.032, 0.01, GLASS_TINT, { x: 0.055, y: 0.065, rz: -Math.PI / 2 }, Math.PI);
    if (d.glass === 'mug' || d.glass === 'tall') b.cyl(r(0) + 0.004, r(0) + 0.004, G.y0, GLASS_TINT, { y: G.y0 / 2 });
    if (G.grow === 'cone') b.cone(G.r * lvl, G.h * lvl, d.color, { y: G.y0 + (G.h * lvl) / 2, rx: Math.PI }, 18);
    else b.cyl(r(lvl), r(0), G.h * lvl, d.color, { y: G.y0 + (G.h * lvl) / 2 }, 18);
    if (d.head) b.cyl(r(lvl), r(lvl), 0.016, d.head, { y: y1 + 0.008 }, 18);
    b.cyl(G.r + 0.003, r(lvl) + 0.003, top - y1 - (d.head ? 0.016 : 0), GLASS_TINT, { y: (top + y1 + (d.head ? 0.016 : 0)) / 2 }, 18);
    if (d.key === 'cocktail') { b.sphere(0.018, '#ffb347', { x: 0.05, y: 0.14, sz: 0.4 }); b.flat(0.004, 0.06, 0.004, '#e85d75', { x: -0.02, y: 0.15, rz: 0.3 }); }
  },
  /** A tap tower: one handle per drink, coloured like the drink. */
  taps(b) {
    b.box(0.5, 0.06, 0.22, '#3b2f2f', { y: 0.03 }, 0.02);
    b.flat(0.44, 0.02, 0.16, '#5c6670', { y: 0.065, z: 0.02 });
    b.cyl(0.04, 0.05, 0.3, '#d4a017', { y: 0.2, z: -0.05 });
    b.box(0.46, 0.06, 0.07, '#d4a017', { y: 0.33, z: -0.03 }, 0.02);
    DRINKS.forEach((d, i) => {
      const x = -0.18 + i * 0.12;
      b.cyl(0.012, 0.012, 0.07, '#c9d3da', { x, y: 0.29, z: 0.04 });
      b.cyl(0.009, 0.006, 0.04, '#9aa7b1', { x, y: 0.25, z: 0.05 });
      b.box(0.04, 0.13, 0.04, d.color, { x, y: 0.43, z: -0.02 }, 0.012);
    });
  },
  /** Wall shelves of bottles behind the patrons. */
  shelves(b, o) {
    const cs = ['#4fbfa8', '#f2a65a', '#b18cf2', '#e85d75', '#ffd66b', '#5aa9e6', '#7cc6a4'];
    for (const [j, y] of [[0, 1.05], [1, 1.55]]) {
      b.box(o.w, 0.05, 0.26, '#9c6a3f', { y, z: 0.13 }, 0.01);
      for (let i = 0; i < Math.floor(o.w * 3.2); i++) {
        const x = -o.w / 2 + 0.18 + i * 0.31 + j * 0.12, c = cs[(i * 3 + j * 2) % cs.length], tall = (i + j) % 3 === 0;
        b.cyl(0.05, 0.055, tall ? 0.26 : 0.2, c, { x, y: y + (tall ? 0.155 : 0.125), z: 0.14 });
        b.cyl(0.018, 0.02, 0.07, c, { x, y: y + (tall ? 0.32 : 0.26), z: 0.14 });
        b.cyl(0.02, 0.02, 0.025, '#3b2f2f', { x, y: y + (tall ? 0.36 : 0.3), z: 0.14 });
      }
    }
  },
  /** A row of bottles for the back counter on phones. */
  bottles(b) {
    const cs = ['#4fbfa8', '#f2a65a', '#b18cf2', '#e85d75', '#ffd66b', '#5aa9e6'];
    for (let i = 0; i < 6; i++) {
      const z = -0.75 + i * 0.3;
      b.cyl(0.05, 0.06, 0.24, cs[i], { z, y: 0.12 });
      b.cyl(0.02, 0.02, 0.08, '#3b2f2f', { z, y: 0.28 });
    }
  },
  /** A rubber bar mat: where a glass should stop. */
  mat(b, o) { b.box(o.w, 0.012, o.d, '#4f7d64', { y: 0.006 }, 0.005); for (let i = -2; i <= 2; i++) b.flat(o.w > o.d ? 0.01 : o.w * 0.8, 0.014, o.w > o.d ? o.d * 0.8 : 0.01, '#3e6650', o.w > o.d ? { x: i * o.w * 0.18, y: 0.008 } : { z: i * o.d * 0.18, y: 0.008 }); },
};
for (const [k, fn] of Object.entries(MODELS)) defineModel('bartender:' + k, fn);
const pic = (renderer, drink) => icon(renderer, 'bartender:full', { drink: drink.key }, { yaw: -0.3, pitch: 0.35 });
/** Little deterministic randomness for looks (keeps Math.random for the game). */
function lookRng(seed) { let a = seed * 9301 + 49297; return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; }; }

export default function create(ctx) {
  const s3 = stage3d(ctx.el, { scale: SCALE, quality: ctx.quality });
  const st = s3.ui, view = s3.view, g = s3.g;
  let needBuild = true;      // the 3D set is (re)built on the next frame
  const pops = new Pops();
  const L = {};
  let taps = [];
  let seats = [];
  let glass = null;          // the glass at the pour spot: { drink, fill, state: 'empty'|'ready'|'held', s }
  let sliding = [];          // glasses on their way down the bar
  let held = null;           // { id, off, samples }
  let clock = 0, spawnT = 0, streak = 0, newGlassT = 0;
  let started = false;
  let pressedTap = -1;
  let shards = [];

  /* layout */
  function layout() {
    const { W, H } = view;
    L.vertical = view.portrait;
    if (!L.vertical) {
      L.barY = clamp(H * 0.6, 230, H - 150);
      L.start = { x: 96, y: L.barY };
      L.dir = { x: 1, y: 0 };
      L.len = W - 18 - L.start.x;
      const tw = 66, th = 56, gx = 14, gy = L.barY + 36;
      taps = DRINKS.map((d, i) => ({ i, x: gx + (i % 2) * (tw + 8), y: gy + Math.floor(i / 2) * (th + 8), w: tw, h: th }));
      if (taps[3].y + th > H - 6) taps.forEach((t, i) => { t.y = L.barY + 36; t.x = gx + i * (tw * 0.86 + 6); t.w = tw * 0.86; });
    } else {
      L.barX = W * 0.64;
      const tapsH = 74, ty = H - tapsH - 12;
      L.start = { x: L.barX, y: ty - 52 };
      L.dir = { x: 0, y: -1 };
      L.len = L.start.y - 26;
      const tw = (W - 24 - 3 * 10) / 4;
      taps = DRINKS.map((d, i) => ({ i, x: 12 + i * (tw + 10), y: ty, w: tw, h: tapsH }));
    }
    const first = L.vertical ? 150 : 170, last = L.len - 52;
    const n = clamp(Math.floor((last - first) / 120) + 1, 3, 6);
    const old = seats;
    seats = Array.from({ length: n }, (_, i) => ({ s: first + (last - first) * (n === 1 ? 0 : i / (n - 1)), who: old[i]?.who || null }));
    needBuild = true;
  }
  /** Point on the bar at distance s from the pour spot. */
  const at = (s) => ({ x: L.start.x + L.dir.x * s, y: L.start.y + L.dir.y * s });
  /** Distance down the bar of a pointer position. */
  const along = (p) => (p.x - L.start.x) * L.dir.x + (p.y - L.start.y) * L.dir.y;
  layout();
  view.onResize = layout;

  /* patrons */
  function spawnPatron() {
    const free = seats.filter((x) => !x.who);
    if (!free.length) return;
    const seat = pick(free);
    const used = new Set(seats.map((x) => x.who?.ch));
    const ch = pick(CRITTERS.filter((c) => !used.has(c)));
    const drink = DRINKS[Math.floor(Math.random() * (ctx.elapsed() < 8 ? 2 : DRINKS.length))];
    const patience = 17 + Math.random() * 6;
    seat.who = { ch, drink, left: patience, patience, state: 'wait', t: 0 };
  }
  const waiting = () => seats.filter((x) => x.who && x.who.state === 'wait');

  function freshGlass() { glass = { drink: null, fill: 0, state: 'empty', s: 0 }; }

  /* drinks come ready-poured: tapping one puts it at the pour spot (or swaps the one waiting there) */
  function startPour(i) {
    if (ctx.over || !started) return;
    pressedTap = i;
    if (!glass || (glass.state !== 'empty' && glass.state !== 'ready')) return;
    if (glass.state === 'ready' && glass.drink === DRINKS[i]) return;
    glass.drink = DRINKS[i]; glass.fill = DRINKS[i].line; glass.state = 'ready'; glass.s = 0; glass.back = false;
    bartender?.play('pour', 0.35);
    ctx.sfx.work('glass', { vol: 0.5 });
  }
  /* sliding */
  function sampleV() {
    const sm = held.samples;
    if (sm.length < 2) return 0;
    const now = sm[sm.length - 1];
    let old = sm[0];
    for (const x of sm) if (now.t - x.t <= 0.09) { old = x; break; }
    if (now.t - old.t < 1e-4) return 0;
    return (now.s - old.s) / (now.t - old.t);
  }
  function launch() {
    const v = clamp(sampleV(), 0, VMAX);
    const gl = glass;
    held = null;
    if (v < 120) { gl.state = 'ready'; gl.back = true; pops.add('Give it a flick!', at(0).x + (L.vertical ? -60 : 70), at(0).y - 60, C.muted, 14); return; }
    sliding.push({ drink: gl.drink, fill: gl.fill, s: gl.s, v, state: 'slide', t: 0 });
    ctx.sfx.work('whoosh', { dur: 0.4, vol: 0.5 });
    bartender?.play('throw', 0.5);
    glass = null; newGlassT = 0.35;
  }
  function settle(x) {
    // came to rest: is anyone here who wanted it?
    const seat = seats.reduce((b, st2) => (Math.abs(st2.s - x.s) < Math.abs((b?.s ?? 1e9) - x.s) ? st2 : b), null);
    const near = seat && Math.abs(seat.s - x.s) <= REACH ? seat : null;
    const p = at(x.s), nx = p.x + (L.vertical ? -96 : 0), ny = p.y - (L.vertical ? 0 : 120);
    if (near?.who?.state === 'wait' && near.who.drink === x.drink) { deliver(near, x); return; }
    x.state = 'stopped'; x.t = 0;
    streak = 0;
    if (near?.who?.state === 'wait') { ctx.sfx.complain(); pops.add('Not my order!', nx, ny, C.berryD, 16); }
    else {
      ctx.sfx.miss();
      const want = waiting().filter((w) => w.who.drink === x.drink).sort((a, b) => Math.abs(a.s - x.s) - Math.abs(b.s - x.s))[0];
      pops.add(want ? (want.s > x.s ? 'Too short!' : 'Too far!') : 'Nobody wanted that', nx, ny, C.berryD, 16);
    }
  }
  function deliver(seat, x) {
    x.state = 'caught'; x.t = 0; x.s = seat.s;
    seat.who.state = 'happy'; seat.who.t = 0;
    streak++;
    ctx.add(1);
    ctx.sfx.good(streak); ctx.sfx.serve();
    bartender?.hop(0.6);
    const p = at(seat.s);
    pops.add(streak >= 4 ? `${streak} in a row!` : 'Cheers! +1', p.x + (L.vertical ? -96 : 0), p.y - (L.vertical ? 30 : 130), C.leafD, 17);
  }

  /* input */
  const offPointer = pointer(st, {
    down: (p) => {
      if (ctx.over || !started) return;
      const t = taps.find((b) => inRect(p, b));
      if (t) { startPour(t.i); return; }
      if (glass && glass.state === 'ready') {
        const gp = at(glass.s);
        if (Math.hypot(p.x - gp.x, p.y - gp.y) < 60) {
          glass.state = 'held'; glass.back = false;
          held = { off: glass.s - along(p), samples: [{ t: clock, s: along(p) }], last: along(p) };
          ctx.sfx.pop();
        }
      }
    },
    move: (p) => { if (held) held.last = along(p); },
    up: (p) => {
      pressedTap = -1;
      if (held) { held.last = along(p); held.samples.push({ t: clock + 1e-3, s: held.last }); launch(); }
    },
  });

  /* update */
  function step(dt) {
    clock += dt;
    if (glass && glass.state === 'ready' && glass.s > 0) glass.s = Math.max(0, glass.s - dt * 400);
    if (!glass) { newGlassT -= dt; if (newGlassT <= 0) freshGlass(); }
    // held glass follows the finger until it's past the push zone
    if (held && glass) {
      held.samples.push({ t: clock, s: held.last });
      while (held.samples.length > 2 && clock - held.samples[0].t > 0.25) held.samples.shift();
      glass.s = clamp(held.last + held.off, 0, LAUNCH);
      if (held.last + held.off > LAUNCH) launch();
    }
    // slide
    for (const x of sliding) {
      x.t += dt;
      if (x.state !== 'slide') continue;
      x.s += x.v * dt;
      x.v -= (DAMP * x.v + DRAG) * dt;
      if (x.s > L.len) {
        x.state = 'off'; x.t = 0; streak = 0;
        ctx.sfx.smash(1);
        bartender?.wobble(1);
        const p = at(L.len);
        shards.push({ x: p.x, y: p.y, t: 0 });
        pops.add('Smash! Too hard', p.x + (L.vertical ? -80 : -60), p.y + (L.vertical ? 30 : -110), C.berryD, 16);
        continue;
      }
      // a patron who wants this reaches out for it as it slows past them
      if (x.v < CATCH_V) {
        const seat = seats.find((q) => q.who?.state === 'wait' && q.who.drink === x.drink && Math.abs(q.s - x.s) <= REACH);
        if (seat) { deliver(seat, x); continue; }
      }
      if (x.v <= 0) { x.v = 0; settle(x); }
    }
    sliding = sliding.filter((x) => !((x.state === 'stopped' && x.t > 1.1) || (x.state === 'caught' && x.t > 1.4) || (x.state === 'off')));
    for (const sh of shards) sh.t += dt;
    shards = shards.filter((sh) => sh.t < 1.2);
    // patrons
    for (const seat of seats) {
      const w = seat.who; if (!w) continue;
      w.t += dt;
      if (w.state === 'wait') {
        w.left -= dt;
        if (w.left <= 0) {
          w.state = 'angry'; w.t = 0; streak = 0; ctx.sfx.complain();
          const p = at(seat.s); pops.add('Left thirsty', p.x + (L.vertical ? -96 : 0), p.y - (L.vertical ? 30 : 130), C.berryD, 14);
        }
      } else if (w.t > 1.4) seat.who = null;
    }
    const want = Math.min(seats.length, ctx.elapsed() < 15 ? 3 : 4);
    spawnT -= dt;
    const live = seats.filter((x) => x.who).length;
    if (live < want && (spawnT <= 0 || waiting().length === 0)) { spawnPatron(); spawnT = 2.2; }
    pops.update(dt);
  }

  /* ── the 3D bar ─────────────────────────────────────────────────────── */
  const world = new THREE.Group();
  s3.add(world);
  let bartender = null, tower = null;
  let seatSpots = [];             // floor spot of each stool
  const seatLooks = new Map();    // seat index → { who, c, state }
  const glassMeshes = new Map();  // glass (or sliding glass) → { group, liquid, head, sig }
  const shardMeshes = new Map();  // shard → [meshes]
  const glassMat = toonMat({ transparent: true, opacity: 0.45, depthWrite: false });
  const shardGeo = new THREE.TetrahedronGeometry(0.05);
  const SPECIES_OF = { '🐻': 'bear', '🐰': 'bunny', '🦊': 'fox', '🐼': 'panda', '🐨': 'koala', '🐯': 'cat', '🐸': 'frog', '🐷': 'pig', '🐮': 'sheep', '🐹': 'hamster', '🦝': 'raccoon', '🐱': 'cat', '🐶': 'dog', '🦉': 'duck' };
  let patronN = 0;
  /** World depth (m) covering `u` units of screen height on a level surface. */
  const depth = (u) => u / (SCALE * s3.sinE);
  function box3(w, h, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat({ color }));
    m.userData.ownGeometry = true; m.castShadow = m.receiveShadow = true;
    return m;
  }
  function own(geo, mat) { const m = new THREE.Mesh(geo, mat); m.userData.ownGeometry = true; m.castShadow = m.receiveShadow = true; return m; }
  /** World point on the bar top at distance s down the bar. */
  function onBar(s, lift = 0) { const p = at(s); return s3.at(p.x, p.y, BAR_H + lift); }

  function build() {
    world.clear();
    glassMeshes.clear(); shardMeshes.clear();
    for (const v of seatLooks.values()) s3.dropCritter(v.c);
    seatLooks.clear();
    const { W } = view, V = L.vertical;
    world.add(s3.floor('wood', { size: 0.5 }));
    if (!V) {
      // the bar runs across the screen; its top is centred on the slide line
      const back = L.barY - BAR_HALF, front = L.barY + BAR_HALF, x1 = L.start.x + L.len + 10;
      const c = s3.at((x1 - 60) / 2, L.barY, BAR_H), d = depth(front - back), len = (x1 + 60) / SCALE;
      const body = box3(len, BAR_H, d, '#8a5a36'); body.position.set(c.x, BAR_H / 2, c.z); world.add(body);
      const top = box3(len + 0.04, 0.05, d + 0.06, '#c98e5a'); top.position.set(c.x, BAR_H - 0.02, c.z); world.add(top);
      const rail = box3(len, 0.04, 0.04, '#d4a017'); rail.position.set(c.x, 0.22, c.z + d / 2 + 0.06); world.add(rail);
      for (let x = 30; x < x1 - 40; x += 110) { const p = box3(80 / SCALE, BAR_H * 0.6, 0.02, '#7d5030'); p.position.set((x + 40) / SCALE, BAR_H * 0.5, c.z + d / 2 + 0.011); world.add(p); }
      const stop = box3(0.05, 0.14, d + 0.04, '#5c3b24'); stop.position.set(x1 / SCALE, BAR_H + 0.05, c.z); world.add(stop);
      // the patrons' side: stools behind the bar, a wall of bottle shelves
      seatSpots = seats.map((seat) => s3.under(at(seat.s).x, back - 24, BAR_H));
      const wallRow = back - 24 + BAR_H * s3.cosE * SCALE - 50;
      world.add(s3.wall({ y: wallRow, a: '#f3e0c6', b: '#e3c9a8' }));
      const shelf = model('bartender:shelves', { w: Math.ceil(W / SCALE + 1) });
      const foot = s3.at(W / 2, wallRow, 0); shelf.position.set(foot.x, 0, foot.z); world.add(shelf);
      // the taps, just behind the pour spot
      tower = model('bartender:taps');
      tower.position.copy(s3.at(L.start.x + 22, L.barY - 12, BAR_H));
      world.add(tower);
    } else {
      // the bar runs up the screen, a little wider on the bartender's side
      const x0 = L.barX - 34, x1 = L.barX + 62, far = 8, near = L.start.y + 30;
      const c = s3.at((x0 + x1) / 2, (far + near) / 2, BAR_H), d = depth(near - far), w = (x1 - x0) / SCALE;
      const body = box3(w, BAR_H, d, '#8a5a36'); body.position.set(c.x, BAR_H / 2, c.z); world.add(body);
      const top = box3(w + 0.06, 0.05, d + 0.04, '#c98e5a'); top.position.set(c.x, BAR_H - 0.02, c.z); world.add(top);
      const rail = box3(0.04, 0.04, d, '#d4a017'); rail.position.set(x0 / SCALE - 0.06, 0.22, c.z); world.add(rail);
      const stop = box3(w + 0.04, 0.14, 0.05, '#5c3b24'); stop.position.copy(s3.at((x0 + x1) / 2, far, BAR_H + 0.05)); world.add(stop);
      seatSpots = seats.map((seat) => s3.at(L.barX - 74, at(seat.s).y + 105, 0));
      // a back counter of bottles along the right edge
      const bx0 = L.barX + 62 + 82, bc = s3.at(bx0 + 50, (far + near) / 2, 0.9);
      const back = box3(100 / SCALE, 0.9, d, '#7d5030'); back.position.set(bc.x, 0.45, bc.z); world.add(back);
      for (let i = 0; i < 3; i++) {
        const b = model('bartender:bottles'); b.scale.setScalar(1.2);
        b.position.copy(s3.at(bx0 + 22, near - 120 - i * 220, 0.9)); b.position.y = 0.9; world.add(b);
      }
      tower = model('bartender:taps');
      tower.rotation.y = -Math.PI / 2;
      tower.position.copy(s3.at(L.barX + 42, L.start.y - 6, BAR_H));
      world.add(tower);
    }
    // stools and the mats on the bar top where each patron catches their drink
    seats.forEach((seat, i) => {
      const st2 = stoolProp(['#e8505b', '#ffd66b', '#4fbfa8', '#b18cf2'][i % 4]); st2.userData.ownGeometry = true;
      st2.position.copy(seatSpots[i]); world.add(st2);
      const m = model('bartender:mat', V ? { w: 0.2, d: +depth(REACH * 2).toFixed(3) } : { w: +((REACH * 2) / SCALE).toFixed(3), d: 0.2 });
      m.position.copy(onBar(seat.s, 0.001)); world.add(m);
    });
    // the pour from a tap into the glass
    // the bartender, behind the taps
    if (bartender) s3.dropCritter(bartender);
    bartender = s3.critter({ ...ctx.critter, scale: V ? 1 : 0.92 });
    const spot = V ? s3.under(L.barX + 62 + 40, L.start.y - 90, BAR_H) : s3.under(46, L.barY - BAR_HALF - 30, BAR_H);
    bartender.setPosition(spot.x, 0, spot.z);
    const face = V ? -1.1 : 0.35;
    bartender.object.rotation.y = face; bartender.face(face);
  }

  /** A patron critter on their stool. */
  function makePatron(i, seat) {
    const rng = lookRng(++patronN + i * 7);
    const c = s3.critter({ species: SPECIES_OF[seat.who.ch] || SPECIES[patronN % SPECIES.length], outfit: casualOutfit(rng), seed: 'patron' + patronN, scale: 0.9 });
    c.setPosition(seatSpots[i].x, 0, seatSpots[i].z);
    c.sit(true, 0.78);
    const face = L.vertical ? 0.85 : 0;
    c.object.rotation.y = face; c.face(face);
    const v = { who: seat.who, c, state: 'wait' };
    seatLooks.set(i, v);
    return v;
  }
  function syncPatrons() {
    seats.forEach((seat, i) => {
      let v = seatLooks.get(i);
      if (v && v.who !== seat.who) { s3.dropCritter(v.c); seatLooks.delete(i); v = null; }
      if (!v && seat.who) v = makePatron(i, seat);
      if (!v || v.state === seat.who.state) return;
      v.state = seat.who.state;
      if (v.state === 'happy') { v.c.hop(1); v.c.play('cheer', 1.2); v.c.setMood('happy'); }
      if (v.state === 'angry') { v.c.wobble(1); v.c.play('angry', 1.4); }
    });
  }

  /** A glass mesh: a see-through shell with the drink inside. */
  function glassLook(obj, drink) {
    const kind = drink?.glass || 'mug', sig = kind + (drink?.key || '');
    let v = glassMeshes.get(obj);
    if (v && v.sig === sig) return v;
    if (v) dropGlass(v);
    const G = GLASSES[kind], group = new THREE.Group();
    const shell = model('bartender:shell', { kind }); shell.material = glassMat; shell.castShadow = false;
    let liquid = null, head = null;
    if (drink) {
      const geo = G.grow === 'cone' ? new THREE.ConeGeometry(G.r * 0.92, G.h, 16) : new THREE.CylinderGeometry(G.r * 0.9, G.rb * 0.9, 1, 16);
      if (G.grow === 'cone') { geo.rotateX(Math.PI); geo.translate(0, G.h / 2, 0); } else geo.translate(0, 0.5, 0);
      liquid = own(geo, toonMat({ color: drink.color })); liquid.position.y = G.y0; liquid.castShadow = false;
      group.add(liquid);
      if (drink.head) { head = own(new THREE.CylinderGeometry(G.r * 0.92, G.r * 0.92, 0.012, 16), toonMat({ color: drink.head })); group.add(head); }
    }
    group.add(shell);
    group.scale.setScalar(GLASS);
    world.add(group);
    v = { group, liquid, head, sig, G };
    glassMeshes.set(obj, v);
    return v;
  }
  function dropGlass(v) { v.group.removeFromParent(); v.group.traverse((o) => { if (o.userData.ownGeometry) o.geometry.dispose(); }); }
  /** Fill the glass to `fill` (0..1 of the liquid's height); returns the surface's local height. */
  function setFill(v, fill) {
    const f = clamp(fill, 0, 1), G = v.G;
    if (!v.liquid) return G.y0;
    v.liquid.visible = f > 0.005;
    if (G.grow === 'cone') v.liquid.scale.setScalar(Math.max(0.001, f));
    else v.liquid.scale.set(1, Math.max(0.001, G.h * f), 1);
    const y = G.y0 + G.h * f;
    if (v.head) { v.head.visible = f > 0.05; v.head.position.y = y; const r = G.grow === 'cone' ? f : (G.rb + (G.r - G.rb) * f) / G.r; v.head.scale.set(r, 1, r); }
    return y;
  }

  function draw() {
    if (needBuild) { needBuild = false; build(); }
    const V = L.vertical;
    syncPatrons();
    // the glass at the pour spot
    const live = new Set();
    if (glass) {
      live.add(glass);
      const v = glassLook(glass, glass.drink);
      v.group.position.copy(onBar(glass.s));
      v.group.scale.setScalar(GLASS * 1.1);
      v.group.rotation.set(0, 0, 0);
      setFill(v, glass.fill);
    }
    // glasses on their way down the bar
    for (const x of sliding) {
      live.add(x);
      const v = glassLook(x, x.drink);
      setFill(v, x.fill);
      const p = onBar(x.s);
      let k = 1;
      if (x.state === 'caught') {
        // the patron reaches out and lifts it
        const e = ease(x.t / 0.3);
        if (V) p.x -= (30 * e) / SCALE; else p.z -= depth(30 * e);
        p.y += 0.25 * e;
        k = 1 - clamp((x.t - 0.6) / 0.6, 0, 1);
      } else if (x.state === 'stopped') k = 1 - clamp((x.t - 0.6) / 0.5, 0, 1);
      v.group.position.copy(p);
      v.group.scale.setScalar(GLASS * Math.max(0.001, k));
      v.group.rotation.y = x.state === 'slide' ? x.s * 0.01 : v.group.rotation.y;
    }
    for (const [obj, v] of glassMeshes) if (!live.has(obj)) { dropGlass(v); glassMeshes.delete(obj); }
    // smashed glass: shards burst off the end of the bar and fall to the floor
    for (const sh of shards) {
      let list = shardMeshes.get(sh);
      if (!list) {
        list = [];
        for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(shardGeo, toonMat({ color: i % 3 ? '#d9eef8' : '#ffffff' })); m.castShadow = true; world.add(m); list.push(m); }
        shardMeshes.set(sh, list);
      }
      const o = s3.at(sh.x, sh.y, BAR_H + 0.1);
      list.forEach((m, i) => {
        const a = i * 0.7 + 0.3, t = sh.t, sp = 0.9 + (i % 3) * 0.35;
        const vx = (V ? Math.cos(a) * 1.1 : -0.25 + Math.cos(a) * 0.55) * sp, vz = (0.35 + Math.abs(Math.sin(a)) * 0.7) * sp;
        m.position.set(o.x + vx * t, Math.max(0.03, o.y + (1.6 + (i % 4) * 0.3) * t - 4.9 * t * t), o.z + vz * t);
        m.rotation.set(t * 9 + i, t * 7, i);
        m.scale.setScalar(1 - clamp((t - 0.9) / 0.3, 0, 1));
      });
    }
    for (const [sh, list] of shardMeshes) if (!shards.includes(sh)) { list.forEach((m) => m.removeFromParent()); shardMeshes.delete(sh); }
    s3.render();

    // 2D overlay: order bubbles, flick zone, taps, the fill line, notes
    const { W } = view;
    s3.begin2d();
    seats.forEach((seat, i) => { if (seat.who) drawBubble(seat, i); });
    // flick zone
    const z0 = at(0), z1 = at(LAUNCH);
    g.save(); g.globalAlpha = glass?.state === 'ready' || glass?.state === 'held' ? 0.65 : 0.25;
    g.strokeStyle = C.butterD; g.lineWidth = 3; g.setLineDash([8, 6]);
    g.beginPath();
    if (V) rr(g, z1.x - 28, z1.y - 30, 56, z0.y - z1.y + 40, 12); else rr(g, z0.x - 24, z0.y - 54, z1.x - z0.x + 50, 64, 12);
    g.stroke(); g.setLineDash([]); g.restore();
    // taps
    taps.forEach((t, i) => {
      const d = DRINKS[i], down = pressedTap === i;
      const on = glass && (glass.state === 'empty' || glass.state === 'ready');
      const picked = glass?.state === 'ready' && glass.drink === d;
      g.save(); if (!on) g.globalAlpha = 0.6;
      box(g, t.x, t.y + (down ? 3 : 0), t.w, t.h, { fill: down || picked ? C.paper2 : '#fff', stroke: down || picked ? C.butterD : C.line, r: 14, shadow: down ? 0 : 4 });
      box(g, t.x + 6, t.y + 5 + (down ? 3 : 0), 6, t.h - 10, { fill: d.color, r: 3 });
      const is = Math.min(40, t.h * 0.66);
      g.drawImage(pic(s3.renderer, d), t.x + t.w / 2 - is / 2 + 3, t.y + t.h * 0.42 - is / 2 + (down ? 3 : 0), is, is);
      text(g, d.name, t.x + t.w / 2 + 3, t.y + t.h - 10 + (down ? 3 : 0), { size: 11, color: C.muted, weight: 700 });
      g.restore();
    });
    if (glass) {
      const p = at(glass.s);
      if (glass.state === 'empty' && started) text(g, 'Pick a drink', p.x + (V ? -80 : 50), p.y - (V ? 20 : 70), { size: 13, color: C.ink, weight: 700, stroke: '#fff' });
      if (glass.state === 'ready') text(g, V ? 'Flick ↑' : 'Flick →', p.x + (V ? -66 : 40), p.y - (V ? 20 : 66), { size: 15, color: C.leafD, weight: 800, stroke: '#fff' });
    }
    pops.draw(g);
    const el = ctx.elapsed();
    if (started && el < 8) {
      const msg = glass?.state === 'ready' || sliding.length ? 'Flick the glass so it stops at the patron' : 'Tap the drink a patron ordered';
      text(g, msg, V ? W * 0.36 : W / 2, V ? L.start.y + 20 : 24, { size: V ? 12 : 15, color: C.ink, weight: 700, alpha: 1 - Math.max(0, el - 6) / 2, stroke: '#fff' });
    }
  }

  /** Order bubble with a patience ring, next to the patron's head. */
  function drawBubble(seat, i) {
    const w = seat.who;
    if (w.state !== 'wait') return;
    const V = L.vertical, spot = seatSpots[i];
    const head = s3.toView(new THREE.Vector3(spot.x, V ? 1.45 : 2.0, spot.z));
    const bx = V ? head.x - 60 : head.x, by = V ? head.y : head.y - 26;
    g.save(); g.globalAlpha = ease(w.t / 0.3);
    circle(g, bx, by, 22, '#fff', C.line, 2.5);
    const k = clamp(w.left / w.patience, 0, 1);
    g.beginPath(); g.arc(bx, by, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    g.strokeStyle = k > 0.5 ? C.leaf : k > 0.25 ? C.butterD : C.berry; g.lineWidth = 4; g.stroke();
    g.drawImage(pic(s3.renderer, w.drink), bx - 17, by - 18, 34, 34);
    g.beginPath();
    if (V) { g.moveTo(bx + 20, by - 6); g.lineTo(bx + 30, by); g.lineTo(bx + 20, by + 6); }
    else { g.moveTo(bx - 6, by + 20); g.lineTo(bx, by + 30); g.lineTo(bx + 6, by + 20); }
    g.fillStyle = '#fff'; g.fill();
    g.restore();
  }

  return {
    start() { started = true; spawnPatron(); spawnPatron(); spawnT = 2; freshGlass(); },
    update(dt) { if (!ctx.over && started) step(dt); else pops.update(dt); },
    draw,
    /** For automated play-tests: s → view point via start + dir·s. */
    peek() {
      return {
        view: { ...view }, start: { ...L.start }, dir: { ...L.dir }, len: L.len, launch: LAUNCH, reach: REACH,
        taps: taps.map((t) => ({ ...t, key: DRINKS[t.i].key })),
        glass: glass ? { state: glass.state, fill: glass.fill, s: glass.s, drink: glass.drink?.key } : null,
        sliding: sliding.map((x) => ({ s: x.s, v: x.v, state: x.state })),
        patrons: seats.filter((x) => x.who?.state === 'wait').map((x) => ({ s: x.s, drink: x.who.drink.key, left: x.who.left })),
      };
    },
    slideDistance,
    destroy() { offPointer(); s3.destroy(); },
  };
}
