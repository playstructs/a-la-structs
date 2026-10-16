/**
 * Fry Cook — "Basket Toss". Your critter holds a raw piece (chicken, onion
 * ring, mozzarella stick, shrimp): tap the wet batter, then the flour, and it
 * comes back battered. Pull back and let go to lob it into the wire basket
 * drifting through the oil — rims and the splash guard bounce, a clean swish
 * is a bonus, anything that misses is dropped. When the basket's golden, grab
 * it and shake it to drain; it tips onto the pass and golden pieces score.
 *
 * Score: +1 per golden piece plated, +1 per swish, −1 per dropped piece.
 * Side-on 3D in the restaurant's style; aim, meters and notes are the overlay.
 */
import { pointer, C, box, circle, text, lerp, ease, clamp, inRect, dist, pick, Pops } from '../kit.js';
import { stage3d } from '../kit3d.js';
import { model, icon } from '../models.js';
import * as THREE from 'three';
import { toonMat } from '../../three/toon.js';

const KINDS = [
  { kind: 'drumstick', name: 'chicken' }, { kind: 'onionRing', name: 'onion ring' },
  { kind: 'mozzStick', name: 'mozzarella stick' }, { kind: 'shrimp', name: 'shrimp' },
];
const SCALE = 150;            // view units per metre
const FOOD = 2.6;             // pieces are drawn larger than life
const R = 15;                 // piece radius (view units)
const GRAVITY = 1100;         // view units / s²
const PULL = 6.2;             // launch speed per unit of pull
const MAX_SPEED = 1080;
const DIP = 0.32;             // seconds for a dunk
const GOLDEN = [4.5, 8.5];    // seconds in the oil for golden
const BURNT = 11;
const HOLDS = 4;              // pieces per basket
const DRAIN = 520;            // view units of side-to-side shaking to drain

export default function create(ctx) {
  const s3 = stage3d(ctx.el, { scale: SCALE, quality: ctx.quality });
  const st = s3.ui, view = s3.view, g = s3.g;
  const pops = new Pops();
  const world = new THREE.Group();
  s3.add(world);

  const L = {};
  let needBuild = true;
  let t = 0;                                  // seconds since the whistle
  let hand = null;                            // { kind, coat: raw|wet|coated, dip: null|{ to, t }, pop }
  const queue = [pick(KINDS), pick(KINDS)];
  let flying = [];                            // { kind, x, y, vx, vy, touched, spin, rot }
  let dropped = [];                           // { kind, x, t }
  let served = [];                            // { kind, cook, t, from, slot }
  let aim = null;                             // pointer while pulling back
  let nextIn = 0;
  const basket = { x: 0, phase: 0, lifted: false, lx: 0, ly: 0, drain: 0, pieces: [], splash: 0, dump: 0 };

  /* ── layout (view units) ────────────────────────────────────────────── */
  function layout() {
    const { W, H } = view;
    const P = view.portrait;
    L.counterY = H * (P ? 0.8 : 0.72);
    L.floorY = H - 4;
    const bw = P ? 84 : 92;
    L.wet = { x: 18, y: L.counterY - 44, w: bw, h: 44 };
    L.dry = { x: 18 + bw + 12, y: L.counterY - 44, w: bw, h: 44 };
    // wide screens: the cook stands in the open between the flour and the fryer; phones: above the bowls
    L.hand = P ? { x: L.wet.x + bw + 6, y: L.counterY - 190 } : { x: L.dry.x + bw + 70, y: L.counterY - 140 };
    const fx = Math.max(L.dry.x + bw + (P ? 22 : 150), W * (P ? 0.55 : 0.5));
    const room = W - fx - (P ? 18 : 140);
    L.fryer = { x: fx, w: Math.min(P ? 999 : 300, Math.max(150, room)), oilY: L.counterY - 22 };
    L.fryer.r = L.fryer.x + L.fryer.w;
    L.guard = { x: L.fryer.r + 4, top: L.fryer.oilY - 130 };
    L.bw = Math.min(104, L.fryer.w * 0.55); L.bh = 40;
    L.rimY = L.fryer.oilY - 16;
    // the pass: on the counter right of the fryer if there's room, else on a shelf above it
    if (W - L.guard.x > 120) L.plate = { x: L.guard.x + 26, y: L.counterY - 10, w: Math.min(110, W - L.guard.x - 40), shelf: false };
    else L.plate = { x: L.fryer.x + L.fryer.w * 0.25, y: L.guard.top - 70, w: L.fryer.w * 0.5, shelf: true };
    L.hintY = Math.max(36, L.hand.y - 110);
    needBuild = true;
  }
  layout();
  view.onResize = layout;

  /* ── the basket's drift through the oil ─────────────────────────────── */
  const driftSpan = () => ((L.fryer.w - L.bw) / 2 - 6) * lerp(0.25, 1, clamp(t / ctx.seconds, 0, 1));
  function basketHome() { return L.fryer.x + L.fryer.w / 2 + Math.sin(basket.phase) * driftSpan(); }
  /** Where the basket's opening is right now. */
  function rim() {
    if (basket.lifted) return { x: basket.lx, y: basket.ly - L.bh / 2 };
    return { x: basket.x, y: L.rimY - (basket.dump > 0 ? 60 * Math.sin(Math.PI * basket.dump) : 0) };
  }

  /* ── prep: dunk, dredge ─────────────────────────────────────────────── */
  function newPiece() { const k = queue.shift(); queue.push(pick(KINDS)); hand = { ...k, coat: 'raw', dip: null, pop: 0 }; }
  function dunk(where) {
    if (ctx.over || !hand || hand.dip) return;
    if (where === 'dry' && hand.coat === 'raw') { pops.add('Wet batter first!', L.dry.x + L.dry.w / 2, L.dry.y - 40, C.berryD, 15); ctx.sfx.miss(); return; }
    if (where === 'wet' && hand.coat !== 'raw') { pops.add(hand.coat === 'wet' ? 'Now the flour' : 'Ready — toss it!', L.wet.x + L.wet.w / 2, L.wet.y - 40, C.muted, 15); return; }
    if (where === 'dry' && hand.coat === 'coated') return;
    hand.dip = { to: where, t: 0 };
    cook?.play('fry', DIP);
    ctx.sfx.work(where === 'wet' ? 'slosh' : 'wipe', { dur: 0.3, vol: 0.6 });
  }

  /* ── toss ───────────────────────────────────────────────────────────── */
  const ready = () => !!hand && hand.coat === 'coated' && !hand.dip;
  function launchVelocity(p) {
    let vx = (L.hand.x - p.x) * PULL, vy = (L.hand.y - p.y) * PULL;
    const s = Math.hypot(vx, vy);
    if (s > MAX_SPEED) { vx *= MAX_SPEED / s; vy *= MAX_SPEED / s; }
    return { vx, vy };
  }
  function toss(v) {
    flying.push({ kind: hand.kind, x: L.hand.x, y: L.hand.y, vx: v.vx, vy: v.vy, touched: false, spin: (Math.random() - 0.5) * 14, rot: 0 });
    hand = null;
    nextIn = 0.28;
    cook?.hop(0.4);
    ctx.sfx.work('whoosh', { dur: 0.4, vol: 0.5 });
  }

  function dropPiece(f, why) {
    dropped.push({ kind: f.kind, x: clamp(f.x, 12, view.W - 12), t: 0 });
    ctx.add(-1);
    ctx.sfx.miss();
    cook?.wobble(0.8);
    pops.add(`${why} −1`, clamp(f.x, 80, view.W - 80), Math.min(f.y, L.counterY) - 34, C.berryD, 16);
  }

  /** One flight step: gravity, the basket (rims, sides, opening), the guard, oil, counter, floor. */
  function fly(f, dt) {
    const py = f.y;
    f.vy += GRAVITY * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.spin * dt;
    const o = rim(), half = L.bw / 2;
    // rims: two posts at the basket's top corners
    for (const side of [-1, 1]) {
      const rx = o.x + side * half, ry = o.y, dx = f.x - rx, dy = f.y - ry, d = Math.hypot(dx, dy);
      if (d < R + 4 && d > 0) {
        const nx = dx / d, ny = dy / d, dot = f.vx * nx + f.vy * ny;
        if (dot < 0) { f.vx -= 1.55 * dot * nx; f.vy -= 1.55 * dot * ny; f.vx *= 0.85; f.vy *= 0.85; }
        f.x = rx + nx * (R + 4); f.y = ry + ny * (R + 4);
        if (!f.touched) ctx.sfx.work('clank', { vol: 0.6 });
        f.touched = true;
      }
    }
    // in through the opening
    if (py < o.y && f.y >= o.y && Math.abs(f.x - o.x) < half - 3 && f.vy > 0) {
      if (basket.pieces.length >= HOLDS) {
        f.vy = -Math.abs(f.vy) * 0.5; f.vx += (f.x < o.x ? -1 : 1) * 120; f.y = o.y - 1; f.touched = true;
        pops.add('Basket’s full!', o.x, o.y - 50, C.berryD, 15);
        return false;
      }
      basket.pieces.push({ kind: f.kind, cook: 0, slot: Math.random() });
      basket.splash = 0.35;
      ctx.sfx.work('sizzle', { dur: 0.9, vol: 0.6 });
      if (!f.touched) { ctx.add(1); ctx.sfx.good(2); pops.add('Swish! +1', o.x, o.y - 56, C.leafD, 18); cook?.play('cheer', 0.9); }
      else pops.add('In!', o.x, o.y - 50, C.leafD, 16);
      return true;
    }
    // the basket's sides
    if (f.y > o.y && f.y < o.y + L.bh + R && Math.abs(f.x - o.x) < half + R && Math.abs(f.x - o.x) > half - 3) {
      const side = Math.sign(f.x - o.x) || 1;
      f.x = o.x + side * (half + R); f.vx = side * Math.abs(f.vx) * 0.5 + side * 40; f.touched = true;
    }
    // the splash guard on the fryer's far side
    if (f.x + R > L.guard.x && f.x - R < L.guard.x + 8 && f.y > L.guard.top && f.y < L.fryer.oilY && f.vx > 0) {
      f.x = L.guard.x - R; f.vx = -f.vx * 0.55; f.touched = true;
      ctx.sfx.work('clank', { vol: 0.5 });
    }
    // oil outside the basket, the counter, the floor, off screen
    if (f.y >= L.fryer.oilY && f.x > L.fryer.x && f.x < L.fryer.r) { dropPiece(f, 'Splash! Missed the basket'); return true; }
    if (f.y >= L.counterY - R && f.vy > 0) { dropPiece(f, 'Dropped!'); return true; }
    if (f.x < -40 || f.x > view.W + 40 || f.y > view.H + 40) { dropPiece(f, 'Dropped!'); return true; }
    return false;
  }

  /* ── lift, shake, tip out ───────────────────────────────────────────── */
  function grab(p) {
    const o = rim();
    if (basket.dump > 0) return false;
    if (!inRect(p, { x: o.x - L.bw / 2 - 26, y: o.y - 50, w: L.bw + 52, h: L.bh + 90 })) return false;
    basket.lifted = true; basket.lx = o.x; basket.ly = L.rimY - 40; basket.drain = 0; basket.px = p.x;
    ctx.sfx.work('slosh', { dur: 0.4, vol: 0.6 });
    cook?.loop('shake');
    return true;
  }
  function shake(p) {
    // Shaking counts the hand's travel, so it works however narrow the fryer is.
    if (basket.pieces.length) basket.drain += Math.min(60, Math.abs(p.x - basket.px)) / DRAIN;
    basket.px = p.x;
    basket.lx = clamp(p.x, L.fryer.x - 20 + L.bw / 2, L.guard.x - L.bw / 2);
    basket.ly = clamp(p.y, L.guard.top + 10, L.rimY - 30);
    if (basket.drain >= 1) tipOut();
  }
  function letGo() {
    basket.lifted = false;
    basket.x = clamp(basket.lx, L.fryer.x + L.bw / 2, L.fryer.r - L.bw / 2);
    basket.phase = Math.asin(clamp((basket.x - (L.fryer.x + L.fryer.w / 2)) / Math.max(1, driftSpan()), -1, 1));
    cook?.loop(null);
    ctx.sfx.work('sizzle', { dur: 0.6, vol: 0.4 });
  }
  function tipOut() {
    let good = 0, raw = 0, burnt = 0;
    for (const pc of basket.pieces) {
      if (pc.cook < GOLDEN[0]) raw++; else if (pc.cook > GOLDEN[1]) burnt++; else good++;
      served.push({ kind: pc.kind, cook: pc.cook, t: 0, from: { x: basket.lx, y: basket.ly }, slot: served.length % 5 });
    }
    basket.pieces = [];
    basket.lifted = false; basket.dump = 0.001; basket.drain = 0;
    basket.x = clamp(basket.lx, L.fryer.x + L.bw / 2, L.fryer.r - L.bw / 2);
    basket.phase = Math.asin(clamp((basket.x - (L.fryer.x + L.fryer.w / 2)) / Math.max(1, driftSpan()), -1, 1));
    cook?.loop(null);
    const px = L.plate.x + L.plate.w / 2, py = L.plate.y - 30;
    if (good) { ctx.add(good); ctx.sfx.good(good + 1); ctx.sfx.serve(); pops.add(`Golden! +${good}`, px, py - 10, C.leafD, 18); cook?.play('cheer', 1); }
    if (raw) pops.add(raw > 1 ? `${raw} undercooked` : 'Undercooked', px, py + 14, C.berryD, 15);
    if (burnt) pops.add(burnt > 1 ? `${burnt} burnt` : 'Burnt', px, py + 36, C.berryD, 15);
    if (!good) ctx.sfx.miss();
  }

  /* ── input ──────────────────────────────────────────────────────────── */
  let mode = null;
  const offPointer = pointer(st, {
    down: (p) => {
      if (ctx.over) return;
      if (inRect(p, { x: L.wet.x - 6, y: L.wet.y - 40, w: L.wet.w + 12, h: L.wet.h + 70 })) { dunk('wet'); return; }
      if (inRect(p, { x: L.dry.x - 6, y: L.dry.y - 40, w: L.dry.w + 12, h: L.dry.h + 70 })) { dunk('dry'); return; }
      if (grab(p)) { mode = 'basket'; return; }
      if (ready() && dist(p, L.hand) < 90) { mode = 'aim'; aim = { x: p.x, y: p.y }; return; }
      if (hand && hand.coat !== 'coated' && !hand.dip) pops.add(hand.coat === 'raw' ? 'Tap the wet batter' : 'Now the flour', L.hand.x, L.hand.y - 40, C.muted, 14);
    },
    move: (p) => {
      if (mode === 'aim') aim = { x: p.x, y: p.y };
      else if (mode === 'basket' && basket.lifted) shake(p);
    },
    up: (p) => {
      if (mode === 'aim') {
        aim = null;
        if (ready() && dist(p, L.hand) > 22) toss(launchVelocity(p));
      } else if (mode === 'basket' && basket.lifted) letGo();
      mode = null;
    },
  });
  const onKey = (e) => {
    if (e.key === '1') { e.preventDefault(); dunk('wet'); }
    if (e.key === '2') { e.preventDefault(); dunk('dry'); }
  };
  window.addEventListener('keydown', onKey);

  /* ── update ─────────────────────────────────────────────────────────── */
  function step(dt) {
    t += dt;
    if (!hand) { nextIn -= dt; if (nextIn <= 0) newPiece(); }
    if (hand) {
      hand.pop = Math.min(1, hand.pop + dt * 5);
      if (hand.dip) {
        hand.dip.t += dt;
        if (hand.dip.t >= DIP) { hand.coat = hand.dip.to === 'wet' ? 'wet' : 'coated'; hand.dip = null; if (hand.coat === 'coated') ctx.sfx.pop(); }
      }
    }
    if (!basket.lifted && basket.dump === 0) { basket.phase += dt * lerp(0.55, 1.5, clamp(t / ctx.seconds, 0, 1)); basket.x = basketHome(); }
    if (basket.dump > 0) { basket.dump += dt / 0.6; if (basket.dump >= 1) basket.dump = 0; }
    basket.splash = Math.max(0, basket.splash - dt);
    if (!basket.lifted) for (const pc of basket.pieces) pc.cook += dt;
    flying = flying.filter((f) => !fly(f, dt));
    for (const d of dropped) d.t += dt;
    dropped = dropped.filter((d) => d.t < 2.2);
    for (const s of served) s.t += dt;
    served = served.filter((s) => s.t < 1.6);
    pops.update(dt);
  }

  /* ── 3D ─────────────────────────────────────────────────────────────── */
  let P = null, cook = null, basketMesh = null, oil = null, plateMesh = null;
  const bowls = {};
  const handMap = new Map(), flyMeshes = new Map(), inMeshes = new Map(), dropMeshes = new Map(), servedMeshes = new Map();
  const depthFree = () => R / (s3.sinE * SCALE);   // free pieces sit just in front of the counter's edge

  function box3(w, h, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat({ color }));
    m.userData.ownGeometry = true; m.castShadow = m.receiveShadow = true;
    return m;
  }

  function build() {
    world.clear();
    for (const m of [handMap, flyMeshes, inMeshes, dropMeshes, servedMeshes]) m.clear();
    const { W } = view;
    P = s3.plane(L.counterY + 0.78 * s3.cosE * SCALE);   // a low counter, so the cook shows over it
    world.add(s3.floor('checker', { size: 0.45 }));
    world.add(s3.wall({ y: P.footY - 1.6 * s3.sinE * SCALE }));
    // one long counter with cupboards
    const hgt = P.height(L.counterY), DEEP = 0.7;
    const body = box3(W / SCALE + 1, hgt, DEEP, '#c98f5a'); body.position.set(W / SCALE / 2, hgt / 2, P.z - DEEP / 2); world.add(body);
    const top = box3(W / SCALE + 1.04, 0.05, DEEP + 0.04, '#e4b583'); top.position.set(W / SCALE / 2, hgt, P.z - DEEP / 2); world.add(top);
    const doors = Math.max(2, Math.round(W / 110)), dw = W / doors;
    for (let d = 0; d < doors; d++) {
      const door = box3(dw / SCALE - 0.06, hgt - 0.22, 0.02, '#e4b583');
      door.position.set((d * dw + dw / 2) / SCALE, hgt / 2 - 0.03, P.z + 0.01); world.add(door);
      const knob = box3(0.03, 0.12, 0.03, '#e8505b'); knob.position.set((d * dw + (d % 2 ? 14 : dw - 14)) / SCALE, hgt * 0.62, P.z + 0.03); world.add(knob);
    }
    // batter bowls
    for (const [key, fill] of [['wet', '#f5e6b8'], ['dry', '#fbf7ee']]) {
      const r = L[key], k = (r.w / SCALE) / 0.48, m = model('bigBowl', { fill });
      m.scale.setScalar(k);
      m.position.set((r.x + r.w / 2) / SCALE, hgt, P.z - 0.26 * k);
      bowls[key] = { mesh: m, k };
      world.add(m);
    }
    // the fryer: a steel vat set into the counter, the oil a little below the top, a splash guard on the far side
    const f = L.fryer, fw = f.w / SCALE, fd = 0.5;
    const vat = box3(fw + 0.08, 0.14, fd + 0.08, '#8e9ba8'); vat.position.set((f.x + f.w / 2) / SCALE, hgt + 0.03, P.z - fd / 2 - 0.06); world.add(vat);
    oil = new THREE.Mesh(new THREE.BoxGeometry(fw - 0.02, 0.02, fd - 0.02), toonMat({ color: '#e9a23b' }));
    oil.userData.ownGeometry = true;
    oil.position.set((f.x + f.w / 2) / SCALE, hgt + 0.1, P.z - fd / 2 - 0.06);
    world.add(oil);
    const gtop = P.height(L.guard.top);
    const guard = box3(0.05, gtop - hgt, fd + 0.08, '#c9d3da'); guard.position.set((L.guard.x + 4) / SCALE, (gtop + hgt) / 2, P.z - fd / 2 - 0.06); world.add(guard);
    // the pass plate
    plateMesh = model('plate'); plateMesh.scale.setScalar((L.plate.w / SCALE) / 0.26);
    if (L.plate.shelf) {
      const sh = box3(L.plate.w / SCALE + 0.3, 0.05, 0.4, '#c9d3da'); sh.position.copy(P.at(L.plate.x + L.plate.w / 2, L.plate.y + 6, 0.2)); world.add(sh);
      plateMesh.position.copy(sh.position); plateMesh.position.y += 0.03;
    } else plateMesh.position.set((L.plate.x + L.plate.w / 2) / SCALE, hgt + 0.02, P.z - 0.25);
    world.add(plateMesh);
    basketMesh = model('wireBasket'); basketMesh.scale.setScalar((L.bw / SCALE) / 0.34);
    world.add(basketMesh);
    // the fry cook behind the bowls, holding out the next piece
    if (cook) s3.dropCritter(cook);
    cook = s3.critter({ ...ctx.critter, scale: 1.15 });
    // clear of the counter's back edge (the counter is DEEP, a critter ~0.35 m round)
    const spot = P.at(L.hand.x - (view.portrait ? 30 : 48), L.counterY, DEEP + 0.4); cook.setPosition(spot.x, 0, spot.z);
    cook.object.rotation.y = 0.45; cook.targetHeading = 0.45;
  }

  /** Batter colour by time in the oil, in steps so meshes are shared. */
  function coatColor(cookT) {
    const c = Math.round(cookT * 2) / 2;
    if (c <= 0) return '#f4ead2';
    if (c < GOLDEN[0]) return mix('#f4ead2', '#f2c14e', c / GOLDEN[0]);
    if (c <= GOLDEN[1]) return mix('#f2c14e', '#d98a2b', (c - GOLDEN[0]) / (GOLDEN[1] - GOLDEN[0]));
    return mix('#d98a2b', '#3b2416', clamp((c - GOLDEN[1]) / (BURNT - GOLDEN[1]), 0, 1));
  }
  function look(kind, coat, cookT = 0) {
    if (coat === 'coated') return ['batter', { coat: coatColor(cookT) }];
    if (coat === 'wet') return [kind, { coat: '#f5e6b8' }];
    return [kind, {}];
  }
  /** The mesh for `key` in `map`, swapped only when its look changes. */
  function meshFor(map, key, [kind, opts]) {
    const sig = kind + JSON.stringify(opts);
    let m = map.get(key);
    if (!m || m.userData.sig !== sig) {
      m?.removeFromParent();
      m = model(kind, opts); m.scale.setScalar(FOOD); m.userData.sig = sig;
      map.set(key, m); world.add(m);
    }
    m.visible = true;
    return m;
  }
  function prune(map, live) { for (const [k, m] of map) if (!live.includes(k)) { m.removeFromParent(); map.delete(k); } }

  function draw() {
    if (needBuild) { needBuild = false; build(); }
    // the piece in hand: dips down into a bowl and comes back up
    if (hand) {
      const m = meshFor(handMap, 'hand', look(hand.kind, hand.coat));
      let x = L.hand.x, y = L.hand.y, back = depthFree();
      if (hand.dip) {
        const r = L[hand.dip.to], k = Math.sin(Math.PI * clamp(hand.dip.t / DIP, 0, 1));
        x = lerp(L.hand.x, r.x + r.w / 2, k); y = lerp(L.hand.y, r.y + 12, k); back = lerp(back, 0.26 * bowls[hand.dip.to].k, k);
      }
      m.scale.setScalar(FOOD * (0.2 + 0.8 * ease(hand.pop)));
      m.position.copy(P.at(x, y + R * 0.7, back));
      m.rotation.set(0, 0.6, 0);
    } else prune(handMap, []);
    // flying pieces
    for (const f of flying) { const m = meshFor(flyMeshes, f, look(f.kind, 'coated')); m.position.copy(P.at(f.x, f.y + R * 0.6, depthFree())); m.rotation.set(0, 0, f.rot); }
    prune(flyMeshes, flying);
    // the basket and what's in it
    const o = rim(), k = basketMesh.scale.x;
    if (basket.lifted) basketMesh.position.copy(P.at(o.x - L.bw * 0.1, o.y + L.bh - 6, 0.3));
    else basketMesh.position.set((o.x - L.bw * 0.1) / SCALE, oil.position.y - 0.07 * k + (basket.dump > 0 ? 0.45 * Math.sin(Math.PI * basket.dump) : 0), oil.position.z);
    const sway = basket.lifted ? clamp((basket.lx - (basket.lastDrawX ?? basket.lx)) * -0.025, -0.4, 0.4) : 0;
    basketMesh.rotation.z = lerp(basketMesh.rotation.z, sway, 0.4);
    basketMesh.rotation.x = basket.dump > 0 ? -Math.sin(Math.PI * basket.dump) * 0.9 : 0;
    basket.lastDrawX = basket.lx;
    basket.pieces.forEach((pc, i) => {
      const m = meshFor(inMeshes, pc, look(pc.kind, 'coated', pc.cook));
      m.position.copy(basketMesh.position).add(new THREE.Vector3(((i % 2) - 0.5) * 0.1 * k, (0.035 + (i > 1 ? 0.03 : 0)) * k, (i > 1 ? 0.03 : -0.02) * k));
      m.rotation.set(0, pc.slot * 6, 0);
    });
    prune(inMeshes, basket.pieces);
    oil.material = toonMat({ color: basket.splash > 0 || (basket.pieces.length && !basket.lifted) ? '#f2b84b' : '#e9a23b' });
    // tipped-out pieces arc onto the plate
    for (const s of served) {
      const m = meshFor(servedMeshes, s, look(s.kind, 'coated', s.cook));
      const kk = ease(clamp(s.t / 0.45, 0, 1));
      const to = { x: L.plate.x + L.plate.w * (0.25 + (s.slot % 5) * 0.12), y: L.plate.y - 6 };
      m.position.copy(P.at(lerp(s.from.x, to.x, kk), lerp(s.from.y, to.y, kk) - Math.sin(kk * Math.PI) * 60, L.plate.shelf ? 0.2 : 0.25));
      if (kk >= 1) m.position.y = Math.max(m.position.y, plateMesh.position.y + 0.02);
      m.visible = s.t < 1.4;
    }
    prune(servedMeshes, served);
    // dropped pieces lie on the floor for a moment
    for (const d of dropped) { const m = meshFor(dropMeshes, d, look(d.kind, 'coated')); m.position.copy(s3.at(d.x, L.floorY - 12, 0)); m.rotation.set(0, d.x, 1.3); }
    prune(dropMeshes, dropped);
    s3.render();

    /* overlay */
    s3.begin2d();
    const label = (s, x, y) => text(g, s, x, y, { size: 12, color: '#fff', weight: 800, stroke: 'rgba(60,50,60,.55)' });
    label(view.portrait ? 'Wet' : '1 · Wet batter', L.wet.x + L.wet.w / 2, L.counterY + 18);
    label(view.portrait ? 'Flour' : '2 · Flour', L.dry.x + L.dry.w / 2, L.counterY + 18);
    label('Fryer', L.fryer.x + L.fryer.w / 2, L.counterY + 18);
    // the bowl to tap next
    if (hand && !hand.dip && hand.coat !== 'coated') {
      const r = hand.coat === 'raw' ? L.wet : L.dry, pulse = 0.5 + 0.5 * Math.sin(t * 8);
      g.save(); g.globalAlpha = 0.5 + 0.4 * pulse; g.setLineDash([8, 6]); g.lineWidth = 3; g.strokeStyle = C.butterD;
      g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + 8, r.w / 2 + 6, 16, 0, 0, Math.PI * 2); g.stroke(); g.restore();
    }
    // ready to throw: a ring round the hand; the aim arc while pulling back
    if (ready() && !aim) { g.save(); g.globalAlpha = 0.55 + 0.35 * Math.sin(t * 6); circle(g, L.hand.x, L.hand.y, 34, null, C.leaf, 3); g.restore(); }
    if (aim && ready()) {
      const v = launchVelocity(aim);
      g.save(); g.setLineDash([4, 4]); g.strokeStyle = 'rgba(74,52,40,.45)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(L.hand.x, L.hand.y); g.lineTo(aim.x, aim.y); g.stroke(); g.restore();
      g.fillStyle = 'rgba(255,255,255,.95)'; g.strokeStyle = C.ink; g.lineWidth = 1.5;
      // only the start of the arc: judging where it lands is the game
      for (let i = 1; i <= 5; i++) {
        const tt = i * 0.05, x = L.hand.x + v.vx * tt, y = L.hand.y + v.vy * tt + 0.5 * GRAVITY * tt * tt;
        g.beginPath(); g.arc(x, y, 5 - i * 0.5, 0, Math.PI * 2); g.fill(); g.stroke();
      }
    }
    // next up
    const nx = view.portrait ? L.hand.x - 66 : L.wet.x + L.wet.w + 6, ny = view.portrait ? L.hand.y - 40 : L.wet.y - 64;
    text(g, 'next', nx, ny - 26, { size: 11, color: C.muted, weight: 800, stroke: '#fff' });
    queue.slice(0, 2).forEach((q, i) => {
      g.save(); g.globalAlpha = i ? 0.55 : 0.9; g.drawImage(icon(s3.renderer, q.kind), nx - 14 + (i ? 30 : 0) * (view.portrait ? -1 : 1), ny - 14, 28, 28); g.restore();
    });
    // the cook meter (a dot per piece) — or the drain meter while shaking
    const mw = Math.max(90, L.bw), mx = o.x - mw / 2, my = Math.max(14, o.y - 74);
    if (basket.lifted && basket.pieces.length) {
      box(g, mx, my, mw, 12, { fill: '#fff', r: 6, stroke: C.line, lw: 2 });
      box(g, mx, my, Math.max(12, mw * clamp(basket.drain, 0, 1)), 12, { fill: C.sea, r: 6 });
      text(g, 'Shake to drain!', o.x, my - 12, { size: 13, color: C.seaD, weight: 800, stroke: '#fff' });
    } else if (basket.pieces.length) {
      box(g, mx, my, mw, 10, { fill: '#fff', r: 5, stroke: C.line, lw: 2 });
      g.fillStyle = '#f2c14e'; g.fillRect(mx + mw * (GOLDEN[0] / BURNT), my, mw * ((GOLDEN[1] - GOLDEN[0]) / BURNT), 10);
      for (const pc of basket.pieces) circle(g, mx + mw * clamp(pc.cook / BURNT, 0, 1), my + 5, 6, pc.cook > GOLDEN[1] ? C.berry : pc.cook >= GOLDEN[0] ? C.leaf : '#fff', C.ink, 1.5);
      const gold = basket.pieces.filter((pc) => pc.cook >= GOLDEN[0] && pc.cook <= GOLDEN[1]).length;
      if (gold) text(g, gold === basket.pieces.length ? 'Golden — grab & shake!' : `${gold} golden`, o.x, my - 13, { size: 13, color: C.leafD, weight: 800, stroke: '#fff' });
      text(g, `${basket.pieces.length}/${HOLDS}`, mx + mw + 16, my + 5, { size: 12, color: C.ink, weight: 800, stroke: '#fff' });
    }
    pops.draw(g);
    if (t < 7) {
      const tip = !hand || hand.coat !== 'coated' ? 'Tap the wet batter, then the flour' : 'Pull back from the piece and let go to toss it in the basket';
      text(g, tip, view.W / 2, L.hintY, { size: 15, color: C.ink, weight: 800, stroke: '#fff', alpha: clamp(7 - t, 0, 1) });
    }
  }

  return {
    start() { newPiece(); },
    update(dt) { if (!ctx.over) step(dt); else pops.update(dt); },
    draw,
    /** For automated play-tests. */
    peek() {
      return {
        view: { ...view }, L, gravity: GRAVITY, pull: PULL, golden: GOLDEN, t,
        hand: hand && { coat: hand.coat, dipping: !!hand.dip }, ready: ready(),
        basket: { ...rim(), lifted: basket.lifted, pieces: basket.pieces.map((p) => p.cook), dump: basket.dump, phase: basket.phase, span: driftSpan(), mid: L.fryer.x + L.fryer.w / 2, speed: lerp(0.55, 1.5, clamp(t / ctx.seconds, 0, 1)) },
        flying: flying.length,
      };
    },
    destroy() { offPointer(); window.removeEventListener('keydown', onKey); s3.destroy(); },
  };
}

function mix(a, b, t) {
  t = clamp(t, 0, 1);
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
