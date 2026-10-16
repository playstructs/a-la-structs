/**
 * Cashier — "Exact Change". A physics game at the till: each customer pays
 * in their own way. Cash goes into the drawer one note or coin at a time
 * (each into its own slot — the wrong slot bounces it back out), then the
 * change comes out of the drawer by hand onto the change tray. Card payers
 * tap their card on the reader and get it back with a receipt; some pay with
 * exact change. Press "Hand over" when the tray's ready.
 *
 * Money is physical: let go mid-air and it falls onto the counter; let go
 * beside the drawer and it hits the floor (−1). Score = customers served.
 */
import { pointer, C, box, circle, text, rr, lerp, clamp, inRect, pick, Pops } from '../kit.js';
import { stage3d } from '../kit3d.js';
import { model, defineModel } from '../models.js';
import * as THREE from 'three';
import { toonMat, glowMat, gradientMap } from '../../three/toon.js';
import { register } from '../../three/props.js';
import { SPECIES, rng } from '../../lexicon/names.js';
import { casualOutfit } from '../../three/outfits.js';

const GRAVITY = 1700;
const MONEY = [
  { v: 2000, label: '$20', note: true, fill: '#cdb0f2', ink: '#5b3d8f' },
  { v: 1000, label: '$10', note: true, fill: '#8fcdf2', ink: '#1f6694' },
  { v: 500, label: '$5', note: true, fill: '#98dcb2', ink: '#2a7a4f' },
  { v: 100, label: '$1', note: true, fill: '#f4dc8a', ink: '#8a6413' },
  { v: 25, label: '25¢', r: 22, fill: '#e4e9ee', ink: '#4f5b66' },
  { v: 10, label: '10¢', r: 17, fill: '#e4e9ee', ink: '#4f5b66' },
  { v: 5, label: '5¢', r: 20, fill: '#d6dde3', ink: '#4f5b66' },
  { v: 1, label: '1¢', r: 17, fill: '#e7a873', ink: '#7a3f17' },
];
const BY_V = new Map(MONEY.map((m) => [m.v, m]));
const NOTE_W = 68, NOTE_H = 36;
const CRITTERS = ['🐻', '🐰', '🦊', '🐼', '🐨', '🐸', '🐷', '🐮', '🐱', '🐶', '🐹', '🦝', '🐯', '🐔'];   // (kept: the pick keeps the random sequence as before)
const SCALE = 150;          // view units per metre
const TOP = 0.9;            // counter top (m)
const DH = 0.78;            // the open drawer's rim, just under the counter lip
const READ_TIME = 1.1;

const fmt = (c) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
function greedy(c) {
  const out = [];
  for (const m of MONEY) while (c >= m.v) { out.push(m.v); c -= m.v; }
  return out;
}
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

export default function create(ctx) {
  const s3 = stage3d(ctx.el, { scale: SCALE, quality: ctx.quality });
  const st = s3.ui, view = s3.view, g = s3.g;
  let needBuild = true;
  const pops = new Pops();
  const L = {};
  let pieces = [];
  let flyers = [];
  let splats = [];
  let held = null;
  let pointerAt = { x: 0, y: 0 };
  let cust = null;
  let nextIn = 0;
  let served = 0, seen = 0, streak = 0;
  let pressT = 9;
  let nid = 1;

  /* ── layout ─────────────────────────────────────────────────────────── */
  function layout() {
    const { W, H } = view;
    const P = view.portrait;
    L.P = P;
    L.cTop = P ? clamp(H * 0.27, 172, 250) : H * 0.29;
    L.cBot = L.cTop + (P ? clamp(H * 0.15, 104, 124) : 82);
    const dw = P ? W - 24 : Math.min(W * 0.74, 620);
    const dy = L.cBot + 22;
    const dh = P ? clamp(H - dy - 50, 150, 330) : H - dy - 8;
    L.drawer = { x: (W - dw) / 2, y: dy, w: dw, h: dh };
    L.floorY = H - 10;
    const pad = 8, cw = (dw - pad * 5) / 4, ch = (dh - pad * 3) / 2;
    L.slots = MONEY.map((m, i) => ({ v: m.v, x: L.drawer.x + pad + (i % 4) * (cw + pad), y: dy + pad + Math.floor(i / 4) * (ch + pad), w: cw, h: ch }));
    // the counter: their side (left), the card reader, the change tray (right)
    if (P) {
      L.offer = { x: 8, y: L.cTop + 6, w: W * 0.4, h: L.cBot - L.cTop - 12 };
      L.reader = { x: W * 0.44, y: L.cTop + 20, w: 58, h: 70 };
      L.tray = { x: W * 0.6, y: L.cTop + 8, w: W * 0.4 - 10, h: L.cBot - L.cTop - 16 };
      L.bubble = { x: 112, y: Math.max(12, L.cTop - 76 - 92), w: W - 126, h: 76 };
      L.cust = { x: 58, y: L.bubble.y + 50 };
      L.screen = { x: 12, y: L.cTop - 72, w: W * 0.5 - 18, h: 58 };
      L.btn = { x: W * 0.5 + 6, y: L.cTop - 72, w: W * 0.5 - 18, h: 58 };
    } else {
      L.offer = { x: 10, y: L.cTop + 6, w: W * 0.34, h: L.cBot - L.cTop - 12 };
      L.reader = { x: W * 0.385, y: L.cTop + 8, w: 62, h: L.cBot - L.cTop - 16 };
      L.tray = { x: W * 0.5, y: L.cTop + 6, w: W * 0.5 - 12, h: L.cBot - L.cTop - 12 };
      L.cust = { x: Math.max(56, W * 0.08), y: L.cTop - 50 };
      L.bubble = { x: L.cust.x + 50, y: 12, w: Math.min(220, W * 0.3), h: 76 };
      const bw = Math.min(170, W * 0.22);
      L.btn = { x: W - 14 - bw, y: L.cTop - 70, w: bw, h: 58 };
      L.screen = { x: L.btn.x - 12 - Math.min(190, W * 0.24), y: L.cTop - 70, w: Math.min(190, W * 0.24), h: 58 };
    }
    for (const p of pieces) if (p.where === 'rest') { p.x = clamp(p.x, p.hw, W - p.hw); p.y = clamp(p.y, L.cTop + p.hh, L.cBot - p.hh); }
    needBuild = true;   // the 3D set is rebuilt on the next frame
  }
  layout();
  view.onResize = layout;

  /* ── pieces ─────────────────────────────────────────────────────────── */
  function makePiece(kind, v, own, x, y) {
    const m = BY_V.get(v);
    let hw = 18, hh = 18;
    if (kind === 'money') { if (m.note) { hw = NOTE_W / 2; hh = NOTE_H / 2; } else hw = hh = m.r; }
    if (kind === 'card') { hw = 31; hh = 20; }
    if (kind === 'receipt') { hw = 18; hh = 24; }
    const p = { id: nid++, kind, v: v || 0, own, x, y, vx: 0, vy: 0, where: 'rest', hw, hh, restY: y, above: false, readT: 0 };
    pieces.push(p);
    return p;
  }
  const onTray = (p) => p.where === 'rest' && inRect(p, { x: L.tray.x - 6, y: L.tray.y - 10, w: L.tray.w + 12, h: L.tray.h + 20 });
  const trayMoney = () => pieces.filter((p) => p.kind === 'money' && onTray(p)).reduce((s, p) => s + p.v, 0);
  const custCashLeft = () => pieces.filter((p) => p.own === 'cust' && p.kind === 'money').length;

  /* ── customers ──────────────────────────────────────────────────────── */
  function newCustomer() {
    const n = seen++;
    const prog = clamp(ctx.elapsed() / ctx.seconds, 0, 1);
    const r = Math.random();
    const type = n < 2 ? 'cash' : r < 0.22 ? 'card' : r < 0.38 ? 'exact' : 'cash';
    let total, offer;
    for (let tries = 0; tries < 40; tries++) {
      if (n < 2) total = rnd(4, 39) * 25;
      else if (n < 5) total = rnd(21, 299) * 5;
      else total = Math.random() < 0.5 ? rnd(51, 1999) : rnd(11, 399) * 5;
      if (type === 'card') { offer = []; break; }
      if (type === 'exact') { offer = greedy(total); if (offer.length <= 6) break; continue; }
      const note = [500, 1000, 2000].find((v) => v >= total);
      const dollars = Math.ceil(total / 100) * 100, cents = total % 100;
      const roll = Math.random();
      if (n >= 3 && cents && roll < 0.3 && greedy(cents).length <= 3) offer = [...greedy(note), ...greedy(cents)];
      else if (roll < 0.5 && greedy(dollars).length <= 3 && dollars > total) offer = greedy(dollars);
      else offer = greedy(note);
      if (greedy(offer.reduce((s, v) => s + v, 0) - total).length <= 8) break;
    }
    const paid = type === 'card' ? total : offer.reduce((s, v) => s + v, 0);
    const due = type === 'card' ? 0 : paid - total;
    const moves = offer.length + greedy(due).length + (type === 'card' ? 4 : 1);
    const patience = (7 + 2.3 * moves) * lerp(1.15, 0.85, prog);
    cust = { ch: pick(CRITTERS), type, total, paid, due, patience, left: patience, state: 'in', t: 0, read: false, mood: 0 };
    // their money (or card) lands on their side of the counter
    const items = type === 'card' ? ['card'] : offer;
    const o = L.offer, n2 = items.length;
    items.forEach((v, i) => {
      const cols = Math.min(n2, L.P ? 2 : 3), row = Math.floor(i / cols), col = i % cols;
      const x = o.x + o.w * ((col + 0.5) / cols) + (row % 2 ? 10 : 0);
      const y = o.y + o.h * (n2 > cols ? (row ? 0.72 : 0.3) : 0.5) + (n2 > 2 * cols ? (row > 1 ? 6 : 0) : 0);
      const p = v === 'card' ? makePiece('card', 0, 'cust', x, y) : makePiece('money', v, 'cust', x, y);
      p.y = -40 - i * 10; p.where = 'fall'; p.restY = clamp(y, L.cTop + p.hh, L.cBot - p.hh); p.above = true; p.vx = 0;
      p.x = clamp(x, p.hw + 4, L.offer.x + L.offer.w);
    });
  }

  function custPos() {
    if (!cust) return { x: -80, y: L.cust.y };
    const k = cust.state === 'in' ? 1 - Math.pow(1 - clamp(cust.t / 0.5, 0, 1), 3) : cust.state === 'out' ? 1 - clamp(cust.t / 0.6, 0, 1) : 1;
    return { x: lerp(-60, L.cust.x, k), y: L.cust.y - (cust.state === 'wait' ? Math.abs(Math.sin(cust.t * 3)) * 2 : 0) };
  }

  function leave(happy) {
    cust.state = 'out'; cust.t = 0; cust.happy = happy;
    const to = custPos();
    for (const p of pieces) {
      if (p.where === 'gone') continue;
      if (p.own === 'cust' || p.kind === 'receipt' || (happy !== null && onTray(p))) {
        flyers.push({ p: { ...p }, x0: p.x, y0: p.y, x1: to.x, y1: to.y, t: 0 });
        p.where = 'gone';
      } else if (onTray(p) && p.kind === 'money') {
        const s = L.slots.find((sl) => sl.v === p.v);
        flyers.push({ p: { ...p }, x0: p.x, y0: p.y, x1: s.x + s.w / 2, y1: s.y + s.h / 2, t: 0 });
        p.where = 'gone';
      }
    }
    if (held && held.p.where === 'gone') held = null;
  }

  function handOver() {
    pressT = 0;
    if (!cust || cust.state !== 'wait' || ctx.over) return;
    const b = L.btn, bx = b.x + b.w / 2, by = b.y + b.h + 16;
    ctx.sfx.click();
    if (cust.type === 'card') {
      const card = pieces.find((p) => p.kind === 'card' && p.where !== 'gone');
      const rec = pieces.find((p) => p.kind === 'receipt' && p.where !== 'gone');
      if (!cust.read) { pops.add(card?.where === 'reader' ? 'Wait for the beep' : 'Tap their card on the reader', bx, by, C.berryD, 15); return; }
      if (!card || !rec || !onTray(card) || !onTray(rec)) { pops.add('Card + receipt on the tray', bx, by, C.berryD, 15); return; }
    } else if (custCashLeft()) { pops.add('Their cash goes in the drawer first', bx, by, C.berryD, 15); return; }
    const got = trayMoney();
    if (got === cust.due) {
      served++; streak++; ctx.add(1); ctx.sfx.good(streak); ctx.sfx.satisfied();
      me?.hop(0.8);
      pops.add(cust.due ? 'Spot on! +1' : 'Thank you! +1', L.cust.x + 30, L.cust.y - 40, C.leafD);
      leave(true);
    } else {
      streak = 0; ctx.sfx.complain();
      me?.wobble(1);
      const diff = got - cust.due;
      pops.add(diff < 0 ? `Short by ${diff > -100 ? `${-diff}¢` : fmt(-diff)}!` : `${diff < 100 ? `${diff}¢` : fmt(diff)} too much!`, L.cust.x + 30, L.cust.y - 40, C.berryD);
      leave(false);
    }
  }

  /* ── physics ────────────────────────────────────────────────────────── */
  function release(p) {
    p.where = 'fall';
    p.vx = clamp(p.vx * 0.55, -900, 900); p.vy = clamp(p.vy * 0.55, -900, 900);
    if (p.y < L.cBot) { p.restY = clamp(p.y, L.cTop + p.hh, L.cBot - p.hh); p.above = true; }
    else { p.restY = null; p.above = false; }
  }

  function intoDrawer(p) {
    let s = L.slots.find((sl) => inRect(p, sl));
    if (!s) s = L.slots.reduce((a, b) => (Math.hypot(b.x + b.w / 2 - p.x, b.y + b.h / 2 - p.y) < Math.hypot(a.x + a.w / 2 - p.x, a.y + a.h / 2 - p.y) ? b : a));
    if (p.kind === 'money' && p.v === s.v) {
      p.where = 'gone';
      if (BY_V.get(p.v).note) ctx.sfx.work('till', { vol: 0.5 }); else ctx.sfx.coin();
      if (p.own === 'cust' && cust && !custCashLeft() && cust.state === 'wait') {
        pops.add(cust.due ? `Change: ${fmt(cust.due)}` : 'Exact! Hand over', L.btn.x + L.btn.w / 2, L.btn.y - 12, C.leafD, 17);
      }
      return;
    }
    // wrong slot: it pops back up onto the counter
    p.where = 'bounce';
    p.restY = L.cBot - p.hh - Math.random() * 14;
    p.vy = -Math.sqrt(2 * GRAVITY * Math.max(40, p.y - p.restY + 50));
    p.vx = clamp((L.drawer.x + L.drawer.w / 2 - p.x) * 0.3, -120, 120) + (Math.random() - 0.5) * 120;
    p.above = false;
    ctx.sfx.work('clank', { vol: 0.5 }); ctx.sfx.miss();
    me?.wobble(0.6);
    pops.add(p.kind === 'money' ? `That’s the ${BY_V.get(s.v).label} slot` : 'Not in the till!', s.x + s.w / 2, s.y - 4, C.berryD, 15);
  }

  function toFloor(p) {
    p.where = 'gone';
    splats.push({ p: { ...p, y: L.floorY - p.hh }, t: 0 });
    ctx.add(-1); streak = 0; ctx.sfx.miss();
    me?.wobble(1);
    pops.add('Dropped! −1', clamp(p.x, 60, view.W - 60), Math.min(p.y, L.floorY) - 30, C.berryD);
    if (cust && cust.state === 'wait') cust.mood = 1.2;
    // the customer's own things get picked back up
    if (p.own === 'cust' && cust && cust.state === 'wait') {
      const q = p.kind === 'card' ? makePiece('card', 0, 'cust', 0, 0) : makePiece('money', p.v, 'cust', 0, 0);
      q.x = L.offer.x + L.offer.w / 2; q.y = -30; q.where = 'fall'; q.restY = L.offer.y + L.offer.h / 2; q.above = true;
    }
    if (p.kind === 'receipt' && cust) { const q = makePiece('receipt', 0, 'till', L.reader.x + L.reader.w / 2, L.cTop + 30); q.where = 'rest'; }
  }

  function landOnCounter(p) {
    p.where = 'rest'; p.vx = p.vy = 0;
    p.x = clamp(p.x, p.hw + 2, view.W - p.hw - 2); p.y = p.restY;
    if (p.kind === 'card' && cust && cust.type === 'card' && !cust.read && overlaps(p, L.reader)) { p.where = 'reader'; p.readT = 0; ctx.sfx.work('tap', { vol: 0.6 }); return; }
    ctx.sfx.work(p.kind === 'money' && !BY_V.get(p.v).note ? 'clank' : 'wipe', { vol: 0.25, dur: 0.15 });
  }
  const overlaps = (p, r) => p.x + p.hw > r.x && p.x - p.hw < r.x + r.w && p.y + p.hh > r.y - 10 && p.y - p.hh < r.y + r.h + 10;

  function step(dt) {
    pops.update(dt);
    pressT += dt;
    for (const f of flyers) f.t += dt;
    flyers = flyers.filter((f) => f.t < 0.45);
    for (const s of splats) s.t += dt;
    splats = splats.filter((s) => s.t < 2);
    if (ctx.over) return;

    if (!cust) { nextIn -= dt; if (nextIn <= 0) newCustomer(); }
    else {
      cust.t += dt;
      cust.mood = Math.max(0, cust.mood - dt);
      if (cust.state === 'in' && cust.t > 0.5) { cust.state = 'wait'; cust.t = 0; }
      else if (cust.state === 'wait') {
        cust.left -= dt;
        if (cust.left <= 0) {
          streak = 0; ctx.sfx.complain();
          pops.add('Too slow!', L.cust.x + 30, L.cust.y - 40, C.berryD);
          leave(null);
        }
      } else if (cust.state === 'out') {
        if (cust.t > 0.6) { cust = null; nextIn = 0.3; }
      }
    }

    if (held) {
      const p = held.p;
      const nx = lerp(p.x, pointerAt.x + held.dx, clamp(dt * 24, 0, 1)), ny = lerp(p.y, pointerAt.y + held.dy, clamp(dt * 24, 0, 1));
      if (dt > 0) { p.vx = (nx - p.x) / dt; p.vy = (ny - p.y) / dt; }
      p.x = nx; p.y = ny;
    }
    for (const p of pieces) {
      if (p.where === 'reader') {
        p.x = lerp(p.x, L.reader.x + L.reader.w / 2, clamp(dt * 14, 0, 1)); p.y = lerp(p.y, L.reader.y + L.reader.h * 0.35, clamp(dt * 14, 0, 1));
        p.readT += dt;
        if (p.readT >= READ_TIME && cust && !cust.read) {
          cust.read = true;
          ctx.sfx.coin(); ctx.sfx.work('register', { vol: 0.5 });
          pops.add('Approved ✓', L.reader.x + L.reader.w / 2, L.reader.y - 6, C.leafD, 16);
          // the card pops back out, a receipt prints beside it
          p.where = 'fall'; p.vy = -380; p.vx = -90; p.restY = L.cTop + p.hh + 4; p.above = false;
          const r = makePiece('receipt', 0, 'till', L.reader.x + L.reader.w / 2, L.reader.y);
          r.where = 'fall'; r.vy = -300; r.vx = 110; r.restY = L.cBot - r.hh - 4; r.above = false;
        }
        continue;
      }
      if (p.where !== 'fall' && p.where !== 'bounce') continue;
      p.vy += GRAVITY * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.where === 'fall' && p.restY == null && p.y < L.cBot - p.hh) { p.restY = L.cBot - p.hh; p.above = true; }
      if (p.restY != null && p.y < p.restY) p.above = true;
      if (p.restY != null && p.above && p.vy > 0 && p.y >= p.restY && p.x > -p.hw && p.x < view.W + p.hw) { landOnCounter(p); continue; }
      if (p.where === 'fall' && p.restY == null && p.vy >= 0 && inRect(p, L.drawer)) { intoDrawer(p); continue; }
      if (p.y >= L.floorY - p.hh || p.x < -60 || p.x > view.W + 60) toFloor(p);
    }
    pieces = pieces.filter((p) => p.where !== 'gone');
  }

  /* ── input ──────────────────────────────────────────────────────────── */
  const offPointer = pointer(st, {
    down: (p) => {
      if (ctx.over || held) return;
      pointerAt = p;
      // loose pieces first, topmost wins
      for (let i = pieces.length - 1; i >= 0; i--) {
        const q = pieces[i];
        if (!['rest', 'fall', 'bounce'].includes(q.where)) continue;
        if (Math.abs(p.x - q.x) <= q.hw + 8 && Math.abs(p.y - q.y) <= q.hh + 8) {
          pieces.splice(i, 1); pieces.push(q);
          held = { p: q, id: p.id, dx: q.x - p.x, dy: q.y - p.y }; q.where = 'held'; ctx.sfx.pop(); return;
        }
      }
      if (inRect(p, L.btn)) { handOver(); return; }
      const s = L.slots.find((sl) => inRect(p, sl));
      if (s) {
        const q = makePiece('money', s.v, 'till', p.x, p.y);
        q.where = 'held'; held = { p: q, id: p.id, dx: 0, dy: 0 };
        if (BY_V.get(s.v).note) ctx.sfx.work('wipe', { vol: 0.3, dur: 0.12 }); else ctx.sfx.pop();
      }
    },
    move: (p) => { if (!held || p.id === held.id) pointerAt = p; },
    up: (p) => {
      if (!held || p.id !== held.id) return;
      pointerAt = p;
      const q = held.p; held = null;
      if (q.where === 'held') release(q);
    },
  });

  /* ── the 3D till ────────────────────────────────────────────────────── */
  // Tabletop mapping: the counter top is level at TOP, the open drawer slides
  // out under its lip toward us (DH), and its compartments line up with the
  // slot rects. Money, the card and the receipt are flat 3D things lying on
  // whatever they're over; dropped ones fall straight down to the floor.
  const world = new THREE.Group();
  s3.add(world);
  const meshes = new Map();       // piece object → mesh
  const flyMeshes = new Map();
  const splatMeshes = new Map();
  let me = null, guest = null, guestFor = null, readerLight = null, regMesh = null;
  const deep = (units) => units / (SCALE * s3.sinE);   // world depth covering `units` of screen height on a level surface

  function box3(w, h, d, color, mat = null) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || toonMat({ color }));
    m.userData.ownGeometry = true; m.castShadow = m.receiveShadow = true;
    return m;
  }
  /** A level slab covering view rect r, its top at height `top`. */
  function slab(r, top, thick, color, mat) {
    const m = box3(r.w / SCALE, thick, deep(r.h), color, mat);
    m.position.copy(s3.at(r.x + r.w / 2, r.y + r.h / 2, top)); m.position.y = top - thick / 2;
    return m;
  }

  function build() {
    world.clear();
    meshes.clear(); flyMeshes.clear(); splatMeshes.clear();
    const { W, H } = view, P = L.P;
    world.add(s3.floor('wood', { size: 0.55 }));
    // the customer stands behind the counter (further back on phones, so they show above the register screen)
    const back = s3.at(0, L.cTop - 6, TOP).z;
    L.custZ = back - (P ? 0.95 : 0.55);
    const wallZ = L.custZ - 0.55;
    world.add(s3.wall({ y: wallZ * s3.sinE * SCALE, a: '#f3e7d6', b: '#e2d3bd' }));
    // the counter: wooden body, pale top, a darker lip along the front
    const cr = { x: -20, y: L.cTop - 6, w: W + 40, h: L.cBot - L.cTop + 6 };
    const body = slab(cr, TOP - 0.05, TOP - 0.05, '#c98f5a'); world.add(body);
    world.add(slab(cr, TOP, 0.05, '#f4e3c6'));
    const lip = box3((W + 40) / SCALE, 0.07, 0.05, '#9c6a3f'); lip.position.copy(s3.at(W / 2, L.cBot, TOP - 0.02)); lip.position.z += 0.02; world.add(lip);
    // their side: a rubber mat
    world.add(slab(L.offer, TOP + 0.012, 0.012, '#7fb48f'));
    // the change tray: a shallow wooden tray with a rim
    const tr = L.tray;
    world.add(slab(tr, TOP + 0.02, 0.02, '#f3e3c8'));
    for (const r of [{ x: tr.x, y: tr.y, w: tr.w, h: 6 }, { x: tr.x, y: tr.y + tr.h - 6, w: tr.w, h: 6 }, { x: tr.x, y: tr.y, w: 6, h: tr.h }, { x: tr.x + tr.w - 6, y: tr.y, w: 6, h: tr.h }]) world.add(slab(r, TOP + 0.035, 0.035, '#c79a66'));
    // the card reader: a slab with a light and three keys
    const rd = L.reader;
    world.add(slab({ x: rd.x, y: rd.y, w: rd.w, h: rd.h }, TOP + 0.045, 0.045, '#5c6670'));
    readerLight = new THREE.Mesh(new THREE.PlaneGeometry((rd.w - 16) / SCALE, deep(Math.min(22, rd.h * 0.3))), glowMat('#c7e6d3'));
    readerLight.material = readerLight.material.clone();
    readerLight.userData.ownGeometry = true;
    readerLight.rotation.x = -Math.PI / 2;
    readerLight.position.copy(s3.at(rd.x + rd.w / 2, rd.y + 8 + Math.min(11, rd.h * 0.15), TOP + 0.047));
    world.add(readerLight);
    for (let i = 0; i < 3; i++) {
      const k = box3(0.06, 0.016, 0.05, '#8e9ba8'); k.position.copy(s3.at(rd.x + rd.w / 2 + (i - 1) * 13, rd.y + rd.h - 12, TOP + 0.05)); world.add(k);
    }
    // the open drawer: a cabinet under the counter lip, eight compartments with stock in them
    const d = L.drawer;
    const dr = { x: d.x - 8, y: d.y - 8, w: d.w + 16, h: d.h + 16 };
    world.add(slab(dr, DH - 0.06, DH - 0.06, '#5e4430'));
    for (const r of [{ x: dr.x, y: dr.y, w: dr.w, h: 8 }, { x: dr.x, y: dr.y + dr.h - 8, w: dr.w, h: 8 }, { x: dr.x, y: dr.y, w: 8, h: dr.h }, { x: dr.x + dr.w - 8, y: dr.y, w: 8, h: dr.h }]) world.add(slab(r, DH, 0.06, '#7a5a3e'));
    const front = box3(dr.w / SCALE * 0.3, 0.05, 0.04, '#e9c46a'); front.position.copy(s3.at(dr.x + dr.w / 2, dr.y + dr.h, DH - 0.12)); front.position.z += 0.03; world.add(front);
    for (const s of L.slots) {
      world.add(slab(s, DH - 0.055, 0.01, '#f1e3cd'));
      const m = BY_V.get(s.v), cx = s.x + s.w / 2, cy = s.y + s.h / 2 + 4;
      if (m.note) {
        for (let i = 2; i >= 0; i--) { const n = moneyMesh(s.v); n.position.copy(s3.at(cx - i * 3, cy - i * 4, DH - 0.05 + (2 - i) * 0.014)); world.add(n); }
      } else {
        for (let i = 0; i < 3; i++) { const c = moneyMesh(s.v); c.scale.setScalar(0.85); c.position.copy(s3.at(cx + (i - 1) * m.r * 0.9, cy + 6 + (i % 2) * 2, DH - 0.05)); world.add(c); }
        const c = moneyMesh(s.v); c.position.copy(s3.at(cx, cy - 4, DH - 0.05 + 0.03)); world.add(c);
      }
    }
    // the register stands at the back of the counter; the screen above it is its display (2D)
    regMesh = register();
    const k = L.P ? 0.95 : 1.1;
    regMesh.scale.setScalar(k);
    const rp = s3.at(L.screen.x + L.screen.w / 2, L.cTop - 6, TOP); rp.z -= 0.12 * k; rp.y = TOP - 0.92 * k;
    regMesh.position.copy(rp);
    world.add(regMesh);
    // the cashier, on our side of the counter, by the drawer
    if (me) s3.dropCritter(me);
    me = s3.critter({ ...ctx.critter, scale: P ? 0.78 : 0.95 });
    if (P) {
      const p = s3.at(W - 52, H - 8, 0); me.setPosition(p.x, 0, p.z); me.targetHeading = -0.6;
    } else {
      const side = (W - d.x - d.w) / 2, p = s3.at(Math.min(W - 44, d.x + d.w + Math.max(44, side)), H - 12, 0);
      me.setPosition(p.x, 0, p.z); me.targetHeading = -0.75;
    }
    me.object.rotation.y = me.targetHeading;
    if (guest) { s3.dropCritter(guest); guest = null; guestFor = null; }
  }

  /* money, card and receipt meshes (geometry + materials shared per kind) */
  const looks = new Map();
  function look(key, make) { if (!looks.has(key)) looks.set(key, make()); return looks.get(key); }
  /** Top-face texture drawn at the face's aspect, with text stretched so it reads right through the camera tilt. */
  function faceTex(w, h, paint) {
    const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * (h / s3.sinE) / w);
    const x = c.getContext('2d');
    paint(x, c.width, c.height);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  function slabLook(key, w, h, thick, side, paint) {
    return look(key, () => {
      const geo = new THREE.BoxGeometry(w / SCALE, thick, deep(h));
      const sideMat = toonMat({ color: side });
      const topMat = new THREE.MeshToonMaterial({ map: faceTex(w, h, paint), gradientMap: gradientMap() });
      return { geo, mats: [sideMat, sideMat, topMat, sideMat, sideMat, sideMat] };
    });
  }
  /** Label text, squashed tall in the texture so the tilt brings it back to shape. */
  function label(x, str, cx, cy, size, color, W2) {
    x.save(); x.translate(cx, cy); x.scale(1, 1 / s3.sinE);
    x.font = `800 ${size}px Fredoka, "Baloo 2", system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = color; x.fillText(str, 0, 2, W2); x.restore();
  }
  function moneyMesh(v) {
    const m = BY_V.get(v);
    if (!m.note) {
      const c = model('cashier:coin', { v });
      return c;
    }
    const L2 = slabLook('note' + v, NOTE_W, NOTE_H, 0.012, m.ink, (x, w, h) => {
      x.fillStyle = m.fill; x.fillRect(0, 0, w, h);
      x.strokeStyle = m.ink; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10);
      x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 5; x.strokeRect(18, 18, w - 36, h - 36);
      x.fillStyle = 'rgba(255,255,255,.55)';
      for (const cx of [40, w - 40]) { x.beginPath(); x.ellipse(cx, h / 2, 18, 18 / s3.sinE, 0, 0, Math.PI * 2); x.fill(); }
      label(x, m.label, w / 2, h / 2, 92, m.ink, w - 120);
    });
    return mesh(L2);
  }
  function mesh({ geo, mats }) {
    const n = new THREE.Mesh(geo, mats); n.castShadow = n.receiveShadow = true;
    // lift by half the thickness so the origin is the base
    const g2 = new THREE.Group(); n.position.y = geo.parameters.height / 2; g2.add(n);
    return g2;
  }
  function pieceMesh(p) {
    if (p.kind === 'money') return moneyMesh(p.v);
    if (p.kind === 'card') return mesh(slabLook('card', 62, 40, 0.014, '#1f6694', (x, w, h) => {
      x.fillStyle = '#4a9fd8'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#1f6694'; x.fillRect(0, h * 0.25, w, h * 0.17);
      x.fillStyle = '#ffd166'; x.fillRect(w * 0.14, h * 0.55, w * 0.2, h * 0.27);
      label(x, '•••• 42', w * 0.66, h * 0.68, 40, '#fff', w * 0.5);
    }));
    return mesh(slabLook('receipt', 36, 48, 0.008, '#e9e2d6', (x, w, h) => {
      x.fillStyle = '#fffdf8'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#cbbba8';
      for (let i = 0; i < 4; i++) x.fillRect(w * 0.18, h * (0.14 + i * 0.16), i === 3 ? w * 0.4 : w * 0.64, h * 0.06);
      label(x, '✓', w * 0.72, h * 0.82, 70, '#3f9a6b', w);
    }));
  }

  /** Where a piece is in the world: lying on the counter, in the reader, held up, or in the air. */
  function placeOf(p, out) {
    const { x, y } = p;
    // (lying over the reader or the tray's rim, it rests on top of them so nothing hides it)
    if (p.where === 'rest') return out.copy(s3.at(x, y, TOP + (overlaps(p, L.reader) ? 0.06 : onTray(p) || overlaps(p, L.tray) ? 0.037 : 0.013) + (p.id % 8) * 0.003));
    if (p.where === 'reader') return out.copy(s3.at(x, y, TOP + 0.06));
    if (p.where === 'held') return out.copy(s3.at(x, y, TOP + 0.2));
    // in the air: dropping straight down onto its resting spot on the counter…
    if (p.restY != null && (p.above || y <= p.restY)) return out.copy(s3.atDepth(x, y, s3.at(x, p.restY, TOP).z));
    if (p.restY != null) return out.copy(s3.at(x, y, DH + 0.05));
    // …or down past the counter to the floor
    const zl = (L.floorY - p.hh) / (s3.sinE * SCALE), q = s3.atDepth(x, y, zl);
    return out.copy(q.y >= 0 ? q : s3.at(x, y, 0));
  }
  const tilt = (p) => ((p.id * 0.618) % 1 - 0.5) * 0.16;

  function syncGuest() {
    if (!cust) { if (guest) { s3.dropCritter(guest); guest = null; guestFor = null; } return; }
    if (guestFor !== cust) {
      if (guest) s3.dropCritter(guest);
      const i = Math.max(0, CRITTERS.indexOf(cust.ch)), seed = `till${seen}`;
      guest = s3.critter({ species: SPECIES[(i * 5 + seen) % SPECIES.length], outfit: casualOutfit(rng(seed)), seed, scale: L.P ? 0.92 : 1 });
      guestFor = cust;
    }
    const c = custPos(), p = s3.at(c.x, 0, 0);
    guest.setPosition(p.x, 0, L.custZ);
    const moving = cust.state === 'in' || cust.state === 'out';
    guest.walking = moving;
    if (moving) guest.phase += 0.2;
    guest.targetHeading = cust.state === 'in' ? Math.PI / 2 : cust.state === 'out' ? -Math.PI / 2 : 0;
    if (cust.state === 'out') { guest.loop(cust.happy ? null : 'angry'); guest.setMood(cust.happy ? 'happy' : null); if (cust.happy && cust.t < 0.05) guest.hop(0.8); }
    else if (cust.state === 'wait') {
      const k = cust.left / cust.patience;
      const paying = cust.type === 'card' ? !cust.read : custCashLeft() > 0;
      guest.loop(k < 0.3 ? 'angry' : paying ? 'serve' : null);
      if (cust.mood > 1.1) guest.wobble(0.6);
    } else guest.loop(null);
  }

  function syncPieces() {
    const live = new Set();
    for (const p of pieces) {
      live.add(p);
      let m = meshes.get(p);
      if (!m) { m = pieceMesh(p); m.rotation.y = tilt(p); meshes.set(p, m); world.add(m); }
      placeOf(p, m.position);
    }
    for (const [p, m] of meshes) if (!live.has(p)) { m.removeFromParent(); meshes.delete(p); }
    // flyers: arcing back to the customer or into the drawer
    const fl = new Set(flyers);
    for (const f of flyers) {
      let m = flyMeshes.get(f);
      if (!m) { m = pieceMesh(f.p); m.rotation.y = tilt(f.p); flyMeshes.set(f, m); world.add(m); }
      const k = f.t / 0.45, x = lerp(f.x0, f.x1, k), y = lerp(f.y0, f.y1, k);
      m.position.copy(s3.at(x, y, TOP + 0.05 + Math.sin(k * Math.PI) * 0.4));
      m.scale.setScalar(1 - 0.5 * clamp((k - 0.5) * 2, 0, 1));
    }
    for (const [f, m] of flyMeshes) if (!fl.has(f)) { m.removeFromParent(); flyMeshes.delete(f); }
    // dropped things lie on the floor for a moment
    const sp = new Set(splats);
    for (const s of splats) {
      if (splatMeshes.has(s)) continue;
      const m = pieceMesh(s.p); m.rotation.y = tilt(s.p) * 4;
      m.position.copy(s3.at(clamp(s.p.x, 20, view.W - 20), L.floorY - s.p.hh * 0.5, 0));
      splatMeshes.set(s, m); world.add(m);
    }
    for (const [s, m] of splatMeshes) if (!sp.has(s)) { m.removeFromParent(); splatMeshes.delete(s); }
  }

  function draw() {
    if (needBuild) { needBuild = false; build(); }
    syncGuest();
    syncPieces();
    readerLight.material.color.set(cust?.read ? '#9ef0b6' : pieces.some((p) => p.where === 'reader') ? '#ffe08a' : '#c7e6d3');
    if (me) me.loop(held ? 'serve' : null);
    s3.render();

    // 2D: coin values, labels, the bubble, the register screen, the button, notes
    const { W } = view;
    s3.begin2d();
    const tag = (str, x, y, size = 12, align = 'center') => text(g, str, x, y, { size, color: '#fff', weight: 800, stroke: 'rgba(60,50,60,.55)', align });
    tag('Customer', L.offer.x + 10, L.offer.y + 12, 11, 'left');
    tag('Change tray', L.tray.x + L.tray.w - 10, L.tray.y + 12, 11, 'right');
    // coin values, on the stock in the drawer and on every loose coin
    for (const s of L.slots) {
      const m = BY_V.get(s.v);
      if (!m.note) coinLabel(m, s.x + s.w / 2, s.y + s.h / 2);
    }
    const coin = (p, x = p.x, y = p.y) => { if (p.kind === 'money' && !BY_V.get(p.v).note) coinLabel(BY_V.get(p.v), x, y); };
    for (const p of pieces) if (p !== held?.p) coin(p);
    for (const f of flyers) { const k = f.t / 0.45; if (k < 0.6) { const v = s3.toView(flyMeshes.get(f)?.position || new THREE.Vector3()); coin(f.p, v.x, v.y); } }
    if (held) coin(held.p);

    // the customer's bubble
    if (cust && cust.state !== 'out') {
      const b = L.bubble, k = cust.state === 'wait' ? cust.left / cust.patience : 1;
      box(g, b.x, b.y, b.w, b.h, { fill: '#fff', r: 14, shadow: 3 });
      g.beginPath(); g.moveTo(b.x + 2, b.y + b.h * 0.55); g.lineTo(b.x - 12, b.y + b.h * 0.72); g.lineTo(b.x + 2, b.y + b.h * 0.75); g.fillStyle = '#fff'; g.fill();
      text(g, `Total ${fmt(cust.total)}`, b.x + 14, b.y + 22, { size: 19, align: 'left', weight: 800 });
      const how = cust.type === 'card' ? 'Paying by card' : cust.type === 'exact' ? `Exact change: ${fmt(cust.paid)}` : `Paying ${fmt(cust.paid)}`;
      text(g, how, b.x + 14, b.y + 46, { size: 14, align: 'left', color: C.muted, weight: 700 });
      box(g, b.x + 14, b.y + b.h - 16, b.w - 28, 7, { fill: C.line, r: 4 });
      if (k > 0) box(g, b.x + 14, b.y + b.h - 16, (b.w - 28) * k, 7, { fill: k < 0.3 ? C.berry : k < 0.6 ? C.butter : C.leaf, r: 4 });
    }
    // the register screen: a little green LCD in a bezel
    const sc = L.screen;
    box(g, sc.x - 4, sc.y - 4, sc.w + 8, sc.h + 8, { fill: '#5a6e8c', r: 13, shadow: 3 });
    box(g, sc.x, sc.y, sc.w, sc.h, { fill: '#2f3d36', r: 10, stroke: '#24302a' });
    g.save(); rr(g, sc.x, sc.y, sc.w, sc.h, 10); g.clip(); g.fillStyle = 'rgba(158,240,182,.07)'; for (let y = sc.y + 2; y < sc.y + sc.h; y += 4) g.fillRect(sc.x, y, sc.w, 1.5); g.restore();
    if (cust && cust.state !== 'out') {
      if (cust.type === 'card') {
        text(g, cust.read ? 'APPROVED' : 'CARD', sc.x + sc.w / 2, sc.y + 20, { size: 13, color: '#bff0cf', weight: 700 });
        text(g, cust.read ? 'Card + receipt back' : 'Tap card on reader', sc.x + sc.w / 2, sc.y + 40, { size: 14, color: '#e9fff0', weight: 700 });
      } else {
        const t = trayMoney(), ok = t === cust.due;
        text(g, `CHANGE ${fmt(cust.due)}`, sc.x + sc.w / 2, sc.y + 20, { size: 16, color: '#e9fff0', weight: 800 });
        text(g, `on tray ${fmt(t)}`, sc.x + sc.w / 2, sc.y + 41, { size: 13, color: ok ? '#9ef0b6' : t > cust.due ? '#ffb3bb' : '#bfd6c8', weight: 700 });
      }
    } else text(g, 'NEXT, PLEASE', sc.x + sc.w / 2, sc.y + sc.h / 2, { size: 13, color: '#bff0cf', weight: 700 });
    // hand-over button
    const b = L.btn, down = pressT < 0.12;
    const ready = cust && cust.state === 'wait' && (cust.type === 'card' ? cust.read : !custCashLeft());
    box(g, b.x, b.y + (down ? 3 : 0), b.w, b.h, { fill: ready ? C.leaf : '#e9dcc8', r: 16, shadow: down ? 0 : 4, stroke: ready ? C.leafD : C.line });
    text(g, 'Hand over', b.x + b.w / 2, b.y + b.h / 2 + (down ? 3 : 0), { size: 19, color: ready ? '#fff' : C.muted, weight: 800 });

    if (L.P) text(g, 'Drawer', L.drawer.x + L.drawer.w / 2, L.drawer.y + L.drawer.h + 22, { size: 13, color: C.ink, weight: 800, stroke: '#fff' });
    // card read progress
    const rp = pieces.find((p) => p.where === 'reader'), rd = L.reader;
    if (rp) { g.beginPath(); g.arc(rd.x + rd.w / 2, rd.y + rd.h * 0.35, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(rp.readT / READ_TIME, 0, 1)); g.strokeStyle = C.leaf; g.lineWidth = 4; g.stroke(); }

    pops.draw(g);
    if (ctx.elapsed() < 9 && served === 0 && cust && cust.state === 'wait') {
      const hint = custCashLeft() ? 'Drag their cash into the matching drawer slot' : 'Drag the change from the drawer onto the tray, then Hand over';
      const hy = L.P ? L.drawer.y + L.drawer.h + 50 : L.cBot + 11;
      text(g, hint, W / 2, hy, { size: L.P ? 14 : 13, color: C.ink, stroke: '#fff', weight: 800, alpha: 1 - Math.max(0, ctx.elapsed() - 7) / 2 });
    }
  }
  function coinLabel(m, x, y) { text(g, m.label, x, y + 1, { size: m.r < 19 ? 12 : 14, color: m.ink, weight: 800, stroke: 'rgba(255,255,255,.8)' }); }

  return {
    update(dt) { step(dt); },
    draw,
    /** For automated play-tests. */
    peek() {
      return {
        view: { ...view }, L: JSON.parse(JSON.stringify(L)), served, seen,
        cust: cust && { type: cust.type, total: cust.total, paid: cust.paid, due: cust.due, state: cust.state, left: cust.left, read: cust.read },
        pieces: pieces.map((p) => ({ id: p.id, kind: p.kind, v: p.v, own: p.own, x: p.x, y: p.y, where: p.where, onTray: onTray(p) })),
        tray: trayMoney(), held: !!held,
      };
    },
    destroy() {
      offPointer();
      for (const l of looks.values()) { l.geo.dispose(); l.mats[2].map?.dispose(); }
      s3.destroy();
    },
  };
}

/* A coin: a chunky disc in its metal, with a raised rim. */
defineModel('cashier:coin', (b, o) => {
  const m = MONEY.find((x) => x.v === o.v), r = m.r / SCALE;
  b.cyl(r, r, 0.024, m.ink, { y: 0.012 }, 24);
  b.cyl(r * 0.97, r * 0.97, 0.026, m.fill, { y: 0.013 }, 24);
  b.torus(r * 0.8, 0.006, m.v === 1 ? '#f0bf93' : '#ffffff', { y: 0.026, rx: Math.PI / 2 });
});
