/**
 * Barista — "Latte Art". Customers ask for a pattern (monk's head, heart,
 * tulip, rosetta); hold to pour steamed milk and move the pitcher to draw it
 * on the espresso. The milk really flows (latteSim.js): hold still and a
 * white blob grows, pull through quickly and it draws to a point, wiggle and
 * leaves fold in. Serve it (or empty the pitcher) and it's judged against
 * the pattern: Fail 0, Poor 1, Good 2, Perfect 4.
 *
 * Stuck on a pattern (two misses in a row) and the barista offers to show
 * you how; "Show me" plays the demo any time. The shift clock stops while a
 * demo plays. Keyboard: arrows move the pitcher (Shift for a quick pull),
 * hold Space to pour, Enter serves, H shows how.
 *
 * 3D in the restaurant's toon style: the cup on the counter, a steel pitcher
 * under your finger, the barista behind the counter. Tickets, buttons,
 * captions and the milk meter are the 2D overlay.
 */
import { pointer, C, box, circle, text, rr, lerp, ease, clamp, inRect, pick, Pops } from '../kit.js';
import { stage3d } from '../kit3d.js';
import { defineModel, model } from '../models.js';
import * as THREE from 'three';
import { toonMat } from '../../three/toon.js';
import { portrait } from '../../three/portraits.js';
import { SPECIES } from '../../lexicon/names.js';
import { casualOutfit } from '../../three/outfits.js';
import { N, Surface, PATTERNS, PATTERN, timeline, simulate, judge, rate } from './latteSim.js';

const SCALE = 220;            // view units per metre
const ELEV = 0.95;            // a steeper look down than the restaurant, to see into the cup
const COUNTER = 0.55;         // counter height (m): low, so the barista shows over it
const MILK = 4.6;             // seconds of pouring in a full pitcher
const NEXT = 2.4;             // seconds the verdict shows before the next customer steps up

const CREMA = [161, 98, 48], CREMA_RIM = [112, 62, 30], FOAM = [252, 245, 232];

defineModel('latte:cup', (b) => {
  b.cyl(1.4, 1.3, 0.06, '#fbfaf5', { y: 0.03 });                                   // saucer
  b.cyl(1.22, 1.24, 0.03, '#efe7da', { y: 0.065 });
  // the cup: open at the top (outside and inside walls), so you see down into the coffee
  b.geom(new THREE.CylinderGeometry(1.12, 0.78, 0.62, 32, 1, true), '#fbfaf5', { y: 0.37 });
  b.geom(new THREE.CylinderGeometry(1.06, 0.74, 0.6, 32, 1, true), '#f1ebe1', { y: 0.38, sx: -1 });   // mirrored: faces inward
  b.disc(0.78, '#fbfaf5', { y: 0.07 });
  b.torus(1.1, 0.045, '#ffffff', { y: 0.68, rx: Math.PI / 2 });                    // rim
  b.cyl(1.08, 1.08, 0.02, '#5a3420', { y: 0.6 });                                   // dark under the surface
  b.torus(0.28, 0.07, '#fbfaf5', { x: 1.2, y: 0.4, ry: 0 });                       // handle
});
defineModel('latte:pitcher', (b) => {
  b.cyl(0.2, 0.25, 0.46, '#c9d3da', { y: 0.23 });                                  // steel jug
  b.torus(0.2, 0.02, '#e9eef2', { y: 0.46, rx: Math.PI / 2 });
  b.cone(0.09, 0.2, '#c9d3da', { x: 0, y: 0.45, z: 0.24, rx: Math.PI / 2.4 }, 10); // spout, toward +z
  b.box(0.06, 0.32, 0.08, '#8e9ba8', { x: 0, y: 0.25, z: -0.27 }, 0.02);          // handle at the back
});

export default function create(ctx) {
  const s3 = stage3d(ctx.el, { scale: SCALE, elevation: ELEV, quality: ctx.quality, background: '#f6efe4' });
  const st = s3.ui, view = s3.view, g = s3.g;
  const pops = new Pops();
  const world = new THREE.Group();
  s3.add(world);

  const L = {};
  let needBuild = true;
  const surface = new Surface();
  const refs = new Map();                     // pattern key → reference surface (simulated ideal pour)
  const misses = new Map();                   // pattern key → misses in a row (two in a row → a demo)
  const struggled = new Set();                // patterns you've missed: their ticket shows the tip
  let order = null;                           // { pattern, who: { species, seed, img }, t }
  let state = 'wait';                         // wait | pour | demo | judged
  let milk = MILK, pouring = false, served = 0, nextT = 0.6;
  let spout = null;                           // where the stream lands, in surface coords { u, v }
  let lastSpout = null, aim = null;           // view point of the pitcher
  let demo = null;                            // { tl, t }
  let verdict = null;                         // { rating, faults, t }
  let clock = 0, hint = '';
  let offer = false;                          // "Want me to show you?" is up on the ticket
  const seen = new Set();                     // patterns served at least once (first time, the ticket shows the tip)
  const cups = [];                            // { name, rating, pts } for the results recap
  const keys = new Set();                     // arrow keys held
  let kbAim = null, kbUsed = false;
  const TEX = N * 2;            // the picture is drawn at twice the sim's resolution, sampled smoothly
  const texData = new Uint8ClampedArray(TEX * TEX * 4);
  let dirty = true;

  /* ── layout (view units) ────────────────────────────────────────────── */
  function layout() {
    const { W, H } = view;
    const P = view.portrait;
    L.portrait = P;
    // the cup's rim is ~1.12 × the coffee's radius and the saucer 1.4 ×
    L.cupR = P ? Math.min(W * 0.36, H * 0.2) : Math.min(H * 0.3, W * 0.22);
    L.cup = P ? { x: W / 2, y: H * 0.56 } : { x: Math.max(W * 0.56, 190 + L.cupR * 1.4), y: H * 0.58 };
    L.farY = P ? H * 0.34 : H * 0.36;                 // the counter's back edge on screen
    L.ticket = P ? { x: 14, y: 14, w: W - 28, h: 104 } : { x: W - 270, y: 12, w: 256, h: 108 };
    const T = L.ticket;
    L.offerWatch = { x: T.x + T.w - 168, y: T.y + T.h - 32, w: 84, h: 26 };
    L.offerSkip = { x: T.x + T.w - 78, y: T.y + T.h - 32, w: 68, h: 26 };
    L.serve = P ? { x: W / 2 + 6, y: H - 70, w: W / 2 - 20, h: 52 } : { x: 18, y: H - 70, w: 156, h: 52 };
    L.show = P ? { x: 14, y: H - 70, w: W / 2 - 20, h: 52 } : { x: 18, y: H - 128, w: 156, h: 46 };
    L.meter = P ? { x: 14, y: H - 96, w: W - 28, h: 12 } : { x: 18, y: H - 154, w: 156, h: 12 };
    L.barista = P ? { x: W * 0.8, y: L.farY } : { x: W * 0.16, y: L.farY };
    needBuild = true;
  }
  layout();
  view.onResize = layout;

  /* ── surface ↔ screen ───────────────────────────────────────────────── */
  let cupWorld = null, rw = 1, topY = 0;
  /** View point → surface coords (u right, v toward the customer; the cup is the unit disc). */
  function toSurface(p) {
    const w = s3.at(p.x, p.y, topY);
    return { u: (w.x - cupWorld.x) / rw, v: (w.z - cupWorld.z) / rw };
  }
  function toView(u, v) { return s3.toView(new THREE.Vector3(cupWorld.x + u * rw, topY, cupWorld.z + v * rw)); }

  /* ── orders ─────────────────────────────────────────────────────────── */
  function refFor(p) { if (!refs.has(p.key)) refs.set(p.key, simulate(p)); return refs.get(p.key); }
  const faces = new Map();
  function faceImg(who) {
    if (faces.has(who.seed)) return faces.get(who.seed);
    const img = new Image();
    img.src = portrait(s3.renderer, { species: who.species, outfit: who.outfit, seed: who.seed });
    faces.set(who.seed, img);
    return img;
  }
  function nextOrder() {
    const k = clamp(ctx.elapsed() / ctx.seconds, 0, 1);
    const top = served < 1 ? 0 : served < 2 ? 1 : k < 0.3 ? 2 : 3;
    const pool = PATTERNS.filter((p) => p.level <= top);
    // lean toward the newest pattern you've unlocked
    const pattern = Math.random() < 0.45 ? pool[pool.length - 1] : pick(pool);
    const r = Math.random;
    const who = { species: pick(SPECIES), seed: 'latte' + Math.floor(r() * 1e6), outfit: casualOutfit(r) };
    order = { pattern, who, t: 0 };
    refFor(pattern);
    freshCup();
    // stuck on this one? offer to show how (it's the player's call)
    offer = (misses.get(pattern.key) || 0) >= 2;
    if (offer) misses.set(pattern.key, 0);
    state = 'pour';
    hint = `New order: ${pattern.name}`;
    ctx.sfx.pop(); ctx.sfx.work('espresso', { dur: 0.6, vol: 0.4 });
  }
  function freshCup() { surface.clear(); milk = MILK; dirty = true; verdict = null; }

  /* ── pouring ────────────────────────────────────────────────────────── */
  function beginPour(p) {
    if (state !== 'pour' || milk <= 0) return;
    pouring = true; offer = false; hint = '';
    aim = pitcherPoint(p); spout = toSurface(aim); lastSpout = spout;
    barista?.loop('pour');
    ctx.sfx.work('pour', { dur: 0.6, vol: 0.35 });
  }
  function endPour() {
    if (!pouring) return;
    pouring = false; surface.lift();
    barista?.loop(null);
    if (milk <= 0) serve();
  }
  /** On a phone the stream lands just above your fingertip, so you can see it. */
  function pitcherPoint(p) { return { x: p.x, y: p.y - (p.e?.pointerType === 'touch' ? 46 : 0) }; }

  function serve() {
    if (state !== 'pour' || !order) return;
    if (surface.poured < 0.15) { pops.add('Pour some milk first', L.cup.x, L.cup.y - L.cupR - 20, C.muted, 15); return; }
    pouring = false; surface.lift();
    const pat = order.pattern;
    const res = judge(surface, refFor(pat), pat), rating = rate(res.score, pat);
    const bonus = pat.bonus && (rating.key === 'good' || rating.key === 'perfect') ? pat.bonus : 0;
    const pts = rating.pts + bonus;
    const reason = res.faults[0] || res.notes[0] || (rating.key === 'perfect' ? 'Beautiful!' : rating.key === 'good' ? 'Close: just tidy the shape' : `Doesn’t look like a ${pat.name.toLowerCase()} yet`);
    verdict = { rating, pts, bonus, reason, mine: surface.copy(), t: 0 };
    state = 'judged'; offer = false;
    served++;
    ctx.add(pts);
    cups.push({ name: pat.name, rating, pts });
    seen.add(pat.key);
    const key = pat.key;
    if (rating.key === 'fail' || rating.key === 'poor') { misses.set(key, (misses.get(key) || 0) + 1); struggled.add(key); } else misses.set(key, 0);
    const tone = rating.key === 'perfect' ? C.leafD : rating.key === 'good' ? C.seaD : C.berryD;
    pops.add(`${rating.name}${pts ? ` +${pts}` : ''}`, L.cup.x, L.cup.y - L.cupR * 0.9, tone, 24);
    if (rating.key === 'perfect') { ctx.sfx.good(4); ctx.sfx.serve(); barista?.play('cheer', 1.2); }
    else if (rating.key === 'good') { ctx.sfx.good(2); ctx.sfx.serve(); barista?.hop(0.6); }
    else { ctx.sfx.miss(); barista?.wobble(0.8); }
    nextT = NEXT;
  }

  /* ── the demo: the barista pours it for you on a fresh cup ─────────── */
  function startDemo(auto = false) {
    if (!order || state === 'demo') return;
    freshCup();
    pouring = false;
    demo = { tl: timeline(order.pattern.pour), t: -0.6, auto, last: null };
    state = 'demo'; offer = false;
    hint = auto ? 'Let me show you how…' : '';
    ctx.freeze?.(true);   // learning costs no time
  }
  function stepDemo(dt) {
    demo.t += dt;
    const tl = demo.tl;
    if (demo.t < 0) return;
    if (demo.t > tl.total + 1.4) {          // done: wipe it and hand over
      demo = null; freshCup(); state = 'pour'; hint = 'Your turn!';
      ctx.freeze?.(false);
      return;
    }
    const p = tl.at(Math.min(demo.t, tl.total));
    const sp = { u: p.u, v: p.v };
    if (demo.t <= tl.total && p.pouring) {
      const last = demo.last || sp;
      surface.pour(dt, sp.u, sp.v, (sp.u - last.u) / dt, (sp.v - last.v) / dt); dirty = true;
    } else surface.lift();
    demo.pouring = demo.t <= tl.total && p.pouring;
    demo.last = sp; demo.say = p.say;
    spout = sp;
  }

  /* ── input ──────────────────────────────────────────────────────────── */
  let downOnCup = false;
  const offPointer = pointer(st, {
    down: (p) => {
      if (ctx.over) return;
      if (inRect(p, L.serve)) { serve(); return; }
      if (inRect(p, L.show)) { if (state === 'pour') startDemo(false); return; }
      if (offer && inRect(p, L.offerWatch)) { startDemo(true); return; }
      if (offer && inRect(p, L.offerSkip)) { offer = false; ctx.sfx.click(); return; }
      if (state !== 'pour') return;
      downOnCup = true;
      beginPour(p);
    },
    move: (p) => { if (state === 'pour') { aim = pitcherPoint(p); kbAim = null; } },
    up: () => { downOnCup = false; endPour(); },
  });
  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const onKey = (e) => {
    if (ctx.over || ctx.paused) return;
    if (ARROWS[e.key]) { e.preventDefault(); keys.add(e.key); kbUsed = true; if (!kbAim) kbAim = aim ? { ...aim } : { x: L.cup.x, y: L.cup.y }; aim = kbAim; return; }
    if (e.key === ' ') { e.preventDefault(); if (!e.repeat && state === 'pour') { kbUsed = true; if (!kbAim) kbAim = aim ? { ...aim } : { x: L.cup.x, y: L.cup.y }; beginPour(kbAim); } return; }
    if (e.key === 'Enter') { e.preventDefault(); serve(); return; }
    if (e.key.toLowerCase() === 'h') { e.preventDefault(); if (state === 'pour') startDemo(offer); }
  };
  const onKeyUp = (e) => {
    if (ARROWS[e.key]) keys.delete(e.key);
    if (e.key === ' ') endPour();
  };
  let shiftHeld = false;
  const onShift = (e) => { shiftHeld = e.shiftKey; };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('keydown', onShift);
  window.addEventListener('keyup', onShift);

  /* ── update ─────────────────────────────────────────────────────────── */
  function step(dt) {
    clock += dt;
    if (state === 'wait' || state === 'judged') {
      if (verdict) verdict.t += dt;
      nextT -= dt;
      if (nextT <= 0) nextOrder();
    }
    if (order) order.t += dt;
    if (state === 'demo') stepDemo(dt);
    // keyboard: the arrows move the pitcher; Shift moves it fast enough for a pull-through
    if (state === 'pour' && keys.size && kbAim) {
      let dx = 0, dy = 0;
      for (const k of keys) { dx += ARROWS[k][0]; dy += ARROWS[k][1]; }
      const len = Math.hypot(dx, dy) || 1, sp = L.cupR * (shiftHeld ? 3.6 : 1.1) * dt;
      kbAim.x = clamp(kbAim.x + dx / len * sp, L.cup.x - L.cupR * 1.05, L.cup.x + L.cupR * 1.05);
      kbAim.y = clamp(kbAim.y + dy / len * sp, L.cup.y - L.cupR * 1.05, L.cup.y + L.cupR * 1.05);
      aim = kbAim;
    }
    if (state === 'pour' && pouring && aim) {
      const sp = toSurface(aim);
      const vu = (sp.u - lastSpout.u) / dt, vv = (sp.v - lastSpout.v) / dt;
      surface.pour(dt, sp.u, sp.v, clamp(vu, -12, 12), clamp(vv, -12, 12)); dirty = true;
      lastSpout = sp; spout = sp;
      milk = Math.max(0, milk - dt);
      if (milk <= 0) endPour();
    }
    pops.update(dt);
  }

  /* ── 3D ─────────────────────────────────────────────────────────────── */
  let barista = null, cup = null, surf = null, tex = null, jug = null, stream = null;

  function box3(w, h, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat({ color }));
    m.userData.ownGeometry = true; m.castShadow = m.receiveShadow = true;
    return m;
  }
  function build() {
    world.clear();
    const { W, H } = view;
    const far = s3.at(0, L.farY, 0).z, near = s3.at(0, H + 60, 0).z;
    // the counter (its top is y = 0), the floor and wall behind it
    const ct = box3(W / SCALE + 2, COUNTER, near - far, '#c98f5a'); ct.position.set(W / SCALE / 2, -COUNTER / 2, (far + near) / 2); world.add(ct);
    const top = box3(W / SCALE + 2.04, 0.05, near - far + 0.04, '#e4b583'); top.position.set(W / SCALE / 2, -0.02, (far + near) / 2); world.add(top);
    const floor = s3.floor('checker', { size: 0.45 }); floor.position.y = -COUNTER; world.add(floor);
    const wall = s3.wall({ y: L.farY - 1.6 * s3.sinE * SCALE }); wall.position.y -= COUNTER; world.add(wall);
    // the cup: radius rw so the surface fills the view circle
    cupWorld = s3.at(L.cup.x, L.cup.y, 0);
    rw = L.cupR / SCALE;
    topY = 0.645 * rw;
    // re-aim so the surface (not the saucer) is centred where the layout wants it
    cupWorld = s3.at(L.cup.x, L.cup.y, topY); cupWorld.y = 0;
    cup = model('latte:cup'); cup.scale.setScalar(rw); cup.position.copy(cupWorld); cup.rotation.y = -0.4; world.add(cup);
    tex = new THREE.DataTexture(texData, TEX, TEX, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.flipY = false;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    mat.userData.outlineParameters = { visible: false };
    surf = new THREE.Mesh(new THREE.CircleGeometry(rw * 1.0, 64), mat);
    surf.userData.ownGeometry = true;
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(cupWorld.x, topY + 0.004, cupWorld.z);
    world.add(surf);
    dirty = true;
    // the pitcher and its stream
    jug = model('latte:pitcher'); jug.scale.setScalar(rw * 0.95); world.add(jug);
    stream = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * rw, 0.05 * rw, 1, 10), toonMat({ color: '#fdf6e8' }));
    stream.userData.ownGeometry = true; stream.visible = false; world.add(stream);
    // the barista behind the counter
    if (barista) s3.dropCritter(barista);
    barista = s3.critter({ ...ctx.critter, scale: 0.9 });
    const spot = s3.at(L.barista.x, L.farY, 0); barista.setPosition(spot.x, -COUNTER, spot.z - 0.45);
    barista.object.rotation.y = 0.35; barista.targetHeading = 0.35;
  }

  /** Foam field → the surface texture (crema darkens toward the rim). */
  function paint() {
    for (let j = 0; j < TEX; j++) {
      const y = (j + 0.5) / TEX * 2 - 1;
      for (let i = 0; i < TEX; i++) {
        // texture rows run from the near side (v = 0 at the customer's edge after the disc is laid flat)
        const x = (i + 0.5) / TEX * 2 - 1, o = ((TEX - 1 - j) * TEX + i) * 4;
        const r2 = x * x + y * y;
        const rim = clamp((r2 - 0.55) / 0.45, 0, 1);
        const f = clamp((surface.sample(x * 0.995, y * 0.995) - 0.32) / 0.36, 0, 1), fo = f * f * (3 - 2 * f);
        for (let c = 0; c < 3; c++) {
          const cr = lerp(CREMA[c], CREMA_RIM[c], rim);
          texData[o + c] = lerp(cr, FOAM[c], fo);
        }
        texData[o + 3] = 255;
      }
    }
    tex.needsUpdate = true;
    dirty = false;
  }

  const UP = new THREE.Vector3(0, 1, 0);
  function placeJug() {
    const active = state === 'demo' ? demo && demo.t >= 0 : state === 'pour';
    jug.visible = !!active;
    stream.visible = false;
    if (!active) return;
    let sp = spout, isPouring = false;
    if (state === 'demo') isPouring = !!demo.pouring;
    else { if (aim) sp = toSurface(aim); isPouring = pouring; }
    if (!sp) sp = { u: 0.15, v: -0.2 };
    const land = new THREE.Vector3(cupWorld.x + sp.u * rw, topY, cupWorld.z + sp.v * rw);
    // the jug hangs up and behind the spot it pours on, tipping forward as it pours
    const tilt = isPouring ? 0.75 : 0.35;
    jug.position.set(land.x + 0.06 * rw, land.y + (isPouring ? 0.32 : 0.48) * rw, land.z - 0.42 * rw);
    jug.rotation.set(tilt, 0, 0);
    if (isPouring) {
      const tip = jug.localToWorld(new THREE.Vector3(0, 0.52, 0.34));
      const dir = land.clone().sub(tip), len = dir.length();
      stream.visible = true;
      stream.scale.set(1, len, 1);
      stream.position.copy(tip).addScaledVector(dir, 0.5);
      stream.quaternion.setFromUnitVectors(UP, dir.normalize());
    }
  }

  function draw() {
    if (needBuild) { needBuild = false; build(); }
    if (dirty) paint();
    placeJug();
    s3.render();

    /* overlay */
    s3.begin2d();
    const P = L.portrait;
    // the order ticket: who, what, and what it should look like — or, just after
    // serving, the verdict: your cup beside the target, the grade and why
    if (order) {
      const T = L.ticket;
      const slide = ease(clamp(order.t / 0.35, 0, 1));                 // a new order slides in
      g.save(); g.translate((1 - slide) * (T.w + 30), 0);
      box(g, T.x, T.y, T.w, T.h, { fill: '#fffaf0', stroke: verdict ? toneOf(verdict.rating) : C.line, r: 14, shadow: 4, lw: verdict ? 3 : 2 });
      const tr = Math.min(36, T.h / 2 - 14);
      if (verdict && state === 'judged') {
        const vr = Math.min(28, tr), ox = T.x + 2 * vr + 26 + vr * 0.7;
        drawThumb(verdict.mine, T.x + 10 + vr, T.y + 14 + vr, vr);
        drawThumb(refFor(order.pattern), ox, T.y + 14 + vr, vr * 0.7);
        text(g, 'yours', T.x + 10 + vr, T.y + 2 * vr + 30, { size: 10, color: C.muted, weight: 800 });
        text(g, 'order', ox, T.y + 2 * vr + 30, { size: 10, color: C.muted, weight: 800 });
        const tx = ox + vr * 0.7 + 12;
        text(g, `${verdict.rating.name}${verdict.pts ? `  +${verdict.pts}` : ''}`, tx, T.y + 28, { size: 19, color: toneOf(verdict.rating), weight: 800, align: 'left' });
        if (verdict.bonus) text(g, `incl. +${verdict.bonus} ${order.pattern.name} bonus`, tx, T.y + 46, { size: 10.5, color: C.muted, weight: 800, align: 'left' });
        wrapText(verdict.reason, tx, T.y + (verdict.bonus ? 64 : 52), T.x + T.w - tx - 8, 13, 3, 12, C.ink);
      } else {
        drawThumb(refFor(order.pattern), T.x + 10 + tr, T.y + 12 + tr, tr);
        const tx = T.x + tr * 2 + 24, img = faceImg(order.who);
        if (img.complete) { g.save(); rr(g, tx, T.y + 8, 28, 28, 14); g.clip(); g.drawImage(img, tx, T.y + 8, 28, 28); g.restore(); }
        text(g, 'would like a', tx + 35, T.y + 22, { size: 11, color: C.muted, weight: 800, align: 'left' });
        text(g, order.pattern.name, tx, T.y + 50, { size: 18, color: C.ink, weight: 800, align: 'left' });
        if (offer) {
          text(g, 'Stuck? Want me to show you?', tx, T.y + 66, { size: 11, color: C.seaD, weight: 800, align: 'left' });
          smallButton(L.offerWatch, 'Watch', C.sea, C.seaD, '#fff');
          smallButton(L.offerSkip, 'Skip', '#fff', C.line, C.muted);
        } else if (!seen.has(order.pattern.key) || struggled.has(order.pattern.key)) {
          wrapText(order.pattern.tip, tx, T.y + 68, T.x + T.w - tx - 8, 12, 3);
        }
      }
      g.restore();
    }
    // the demo's captions
    if (state === 'demo' && demo) {
      // captions below the cup, clear of the ticket
      const msg = demo.t < 0 ? hint || 'Watch the barista…' : demo.say || 'Watch the barista…';
      chip(msg, L.cup.x, Math.min(view.H - 20, L.cup.y + L.cupR * 0.95 + 30), C.seaD);
    } else if (state === 'pour' && hint) {
      chip(hint, L.cup.x, Math.min(view.H - 20, L.cup.y + L.cupR * 0.95 + 30), C.leafD);
      if (surface.poured > 0.3) hint = '';
    }
    // milk left
    const M = L.meter, k = milk / MILK;
    box(g, M.x, M.y, M.w, M.h, { fill: '#fff', r: M.h / 2, stroke: C.line, lw: 2 });
    if (k > 0.02) box(g, M.x + 2, M.y + 2, (M.w - 4) * k, M.h - 4, { fill: k < 0.25 ? C.berry : C.sea, r: (M.h - 4) / 2 });
    text(g, 'Milk left', M.x, M.y - 9, { size: 11, color: C.muted, weight: 800, align: 'left' });
    // buttons
    const canServe = state === 'pour' && surface.poured >= 0.15;
    button(L.serve, 'Serve', canServe ? C.leaf : '#d8cbbb', canServe ? C.leafD : '#bfae98', '#fff');
    button(L.show, 'Show me', state === 'pour' ? '#fff' : '#f2ebe0', C.line, state === 'pour' ? C.seaD : C.muted);
    // keyboard players get the keys spelled out
    if (!P) text(g, kbUsed ? 'Arrows move · Shift + arrow = quick pull · hold Space to pour · Enter serves · H shows how' : 'Keyboard: arrows move, hold Space to pour, Enter serves, H shows how', view.W / 2 + 80, view.H - 10, { size: 11, color: C.muted, weight: 700, stroke: '#fff' });
    pops.draw(g);
    // first-time hint
    if (ctx.elapsed() < 7 && state === 'pour' && surface.poured < 0.2 && !hint) {
      chip(P ? 'Hold on the cup to pour' : 'Hold on the cup to pour, and move to draw', L.cup.x, Math.min(view.H - 20, L.cup.y + L.cupR * 0.95 + 30), C.ink);
    }
  }

  function toneOf(r) { return r.key === 'perfect' ? C.leafD : r.key === 'good' ? C.seaD : C.berryD; }
  function smallButton(r, label, fill, edge, ink) {
    box(g, r.x, r.y, r.w, r.h, { fill, stroke: edge, r: r.h / 2, lw: 2 });
    text(g, label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size: 13, color: ink, weight: 800 });
  }
  function button(r, label, fill, edge, ink) {
    box(g, r.x, r.y, r.w, r.h, { fill, stroke: edge, r: r.h / 2, lw: 3, shadow: 4 });
    text(g, label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size: 17, color: ink, weight: 800 });
  }
  function chip(msg, x, y, color) {
    g.save(); g.font = '800 14px Fredoka, Nunito, system-ui, sans-serif';
    const w = Math.min(view.W - 20, g.measureText(msg).width + 28); g.restore();
    box(g, clamp(x - w / 2, 10, view.W - w - 10), y - 15, w, 30, { fill: '#fffaf0', stroke: color, r: 15, lw: 2 });
    text(g, msg, clamp(x, w / 2 + 10, view.W - w / 2 - 10), y, { size: 14, color, weight: 800 });
  }
  /** Wrapped text that stays inside its box: at most `lines` lines, the last one cut with "…". */
  function wrapText(str, x, y, w, lh, lines = 2, size = 10.5, color = C.muted) {
    g.save(); g.font = `700 ${size}px Nunito, system-ui, sans-serif`;
    const out = []; let line = '';
    for (const wd of str.split(' ')) { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > w && line) { out.push(line); line = wd; } else line = t; }
    if (line) out.push(line);
    if (out.length > lines) { out.length = lines; let last = out[lines - 1]; while (last && g.measureText(last + '…').width > w) last = last.slice(0, -1); out[lines - 1] = last.replace(/[\s,.;:]+$/, '') + '…'; }
    g.restore();
    out.forEach((l, i) => text(g, l, x, y + i * lh, { size, color, weight: 700, align: 'left' }));
  }
  /** A little picture of what the pattern should look like. */
  const thumbs = new Map();
  function drawThumb(ref, cx, cy, r) {
    let c = thumbs.get(ref);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = 72;
      const tg = c.getContext('2d'), img = tg.createImageData(72, 72);
      for (let y = 0; y < 72; y++) for (let x = 0; x < 72; x++) {
        const u = (x + 0.5) / 72 * 2 - 1, v = (y + 0.5) / 72 * 2 - 1, o = (y * 72 + x) * 4;
        if (u * u + v * v >= 1) { img.data[o + 3] = 0; continue; }
        const f = clamp((ref.sample(u, v) - 0.3) / 0.4, 0, 1);
        for (let k = 0; k < 3; k++) img.data[o + k] = lerp(CREMA[k], FOAM[k], f);
        img.data[o + 3] = 255;
      }
      tg.putImageData(img, 0, 0);
      thumbs.set(ref, c);
    }
    circle(g, cx, cy, r + 4, '#fff', C.line, 2);
    g.drawImage(c, cx - r, cy - r, r * 2, r * 2);
  }

  return {
    update(dt) { if (!ctx.over) step(dt); else pops.update(dt); },
    draw,
    end() { pouring = false; ctx.freeze?.(false); },
    /** For automated play-tests. */
    peek() {
      return {
        view: { ...view }, L, state, milk, served, pattern: order?.pattern.key, offer,
        cupView: (u, v) => (cupWorld ? toView(u, v) : null),
        pour: order ? order.pattern.pour : null, verdict: verdict && { rating: verdict.rating.key, faults: verdict.faults },
      };
    },
    /** Each cup this shift, for the results card. */
    recap() { return cups.map((c) => ({ label: c.name, value: `${c.rating.name.replace('!', '')}${c.pts ? ` +${c.pts}` : ''}`, tone: c.rating.key === 'perfect' ? 'good' : c.rating.key === 'good' ? 'ok' : 'bad' })); },
    destroy() {
      offPointer(); ctx.freeze?.(false);
      for (const [ev, fn] of [['keydown', onKey], ['keyup', onKeyUp], ['keydown', onShift], ['keyup', onShift]]) window.removeEventListener(ev, fn);
      s3.destroy();
    },
  };
}
