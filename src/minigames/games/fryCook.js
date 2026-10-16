/**
 * Fry Cook — "Fry Station". A physics game: drag each piece from the tray
 * through the wet batter, then the dry batter, and into the basket. Drag the
 * basket into the oil, lift it out when the pieces are golden, and tip it
 * over the plate. Pieces you let go of over the floor (or fling off the
 * counter) are dropped and cost a point. Score = golden pieces plated.
 */
import { pointer, C, box, circle, text, lerp, clamp, inRect, dist, pick, Pops } from '../kit.js';
import { stage3d } from '../kit3d.js';
import { model } from '../models.js';
import * as THREE from 'three';
import { toonMat, glowMat, Builder } from '../../three/toon.js';

const KINDS = [
  { kind: 'drumstick', name: 'chicken' }, { kind: 'onionRing', name: 'onion ring' }, { kind: 'mozzStick', name: 'mozzarella stick' }, { kind: 'shrimp', name: 'shrimp' },
];
const SCALE = 150;                // view units per metre
const FOOD = 2.8;                 // pieces are drawn larger than life
const GRAVITY = 1500;
const DIP = 0.45;                 // seconds in a bowl to take the batter
const GOLDEN = [4.2, 7.6];        // seconds in the oil for golden
const BURNT = 10;
const BASKET_HOLDS = 3;
const R = 20;                     // piece radius

export default function create(ctx) {
  const s3 = stage3d(ctx.el, { scale: SCALE, quality: ctx.quality });
  const st = s3.ui, view = s3.view, g = s3.g;
  const world = new THREE.Group();
  s3.add(world);
  let P = null;                   // the upright plane everything sits on
  let cook = null;
  const meshes = new Map();       // piece → mesh
  let needBuild = true;
  const pops = new Pops();
  let pieces = [];
  let held = null;                // { piece } | { basket: true }
  let pointerAt = { x: 0, y: 0 };
  let trayTimer = 0, sizzleTimer = 0, plateAway = 0;
  let splats = [];
  const L = {};
  const basket = { x: 0, y: 0, inOil: false, tx: 0, ty: 0 };

  /**
   * Wide screens: one row — prep counter | gap | fry counter. Phones: the prep
   * counter is a shelf across the top; below it the fry counter and the pass
   * with the gap between them. Every station sits on a counter at `base`.
   */
  function layout() {
    const { W, H } = view;
    L.floorY = H - 6;
    const gap = Math.max(50, Math.min(70, W * 0.1));
    let prep, fry, pass;
    if (view.portrait) {
      const top = H * 0.4, low = H * 0.8;
      prep = { x: 0, w: W, y: top, shelf: true };
      fry = { x: 0, w: W * 0.58 - gap / 2, y: low };
      pass = { x: W * 0.58 + gap / 2, w: W - (W * 0.58 + gap / 2), y: low };
      L.gap = { x: fry.w, w: gap, y: low };
    } else {
      const y = H * 0.64;
      prep = { x: 0, w: W * 0.5 - gap / 2, y };
      fry = { x: W * 0.5 + gap / 2, w: (W - (W * 0.5 + gap / 2)) * 0.6, y };
      pass = { x: fry.x + fry.w, w: W - fry.x - fry.w, y };
      L.gap = { x: prep.w, w: gap, y };
    }
    L.counters = [prep, fry, pass];
    const sw = prep.w / 3;
    const bowl = (i) => ({ x: prep.x + sw * i + sw * 0.12, y: prep.y - 46, w: sw * 0.76, h: 46, base: prep.y });
    L.tray = bowl(0); L.tray.y = prep.y - 22; L.tray.h = 22;
    L.wet = bowl(1); L.dry = bowl(2);
    L.fryer = { x: fry.x + fry.w * 0.12, y: fry.y - 64, w: fry.w * 0.76, h: 64, base: fry.y };
    L.rack = { x: L.fryer.x + L.fryer.w * 0.1, y: L.fryer.y - 70, w: L.fryer.w * 0.8, h: 40 };
    L.plate = { x: pass.x + pass.w * 0.12, y: pass.y - 18, w: pass.w * 0.76, h: 18, base: pass.y };
    L.bw = Math.min(L.fryer.w * 0.9, 120); L.bh = 40;
    L.hintY = Math.max(30, Math.min(prep.y, fry.y) - (view.portrait ? 120 : 150));
    homeBasket(true);
    reseat();
    needBuild = true;   // the 3D set is rebuilt on the next frame
  }
  /** After a resize, put resting pieces back where they belong. */
  function reseat() {
    let t = 0;
    for (const p of pieces) {
      if (p.where === 'tray') { p.x = L.tray.x + L.tray.w * (0.28 + (t++ % 2) * 0.44); p.y = L.tray.base - R + 2; }
      else if (p.where === 'wet' || p.where === 'dry') { const r = L[p.where]; p.x = r.x + r.w / 2; p.y = r.y + 18; }
      else if (p.where === 'counter' || p.where === 'falling') { p.where = 'falling'; p.x = clamp(p.x, R, view.W - R); p.y = Math.min(p.y, L.hintY); p.py = p.y; p.vx = p.vy = 0; }
      else if (p.where === 'served') { p.where = 'gone'; meshes.get(p)?.removeFromParent(); meshes.delete(p); }
    }
  }
  function oilSpot() { return { x: L.fryer.x + L.fryer.w / 2, y: L.fryer.y + 26 }; }
  function rackSpot() { return { x: L.fryer.x + L.fryer.w / 2, y: L.rack.y + 10 }; }
  function homeBasket(snap = false) {
    const s = basket.inOil ? oilSpot() : rackSpot();
    basket.tx = s.x; basket.ty = s.y;
    if (snap) { basket.x = s.x; basket.y = s.y; }
  }
  layout();
  view.onResize = layout;

  /* pieces */
  function spawn() {
    const inTray = pieces.filter((p) => p.where === 'tray').length;
    if (inTray >= 2) return;
    const k = pick(KINDS);
    const slot = pieces.some((p) => p.where === 'tray' && p.x < L.tray.x + L.tray.w / 2) ? 1 : 0;
    pieces.push({ ...k, id: Math.random(), x: L.tray.x + L.tray.w * (0.28 + slot * 0.44), y: L.tray.base - R + 2, vx: 0, vy: 0, where: 'tray', coat: 'raw', dip: 0, cook: 0, born: 0 });
  }

  function restOn(p, where, y) { p.where = where; p.y = y; p.vx = 0; p.vy = 0; p.dip = 0; }

  function land(p) {
    const at = { x: p.x, y: p.y };
    // into a bowl
    for (const [key, r] of [['wet', L.wet], ['dry', L.dry]]) {
      if (at.x > r.x - 4 && at.x < r.x + r.w + 4 && at.y > r.y - R) {
        restOn(p, key, r.y + 18);
        ctx.sfx.work('slosh', { dur: 0.3, vol: 0.5 });
        if (key === 'dry' && p.coat === 'raw') pops.add('Wet batter first!', r.x + r.w / 2, r.y - 30, C.berryD, 15);
        if (key === 'wet' && p.coat === 'coated') { p.coat = 'raw'; pops.add('Washed off!', r.x + r.w / 2, r.y - 30, C.berryD, 15); }
        return true;
      }
    }
    // into the basket
    const b = basketRect();
    if (at.x > b.x - 12 && at.x < b.x + b.w + 12 && at.y > b.y - 14 && at.y < b.y + b.h) {
      if (p.coat !== 'coated') {
        pops.add(p.coat === 'raw' ? 'Batter it first!' : 'Needs dry batter!', basket.x, b.y - 30, C.berryD, 15);
        p.vy = -420; p.vx = (Math.random() - 0.5) * 260; p.y = b.y - 12;
        ctx.sfx.miss();
        return false;
      }
      if (basketPieces().length >= BASKET_HOLDS) { pops.add('Basket’s full!', basket.x, b.y - 30, C.berryD, 15); p.vy = -380; p.vx = 160; p.y = b.y - 12; return false; }
      p.where = 'basket'; p.vx = p.vy = 0;
      ctx.sfx.work('thud', { vol: 0.5 });
      if (basket.inOil) ctx.sfx.work('sizzle', { dur: 0.8, vol: 0.5 });
      return true;
    }
    // on a counter (only from above: a piece let go under the shelf falls past it)
    const c = L.counters.find((k) => at.x > k.x && at.x < k.x + k.w && at.y >= k.y - R && p.py < k.y - R + 1);
    if (c) {
      if (at.x > L.fryer.x && at.x < L.fryer.x + L.fryer.w && c.y === L.fryer.base) {
        // straight into the oil with no basket: ruined
        drop(p, 'Splash! Use the basket.'); return true;
      }
      restOn(p, 'counter', c.y - R);
      ctx.sfx.work('thud', { vol: 0.35 });
      return true;
    }
    if (at.y >= L.floorY - R || at.x < -R || at.x > view.W + R) { drop(p, 'Dropped!'); return true; }
    return false;
  }

  function drop(p, why) {
    p.where = 'gone';
    splats.push({ x: clamp(p.x, 10, view.W - 10), y: Math.min(p.y, L.floorY - 8), kind: p.kind, coat: p.coat, cook: p.cook, t: 0 });
    ctx.add(-1);
    ctx.sfx.miss();
    pops.add(`${why} −1`, clamp(p.x, 60, view.W - 60), Math.min(p.y, L.floorY) - 40, C.berryD);
  }

  /* basket */
  function basketRect() { return { x: basket.x - L.bw / 2, y: basket.y - L.bh / 2, w: L.bw, h: L.bh }; }
  function basketPieces() { return pieces.filter((p) => p.where === 'basket'); }

  function releaseBasket() {
    const p = pointerAt;
    if (inRect(p, { x: L.fryer.x - 20, y: L.fryer.y - 70, w: L.fryer.w + 40, h: L.fryer.h + 80 })) {
      if (!basket.inOil) { basket.inOil = true; ctx.sfx.work('sizzle', { dur: 1.2, vol: 0.7 }); }
    } else if (inRect(p, { x: L.plate.x - 30, y: L.plate.y - 120, w: L.plate.w + 60, h: 150 })) {
      basket.inOil = false;
      tipOut();
    } else basket.inOil = false;
    homeBasket();
  }

  function tipOut() {
    const list = basketPieces();
    if (!list.length) return;
    let good = 0;
    for (const p of list) {
      p.where = 'served'; p.x = L.plate.x + L.plate.w / 2 + (Math.random() - 0.5) * L.plate.w * 0.5; p.y = L.plate.y - 10;
      if (p.cook >= GOLDEN[0] && p.cook <= GOLDEN[1]) good++;
    }
    const raw = list.filter((p) => p.cook < GOLDEN[0]).length, burnt = list.filter((p) => p.cook > GOLDEN[1]).length;
    if (good) { ctx.add(good); ctx.sfx.good(good); ctx.sfx.serve(); pops.add(`Golden! +${good}`, L.plate.x + L.plate.w / 2, L.plate.y - 50, C.leafD); }
    if (raw) pops.add(raw > 1 ? `${raw} undercooked` : 'Undercooked', L.plate.x + L.plate.w / 2, L.plate.y - (good ? 78 : 50), C.berryD, 16);
    if (burnt) pops.add(burnt > 1 ? `${burnt} overdone` : 'Overdone', L.plate.x + L.plate.w / 2, L.plate.y - (good || raw ? 104 : 50), C.berryD, 16);
    if (!good) ctx.sfx.miss();
    plateAway = 0.9;
  }

  /* input */
  const offPointer = pointer(st, {
    down: (p) => {
      if (ctx.over) return;
      pointerAt = p;
      const free = pieces.filter((x) => ['tray', 'wet', 'dry', 'counter', 'falling'].includes(x.where));
      let best = null, bd = R * 1.7;
      for (const x of free) { const d = dist(p, x); if (d < bd) { bd = d; best = x; } }
      if (best) { held = { piece: best, lastX: p.x, lastY: p.y }; best.where = 'held'; ctx.sfx.pop(); return; }
      const b = basketRect();
      if (inRect(p, { x: b.x - 14, y: b.y - 30, w: b.w + 28, h: b.h + 40 })) {
        held = { basket: true, dx: basket.x - p.x, dy: basket.y - p.y };
        if (basket.inOil) ctx.sfx.work('slosh', { dur: 0.4, vol: 0.6 });
        basket.inOil = false;
      }
    },
    move: (p) => { pointerAt = p; },
    up: (p) => {
      pointerAt = p;
      if (!held) return;
      // A gentle let-go mostly drops; a real flick still throws.
      if (held.piece) { const x = held.piece; x.where = 'falling'; x.py = x.y; x.vx = clamp(x.vx * 0.55, -800, 800); x.vy = clamp(x.vy * 0.55, -800, 800); }
      else if (held.basket) releaseBasket();
      held = null;
    },
  });

  /* update */
  function step(dt) {
    trayTimer -= dt;
    if (trayTimer <= 0) { spawn(); trayTimer = 1.1; }
    if (plateAway > 0) plateAway = Math.max(0, plateAway - dt);
    if (plateAway === 0) pieces = pieces.filter((p) => p.where !== 'served');

    if (held?.piece) {
      const x = held.piece;
      const nx = lerp(x.x, pointerAt.x, clamp(dt * 22, 0, 1)), ny = lerp(x.y, pointerAt.y - 6, clamp(dt * 22, 0, 1));
      if (dt > 0) { x.vx = (nx - x.x) / dt; x.vy = (ny - x.y) / dt; }
      x.x = nx; x.y = ny;
    }
    if (held?.basket) {
      basket.x = lerp(basket.x, pointerAt.x + held.dx, clamp(dt * 20, 0, 1));
      basket.y = lerp(basket.y, Math.min(pointerAt.y + held.dy, L.fryer.base - L.bh / 2), clamp(dt * 20, 0, 1));
    } else {
      basket.x = lerp(basket.x, basket.tx, clamp(dt * 12, 0, 1));
      basket.y = lerp(basket.y, basket.ty, clamp(dt * 12, 0, 1));
    }

    for (const p of pieces) {
      if (p.where === 'falling') {
        p.py = p.y; p.vy += GRAVITY * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.vy > 0) land(p);
      } else if (p.where === 'wet' || p.where === 'dry') {
        p.dip += dt;
        if (p.dip >= DIP) {
          if (p.where === 'wet' && p.coat === 'raw') { p.coat = 'wet'; ctx.sfx.work('slosh', { dur: 0.25, vol: 0.35 }); }
          if (p.where === 'dry' && p.coat === 'wet') { p.coat = 'coated'; ctx.sfx.work('wipe', { dur: 0.3, vol: 0.5 }); }
        }
      } else if (p.where === 'basket') {
        const list = basketPieces(), i = list.indexOf(p);
        p.x = basket.x + (i - (list.length - 1) / 2) * (L.bw / 3.4);
        p.y = basket.y - 4 + (basket.inOil ? Math.sin(performance.now() / 120 + i) * 1.5 : 0);
        if (basket.inOil) p.cook += dt;
      }
    }
    pieces = pieces.filter((p) => p.where !== 'gone');
    if (basket.inOil && basketPieces().length) {
      sizzleTimer -= dt;
      if (sizzleTimer <= 0) { ctx.sfx.work('sizzle', { dur: 1.1, vol: 0.35 }); sizzleTimer = 1.1; }
    }
    for (const s of splats) s.t += dt;
    splats = splats.filter((s) => s.t < 2.5);
    pops.update(dt);
  }

  /* ── 3D ─────────────────────────────────────────────────────────────── */

  function box3(w, h, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat({ color }));
    m.userData.ownGeometry = true; m.castShadow = m.receiveShadow = true;
    return m;
  }
  let basketMesh = null, oil = null, fryerBody = null, plateMesh = null, bowls = {};

  /** Kitchen set built from the layout: counters, bowls, fryer, plate, the cook. */
  function build() {
    world.clear();
    meshes.clear();
    splatMeshes.clear();
    const { W, H } = view;
    const lowest = Math.max(...L.counters.map((c) => c.y));
    P = s3.plane(lowest + 0.9 * s3.cosE * SCALE);
    world.add(s3.floor('checker', { size: 0.45 }));
    world.add(s3.wall({ y: P.footY - 1.5 * s3.sinE * SCALE }));
    const DEEP = 0.7;
    for (const c of L.counters) {
      const hgt = P.height(c.y), cx = (c.x + c.w / 2) / SCALE;
      if (c.shelf) {
        const plank = box3(c.w / SCALE + 0.1, 0.06, 0.42, '#c9d3da'); plank.position.set(cx, hgt - 0.03, P.z - 0.21); world.add(plank);
        for (const bx of [c.x + 34, c.x + c.w - 34]) { const br = box3(0.05, 0.3, 0.3, '#9aa7b1'); br.position.set(bx / SCALE, hgt - 0.2, P.z - 0.25); world.add(br); }
        continue;
      }
      const body = box3(c.w / SCALE, hgt, DEEP, '#c98f5a'); body.position.set(cx, hgt / 2, P.z - DEEP / 2); world.add(body);
      const top = box3(c.w / SCALE + 0.03, 0.05, DEEP + 0.04, '#c9d3da'); top.position.set(cx, hgt, P.z - DEEP / 2); world.add(top);
      // cupboard doors on the front
      const doors = Math.max(1, Math.round(c.w / 90)), dw = c.w / doors;
      for (let d = 0; d < doors; d++) {
        const door = box3(dw / SCALE - 0.06, Math.max(0.2, hgt - 0.24), 0.02, '#e4b583');
        door.position.set((c.x + d * dw + dw / 2) / SCALE, hgt / 2 - 0.02, P.z + 0.01); world.add(door);
        const knob = box3(0.03, 0.12, 0.03, '#e8505b'); knob.position.set((c.x + d * dw + (d % 2 ? 14 : dw - 14)) / SCALE, hgt * 0.62, P.z + 0.03); world.add(knob);
      }
    }
    // raw tray
    const tray = box3(L.tray.w / SCALE, 0.04, 0.3, '#7d8a96'); tray.position.copy(P.at(L.tray.x + L.tray.w / 2, L.tray.base, 0.15)); tray.position.y = P.height(L.tray.base) + 0.02; world.add(tray);
    // batter bowls: centred a little behind the counter's front edge
    for (const [key, fill] of [['wet', '#f5e6b8'], ['dry', '#fbf7ee']]) {
      const r = L[key], k = (r.w / SCALE) / 0.48, m = model('bigBowl', { fill });
      m.scale.setScalar(k);
      m.position.copy(P.at(r.x + r.w / 2, r.base, 0.26 * k)); m.position.y = P.height(r.base);
      bowls[key] = { mesh: m, back: 0.26 * k, k };
      world.add(m);
    }
    // the fryer: a steel cabinet on the fry counter with a vat of oil on top
    const f = L.fryer, fw = f.w / SCALE, fh = P.height(f.y) - P.height(f.base), fd = 0.55;
    fryerBody = box3(fw, fh, fd, '#8e9ba8'); fryerBody.position.copy(P.at(f.x + f.w / 2, f.base, fd / 2)); fryerBody.position.y = P.height(f.base) + fh / 2; world.add(fryerBody);
    oil = new THREE.Mesh(new THREE.BoxGeometry(fw - 0.06, 0.02, fd - 0.08), toonMat({ color: '#e0a83a' }));
    oil.userData.ownGeometry = true;
    oil.position.copy(fryerBody.position); oil.position.y = P.height(f.base) + fh + 0.005; world.add(oil);
    const panel = box3(fw * 0.4, fh * 0.25, 0.02, '#2b2d42'); panel.position.copy(fryerBody.position); panel.position.z += fd / 2 + 0.01; panel.position.y -= fh * 0.15; world.add(panel);
    // the hook the basket hangs on
    const hook = box3(0.03, P.height(L.rack.y) - P.height(f.y) + 0.1, 0.03, '#9aa7b1');
    hook.position.copy(P.at(f.x + f.w / 2, (L.rack.y + f.y) / 2, 0.3)); world.add(hook);
    // plate on the pass
    plateMesh = model('plate'); plateMesh.scale.setScalar((L.plate.w / SCALE) / 0.26);
    plateMesh.position.copy(P.at(L.plate.x + L.plate.w / 2, L.plate.base, 0.2)); plateMesh.position.y = P.height(L.plate.base);
    world.add(plateMesh);
    // the basket
    basketMesh = model('wireBasket'); basketMesh.scale.setScalar((L.bw / SCALE) / 0.34);
    world.add(basketMesh);
    // the fry cook behind the pass, in the uniform their role wears
    if (cook) s3.dropCritter(cook);
    cook = s3.critter({ ...ctx.critter, scale: view.portrait ? 0.95 : 1.05 });
    // in the gap between the counters, watching for drops
    const spot = P.at(L.gap.x + L.gap.w / 2, L.gap.y, 0.9); cook.setPosition(spot.x, 0, spot.z);
    cook.object.rotation.y = 0; cook.targetHeading = 0;
  }

  /** Dropped pieces lie on the floor for a moment. */
  const splatMeshes = new Map();
  function syncSplats() {
    for (const sp of splats) {
      if (splatMeshes.has(sp)) continue;
      const [kind, opts] = pieceLook(sp), m = model(kind, opts);
      m.scale.setScalar(FOOD); m.rotation.set(0, Math.random() * 6, 1.3);
      m.position.copy(s3.at(sp.x, L.floorY - 14, 0));
      splatMeshes.set(sp, m); world.add(m);
    }
    for (const [sp, m] of splatMeshes) if (!splats.includes(sp)) { m.removeFromParent(); splatMeshes.delete(sp); }
  }

  /** Batter colour from pale through golden to burnt, in a few steps so meshes can be shared. */
  function coatColor(p) {
    if (p.cook <= 0) return '#f4ead2';
    const c = Math.round(p.cook * 2) / 2;
    if (c < GOLDEN[0]) return mix('#f4ead2', '#f2c14e', c / GOLDEN[0]);
    if (c <= GOLDEN[1]) return mix('#f2c14e', '#d98a2b', (c - GOLDEN[0]) / (GOLDEN[1] - GOLDEN[0]));
    return mix('#d98a2b', '#3b2416', clamp((c - GOLDEN[1]) / (BURNT - GOLDEN[1]), 0, 1));
  }
  function pieceLook(p) {
    if (p.coat === 'coated') return ['batter', { coat: coatColor(p) }];
    if (p.coat === 'wet') return [p.kind, { coat: '#f5e6b8' }];
    return [p.kind, {}];
  }
  function syncPiece(p) {
    const [kind, opts] = pieceLook(p), sig = kind + JSON.stringify(opts);
    let m = meshes.get(p);
    if (!m || m.userData.sig !== sig) {
      const old = m;
      m = model(kind, opts); m.scale.setScalar(FOOD); m.userData.sig = sig; m.rotation.y = (p.id || 0) * 6;
      if (old) { m.position.copy(old.position); old.removeFromParent(); }
      meshes.set(p, m); world.add(m);
    }
    m.visible = p.where !== 'gone';
    if (p.where === 'wet' || p.where === 'dry') {
      // floating in the batter, in the middle of the bowl
      const b = bowls[p.where];
      m.position.set(p.x / SCALE, b.mesh.position.y + 0.17 * b.k, b.mesh.position.z);
    } else if (p.where === 'basket') {
      const list = basketPieces(), i = list.indexOf(p), k = basketMesh.scale.x;
      m.position.copy(basketMesh.position).add(new THREE.Vector3((i - (list.length - 1) / 2) * 0.1 * k, 0.03 * k, 0));
    } else if (p.where === 'served') {
      m.position.copy(plateMesh.position); m.position.x += (p.x - (L.plate.x + L.plate.w / 2)) / SCALE; m.position.y += 0.02 * plateMesh.scale.x;
    } else {
      // Free pieces: the model's base shows at the logic point, so resting on a counter it sits on the top.
      m.position.copy(P.at(p.x, p.y, R / (s3.sinE * SCALE)));
    }
  }
  /** Basket: held it follows the pointer; in the oil it sits in the vat; otherwise it hangs on the hook. */
  function placeBasket() {
    const m = basketMesh;
    if (basket.inOil && !held?.basket) {
      m.position.set((basket.x - L.bw * 0.1) / SCALE, oil.position.y - 0.08 * m.scale.x, oil.position.z);
    } else {
      m.position.copy(P.at(basket.x - L.bw * 0.1, basket.y + L.bh / 2 - 6, 0.3));
    }
  }
  /** Where the basket appears on screen (for the cook timer and sparkles). */
  const basketScreenY = () => s3.toView(basketMesh.position).y - 10;

  function draw() {
    if (needBuild) { needBuild = false; build(); }
    placeBasket();
    for (const p of pieces) syncPiece(p);
    for (const [p, m] of meshes) if (!pieces.includes(p)) { m.removeFromParent(); meshes.delete(p); }
    syncSplats();
    basketMesh.rotation.z = held?.basket ? clamp((pointerAt.x - basket.x) * -0.004, -0.3, 0.3) : 0;
    oil.material = toonMat({ color: basket.inOil ? '#f2b84b' : '#e0a83a' });
    plateMesh.position.x = (L.plate.x + L.plate.w / 2 + (plateAway > 0 && plateAway < 0.45 ? (0.45 - plateAway) * 800 : 0)) / SCALE;
    s3.render();

    // 2D: labels, dipping rings, the cook timer, notes
    const { W } = view;
    s3.begin2d();
    const label = (t, x, base) => text(g, t, x, base + 18, { size: 12, color: '#fff', weight: 800, stroke: 'rgba(60,50,60,.55)' });
    label('Raw', L.tray.x + L.tray.w / 2, L.tray.base);
    label('Wet batter', L.wet.x + L.wet.w / 2, L.wet.base);
    label('Flour', L.dry.x + L.dry.w / 2, L.dry.base);
    label('Fryer', L.fryer.x + L.fryer.w / 2, L.fryer.base);
    label('Plate', L.plate.x + L.plate.w / 2, L.plate.base);
    for (const p of pieces) {
      const taking = (p.where === 'wet' && p.coat === 'raw') || (p.where === 'dry' && p.coat === 'wet');
      if (taking) { g.beginPath(); g.arc(p.x, p.y - 4, R + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(p.dip / DIP, 0, 1)); g.strokeStyle = C.leaf; g.lineWidth = 4; g.stroke(); }
      else if ((p.where === 'wet' && p.coat === 'wet') || (p.where === 'dry' && p.coat === 'coated')) text(g, '✓', p.x + R, p.y - R - 6, { size: 18, color: C.leafD, weight: 800, stroke: '#fff' });
      if (p.where === 'basket' && basket.inOil && p.cook >= GOLDEN[0] && p.cook <= GOLDEN[1]) text(g, '✨', p.x + R * 0.6, basketScreenY() - 18, { size: 13 });
    }
    const list = basketPieces();
    if (basket.inOil && list.length) {
      const c = Math.max(...list.map((p) => p.cook)), k = clamp(c / BURNT, 0, 1);
      const tw = L.bw, tx = basket.x - tw / 2, ty = basketScreenY() - 46;
      box(g, tx, ty, tw, 10, { fill: '#fff', r: 5, stroke: C.line, lw: 2 });
      g.fillStyle = '#f2c14e'; g.fillRect(tx + tw * (GOLDEN[0] / BURNT), ty, tw * ((GOLDEN[1] - GOLDEN[0]) / BURNT), 10);
      circle(g, tx + tw * k, ty + 5, 7, c > GOLDEN[1] ? C.berry : c >= GOLDEN[0] ? C.leaf : '#fff', C.ink, 2);
    }
    pops.draw(g);
    if (ctx.elapsed() < 6) text(g, view.portrait ? 'Drag a piece into the wet batter' : 'Drag a piece from the tray into the wet batter →', W / 2, L.hintY, { size: 15, color: C.ink, weight: 800, stroke: '#fff', alpha: 1 - Math.max(0, ctx.elapsed() - 4) / 2 });
  }

  return {
    update(dt) { if (!ctx.over) step(dt); else pops.update(dt); },
    draw,
    /** For automated play-tests. */
    peek() { return { L, basket: { ...basket }, pieces: pieces.map((p) => ({ x: p.x, y: p.y, where: p.where, coat: p.coat, cook: p.cook, dip: p.dip })), view: { ...view } }; },
    destroy() { offPointer(); s3.destroy(); },
  };
}

function mix(a, b, t) {
  t = clamp(t, 0, 1);
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
