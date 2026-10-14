/**
 * Little bursts of joy (and grumbling): hearts, sparkles, steam, suds, coins,
 * angry puffs, confetti — plus dishes that fly in an arc from server to table.
 */
import * as THREE from 'three';
import { itemMesh } from './items.js';

const TEX = {};

function canvasTex(draw, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function heart(g, s, color = '#ff5c8a') {
  g.fillStyle = color;
  g.beginPath();
  const x = s / 2, y = s * 0.32;
  g.moveTo(x, s * 0.85);
  g.bezierCurveTo(s * 0.05, s * 0.55, s * 0.08, s * 0.12, x, y);
  g.bezierCurveTo(s * 0.92, s * 0.12, s * 0.95, s * 0.55, x, s * 0.85);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.7)';
  g.beginPath(); g.ellipse(s * 0.33, s * 0.33, s * 0.07, s * 0.05, -0.6, 0, Math.PI * 2); g.fill();
}

function star(g, s, color) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? s * 0.2 : s * 0.46;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
  }
  g.closePath(); g.fill();
}

function soft(g, s, color, alpha = 1) {
  const grd = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
  grd.addColorStop(0, color); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalAlpha = alpha; g.fillStyle = grd; g.fillRect(0, 0, s, s); g.globalAlpha = 1;
}

function getTex(kind) {
  if (TEX[kind]) return TEX[kind];
  const draw = {
    heart: (g, s) => heart(g, s),
    sparkle: (g, s) => star(g, s, '#ffe066'),
    star: (g, s) => star(g, s, '#ffd23f'),
    steam: (g, s) => soft(g, s, 'rgba(255,255,255,0.95)'),
    dust: (g, s) => soft(g, s, 'rgba(230,214,190,0.9)'),
    bubble: (g, s) => { g.strokeStyle = 'rgba(160,210,255,.95)'; g.lineWidth = 4; g.beginPath(); g.arc(s / 2, s / 2, s * 0.38, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(s * 0.38, s * 0.38, s * 0.08, 0, Math.PI * 2); g.fill(); },
    coin: (g, s) => { g.fillStyle = '#f4b400'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.32, 0, Math.PI * 2); g.fill(); g.fillStyle = '#f4b400'; g.font = `bold ${s * 0.4}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('G', s / 2, s / 2 + 2); },
    angry: (g, s) => {
      g.fillStyle = '#ff5a5f';
      for (let i = 0; i < 4; i++) { g.save(); g.translate(s / 2, s / 2); g.rotate(i * Math.PI / 2); g.beginPath(); g.moveTo(s * 0.06, s * 0.06); g.quadraticCurveTo(s * 0.32, s * 0.02, s * 0.36, s * 0.3); g.lineTo(s * 0.26, s * 0.3); g.quadraticCurveTo(s * 0.24, s * 0.14, s * 0.06, s * 0.16); g.fill(); g.restore(); }
    },
    puff: (g, s) => { g.fillStyle = '#8a7a8f'; for (const [x, y, r] of [[0.35, 0.5, 0.22], [0.6, 0.45, 0.25], [0.5, 0.3, 0.2], [0.68, 0.62, 0.18]]) { g.beginPath(); g.arc(x * s, y * s, r * s, 0, Math.PI * 2); g.fill(); } },
    note: (g, s) => { g.fillStyle = '#7b61ff'; g.beginPath(); g.ellipse(s * 0.38, s * 0.72, s * 0.14, s * 0.1, -0.4, 0, Math.PI * 2); g.fill(); g.fillRect(s * 0.48, s * 0.18, s * 0.06, s * 0.55); g.fillRect(s * 0.48, s * 0.18, s * 0.24, s * 0.08); },
    zzz: (g, s) => { g.fillStyle = '#7da3ff'; g.font = `900 ${s * 0.7}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('z', s / 2, s / 2); },
    confetti0: (g, s) => { g.fillStyle = '#ff5c8a'; g.fillRect(s * 0.3, s * 0.2, s * 0.4, s * 0.6); },
    confetti1: (g, s) => { g.fillStyle = '#4fbfa8'; g.fillRect(s * 0.3, s * 0.2, s * 0.4, s * 0.6); },
    confetti2: (g, s) => { g.fillStyle = '#ffd23f'; g.fillRect(s * 0.3, s * 0.2, s * 0.4, s * 0.6); },
    confetti3: (g, s) => { g.fillStyle = '#7b61ff'; g.fillRect(s * 0.3, s * 0.2, s * 0.4, s * 0.6); },
    sweat: (g, s) => { g.fillStyle = '#7fd1ff'; g.beginPath(); g.moveTo(s / 2, s * 0.1); g.quadraticCurveTo(s * 0.85, s * 0.6, s / 2, s * 0.85); g.quadraticCurveTo(s * 0.15, s * 0.6, s / 2, s * 0.1); g.fill(); },
    recipe: (g, s) => { g.fillStyle = '#fff1d6'; g.fillRect(s * 0.2, s * 0.12, s * 0.6, s * 0.76); g.fillStyle = '#e85d75'; g.fillRect(s * 0.28, s * 0.2, s * 0.44, s * 0.1); g.fillStyle = '#b08968'; for (let i = 0; i < 3; i++) g.fillRect(s * 0.28, s * (0.42 + i * 0.13), s * 0.44, s * 0.05); },
    flash: (g, s) => soft(g, s, 'rgba(255,255,240,1)'),
  }[kind];
  TEX[kind] = canvasTex(draw || ((g, s) => soft(g, s, '#fff')));
  return TEX[kind];
}

const MAT = {};
function mat(kind) {
  if (!MAT[kind]) {
    MAT[kind] = new THREE.SpriteMaterial({ map: getTex(kind), transparent: true, depthWrite: false });
    MAT[kind].userData.outlineParameters = { visible: false };
  }
  return MAT[kind];
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'fx';
    scene.add(this.root);
    this.parts = [];
    this.pool = [];
    this.flights = [];
  }

  sprite(kind) {
    const s = this.pool.pop() || new THREE.Sprite();
    s.material = mat(kind);
    s.visible = true;
    s.renderOrder = 10;
    this.root.add(s);
    return s;
  }

  /**
   * emit('heart', pos, { count, spread, up, speed, life, size, gravity })
   */
  emit(kind, pos, o = {}) {
    const n = o.count ?? 6;
    for (let i = 0; i < n; i++) {
      const k = kind === 'confetti' ? `confetti${i % 4}` : kind;
      const s = this.sprite(k);
      const spread = o.spread ?? 0.4;
      s.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * 0.2, pos.z + (Math.random() - 0.5) * spread);
      const sp = o.speed ?? 1;
      const p = {
        s, life: (o.life ?? 1.2) * (0.7 + Math.random() * 0.6), age: 0,
        v: new THREE.Vector3((Math.random() - 0.5) * sp, (o.up ?? 1.4) * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * sp),
        g: o.gravity ?? 0.6, size: (o.size ?? 0.32) * (0.75 + Math.random() * 0.5), spin: (Math.random() - 0.5) * 4,
        grow: kind === 'steam' || kind === 'dust' || kind === 'puff',
      };
      s.scale.setScalar(p.size);
      this.parts.push(p);
    }
  }

  /** A dish (item mesh) or a sprite flies from a to b in an arc. */
  fly({ from, to, item = null, sprite = null, dur = 0.7, height = 1.2, spin = true, onHit = null }) {
    let obj;
    if (item) { obj = itemMesh(item) || this.sprite('star'); obj.scale.setScalar(1.6); this.root.add(obj); }
    else { obj = this.sprite(sprite || 'puff'); obj.scale.setScalar(0.55); }
    obj.position.copy(from);
    this.flights.push({ obj, from: from.clone(), to: to.clone(), t: 0, dur, height, spin, onHit, isSprite: !item });
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) {
        p.s.visible = false; this.root.remove(p.s); this.pool.push(p.s);
        this.parts.splice(i, 1);
        continue;
      }
      p.v.y -= p.g * dt;
      p.s.position.addScaledVector(p.v, dt);
      const k = p.age / p.life;
      p.s.material.rotation = 0;
      const sc = p.grow ? p.size * (1 + k * 1.5) : p.size * (k < 0.15 ? k / 0.15 : 1);
      p.s.scale.setScalar(sc);
      p.s.material.opacity = 1;
      // fade by shrinking at the end (shared materials can't fade per particle)
      if (k > 0.75) p.s.scale.multiplyScalar(1 - (k - 0.75) * 4);
    }
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.t += dt / f.dur;
      const t = Math.min(1, f.t);
      f.obj.position.lerpVectors(f.from, f.to, t);
      f.obj.position.y += Math.sin(t * Math.PI) * f.height;
      if (f.spin && !f.isSprite) { f.obj.rotation.y += dt * 8; f.obj.rotation.z = Math.sin(t * Math.PI) * 0.4; }
      if (t >= 1) {
        if (f.isSprite) { f.obj.visible = false; this.root.remove(f.obj); this.pool.push(f.obj); }
        else this.root.remove(f.obj);
        this.flights.splice(i, 1);
        if (f.onHit) f.onHit();
      }
    }
  }

  clear() {
    this.parts.forEach((p) => { this.root.remove(p.s); });
    this.flights.forEach((f) => this.root.remove(f.obj));
    this.parts = []; this.flights = [];
  }
}
