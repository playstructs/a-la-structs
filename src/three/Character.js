/**
 * A critter you can boss around: walk along a path, hold things, play a
 * gesture, blink, bob, sit, sleep, sulk and celebrate. All animation is
 * procedural so every role can share one rig.
 */
import * as THREE from 'three';
import { buildCritter } from './animals.js';
import { itemMesh } from './items.js';
import { Builder } from './toon.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
let hitGeo = null;

export class Character {
  constructor({ species = 'cat', outfit = {}, seed = 'x', scale = 1, speed = 1.7, data = {} } = {}) {
    this.rig = buildCritter({ species, outfit, seed, scale });
    this.object = this.rig.root;
    this.object.userData.character = this;
    this.data = data;
    this.species = species;
    this.outfit = outfit;
    this.speed = speed;
    this.path = [];
    this.onArrive = null;
    this.gesture = null;
    this.gestureLoop = null;
    this.walking = false;
    this.sitting = false;
    this.sleeping = false;
    this.mood = null;
    this.t = Math.random() * 10;
    this.phase = 0;
    this.nextBlink = 1 + Math.random() * 3;
    this.blinkT = 0;
    this.targetHeading = 0;
    this.held = { R: null, L: null };
    this.jump = 0;
    this.shake = 0;
    this.anchor = new THREE.Object3D();
    this.anchor.position.set(0, 1.6 * scale, 0);
    this.object.add(this.anchor);

    if (!hitGeo) hitGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.4, 8);
    this.hitbox = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.position.y = 0.7;
    this.hitbox.userData.character = this;
    this.object.add(this.hitbox);

    if (outfit.hold) this.hold(outfit.hold, 'R');
  }

  get position() { return this.object.position; }

  setPosition(x, y, z) { this.object.position.set(x, y, z); return this; }

  faceTowards(v) {
    tmp.subVectors(v, this.object.position);
    if (tmp.lengthSq() < 1e-4) return;
    this.targetHeading = Math.atan2(tmp.x, tmp.z);
  }

  face(angle) { this.targetHeading = angle; }

  /** Walk through points (Vector3 in the parent's space). */
  walkTo(points, onArrive = null) {
    this.path = (Array.isArray(points) ? points : [points]).map((p) => p.clone());
    this.onArrive = onArrive;
    this.walking = this.path.length > 0;
    if (this.sitting) this.sit(false);
    if (!this.walking && onArrive) onArrive();
  }

  stop() { this.path = []; this.walking = false; this.onArrive = null; }

  /** Play a gesture for `dur` seconds (Infinity loops until replaced). */
  play(name, dur = 2, onDone = null) {
    this.gesture = { name, t: 0, dur, onDone };
  }

  loop(name) { this.gestureLoop = name; }

  hold(kind, hand = 'R') {
    const h = hand === 'L' ? this.rig.handL : this.rig.handR;
    if (this.held[hand]) { h.remove(this.held[hand]); this.held[hand] = null; }
    if (!kind) return;
    const m = itemMesh(kind);
    if (!m) return;
    m.rotation.x = Math.PI / 2;   // hands point down; items stand up when the arm is raised forward
    m.position.set(0, -0.02, 0.02);
    if (kind === 'arrowSign') { m.rotation.set(Math.PI / 2, 0, 0); m.position.set(0, -0.05, 0.05); }
    if (['crate', 'tub', 'box'].includes(kind)) { m.position.set(hand === 'R' ? 0.2 : -0.2, -0.05, 0.12); }
    h.add(m);
    this.held[hand] = m;
    this.heldKind = kind;
  }

  sit(on = true, seatY = 0.3) {
    this.sitting = on;
    this.seatY = seatY;
  }

  sleep(on = true) { this.sleeping = on; if (on) this.sit(true, 0.2); }

  hop(power = 1) { this.jump = Math.max(this.jump, power); }
  wobble(power = 1) { this.shake = Math.max(this.shake, power); }

  setMood(m) { this.mood = m; }

  /** Disguise for stealth: a potted fern pulled over their head. */
  setHidden(on) {
    if (on && !this.disguise) {
      const b = new Builder();
      b.cyl(0.3, 0.24, 0.35, '#c4693d', { y: 0.18 });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        b.sphere(0.2, i % 2 ? '#5fa85a' : '#77c46b', { x: Math.cos(a) * 0.2, y: 0.55 + (i % 3) * 0.12, z: Math.sin(a) * 0.2, sy: 1.4 });
      }
      b.sphere(0.25, '#6cbd61', { y: 0.85, sy: 1.3 });
      b.sphere(0.04, '#2b2024', { x: -0.07, y: 0.6, z: 0.28 });
      b.sphere(0.04, '#2b2024', { x: 0.07, y: 0.6, z: 0.28 });
      this.disguise = b.mesh();
      this.object.add(this.disguise);
    }
    if (this.disguise) this.disguise.visible = !!on;
    this.rig.body.visible = !on;
    this.hidden = !!on;
  }

  update(dt) {
    this.t += dt;
    const r = this.rig;
    const o = this.object;

    // movement
    if (this.walking && this.path.length) {
      const target = this.path[0];
      tmp.set(target.x - o.position.x, 0, target.z - o.position.z);
      const dist = tmp.length();
      const step = this.speed * dt;
      if (dist <= step) {
        o.position.x = target.x; o.position.z = target.z;
        this.path.shift();
        if (!this.path.length) {
          this.walking = false;
          const cb = this.onArrive; this.onArrive = null;
          if (cb) cb();
        }
      } else {
        tmp.multiplyScalar(step / dist);
        o.position.add(tmp);
        this.targetHeading = Math.atan2(tmp.x, tmp.z);
      }
      this.phase += dt * this.speed * 7.5;
    }

    // heading (shortest turn)
    let dh = this.targetHeading - o.rotation.y;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    o.rotation.y += dh * Math.min(1, dt * 10);

    // reset pose
    let armLx = 0, armLz = 0.1, armRx = 0, armRz = -0.1;
    let legLx = 0, legRx = 0;
    let bodyY = 0, bodyRz = 0, bodyRx = 0, headRx = 0, headRy = 0, headRz = 0;
    const t = this.t;

    if (this.walking) {
      const s = Math.sin(this.phase);
      legLx = s * 0.7; legRx = -s * 0.7;
      armLx = -s * 0.55; armRx = s * 0.55;
      bodyY = Math.abs(Math.cos(this.phase)) * 0.05;
      bodyRz = s * 0.06;
    } else {
      bodyY = Math.sin(t * 2.2) * 0.008;
      headRy = Math.sin(t * 0.5) * 0.25 * (Math.sin(t * 0.13) > 0.3 ? 1 : 0);
    }

    // carrying overrides arms while walking
    const carrying = this.heldKind && ['plate', 'steak', 'tub', 'crate', 'box', 'cleanPlate', 'pot', 'cake', 'pudding', 'fries', 'cocktail', 'coffee', 'cup', 'basket', 'croissant'].includes(this.heldKind);
    if (carrying && this.walking) { armRx = -1.25; if (['tub', 'crate', 'box'].includes(this.heldKind)) armLx = -1.25; }

    const g = this.gesture || (this.gestureLoop ? { name: this.gestureLoop, t: this.t, dur: Infinity } : null);
    if (g) {
      if (this.gesture) {
        this.gesture.t += dt;
        if (this.gesture.t >= this.gesture.dur) {
          const cb = this.gesture.onDone; this.gesture = null;
          if (cb) cb();
        }
      }
      const gt = g.t;
      switch (g.name) {
        case 'chop': armRx = -1.25 + Math.sin(gt * 14) * 0.35; armLx = -0.9; headRx = 0.25; break;
        case 'stir': armRx = -1.1 + Math.sin(gt * 6) * 0.2; armRz = -0.1 + Math.cos(gt * 6) * 0.3; armLx = -0.5; headRx = 0.2; break;
        case 'fry': armRx = -1.05 + Math.sin(gt * 20) * 0.12; armLx = -0.4; bodyY += Math.abs(Math.sin(gt * 20)) * 0.01; headRx = 0.15; break;
        case 'shake': armRx = -2.5 + Math.sin(gt * 18) * 0.3; armLx = -2.5 + Math.sin(gt * 18 + 1) * 0.3; bodyY += Math.abs(Math.sin(gt * 18)) * 0.02; break;
        case 'pour': armRx = -1.4; armRz = -0.6 + Math.sin(gt * 2) * 0.1; headRx = 0.2; break;
        case 'scrub': armRx = -1.0 + Math.sin(gt * 13) * 0.32; armLx = -1.0 - Math.sin(gt * 13) * 0.32; bodyRx = 0.15; headRx = 0.3; break;
        case 'carry': armRx = -1.25; armLx = -1.25; break;
        case 'wave': armRx = -2.7; armRz = -0.4 + Math.sin(gt * 10) * 0.45; headRz = 0.12; break;
        case 'type': armRx = -1.1 + Math.sin(gt * 16) * 0.12; armLx = -1.1 + Math.sin(gt * 16 + 2) * 0.12; headRx = 0.25; break;
        case 'spin': armRx = -2.4; armLx = -0.2 + Math.sin(gt * 3) * 0.3; if (this.held.R) this.held.R.rotation.y = gt * 9; bodyY += Math.abs(Math.sin(gt * 4)) * 0.06; legLx = Math.sin(gt * 8) * 0.4; legRx = -Math.sin(gt * 8) * 0.4; break;
        case 'selfie': armRx = -2.2; armRz = -0.35; headRz = 0.25 + Math.sin(gt * 2) * 0.08; headRy = -0.3; armLx = -0.3; armLz = 0.6; break;
        case 'knead': armRx = -1.0 + Math.abs(Math.sin(gt * 6)) * 0.45; armLx = -1.0 + Math.abs(Math.sin(gt * 6 + 1.5)) * 0.45; bodyY -= Math.abs(Math.sin(gt * 6)) * 0.03; headRx = 0.25; break;
        case 'wipe': armRx = -1.0; armRz = -0.1 + Math.sin(gt * 5) * 0.5; bodyRx = 0.12; headRx = 0.2; break;
        case 'cheer': armRx = -2.9; armLx = -2.9; armRz = -0.4; armLz = 0.4; bodyY += Math.abs(Math.sin(gt * 9)) * 0.18; break;
        case 'angry': armLz = 0.45 + Math.sin(gt * 25) * 0.1; armRz = -0.45 - Math.sin(gt * 25) * 0.1; legLx = Math.max(0, Math.sin(gt * 12)) * 0.6; legRx = Math.max(0, -Math.sin(gt * 12)) * 0.6; headRy = Math.sin(gt * 18) * 0.25; headRx = -0.1; break;
        case 'sad': armLz = 0.02; armRz = -0.02; headRx = 0.45; bodyY -= 0.02; break;
        case 'eat': armRx = Math.sin(gt * 4) > 0 ? -2.2 : -1.2; headRx = 0.1 + Math.max(0, Math.sin(gt * 4)) * 0.15; break;
        case 'clap': armRx = -1.3; armLx = -1.3; armRz = -0.2 + Math.abs(Math.sin(gt * 12)) * 0.25; armLz = 0.2 - Math.abs(Math.sin(gt * 12)) * 0.25; break;
        case 'write': armLx = -1.2; armLz = -0.2; armRx = -1.1 + Math.sin(gt * 18) * 0.05; armRz = 0.2; headRx = 0.3; break;
        case 'talk': armRx = -0.9 + Math.sin(gt * 4) * 0.4; armRz = -0.3; headRx = Math.sin(gt * 7) * 0.08; headRz = Math.sin(gt * 3) * 0.06; break;
        case 'point': armRx = -1.6; armRz = -0.05; break;
        case 'lift': armRx = -2.6; armLx = -2.6; bodyY += Math.abs(Math.sin(gt * 3)) * 0.02; break;
        case 'serve': armRx = -1.5 + Math.sin(Math.min(1, gt * 2) * Math.PI) * -0.4; armLx = -0.6; bodyRx = 0.08; break;
        case 'throw': armRx = gt < 0.25 ? -2.8 : -1.2; armLx = -0.4; bodyRx = gt < 0.25 ? -0.08 : 0.12; break;
        case 'phone': armRx = -1.6; armLx = -1.0; headRx = 0.35; break;
        case 'sweep': armRx = -0.8 + Math.sin(gt * 5) * 0.25; armLx = -0.8 + Math.sin(gt * 5) * 0.25; armRz = Math.sin(gt * 5) * 0.4; armLz = Math.sin(gt * 5) * 0.4; break;
        default: break;
      }
    }

    // sitting
    if (this.sitting) {
      legLx = -1.45; legRx = -1.45;
      bodyY += (this.seatY ?? 0.3) - 0.19;
    }
    if (this.sleeping) { headRx = 0.5; armLz = 0.05; armRz = -0.05; bodyY -= 0.02 + Math.sin(t * 1.5) * 0.01; }

    // reactions
    if (this.jump > 0) { bodyY += Math.sin((1 - this.jump) * Math.PI) * 0.35; this.jump = Math.max(0, this.jump - dt * 2.2); }
    if (this.shake > 0) { bodyRz += Math.sin(t * 50) * 0.18 * this.shake; this.shake = Math.max(0, this.shake - dt * 1.8); }

    // blink
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) { this.blinkT = 0.13; this.nextBlink = 2 + Math.random() * 4; }
    if (this.blinkT > 0) this.blinkT -= dt;
    r.eyes.scale.y = this.sleeping ? 0.12 : (this.blinkT > 0 ? 0.12 : (this.mood === 'happy' ? 0.7 : 1));

    // apply
    const k = Math.min(1, dt * 14);
    const lerp = (obj, prop, v) => { obj[prop] += (v - obj[prop]) * k; };
    lerp(r.armL.rotation, 'x', armLx); lerp(r.armL.rotation, 'z', armLz);
    lerp(r.armR.rotation, 'x', armRx); lerp(r.armR.rotation, 'z', armRz);
    lerp(r.legL.rotation, 'x', legLx); lerp(r.legR.rotation, 'x', legRx);
    lerp(r.head.rotation, 'x', headRx); lerp(r.head.rotation, 'y', headRy); lerp(r.head.rotation, 'z', headRz);
    r.body.position.y += (bodyY - r.body.position.y) * Math.min(1, dt * 18);
    lerp(r.body.rotation, 'z', bodyRz); lerp(r.body.rotation, 'x', bodyRx);
    if (r.tail) { r.tail.rotation.z = Math.sin(t * (this.mood === 'happy' ? 12 : 3)) * (this.mood === 'happy' ? 0.5 : 0.2); }
    r.shadow.scale.setScalar(1 - Math.min(0.4, Math.max(0, r.body.position.y) * 1.2));
  }

  dispose() {
    this.object.removeFromParent();
  }
}

export { UP };
