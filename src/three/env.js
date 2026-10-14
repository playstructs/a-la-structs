/**
 * The restaurant building: floors, walls, the bar, the dining room, the
 * kitchen line, the dish pit, and the street out front. Everything static.
 */
import * as THREE from 'three';
import { Builder, VC, toonMat, textTexture, glowMat } from './toon.js';
import * as P from './props.js';
import { AREA_RECTS, DIVIDER_Z, KITCHEN_SPLIT_X, TABLES, BAR, STATIONS, PASS } from './layout.js';
import { awningFor } from '../lexicon/names.js';

function tileTexture(draw, size = 256, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.repeat.set(repeat, repeat);
  return t;
}

const FLOORS = {
  land: () => tileTexture((g, s) => {
    const n = 4, q = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? '#f7e3d4' : '#e8b8a0'; g.fillRect(i * q, j * q, q, q); }
    g.strokeStyle = 'rgba(120,80,60,.15)'; g.lineWidth = 2;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * q, 0); g.lineTo(i * q, s); g.stroke(); g.beginPath(); g.moveTo(0, i * q); g.lineTo(s, i * q); g.stroke(); }
  }),
  water: () => tileTexture((g, s) => {
    g.fillStyle = '#e3f4f7'; g.fillRect(0, 0, s, s);
    const n = 8, q = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i * 3 + j * 5) % 7 === 0) { g.fillStyle = '#9fd6dc'; g.fillRect(i * q + 1, j * q + 1, q - 2, q - 2); }
    g.strokeStyle = 'rgba(80,140,150,.25)'; g.lineWidth = 2;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * q, 0); g.lineTo(i * q, s); g.stroke(); g.beginPath(); g.moveTo(0, i * q); g.lineTo(s, i * q); g.stroke(); }
  }),
  air: () => tileTexture((g, s) => {
    const rows = 6, h = s / rows;
    const tones = ['#d9a571', '#cf9a66', '#e0ad7b', '#d49f6c'];
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * s * 0.33;
      for (let x = -s; x < s * 2; x += s * 0.66) { g.fillStyle = tones[(r + Math.floor(x / 50)) & 3]; g.fillRect(x + off, r * h, s * 0.66 - 3, h - 3); }
    }
    g.fillStyle = 'rgba(120,70,30,.18)';
    for (let r = 0; r < rows; r++) g.fillRect(0, r * h + h - 3, s, 3);
  }),
  space: () => tileTexture((g, s) => {
    g.fillStyle = '#f6efe2'; g.fillRect(0, 0, s, s);
    const n = 4, q = s / n;
    g.fillStyle = '#7fcfc0';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) % 2) { g.save(); g.translate(i * q + q / 2, j * q + q / 2); g.rotate(Math.PI / 4); g.fillRect(-q * 0.35, -q * 0.35, q * 0.7, q * 0.7); g.restore(); }
  }),
  sidewalk: () => tileTexture((g, s) => {
    g.fillStyle = '#e7e1d8'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#cfc6ba'; g.lineWidth = 4;
    g.strokeRect(2, 2, s - 4, s - 4);
    for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(160,150,140,.25)'; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 2 + Math.random() * 3, 0, 7); g.fill(); }
  }),
  grass: () => tileTexture((g, s) => {
    g.fillStyle = '#9fd685'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 160; i++) { g.fillStyle = i % 3 ? '#8cc972' : '#b3e39b'; g.fillRect(Math.random() * s, Math.random() * s, 3, 8); }
  }),
  road: () => tileTexture((g, s) => {
    g.fillStyle = '#6b6f7d'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 80; i++) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(Math.random() * s, Math.random() * s, 4, 4); }
  }),
  wallTile: () => tileTexture((g, s) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#d7e3ea'; g.lineWidth = 3;
    const rows = 8, h = s / rows;
    for (let r = 0; r < rows; r++) {
      g.beginPath(); g.moveTo(0, r * h); g.lineTo(s, r * h); g.stroke();
      const off = (r % 2) * s / 8;
      for (let x = off; x < s; x += s / 4) { g.beginPath(); g.moveTo(x, r * h); g.lineTo(x, r * h + h); g.stroke(); }
    }
  }),
  wallpaper: () => tileTexture((g, s) => {
    g.fillStyle = '#fff1dd'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#ffd6c4';
    for (let i = 0; i < 4; i++) g.fillRect(i * s / 4 + s / 16, 0, s / 16, s);
    g.fillStyle = '#ffb3a0';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(i * s / 4 + s / 5.5, j * s / 4 + s / 8, 5, 0, 7); g.fill(); }
  }),
};

const texCache = {};
function floorMat(kind, rx, rz) {
  const key = `${kind}:${rx}:${rz}`;
  if (!texCache[key]) {
    const t = FLOORS[kind]();
    t.repeat.set(rx, rz);
    // Flat ground layers: pull toward the camera a touch so stacked layers never fight.
    texCache[key] = new THREE.MeshToonMaterial({ map: t, gradientMap: toonMat({}).gradientMap, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    texCache[key].userData.outlineParameters = { visible: false };
  }
  return texCache[key];
}

function plane(w, d, mat, x, z, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

function wallMat(kind, rx, ry) {
  const key = `wall:${kind}:${rx}:${ry}`;
  if (!texCache[key]) {
    const t = FLOORS[kind]();
    t.repeat.set(rx, ry);
    texCache[key] = new THREE.MeshToonMaterial({ map: t, gradientMap: toonMat({}).gradientMap });
  }
  return texCache[key];
}

/**
 * @param {{ name: string, ownerId: string, peek?: boolean }} opts
 * @returns {{ group, ground, chairs, stools, nameSign, ticks }}
 */
export function buildRestaurant({ name = 'Your Restaurant', ownerId = 'me' } = {}) {
  const g = new THREE.Group();
  g.name = 'restaurant';
  const ticks = [];
  const add = (o, x = 0, y = 0, z = 0, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; g.add(o); if (o.userData.tick) ticks.push(o); return o; };
  const [awningColor, awningStripe] = awningFor(ownerId);

  // ground, sidewalk, street
  const ground = plane(120, 120, floorMat('grass', 30, 30), 0, 0, -0.12);
  g.add(ground);
  g.add(plane(40, 4.6, floorMat('sidewalk', 10, 1.15), 0, 8.8, -0.03));
  g.add(plane(80, 7, floorMat('road', 20, 2), 0, 14.6, -0.07));
  const lines = new Builder();
  for (let x = -38; x < 40; x += 4) lines.flat(2, 0.04, 0.18, '#fff6d5', { x, y: -0.04, z: 14.6 });
  lines.flat(80, 0.03, 0.25, '#d9d2c5', { y: 0.06, z: 11.15 });
  for (let i = 0; i < 6; i++) lines.flat(0.6, 0.04, 3.2, '#f4f1ea', { x: 0.2 + i * 1.0, y: -0.04, z: 14.6 });
  g.add(lines.mesh({ shadow: false }));
  g.add(plane(30, 4, floorMat('sidewalk', 7, 1), 0, -10.5, -0.03));

  // floors by area
  for (const [area, r] of Object.entries(AREA_RECTS)) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const scale = area === 'water' ? 0.45 : area === 'air' ? 0.33 : 0.5;
    g.add(plane(w, d, floorMat(area, w * scale, d * scale), (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 0.01));
  }
  // baseboard / foundation
  const base = new Builder();
  base.box(24.6, 0.18, 15.1, '#d8c3a5', { y: -0.1, z: -0.75 }, 0.05); // top at -0.01, just under the floors (0.01)
  g.add(base.mesh({ shadow: false }));

  // walls
  const walls = new Builder();
  const H = 2.8;
  // back wall (kitchen) & left wall: tall; right wall: half; front: low railing
  const back = new THREE.Mesh(new THREE.BoxGeometry(24.4, H, 0.3), wallMat('wallTile', 12, 1.4));
  back.position.set(0, H / 2, -8.15); back.receiveShadow = true; g.add(back);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.3, H, 14.9), wallMat('wallpaper', 6, 1.2));
  left.position.set(-12.15, H / 2, -0.75); left.receiveShadow = true; g.add(left);
  walls.box(0.3, 1.2, 14.9, '#f2c9a0', { x: 12.15, y: 0.6, z: -0.75 }, 0.05);
  walls.box(0.34, 0.1, 15.0, '#c98f5a', { x: 12.15, y: 1.23, z: -0.75 }, 0.03);
  // front railing with door gap (x 1..4.2)
  walls.box(13.0, 0.55, 0.25, '#f2c9a0', { x: -5.5, y: 0.28, z: 6.6 }, 0.05);
  walls.box(7.8, 0.55, 0.25, '#f2c9a0', { x: 8.2, y: 0.28, z: 6.6 }, 0.05);
  walls.box(13.0, 0.08, 0.32, '#c98f5a', { x: -5.5, y: 0.58, z: 6.6 }, 0.03);
  walls.box(7.8, 0.08, 0.32, '#c98f5a', { x: 8.2, y: 0.58, z: 6.6 }, 0.03);
  // door frame posts
  walls.box(0.3, 3.0, 0.3, '#c98f5a', { x: 1.0, y: 1.5, z: 6.6 }, 0.05);
  walls.box(0.3, 3.0, 0.3, '#c98f5a', { x: 4.2, y: 1.5, z: 6.6 }, 0.05);
  // divider (FOH/BOH) half wall with door gaps at x [-1,0.6] and [4.6,5.8]
  const divSeg = (x0, x1, h = 1.15) => {
    walls.box(x1 - x0, h, 0.28, '#f7e3cf', { x: (x0 + x1) / 2, y: h / 2, z: DIVIDER_Z }, 0.05);
    walls.box(x1 - x0 + 0.04, 0.08, 0.36, '#c98f5a', { x: (x0 + x1) / 2, y: h + 0.02, z: DIVIDER_Z }, 0.03);
  };
  divSeg(-12, PASS.x0, 1.15);
  divSeg(PASS.x0, PASS.x1, 0.9);
  divSeg(PASS.x1, -1.0, 1.15);
  divSeg(0.6, 4.6, 1.15);
  divSeg(5.8, 12, 1.15);
  // kitchen split
  walls.box(0.26, 1.15, 3.7, '#f7e3cf', { x: KITCHEN_SPLIT_X, y: 0.58, z: -6.15 }, 0.05);
  walls.box(0.34, 0.08, 3.74, '#c98f5a', { x: KITCHEN_SPLIT_X, y: 1.18, z: -6.15 }, 0.03);
  // windows on the left wall
  for (const z of [-5.0, 1.5, 4.5]) {
    walls.box(0.1, 1.2, 1.6, '#c98f5a', { x: -11.98, y: 1.6, z }, 0.05);
    walls.box(0.12, 1.0, 1.4, '#bfe7ff', { x: -11.96, y: 1.6, z }, 0.03);
    walls.flat(0.14, 1.0, 0.06, '#c98f5a', { x: -11.95, y: 1.6, z });
  }
  // back door (dish pit, right wall)
  walls.box(0.2, 2.1, 1.2, '#7aa5c9', { x: 12.05, y: 1.05, z: -4.0 }, 0.05);
  g.add(walls.mesh());

  // awning & name sign
  add(P.awning(4.4, awningColor, awningStripe), 2.6, 2.75, 6.95);
  const signTex = textTexture(name, { w: 1024, h: 180, bg: '#fff7e8', fg: '#5a3b2a', border: awningColor, font: '700 96px Fredoka, "Baloo 2", system-ui, sans-serif', radius: 40 });
  const nameSign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.8), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
  nameSign.material.userData.outlineParameters = { visible: false };
  nameSign.position.set(2.6, 3.55, 7.08);
  g.add(nameSign);
  const signBoard = new Builder();
  signBoard.box(4.85, 1.0, 0.15, awningColor, { x: 2.6, y: 3.55, z: 6.96 }, 0.12);
  g.add(signBoard.mesh());

  // ── Bar & Counter (space)
  const bar = new Builder();
  const bw = BAR.x1 - BAR.x0;
  bar.box(bw, 1.0, 0.8, '#3f8f86', { x: (BAR.x0 + BAR.x1) / 2, y: 0.5, z: BAR.z }, 0.06);
  bar.box(bw + 0.15, 0.08, 0.95, '#f4efe6', { x: (BAR.x0 + BAR.x1) / 2, y: 1.03, z: BAR.z }, 0.03);
  bar.flat(bw, 0.06, 0.04, '#d4a017', { x: (BAR.x0 + BAR.x1) / 2, y: 0.2, z: BAR.z + 0.44 });
  g.add(bar.mesh());
  add(P.backShelf(6.0), 8.6, 0, -1.2);
  const stools = [];
  for (const s of STATIONS.space) stools.push(add(P.stool(['#e8505b', '#ffd66b', '#4fbfa8', '#b18cf2'][stools.length % 4]), s.prop.x, 0, BAR.stoolZ));
  // pendant lamps over the bar
  for (const s of STATIONS.space) {
    const pb = new Builder();
    pb.flat(0.02, 1.0, 0.02, '#3b2f2f', { y: 3.3 });
    pb.cone(0.22, 0.25, '#ffd66b', { y: 2.75 }, 12);
    const lamp = pb.mesh({ shadow: false });
    lamp.position.set(s.prop.x, 0, BAR.z);
    g.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), glowMat('#fff3c4'));
    bulb.position.set(s.prop.x, 2.62, BAR.z);
    g.add(bulb);
  }
  add(P.plant(1.1), 11.4, 0, -0.9);

  // ── Dining room (air)
  const chairs = [];
  const chairColors = ['#e88d67', '#7cc6a4', '#f2c14e', '#9fb7ff'];
  TABLES.forEach((t, i) => {
    add(P.table(true, i % 2 ? '#fff5f5' : '#f1fbff'), t.x, 0, t.z);
    for (const s of [-1, 1]) {
      const c = add(P.chair(chairColors[i % 4]), t.x + s * 0.95, 0, t.z + 0.05, -s * Math.PI / 2);
      chairs.push({ obj: c, pos: c.position.clone(), face: -s * Math.PI / 2 + (s > 0 ? 0 : 0), table: t, side: s });
    }
  });
  add(P.rug(8.0, 5.6, '#f2a6a0'), -6.2, 0, 3.1);
  add(P.plant(1.2), -11.3, 0, 6.0);
  add(P.plant(0.9), 0.3, 0, 5.9);
  const mb = P.menuBoard();
  mb.position.set(-11.95, 1.9, -0.2); mb.rotation.y = Math.PI / 2;
  g.add(mb);
  // little framed pictures on the left wall
  const pics = new Builder();
  for (const [z, c] of [[3.0, '#ffb3c6'], [-0.3 + 2.0, '#bde0fe'], [6.0, '#caffbf']]) { pics.box(0.06, 0.6, 0.8, '#c98f5a', { x: -11.98, y: 2.3, z }, 0.03); pics.flat(0.07, 0.48, 0.66, c, { x: -11.97, y: 2.3, z }); }
  g.add(pics.mesh());

  // ── Cooking line (land)
  add(P.potRack(3.6), -5.8, 0, -7.6);
  const shelf = new Builder();
  for (const x of [-11.2, -8.0, -5.0, -2.0]) {
    shelf.box(1.6, 0.06, 0.35, '#c98f5a', { x, y: 2.0, z: -7.85 }, 0.01);
    for (let i = 0; i < 4; i++) shelf.cyl(0.09, 0.09, 0.22, ['#ffd166', '#ef476f', '#06d6a0', '#118ab2'][i], { x: x - 0.55 + i * 0.36, y: 2.14, z: -7.85 });
  }
  g.add(shelf.mesh());
  const passW = P.passWindow(PASS.x1 - PASS.x0);
  add(passW, (PASS.x0 + PASS.x1) / 2, 0, PASS.z);
  // chef's counter stools on the kitchen side of the pass (customer seats in a challenge)
  for (let i = 0; i < 4; i++) stools.push(add(P.stool('#f2a65a'), -10.2 + i * 2.9, 0, -2.25));

  // ── Dish pit (water)
  add(P.potRack(3.0), 7.0, 0, -7.6);
  const rack = new Builder();
  rack.box(1.6, 1.6, 0.5, '#c9d3da', { x: 11.2, y: 0.8, z: -2.6 }, 0.04);
  for (let s = 0; s < 3; s++) for (let i = 0; i < 6; i++) rack.cyl(0.14, 0.14, 0.02, '#fbfaf5', { x: 10.65 + i * 0.22, y: 0.4 + s * 0.5, z: -2.6, rz: Math.PI / 2 });
  g.add(rack.mesh());
  for (let i = 0; i < 4; i++) stools.push(add(P.stool('#4fbfa8'), 3.2 + i * 2.35, 0, -2.25));

  // ── outside
  add(P.flowerBox(3.0), -9.5, 0, 7.3);
  add(P.flowerBox(3.0), -5.0, 0, 7.3);
  add(P.flowerBox(2.4), 8.8, 0, 7.3);
  add(P.bench(), -1.4, 0, 9.9, Math.PI);
  add(P.lampPost(), -12.5, 0, 10.4);
  add(P.lampPost(), 12.5, 0, 10.4);
  add(P.tree(1.1, 0.4), -14.5, 0, 6.5);
  add(P.tree(1.3, 1.7), 14.8, 0, 4.0);
  add(P.tree(1.0, 2.6), -15.2, 0, -3.5);
  add(P.tree(1.2, 3.3), 15.4, 0, -6.5);
  add(P.tree(0.9, 1.2), -14.0, 0, -9.5);
  add(P.car('#ffb3c6'), -7.5, 0, 13.2);
  add(P.car('#a0e7e5'), 9.5, 0, 16.2, Math.PI);

  return { group: g, ground, chairs, stools, nameSign, ticks };
}
