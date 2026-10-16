/**
 * Line Cook — "Keep the Line Moving". A rhythm game: plates step down the
 * line one station per beat. Each plate is missing an ingredient (later, two);
 * tap it in while the plate sits at your station. The beat speeds up as the
 * shift goes on. Score = plates completed.
 *
 * The line runs left → right on wide screens and top → bottom on phones, so
 * there's always a few plates' warning before one reaches you. Drawn in the
 * restaurant's 3D toon style; the tickets and notes are the 2D overlay.
 */
import { pointer, C, text, rr, circle, lerp, ease, clamp, inRect, pick, shuffle, Pops } from '../kit.js';
import { stage3d } from '../kit3d.js';
import { model, icon } from '../models.js';
import * as THREE from 'three';
import { toonMat, glowMat, gradientMap } from '../../three/toon.js';

const PANTRY = [
  { kind: 'tomato', name: 'Tomato' }, { kind: 'cheese', name: 'Cheese' },
  { kind: 'lettuce', name: 'Lettuce' }, { kind: 'bacon', name: 'Bacon' },
];
const DISHES = [
  { kind: 'burger', needs: ['cheese', 'lettuce', 'tomato', 'bacon'] },
  { kind: 'taco', needs: ['lettuce', 'cheese', 'tomato'] },
  { kind: 'salad', needs: ['lettuce', 'tomato', 'cheese'] },
  { kind: 'toast', needs: ['bacon', 'tomato', 'cheese'] },
  { kind: 'pizza', needs: ['cheese', 'tomato', 'bacon'] },
];
const SLOT = 104;          // distance between stations on the line (view units)
const START_BEAT = 1.09;   // seconds per beat at the start…
const END_BEAT = 0.56;     // …and at the end
const SCALE = 150;         // view units per metre
const TOP = 0.72;          // counter / belt height (m): low, so the cook shows over it
const FOOD = 2.1;          // food and plates are drawn larger than life

export default function create(ctx) {
  const s3 = stage3d(ctx.el, { scale: SCALE, quality: ctx.quality });
  const st = s3.ui, view = s3.view, g = s3.g;
  const pops = new Pops();
  let plates = [];
  let beat = 0;            // beats so far
  let sinceBeat = 0;       // seconds into the current beat
  let streak = 0;
  let flash = null;        // { tone, t }
  let pressed = null;      // { i, t } bin feedback
  let flying = [];         // ingredients flying from bin to plate
  let bins = [];

  const beatLen = () => lerp(START_BEAT, END_BEAT, clamp(ctx.elapsed() / ctx.seconds, 0, 1));

  /* layout in view units: `s` is distance along the line */
  const L = {};
  function layout() {
    const { W, H } = view;
    L.vertical = view.portrait;
    const cols = PANTRY.length, rows = 1;
    const bw = Math.min(L.vertical ? 96 : 120, (W - 32 - (cols - 1) * 10) / cols), bh = L.vertical ? 74 : 84;
    const top = H - 14 - rows * bh - (rows - 1) * 10;
    const left = (W - (cols * bw + (cols - 1) * 10)) / 2;
    bins = PANTRY.map((p, i) => ({ ...p, x: left + (i % cols) * (bw + 10), y: top + Math.floor(i / cols) * (bh + 10), w: bw, h: bh }));
    L.binTop = top;
    if (L.vertical) {
      L.cross = W * 0.38;                    // x of the belt
      L.length = top - 40;
      L.zoneSlot = Math.max(3, Math.floor((L.length - 60) / SLOT));
    } else {
      L.cross = H * 0.4;                     // y of the belt
      L.length = W;
      L.zoneSlot = Math.max(3, Math.round((W * 0.62) / SLOT));
    }
    L.slots = Math.ceil(L.length / SLOT) + 2;
    L.zoneS = L.zoneSlot * SLOT - SLOT / 2;
    L.zone = at(L.zoneS);
    build();
  }
  /** Point on the line at distance s. */
  function at(s) { return L.vertical ? { x: L.cross, y: s } : { x: s, y: L.cross }; }

  /* ── the 3D kitchen ─────────────────────────────────────────────────── */
  const world = new THREE.Group();
  s3.add(world);
  let belt = null, beltTex = null, lamp = null, stationMat = null, tubs = [], cook = null;
  const plateMeshes = new Map();

  function box3(w, h, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat({ color }));
    m.userData.ownGeometry = true; m.castShadow = m.receiveShadow = true;
    return m;
  }
  /** World depth (m) that covers `units` of screen height on a level surface. */
  const depth = (units) => units / (SCALE * Math.sin(s3.elevation));

  function build() {
    world.clear();
    tubs = [];
    const { W, H } = view;
    // floor and (on wide screens) a tiled back wall
    world.add(s3.floor('checker', { size: 0.4 }));
    if (!L.vertical) world.add(s3.wall({ y: L.cross - 120 }));   // just behind the cook
    // the belt: a steel body with a moving rubber top
    beltTex = beltTexture();
    const bandUnits = 68;
    if (!L.vertical) {
      const len = W / SCALE + 1, d = depth(bandUnits), c = s3.at(W / 2, L.cross, TOP);
      const body = box3(len, TOP, d + 0.12, '#9aa7b1'); body.position.set(c.x, TOP / 2, c.z); world.add(body);
      belt = new THREE.Mesh(new THREE.PlaneGeometry(len, d), new THREE.MeshToonMaterial({ map: beltTex, gradientMap: gradientMap() }));
      belt.rotation.x = -Math.PI / 2; belt.position.set(c.x, TOP + 0.002, c.z);
      beltTex.repeat.set(len / 0.18, 1);
    } else {
      const len = depth(L.length + 40), w = bandUnits / SCALE, c = s3.at(L.cross, (L.length - 40) / 2, TOP);
      const body = box3(w + 0.12, TOP, len, '#9aa7b1'); body.position.set(c.x, TOP / 2, c.z); world.add(body);
      beltTex = beltTexture(true);
      belt = new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshToonMaterial({ map: beltTex, gradientMap: gradientMap() }));
      belt.rotation.x = -Math.PI / 2; belt.position.set(c.x, TOP + 0.002, c.z);
      beltTex.repeat.set(1, len / 0.18);
    }
    world.add(belt);
    // your station: a warm patch on the belt under a heat lamp
    stationMat = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.35, depthWrite: false });
    stationMat.userData.outlineParameters = { visible: false };
    const patch = new THREE.Mesh(new THREE.PlaneGeometry((SLOT - 10) / SCALE, depth(84)), stationMat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.copy(s3.at(L.zone.x, L.zone.y, TOP + 0.004));
    world.add(patch);
    lamp = new THREE.Group();
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 18), toonMat({ color: C.berry }));
    shade.userData.ownGeometry = true;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), glowMat('#ffd27a'));
    bulb.position.y = -0.08; bulb.userData.ownGeometry = true;
    const cord = box3(0.015, 3, 0.015, '#5c6670'); cord.position.y = 1.6;
    lamp.add(shade, bulb, cord);
    lamp.position.copy(s3.under(L.zone.x, L.zone.y, TOP)); lamp.position.y = TOP + 1.45;
    lamp.userData.bulb = bulb;
    // Seen from above on a phone the lamp would hide the station: wide screens only.
    if (!L.vertical) world.add(lamp);
    // the cook, in the uniform their role wears
    if (cook) s3.dropCritter(cook);
    cook = s3.critter({ ...ctx.critter, scale: L.vertical ? 0.8 : 1 });
    if (!L.vertical) {
      const p = s3.under(L.zone.x - 78, L.cross - 78, TOP);
      cook.setPosition(p.x, 0, p.z); cook.object.rotation.y = 0;
    } else {
      const p = s3.at(Math.min(view.W - 50, L.cross + 150), L.zone.y + 40, 0);
      cook.setPosition(p.x, 0, p.z); cook.object.rotation.y = -0.6;
    }
    cook.targetHeading = cook.object.rotation.y;
    // the pass counter in front, with an ingredient tub per bin
    const bt = L.binTop - 16, bb = H + 40, c = s3.at(W / 2, (bt + bb) / 2, TOP);
    const front = box3(W / SCALE + 1, TOP, depth(bb - bt), '#c98f5a'); front.position.set(c.x, TOP / 2, c.z); world.add(front);
    const topSlab = box3(W / SCALE + 1.04, 0.05, depth(bb - bt) + 0.04, '#e4b583'); topSlab.position.set(c.x, TOP + 0.02, c.z); world.add(topSlab);
    for (const b of bins) {
      const tub = model('tub', { w: 0.26, d: 0.2 });
      const k = (b.w * 0.82 / SCALE) / 0.26;
      tub.scale.setScalar(k);
      tub.position.copy(s3.at(b.x + b.w / 2, b.y + b.h * 0.56, TOP + 0.045));
      const food = model(b.kind); food.scale.setScalar(FOOD * 1.05); food.position.y = 0.066;
      food.scale.divideScalar(k);
      tub.add(food);
      world.add(tub);
      tubs.push(tub);
    }
    for (const m of plateMeshes.values()) world.add(m);
  }

  layout();
  view.onResize = layout;

  /* plates */
  function newPlate() {
    const dish = pick(DISHES);
    const two = ctx.elapsed() > ctx.seconds * 0.4 && Math.random() < 0.35;
    const shown = shuffle(dish.needs).slice(0, Math.min(dish.needs.length, 4));
    const missing = shown.slice(0, two ? 2 : 1);
    return { dish, items: shuffle(shown), missing: new Set(missing), added: new Set(), slot: -1, from: -1, state: 'line' };
  }

  function plateMesh(p) {
    let m = plateMeshes.get(p);
    if (!m) {
      m = new THREE.Group();
      const plate = model('plate'), dish = model(p.dish.kind);
      dish.position.y = 0.02;
      dish.rotation.y = Math.random() * 6;
      m.add(plate, dish);
      m.scale.setScalar(FOOD);
      plateMeshes.set(p, m);
      world.add(m);
    }
    return m;
  }

  const notePos = () => (L.vertical ? { x: L.zone.x + 100, y: L.zone.y - 70 } : { x: L.zone.x + 70, y: L.zone.y - 80 });

  function onBeat() {
    beat++;
    ctx.sfx.beat(beat, { accent: beat % 4 === 0 });
    for (const p of plates) {
      // Leaving the station unfinished counts as a miss.
      if (p.slot === L.zoneSlot && p.state === 'line') {
        p.state = 'missed'; streak = 0; ctx.sfx.miss(); flash = { tone: 'bad', t: 0 };
        cook?.wobble(1);
        const n = notePos(); pops.add('Missed!', n.x, n.y, C.berryD);
      }
      p.from = p.slot; p.slot++;
    }
    for (const p of plates) if (p.slot >= L.slots + 1) { plateMeshes.get(p)?.removeFromParent(); plateMeshes.delete(p); }
    plates = plates.filter((p) => p.slot < L.slots + 1);
    const late = ctx.elapsed() > ctx.seconds * 0.5;
    if (beat % 2 === 0 || (late && Math.random() < 0.4)) {
      const p = newPlate(); p.from = -1; p.slot = 0; plates.push(p);
    }
  }

  function plateS(p) {
    const k = ease(sinceBeat / Math.max(0.12, beatLen() * 0.38));
    return lerp(p.from * SLOT - SLOT / 2, p.slot * SLOT - SLOT / 2, k);
  }

  function atStation() { return plates.find((p) => p.slot === L.zoneSlot && p.state === 'line'); }

  function useBin(i) {
    if (ctx.over) return;
    const b = bins[i];
    pressed = { i, t: 0 };
    const p = atStation();
    const n = notePos();
    if (!p) { streak = 0; ctx.sfx.miss(); pops.add('Wait for a plate', b.x + b.w / 2, b.y - 8, C.muted, 15); return; }
    if (!p.missing.has(b.kind) || p.added.has(b.kind)) {
      p.state = 'ruined'; streak = 0; ctx.sfx.miss(); flash = { tone: 'bad', t: 0 };
      cook?.wobble(1);
      pops.add(`No ${b.name.toLowerCase()}!`, n.x, n.y, C.berryD);
      return;
    }
    p.added.add(b.kind);
    const fm = model(b.kind); fm.scale.setScalar(FOOD); world.add(fm);
    flying.push({ mesh: fm, from: s3.at(b.x + b.w / 2, b.y + b.h * 0.5, TOP + 0.15), t: 0, plate: p });
    ctx.sfx.work('chop', { vol: 0.6 });
    if (p.added.size === p.missing.size) {
      p.state = 'done'; streak++; ctx.add(1); ctx.sfx.good(streak); flash = { tone: 'good', t: 0 };
      cook?.hop(0.7);
      const onTime = sinceBeat < beatLen() * 0.55;
      pops.add(streak >= 5 ? `${streak} in a row!` : onTime ? 'On the beat!' : 'Order up!', n.x, n.y, C.leafD);
    }
  }

  const offPointer = pointer(st, {
    down: (p) => { const i = bins.findIndex((b) => inRect(p, b)); if (i >= 0) useBin(i); },
  });
  const onKey = (e) => { const n = Number(e.key); if (n >= 1 && n <= bins.length) { e.preventDefault(); useBin(n - 1); } };
  window.addEventListener('keydown', onKey);

  /* drawing */
  function draw() {
    const pulse = 1 - clamp(sinceBeat / 0.25, 0, 1);
    // 3D: plates ride the belt, the belt top scrolls, the lamp throbs on the beat
    for (const p of plates) {
      const m = plateMesh(p), q = at(plateS(p));
      m.visible = shown(p);
      m.position.copy(s3.at(q.x, q.y, TOP + 0.005));
      const dim = p.state === 'missed' || p.state === 'ruined';
      m.children[1].visible = !dim;
      m.rotation.z = dim ? 0.12 : 0;
    }
    if (plates.length) { const o = (plateS(plates[0]) / SCALE) / 0.18; if (L.vertical) beltTex.offset.y = o; else beltTex.offset.x = -o; }
    const tone = flash && flash.t < 0.35 ? (flash.tone === 'good' ? '#5fc293' : '#ff7a8a') : '#ffd166';
    stationMat.color.set(tone);
    stationMat.opacity = 0.28 + 0.3 * pulse;
    lamp.userData.bulb.scale.setScalar(1 + 0.35 * pulse);
    tubs.forEach((t, i) => { t.position.y = TOP + 0.045 - (pressed && pressed.i === i && pressed.t < 0.12 ? 0.04 : 0); });
    for (const f of flying) {
      const k = ease(f.t / 0.18), to = s3.at(at(plateS(f.plate)).x, at(plateS(f.plate)).y, TOP + 0.05);
      f.mesh.position.lerpVectors(f.from, to, k);
      f.mesh.position.y += Math.sin(k * Math.PI) * 0.35;
    }
    s3.render();

    // 2D: tickets, labels, beat dots, notes
    s3.begin2d();
    const { W } = view, V = L.vertical;
    for (const p of plates) if (shown(p)) drawTicket(p, at(plateS(p)));
    if (V) text(g, 'YOUR STATION', L.zone.x, L.zone.y + 62, { size: 11, color: C.ink, weight: 800, stroke: '#fff' });
    else text(g, 'YOUR STATION', L.zone.x, L.zone.y - 46, { size: 12, color: C.ink, weight: 800, stroke: '#fff' });
    const dots = 4, dot = V ? { x: W - 26, y: 22, dx: 0, dy: 22 } : { x: W / 2 - 33, y: 22, dx: 22, dy: 0 };
    for (let i = 0; i < dots; i++) circle(g, dot.x + i * dot.dx, dot.y + i * dot.dy, i === beat % dots ? 8 + 3 * pulse : 6, i === beat % dots ? C.berry : 'rgba(255,255,255,.85)', i === beat % dots ? null : C.line, 2);
    bins.forEach((b, i) => {
      text(g, V ? b.name : `${i + 1} · ${b.name}`, b.x + b.w / 2, b.y + b.h - 8, { size: 12, color: C.ink, weight: 800, stroke: '#fff' });
    });
    pops.draw(g);
  }

  function drawTicket(p, { x, y }) {
    const n = p.items.length, cell = 26;
    const tw = V2() ? 2 * cell + 10 : n * cell + 10, th = V2() ? Math.ceil(n / 2) * cell + 10 : cell + 10;
    const tx = V2() ? x - 50 - tw : x - tw / 2, ty = V2() ? y - th / 2 : y + 46;
    const dim = p.state === 'missed' || p.state === 'ruined';
    g.save(); if (dim) g.globalAlpha = 0.5;
    rr(g, tx, ty, tw, th, 8); g.fillStyle = '#fffaf0'; g.fill(); g.lineWidth = 2; g.strokeStyle = C.line; g.stroke();
    p.items.forEach((kind, i) => {
      const cx = tx + 5 + (V2() ? (i % 2) : i) * cell + cell / 2, cy = ty + 5 + (V2() ? Math.floor(i / 2) : 0) * cell + cell / 2;
      const need = p.missing.has(kind) && !p.added.has(kind);
      if (need) {
        g.setLineDash([3, 3]); circle(g, cx, cy, 11, '#fff', C.berry, 2); g.setLineDash([]);
        g.globalAlpha *= 0.4; g.drawImage(icon(s3.renderer, kind), cx - 11, cy - 11, 22, 22); g.globalAlpha /= 0.4;
      } else g.drawImage(icon(s3.renderer, kind), cx - 12, cy - 12, 24, 24);
    });
    if (p.state === 'done') text(g, '✓', tx + tw - 2, ty, { size: 22, color: C.leafD, weight: 800, stroke: '#fff' });
    if (dim) text(g, '✗', tx + tw - 2, ty, { size: 22, color: C.berryD, weight: 800, stroke: '#fff' });
    g.restore();
  }
  const V2 = () => L.vertical;
  /** Plates that have run off the end of the line (under the pass) aren't drawn. */
  const shown = (p) => plateS(p) < L.length - 20;

  return {
    start() { sinceBeat = 0; onBeat(); },
    update(dt) {
      if (dt > 0 && !ctx.over) {
        sinceBeat += dt;
        if (sinceBeat >= beatLen()) { sinceBeat -= beatLen(); onBeat(); }
      }
      pops.update(dt);
      if (flash) flash.t += dt;
      if (pressed) pressed.t += dt;
      for (const f of flying) f.t += dt;
      for (const f of flying) if (f.t >= 0.18) f.mesh.removeFromParent();
      flying = flying.filter((f) => f.t < 0.18);
    },
    draw,
    /** For automated play-tests: bin indexes the plate at your station still needs. */
    peek() { const p = atStation(); return p ? [...p.missing].filter((c) => !p.added.has(c)).map((c) => PANTRY.findIndex((x) => x.kind === c)) : []; },
    destroy() { offPointer(); window.removeEventListener('keydown', onKey); s3.destroy(); },
  };
}

/* textures */
function beltTexture(vertical = false) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#4f4a56'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#625c6a'; if (vertical) g.fillRect(0, 0, 64, 10); else g.fillRect(0, 0, 10, 64);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
