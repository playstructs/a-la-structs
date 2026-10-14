/**
 * Floor plan. Restaurant-local coordinates, metres-ish; +z faces the street
 * (and the camera).
 *
 *        z=-8  ┌───────── Cooking Line (land) ───────┬──── Dish Pit (water) ────┐
 *              │  back wall: chef / freezer / gear   │  back wall: sous / gear  │
 *              │  cooks at stations, facing camera   │  washers at sinks        │
 *        z=-1.5├────── pass window ──door──────────────────door─────────────────┤
 *              │       Dining Room (air)            │    Bar & Counter (space)  │
 *        z=6.5 └────────────── front door ─────────────────────────────────────┘
 *              sidewalk: pole signs, sign spinners          street beyond
 */
import * as THREE from 'three';

export const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);

export const BOUNDS = { x0: -12, x1: 12, z0: -8, z1: 6.5 };
export const DIVIDER_Z = -1.5;
export const KITCHEN_SPLIT_X = 1.5;
export const FOH_SPLIT_X = 4;

export const AREA_RECTS = {
  land: { x0: -12, x1: KITCHEN_SPLIT_X, z0: -8, z1: DIVIDER_Z },
  water: { x0: KITCHEN_SPLIT_X, x1: 12, z0: -8, z1: DIVIDER_Z },
  air: { x0: -12, x1: FOH_SPLIT_X, z0: DIVIDER_Z, z1: 6.5 },
  space: { x0: FOH_SPLIT_X, x1: 12, z0: DIVIDER_Z, z1: 6.5 },
};

/** Fleet stations: where crew in slot N of an area work. stand = where the critter stands; prop = their station. */
export const STATIONS = {
  land: [0, 1, 2, 3].map((i) => ({ stand: V(-10.2 + i * 2.9, -5.5), prop: V(-10.2 + i * 2.9, -4.45), face: 0 })),
  water: [0, 1, 2, 3].map((i) => ({ stand: V(3.2 + i * 2.35, -5.5), prop: V(3.2 + i * 2.35, -4.45), face: 0 })),
  space: [0, 1, 2, 3].map((i) => ({ stand: V(5.7 + i * 1.65, 0.15), prop: V(5.7 + i * 1.65, 1.15), face: 0 })),
  air: [0, 1, 2, 3].map((i) => ({ stand: V(-10.6 + i * 2.6, -0.45), prop: V(-10.6 + i * 2.6, -0.95), face: 0, propFace: 0 })),
};

/** Where the Manager stands in each area. */
export const COMMAND_SPOT = {
  land: { stand: V(-0.4, -2.8), face: 0.3 },
  water: { stand: V(7.2, -2.6), face: -0.2 },
  air: { stand: V(0.8, 2.8), face: -0.4 },
  space: { stand: V(8.4, 3.4), face: 0.0 },
};

/**
 * Planetary slots per area. Kitchen gear sits by the back wall with its
 * operator behind it; bar gear sits along the front window.
 */
export const PLANET_SPOTS = {
  land: [0, 1, 2, 3].map((i) => ({ prop: V(-10.4 + i * 2.95, -6.75), stand: V(-10.4 + i * 2.95, -7.45), face: 0 })),
  water: [0, 1, 2, 3].map((i) => ({ prop: V(3.3 + i * 2.35, -6.75), stand: V(3.3 + i * 2.35, -7.45), face: 0 })),
  space: [V(5.0, 4.9), V(7.0, 5.6), V(9.4, 5.6), V(11.2, 4.4)].map((p) => ({ prop: p, stand: p.clone().add(V(0, -0.8)), face: 0 })),
  air: [V(-11, 5.5), V(-8.5, 5.8), V(-6, 5.8), V(-3.5, 5.8)].map((p) => ({ prop: p, stand: p.clone().add(V(0, -0.8)), face: 0 })),
};

/** Curbside spots for signs and sign spinners (by ambit side + slot). */
export const CURB_SPOTS = {
  land: [V(-10.4, 8.6), V(-7.8, 8.9), V(-5.2, 8.6), V(-2.6, 8.9)],
  water: [V(6.0, 8.9), V(8.4, 8.6), V(10.6, 8.9), V(4.0, 8.6)],
  air: [V(-1.0, 8.8), V(-11.5, 9.2), V(-9, 9.2), V(-6.5, 9.2)],
  space: [V(11.5, 9.2), V(9.0, 9.4), V(7.0, 9.4), V(5.0, 9.4)],
};

/** Dining tables (centres). */
export const TABLES = [V(-9.8, 1.6), V(-6.2, 1.6), V(-2.6, 1.6), V(-9.8, 4.6), V(-6.2, 4.6), V(-2.6, 4.6)];
export const BAR = { x0: 5.0, x1: 11.6, z: 1.15, stoolZ: 2.35 };
export const PASS = { x0: -6.5, x1: -2.5, z: DIVIDER_Z };

/** Customer seats per area (index = enemy slot; the Critic gets the extra one). */
export const CUSTOMER_SPOTS = {
  space: [V(5.7, 2.35), V(7.35, 2.35), V(9.0, 2.35), V(10.65, 2.35), V(8.2, 4.3)],
  air: [V(-10.75, 1.65), V(-7.15, 1.65), V(-3.55, 1.65), V(-10.75, 4.65), V(-6.2, 3.2)],
  land: [V(-10.2, -2.25), V(-7.3, -2.25), V(-4.4, -2.25), V(-1.5, -2.25), V(-5.8, -3.2)],
  water: [V(3.2, -2.25), V(5.55, -2.25), V(7.9, -2.25), V(10.25, -2.25), V(9.0, -3.3)],
};
/** Which customer spots are seats (stools/chairs) and how high. */
export const CUSTOMER_SEAT = { space: 0.78, air: 0.5, land: 0.78, water: 0.78 };
export const CUSTOMER_FACE = { space: Math.PI, air: Math.PI / 2, land: Math.PI, water: Math.PI };

export const DOOR = V(2.6, 6.9);
export const STREET_Z = 11.5;

/* ── walking routes ─────────────────────────────────────────────────────── */

const NODES = {
  street: V(2.6, 9.6),
  door: V(2.6, 6.3),
  foh: V(1.5, 3.2),
  dining: V(-5.5, 3.1),
  diningBack: V(-5.5, 0.3),
  bar: V(8.4, 3.3),
  behindBar: V(4.6, 0.0),
  kDoorL: V(-0.2, -0.6),
  kDoorL2: V(-0.2, -2.4),
  kDoorR: V(5.2, -0.6),
  kDoorR2: V(5.2, -2.4),
  line: V(-5.5, -3.3),
  lineBack: V(-5.5, -6.2),
  dish: V(6.7, -3.3),
  dishBack: V(6.7, -6.2),
  kMid: V(1.5, -3.2),
  curbL: V(-5.5, 8.3),
  curbR: V(8.0, 8.3),
};

const EDGES = [
  ['street', 'door'], ['street', 'curbL'], ['street', 'curbR'], ['door', 'foh'], ['foh', 'dining'], ['foh', 'bar'],
  ['dining', 'diningBack'], ['diningBack', 'kDoorL'], ['foh', 'kDoorL'], ['bar', 'behindBar'], ['behindBar', 'kDoorR'],
  ['kDoorL', 'kDoorL2'], ['kDoorR', 'kDoorR2'], ['kDoorL2', 'line'], ['kDoorL2', 'kMid'], ['kMid', 'dish'], ['kDoorR2', 'dish'],
  ['line', 'lineBack'], ['dish', 'dishBack'], ['kMid', 'kDoorR2'],
];

const ADJ = {};
for (const [a, b] of EDGES) { (ADJ[a] = ADJ[a] || []).push(b); (ADJ[b] = ADJ[b] || []).push(a); }

/** Which zone a point is in — limits which nodes it may join from (no walking through walls). */
export function zoneOf(p) {
  if (p.z > 6.5) return 'outside';
  if (p.z < DIVIDER_Z) return p.x < KITCHEN_SPLIT_X ? 'land' : 'water';
  if (p.x > FOH_SPLIT_X && p.z < 2.0 && p.z > -1.5 && p.x > 4.7) return 'behindBar';
  return p.x < FOH_SPLIT_X ? 'air' : 'space';
}

const ZONE_NODES = {
  outside: ['street', 'curbL', 'curbR', 'door'],
  air: ['dining', 'diningBack', 'foh', 'kDoorL', 'door'],
  space: ['bar', 'foh', 'door'],
  behindBar: ['behindBar', 'kDoorR'],
  land: ['line', 'lineBack', 'kDoorL2', 'kMid'],
  water: ['dish', 'dishBack', 'kDoorR2', 'kMid'],
};

function nearestNode(p) {
  const zone = zoneOf(p);
  let best = null, bd = Infinity;
  for (const n of ZONE_NODES[zone]) {
    const d = NODES[n].distanceToSquared(p);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

function bfs(a, b) {
  if (a === b) return [a];
  const prev = { [a]: null };
  const q = [a];
  while (q.length) {
    const n = q.shift();
    for (const m of ADJ[n] || []) {
      if (m in prev) continue;
      prev[m] = n;
      if (m === b) { const path = [b]; let c = n; while (c) { path.unshift(c); c = prev[c]; } return path; }
      q.push(m);
    }
  }
  return [a, b];
}

/** A list of points to walk from `from` to `to` without crossing walls. */
export function route(from, to) {
  const za = zoneOf(from), zb = zoneOf(to);
  if (za === zb) return [to.clone()];
  const a = nearestNode(from), b = nearestNode(to);
  const pts = bfs(a, b).map((n) => NODES[n].clone());
  pts.push(to.clone());
  // small jitter so crowds don't walk single-file on the exact same line
  for (let i = 0; i < pts.length - 1; i++) { pts[i].x += (Math.random() - 0.5) * 0.5; pts[i].z += (Math.random() - 0.5) * 0.5; }
  return pts;
}

export function randomIn(area, margin = 1) {
  const r = AREA_RECTS[area];
  return V(r.x0 + margin + Math.random() * (r.x1 - r.x0 - margin * 2), r.z0 + margin + Math.random() * (r.z1 - r.z0 - margin * 2));
}

export { NODES };
