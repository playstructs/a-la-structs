/**
 * Walking around things. A coarse occupancy grid over the restaurant and its
 * sidewalk: walls, furniture and station gear are blocked (grown by a
 * critter's radius), and paths are found with A* and then straightened
 * wherever there's a clear line, so critters walk natural lines around
 * tables instead of through them.
 */
import * as THREE from 'three';

const CELL = 0.15;          // metres per grid cell
const RADIUS = 0.25;        // a critter's half-width: obstacles grow by this much
const AREA = { x0: -17, x1: 17, z0: -9.5, z1: 12.5 };
const SQRT2 = Math.SQRT2;
const box3 = new THREE.Box3();

export class NavGrid {
  /** @param {Array<{x0,x1,z0,z1}|{x,z,r}>} obstacles footprints on the floor (x/z, before growing) */
  constructor(obstacles = []) {
    this.w = Math.ceil((AREA.x1 - AREA.x0) / CELL);
    this.h = Math.ceil((AREA.z1 - AREA.z0) / CELL);
    this.blocked = new Uint8Array(this.w * this.h);
    for (const o of obstacles) this.add(o);
  }

  ix(x) { return Math.floor((x - AREA.x0) / CELL); }
  iz(z) { return Math.floor((z - AREA.z0) / CELL); }
  cx(i) { return AREA.x0 + (i + 0.5) * CELL; }
  cz(j) { return AREA.z0 + (j + 0.5) * CELL; }
  inside(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h; }
  free(i, j) { return this.inside(i, j) && !this.blocked[j * this.w + i]; }

  /** Block a footprint: a rectangle {x0,x1,z0,z1} or a circle {x,z,r}. */
  add(o) {
    if ('r' in o) {
      const r = o.r + RADIUS;
      for (let j = this.iz(o.z - r); j <= this.iz(o.z + r); j++) for (let i = this.ix(o.x - r); i <= this.ix(o.x + r); i++) {
        if (this.inside(i, j) && (this.cx(i) - o.x) ** 2 + (this.cz(j) - o.z) ** 2 <= r * r) this.blocked[j * this.w + i] = 1;
      }
      return;
    }
    for (let j = this.iz(o.z0 - RADIUS); j <= this.iz(o.z1 + RADIUS); j++) for (let i = this.ix(o.x0 - RADIUS); i <= this.ix(o.x1 + RADIUS); i++) {
      if (this.inside(i, j)) this.blocked[j * this.w + i] = 1;
    }
  }

  /** Block whatever a 3D object stands on (its bounding box on the floor). */
  addObject(obj, shrink = 0.05) {
    box3.setFromObject(obj);
    if (box3.isEmpty() || box3.min.y > 0.6) return;   // hung on a wall or overhead
    this.add({ x0: box3.min.x + shrink, x1: box3.max.x - shrink, z0: box3.min.z + shrink, z1: box3.max.z - shrink });
  }

  /** Nearest walkable cell to a point (the point itself if it's walkable). */
  nearestFree(p) {
    let i = Math.min(this.w - 1, Math.max(0, this.ix(p.x))), j = Math.min(this.h - 1, Math.max(0, this.iz(p.z)));
    if (this.free(i, j)) return [i, j];
    for (let r = 1; r < 40; r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !this.free(i + di, j + dj)) continue;
        const d = (this.cx(i + di) - p.x) ** 2 + (this.cz(j + dj) - p.z) ** 2;
        if (d < bd) { bd = d; best = [i + di, j + dj]; }
      }
      if (best) return best;
    }
    return null;
  }

  /** Is the straight line between two cells clear? */
  clear(i0, j0, i1, j1) {
    const n = Math.ceil(Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0)) * 2);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (!this.free(Math.round(i0 + (i1 - i0) * t), Math.round(j0 + (j1 - j0) * t))) return false;
    }
    return true;
  }

  /**
   * Points to walk from `from` to `to` (excluding `from`), going around
   * everything blocked. Ends exactly at `to`, even when `to` is a seat or a
   * spot pressed up against a counter. null if there's no way through.
   */
  path(from, to) {
    const a = this.nearestFree(from), b = this.nearestFree(to);
    if (!a || !b) return null;
    const cells = a[0] === b[0] && a[1] === b[1] ? [a] : this.astar(a, b);
    if (!cells) return null;
    // String-pull: keep only the corners needed to stay clear.
    const keep = [cells[0]];
    for (let k = 1; k < cells.length; k++) {
      const last = keep[keep.length - 1];
      if (!this.clear(last[0], last[1], cells[k][0], cells[k][1])) keep.push(cells[k - 1]);
    }
    if (cells.length > 1) keep.push(cells[cells.length - 1]);
    const pts = keep.slice(1).map(([i, j]) => new THREE.Vector3(this.cx(i), 0, this.cz(j)));
    // Step straight from the last free spot onto the destination itself.
    const end = to.clone(); end.y = 0;
    const last = pts[pts.length - 1];
    if (!last || last.distanceToSquared(end) > 1e-4) pts.push(end); else pts[pts.length - 1] = end;
    return pts;
  }

  astar([si, sj], [gi, gj]) {
    const { w } = this;
    const N = this.w * this.h;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    const hEst = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz); };
    const s = sj * w + si, goal = gj * w + gi;
    g[s] = 0; heap.push(s, hEst(si, sj));
    while (heap.size) {
      const c = heap.pop();
      if (c === goal) {
        const out = [];
        for (let k = c; k !== -1; k = came[k]) out.push([k % w, Math.floor(k / w)]);
        return out.reverse();
      }
      if (closed[c]) continue;
      closed[c] = 1;
      const ci = c % w, cj = Math.floor(c / w);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (!this.free(ni, nj)) continue;
        if (di && dj && (!this.free(ci + di, cj) || !this.free(ci, cj + dj))) continue;   // no corner-cutting
        const n = nj * w + ni;
        const ng = g[c] + (di && dj ? SQRT2 : 1);
        if (ng < g[n]) { g[n] = ng; came[n] = c; heap.push(n, ng + hEst(ni, nj)); }
      }
    }
    return null;
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const { k, p } = this;
    let i = k.length; k.push(key); p.push(pri);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (p[up] <= pri) break;
      k[i] = k[up]; p[i] = p[up]; i = up;
    }
    k[i] = key; p[i] = pri;
  }
  pop() {
    const { k, p } = this;
    const top = k[0], lastK = k.pop(), lastP = p.pop();
    if (k.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= k.length) break;
        if (c + 1 < k.length && p[c + 1] < p[c]) c++;
        if (p[c] >= lastP) break;
        k[i] = k[c]; p[i] = p[c]; i = c;
      }
      k[i] = lastK; p[i] = lastP;
    }
    return top;
  }
}
