/**
 * The restaurant group's town. Every member's restaurant lines the loop
 * road around the plaza; rival groups trade across the river. Walk your
 * owner around, wave at whoever else is out, and peek into restaurants.
 */
import * as THREE from 'three';
import { Builder, textTexture, glowMat, blobShadow } from '../toon.js';
import { Character } from '../Character.js';
import { OUTFITS } from '../outfits.js';
import * as P from '../props.js';
import { FX } from '../fx.js';
import { el } from '../labels.js';
import { awningFor, rng } from '../../lexicon/names.js';

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const RING = 17;          // road ring half-size
const LOT = 25.5;         // where buildings sit
const RIVER_Z = -42;
const RIVAL_Z = -54;

function ownerOutfit(color) {
  return { ...OUTFITS.casual, shirt: color, sleeves: color, apron: '#fff7e8', apronStyle: 'waist', pants: '#4b4f5c', hold: null };
}

export class TownScene extends EventTarget {
  constructor({ me, group }) {
    super();
    this.me = me;
    this.group = group;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#bfe7f5');
    this.scene.fog = new THREE.Fog('#bfe7f5', 70, 150);
    this.fx = new FX(this.scene);
    this.lots = [];
    this.rivalLots = [];
    this.peers = new Map();
    this.ticks = [];
    this.keys = new Set();
    this.time = 0;
    this.r = rng('town');
    this.buildWorld();
    const [awn] = awningFor(me.id);
    this.avatar = new Character({ species: me.species, outfit: ownerOutfit(awn), seed: me.id, speed: 4.2, data: { me: true } });
    this.avatar.setPosition(0, 0, 10);
    this.scene.add(this.avatar.object);
    this.onKey = (e) => this.key(e);
  }

  /* ── world ────────────────────────────────────────────────────────────── */

  buildWorld() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight('#fff6e5', '#b9a3d6', 1.25));
    const sun = new THREE.DirectionalLight('#fff1d6', 2.0);
    sun.position.set(-20, 40, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 140 });
    sun.shadow.bias = -0.0008;
    s.add(sun);

    // ground
    const gtex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d'); g.fillStyle = '#9fd685'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 400; i++) { g.fillStyle = i % 3 ? '#8cc972' : '#b3e39b'; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 8); }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshToonMaterial({ map: gtex }));
    ground.material.userData.outlineParameters = { visible: false };
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true;
    s.add(ground);
    this.ground = ground;

    const b = new Builder();
    // road ring
    const roadC = '#7a7f8e', curb = '#e7e1d8';
    for (const sgn of [-1, 1]) {
      b.flat(RING * 2 + 4, 0.04, 4, roadC, { z: sgn * RING, y: 0.02 });
      b.flat(4, 0.04, RING * 2 + 4, roadC, { x: sgn * RING, y: 0.02 });
      b.flat(RING * 2 + 8, 0.06, 1.2, curb, { z: sgn * (RING + 2.6), y: 0.03 });
      b.flat(1.2, 0.06, RING * 2 + 8, curb, { x: sgn * (RING + 2.6), y: 0.03 });
      for (let i = -RING + 2; i < RING; i += 3) { b.flat(1.4, 0.05, 0.16, '#fff6d5', { x: i, z: sgn * RING, y: 0.03 }); b.flat(0.16, 0.05, 1.4, '#fff6d5', { x: sgn * RING, z: i, y: 0.03 }); }
    }
    // road to the bridge
    b.flat(4, 0.04, 22, roadC, { z: -RING - 11, y: 0.02 });
    // plaza
    b.cyl(11.5, 11.5, 0.08, '#efe3cf', { y: 0.04 }, 40);
    b.cyl(10.4, 10.4, 0.09, '#f7eddc', { y: 0.05 }, 40);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; b.flat(1.2, 0.1, 0.5, '#e8d3b5', { x: Math.cos(a) * 8.5, z: Math.sin(a) * 8.5, ry: -a, y: 0.06 }); }
    // fountain
    b.cyl(3.2, 3.4, 0.6, '#c9d3da', { y: 0.3 }, 28);
    b.cyl(2.8, 2.8, 0.62, '#8fd3f4', { y: 0.32 }, 28);
    b.cyl(0.4, 0.5, 1.6, '#c9d3da', { y: 1.0 });
    b.cyl(1.2, 0.9, 0.3, '#c9d3da', { y: 1.8 }, 20);
    b.cyl(1.0, 1.0, 0.31, '#8fd3f4', { y: 1.82 }, 20);
    // river
    b.flat(240, 0.03, 9, '#7cc6f2', { z: RIVER_Z, y: 0.01 });
    b.flat(240, 0.05, 0.8, '#e7e1d8', { z: RIVER_Z + 4.8, y: 0.03 });
    b.flat(240, 0.05, 0.8, '#e7e1d8', { z: RIVER_Z - 4.8, y: 0.03 });
    // bridge
    b.box(5, 0.5, 11, '#c98f5a', { z: RIVER_Z, y: 0.35 }, 0.1);
    for (const x of [-2.6, 2.6]) { b.box(0.3, 0.9, 11, '#9c6a3f', { x, z: RIVER_Z, y: 0.9 }, 0.08); }
    // rival district road
    b.flat(80, 0.04, 4, roadC, { z: RIVAL_Z + 4, y: 0.02 });
    const m = b.mesh({ shadow: false });
    m.receiveShadow = true;
    s.add(m);

    // fountain water jets
    const jets = [];
    for (let i = 0; i < 8; i++) {
      const j = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glowMat('#d8f3ff'));
      s.add(j); jets.push(j);
    }
    this.ticks.push((dt, t) => jets.forEach((j, i) => {
      const p = (t * 0.7 + i / 8) % 1; const a = i / 8 * Math.PI * 2;
      j.position.set(Math.cos(a) * p * 1.8, 2.0 + Math.sin(p * Math.PI) * 1.2, Math.sin(a) * p * 1.8);
    }));

    // decor
    const add = (o, x, z, ry = 0) => { o.position.set(x, 0, z); o.rotation.y = ry; s.add(o); if (o.userData.tick) this.ticks.push((dt, t) => o.userData.tick(dt, t)); return o; };
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; add(P.bench(), Math.cos(a) * 7, Math.sin(a) * 7, -a - Math.PI / 2); add(P.lampPost(), Math.cos(a) * 10.6, Math.sin(a) * 10.6); }
    for (const [x, z] of [[-36, 30], [36, 30], [-36, -30], [36, -30], [-12, 36], [14, 36], [-40, 0], [40, 2], [-22, -36], [24, -35], [-50, -20], [48, -18], [0, 38]]) add(P.tree(1.2 + this.r() * 0.6, this.r() * 4), x, z);
    for (let i = 0; i < 10; i++) add(P.tree(1 + this.r() * 0.4, this.r() * 4), -60 + i * 13, RIVAL_Z - 12);

    // noticeboard
    const nb = new Builder();
    nb.box(3.2, 2.0, 0.2, '#9c6a3f', { y: 2.0 }, 0.1);
    for (const x of [-1.4, 1.4]) nb.cyl(0.1, 0.1, 2.2, '#7a5232', { x, y: 1.1 });
    const board = nb.mesh();
    board.position.set(0, 0, 6.2);
    board.rotation.y = 0;
    s.add(board);
    const tex = textTexture(this.group?.name || 'Our Restaurant Group', { w: 1024, h: 320, bg: '#fff7e8', fg: '#5a3b2a', font: '700 110px Fredoka, system-ui, sans-serif', radius: 30 });
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.94), new THREE.MeshBasicMaterial({ map: tex }));
    plaque.material.userData.outlineParameters = { visible: false };
    plaque.position.set(0, 2.05, 6.32);
    s.add(plaque);

    // signpost to the rivals
    const sp = new Builder();
    sp.cyl(0.1, 0.1, 2.6, '#7a5232', { y: 1.3 });
    sp.box(2.6, 0.5, 0.12, '#ffd66b', { x: 0.9, y: 2.3 }, 0.08);
    const post = sp.mesh();
    post.position.set(3.5, 0, -RING - 6);
    s.add(post);
    const st = textTexture('Rivals → over the bridge', { w: 640, h: 128, bg: null, fg: '#5a3b2a', font: '700 52px Fredoka, system-ui, sans-serif' });
    const stm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.48), new THREE.MeshBasicMaterial({ map: st, transparent: true }));
    stm.material.userData.outlineParameters = { visible: false };
    stm.position.set(4.4, 2.3, -RING - 5.93);
    s.add(stm);
  }

  /** Lot positions around the ring, facing the road. */
  lotSlots() {
    const out = [];
    for (const x of [0, -11, 11]) out.push({ pos: V(x, LOT), ry: Math.PI });       // south, facing the road
    for (const z of [0, -11, 11]) out.push({ pos: V(LOT, z), ry: -Math.PI / 2 });  // east
    for (const z of [0, -11, 11]) out.push({ pos: V(-LOT, z), ry: Math.PI / 2 });  // west
    for (const x of [-11, 11]) out.push({ pos: V(x, -LOT), ry: 0 });              // north (the bridge road runs down the middle)
    return out;
  }

  building(m, opts = {}) {
    const [awn, stripe] = awningFor(m.planetId || m.id);
    const g = new THREE.Group();
    const b = new Builder();
    const w = 7.2, d = 5.5, h = 3.4;
    const wall = opts.rival ? '#e9dcff' : ['#fff1dd', '#ffe4ec', '#e6f7ff', '#eaffea'][Math.abs((m.planetId || m.id || '').length + (m.recipes || 0)) % 4];
    b.box(w, h, d, wall, { y: h / 2 }, 0.15);
    b.box(w + 0.4, 0.4, d + 0.4, awn, { y: h + 0.2 }, 0.1);
    b.box(w * 0.7, 1.0, d * 0.6, stripe === '#ffffff' ? '#f7efe5' : stripe, { y: h + 0.9 }, 0.15);
    b.box(1.4, 2.2, 0.2, '#9c6a3f', { y: 1.1, z: d / 2 + 0.02 }, 0.06);
    b.sphere(0.08, '#ffd23f', { x: 0.45, y: 1.1, z: d / 2 + 0.15 });
    for (const x of [-2.4, 2.4]) {
      b.box(1.8, 1.3, 0.12, '#c98f5a', { x, y: 1.7, z: d / 2 + 0.03 }, 0.05);
      b.box(1.55, 1.05, 0.14, '#bfe7ff', { x, y: 1.7, z: d / 2 + 0.04 }, 0.04);
      b.box(1.9, 0.35, 0.5, '#7cc96b', { x, y: 0.95, z: d / 2 + 0.3 }, 0.08);
      for (let i = 0; i < 4; i++) b.sphere(0.1, ['#ff8fab', '#ffd66b', '#ffffff', '#b18cf2'][i], { x: x - 0.6 + i * 0.4, y: 1.18, z: d / 2 + 0.35 });
    }
    // awning stripes
    for (let i = 0; i < 8; i++) b.box(w / 8, 0.06, 1.2, i % 2 ? stripe : awn, { x: -w / 2 + (i + 0.5) * w / 8, y: 2.85, z: d / 2 + 0.55, rx: 0.35 }, 0.01);
    const mesh = b.mesh();
    g.add(mesh);
    const sign = textTexture(m.restaurantName || 'Restaurant', { w: 1024, h: 180, bg: '#fff7e8', fg: '#5a3b2a', border: awn, font: '700 88px Fredoka, system-ui, sans-serif', radius: 40 });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 1.1), new THREE.MeshBasicMaterial({ map: sign, transparent: true }));
    sm.material.userData.outlineParameters = { visible: false };
    sm.position.set(0, h + 0.9, d / 2 + 0.05);
    g.add(sm);
    if (m.isMe) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), glowMat('#ffd23f'));
      star.position.set(0, h + 2.2, 0);
      g.add(star);
      this.ticks.push((dt, t) => { star.rotation.y = t * 1.5; star.position.y = h + 2.2 + Math.sin(t * 2) * 0.2; });
    }
    if ((m.staff || 0) > 8 || m.recipes > 6) { const ps = P.poleSign(m.recipes > 6 ? 'YUM!' : 'EAT!', awn); ps.scale.setScalar(0.7); ps.position.set(w / 2 + 1.2, 0, d / 2 + 1.2); g.add(ps); this.ticks.push((dt, t) => ps.userData.tick(dt, t)); }
    g.traverse((o) => { o.userData.pick = { playerId: m.id, rival: !!opts.rival }; });
    return g;
  }

  setMembers(members) {
    for (const l of this.lots) l.group.removeFromParent();
    this.lots = [];
    const slots = this.lotSlots();
    const ordered = [...members].sort((a, b) => (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0));
    ordered.slice(0, slots.length).forEach((m, i) => {
      const s = slots[i];
      const g = this.building(m);
      g.position.copy(s.pos);
      g.rotation.y = s.ry;
      this.scene.add(g);
      const door = new THREE.Vector3(0, 0, 4.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.ry).add(s.pos);
      this.lots.push({ member: m, group: g, door });
      if (m.isMe) this.avatar.setPosition(door.x * 0.4, 0, door.z * 0.4);
    });
  }

  setRivals(rivals) {
    for (const l of this.rivalLots) l.group.removeFromParent();
    this.rivalLots = [];
    rivals.slice(0, 8).forEach((m, i) => {
      const g = this.building(m, { rival: true });
      g.position.set(-35 + i * 10, 0, RIVAL_Z);
      g.scale.setScalar(0.85);
      this.scene.add(g);
      this.rivalLots.push({ member: m, group: g, door: V(-35 + i * 10, RIVAL_Z + 4) });
    });
  }

  /* ── people ───────────────────────────────────────────────────────────── */

  setPeers(peers) {
    const ids = new Set(peers.map((p) => p.id));
    for (const [id, p] of this.peers) if (!ids.has(id)) { p.c.dispose(); if (p.label) { p.label.removeFromParent(); p.label.element.remove(); } this.peers.delete(id); }
    for (const p of peers) {
      if (p.id === this.me.id || this.peers.has(p.id)) continue;
      const [awn] = awningFor(p.id);
      const c = new Character({ species: p.species || 'cat', outfit: ownerOutfit(awn), seed: p.id, speed: 3.2, data: { peer: p.id } });
      c.setPosition(p.x ?? (this.r() - 0.5) * 20, 0, p.z ?? (this.r() - 0.5) * 20);
      this.scene.add(c.object);
      const entry = { c, info: p, bot: !!p.bot, nextWander: 0 };
      if (this.engine) entry.label = this.engine.labels.attach(c.anchor, el('div', 'nametag', `<b>${escapeHtml(p.name)}</b>${p.restaurant ? `<small>${escapeHtml(p.restaurant)}</small>` : ''}`));
      this.peers.set(p.id, entry);
    }
  }

  peerMoved({ id, x, z }) {
    const p = this.peers.get(id);
    if (!p || p.bot) return;
    p.c.walkTo([V(x, z)]);
  }

  chat({ from, text }) {
    const target = from === this.me.id ? this.avatar : this.peers.get(from)?.c;
    if (target && this.engine) this.engine.labels.say(target, text, { ms: 4200 });
    if (target && Math.random() < 0.5) target.play('talk', 1.6);
  }

  /* ── engine hooks ─────────────────────────────────────────────────────── */

  enter(engine) {
    this.engine = engine;
    const a = this.avatar.position;
    const far = engine.camera.aspect < 0.9 ? 1.25 : 1;
    engine.frameView({ target: V(a.x, a.z, 0.8), position: V(a.x, a.z + 15 * far, 26 * far), minDistance: 12, maxDistance: 70, minPolar: 0.2, maxPolar: 0.95, minAzimuth: -Infinity, maxAzimuth: Infinity, pan: false });
    this.myTag = engine.labels.attach(this.avatar.anchor, el('div', 'nametag me', `<b>${escapeHtml(this.me.name)}</b>${this.me.name === 'You' ? '' : '<small>You</small>'}`));
    for (const p of this.peers.values()) p.label = engine.labels.attach(p.c.anchor, el('div', 'nametag', `<b>${escapeHtml(p.info.name)}</b>${p.info.restaurant ? `<small>${escapeHtml(p.info.restaurant)}</small>` : ''}`));
    this.promptHolder = new THREE.Object3D(); this.scene.add(this.promptHolder);
    this.promptEl = el('button', 'world-prompt', '');
    this.promptEl.addEventListener('click', (e) => { e.stopPropagation(); if (this.nearLot) this.dispatchEvent(new CustomEvent('peek', { detail: { playerId: this.nearLot.member.id, rival: this.nearLot.rival, member: this.nearLot.member } })); });
    this.prompt = engine.labels.attach(this.promptHolder, this.promptEl);
    this.promptEl.hidden = true;
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    this.lastCamTarget = engine.controls.target.clone();
  }

  exit() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    this.keys.clear();
  }

  key(e) {
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'e', ' '].includes(k)) return;
    if (e.type === 'keydown') {
      this.keys.add(k);
      if (k === 'e' && this.nearLot) this.promptEl.click();
      if (k === ' ') { this.avatar.hop(1); this.avatar.play('wave', 1.2); }
    } else this.keys.delete(k);
    e.preventDefault();
  }

  pickables() { return [...this.lots.map((l) => l.group), ...this.rivalLots.map((l) => l.group)]; }

  pick(hit) {
    if (hit?.data?.playerId) {
      const lot = [...this.lots, ...this.rivalLots].find((l) => l.member.id === hit.data.playerId);
      if (lot) this.avatar.walkTo(this.pathTo(lot.door), () => { this.avatar.faceTowards(lot.group.position); this.dispatchEvent(new CustomEvent('peek', { detail: { playerId: lot.member.id, rival: !!hit.data.rival, member: lot.member } })); });
      return;
    }
    if (hit?.ground) this.avatar.walkTo(this.pathTo(hit.point));
  }

  pathTo(p) {
    // Cross the river by the bridge.
    const a = this.avatar.position;
    const farA = a.z < RIVER_Z, farP = p.z < RIVER_Z;
    if (farA === farP) return [V(p.x, p.z)];
    return farA ? [V(0, RIVER_Z - 6), V(0, RIVER_Z + 6), V(p.x, p.z)] : [V(0, RIVER_Z + 6), V(0, RIVER_Z - 6), V(p.x, p.z)];
  }

  update(dt, t, engine) {
    this.time += dt;
    // keyboard movement relative to camera
    let mx = 0, mz = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) mz -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) mz += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
    const av = this.avatar;
    if (mx || mz) {
      const cam = engine.camera;
      const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const dir = fwd.multiplyScalar(-mz).add(right.multiplyScalar(mx)).normalize();
      av.walkTo([av.position.clone().addScaledVector(dir, 0.6)]);
    }
    // keep out of the river except on the bridge
    if (Math.abs(av.position.z - RIVER_Z) < 4.6 && Math.abs(av.position.x) > 2.2) av.position.z = av.position.z > RIVER_Z ? RIVER_Z + 4.6 : RIVER_Z - 4.6;
    av.position.x = THREE.MathUtils.clamp(av.position.x, -70, 70);
    av.position.z = THREE.MathUtils.clamp(av.position.z, -75, 45);
    av.update(dt);

    // camera follows
    const c = engine.controls;
    const want = V(av.position.x, av.position.z, 0.8);
    const delta = want.clone().sub(c.target).multiplyScalar(Math.min(1, dt * 5));
    c.target.add(delta);
    engine.camera.position.add(delta);

    // broadcast footsteps
    if (this.hangout && (av.walking || this.time - (this.lastSent || 0) > 2)) {
      this.hangout.move(+av.position.x.toFixed(2), +av.position.z.toFixed(2), +av.object.rotation.y.toFixed(2));
      this.lastSent = this.time;
    }

    // peers
    for (const p of this.peers.values()) {
      if (p.bot && this.time > p.nextWander && !p.c.walking) {
        const lot = this.lots[Math.floor(this.r() * this.lots.length)];
        const tgt = this.r() < 0.5 && lot ? lot.door.clone().multiplyScalar(0.85) : V((this.r() - 0.5) * 30, (this.r() - 0.5) * 30);
        p.c.walkTo([tgt], () => { if (this.r() < 0.4) p.c.play(['wave', 'talk', 'cheer'][Math.floor(this.r() * 3)], 1.5); });
        p.nextWander = this.time + 4 + this.r() * 8;
      }
      p.c.update(dt);
    }

    // nearest lot → prompt
    let near = null, nd = 3.6 * 3.6;
    for (const l of [...this.lots, ...this.rivalLots.map((r) => ({ ...r, rival: true }))]) {
      const d = l.door.distanceToSquared(V(av.position.x, av.position.z));
      if (d < nd) { nd = d; near = l; }
    }
    if (near !== this.nearLot) {
      this.nearLot = near;
      if (this.promptEl) {
        this.promptEl.hidden = !near;
        if (near) {
          this.promptHolder.position.set(near.door.x, 2.2, near.door.z);
          this.promptEl.innerHTML = near.member.isMe ? '<kbd>E</kbd> Go inside' : near.rival ? `<kbd>E</kbd> Size up ${escapeHtml(near.member.restaurantName)}` : `<kbd>E</kbd> Peek inside ${escapeHtml(near.member.restaurantName)}`;
        }
      }
    }
    for (const fn of this.ticks) fn(dt, this.time);
    this.fx.update(dt);
  }

  dispose() {
    this.exit();
    for (const p of this.peers.values()) p.c.dispose();
    this.peers.clear();
  }
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export { blobShadow };
