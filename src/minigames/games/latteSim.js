/**
 * The milk-on-espresso simulation behind the Latte Art game, kept free of
 * rendering so it can be tuned and tested on its own.
 *
 * The cup's surface is a disc of radius 1 (u right, v toward the customer)
 * sampled on an N×N grid of foam amounts m (0 crema … 1 white foam). While
 * milk pours, the surface flows like the real thing:
 *   • it's pushed outward from where the stream lands (incompressibly: the
 *     white area grows by FLOW per second), so holding still grows a blob;
 *   • the stream drags the surface along as it moves, so a quick line
 *     through a blob pulls it into a point (a heart) and a wiggle lays down
 *     ripples (a rosetta).
 * Each frame is a semi-Lagrangian step: look back along the flow and copy.
 *
 * Patterns are pours — a list of steps for the pitcher — and the reference
 * picture of each is just this simulation run on its ideal pour, so the
 * target is always something the player can actually make.
 */
export const N = 160;
/** Tunables (exported so tests can try variants). */
export const P = {
  FLOW: 0.3,       // area of foam added per second of a slow pour (the disc's area is π)
  THIN: 2.2,       // moving this fast (cup radii/s) the stream thins to a trickle, as when you lift to pull through
  STREAM: 0.055,   // radius of the stream where it lands
  DRAG: 0.6,       // how much of the pitcher's motion the surface follows…
  DRAG_R: 0.17,    // …within this radius of the stream
  SHARPEN: 0.25,   // per step, undo the blur resampling adds so thin crema lines survive
};

export class Surface {
  constructor() { this.m = new Float32Array(N * N); this.t = new Float32Array(N * N); this.clear(); }
  /** Fresh crema; and the moves seen so far (what the judge checks besides the picture). */
  clear() { this.fv = null; this.m.fill(0); this.poured = 0; this.wig = null; this.leaves = 0; this.holds = 0; this.pulls = 0; this.run = null; }
  copy() { const s = new Surface(); s.m.set(this.m); s.poured = this.poured; return s; }

  /** Foam at a surface point (bilinear), 0 outside the cup. */
  sample(u, v) {
    if (u * u + v * v >= 1) return 0;
    const fx = (u + 1) * 0.5 * N - 0.5, fy = (v + 1) * 0.5 * N - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? 0 : this.m[y * N + x]);
    return (at(x0, y0) * (1 - ax) + at(x0 + 1, y0) * ax) * (1 - ay) + (at(x0, y0 + 1) * (1 - ax) + at(x0 + 1, y0 + 1) * ax) * ay;
  }

  /**
   * Advance dt seconds with the stream landing at (su, sv) and moving at
   * (vu, vv) per second. Nothing moves unless milk is pouring.
   */
  pour(dt, su, sv, vu, vv) {
    const m = this.m, t = this.t;
    // The stream thins with the pitcher's smoothed speed (~0.1 s), so a shaky
    // hand doesn't starve the blob; the drag and the ripples follow the raw motion.
    const fv = this.fv || (this.fv = { u: vu, v: vv }), kf = Math.min(1, dt / 0.1);
    fv.u += (vu - fv.u) * kf; fv.v += (vv - fv.v) * kf;
    const speed = Math.hypot(fv.u, fv.v);
    const q = P.FLOW * Math.max(0.08, 1 - speed / P.THIN) / (2 * Math.PI);
    const inside = su * su + sv * sv < 1;
    const STREAM = P.STREAM, DRAG_R = P.DRAG_R, DRAG = P.DRAG, SHARPEN = P.SHARPEN;
    for (let j = 0; j < N; j++) {
      const y = (j + 0.5) / N * 2 - 1;
      for (let i = 0; i < N; i++) {
        const k = j * N + i, x = (i + 0.5) / N * 2 - 1;
        if (x * x + y * y >= 1) { t[k] = 0; continue; }
        const dx = x - su, dy = y - sv, r = Math.hypot(dx, dy);
        let ux = 0, uy = 0;
        if (inside && r > 1e-5) {
          const vr = q / Math.max(r, STREAM);            // outward push: d(area)/dt = FLOW
          ux = dx / r * vr; uy = dy / r * vr;
        }
        const w = Math.exp(-(r / DRAG_R) * (r / DRAG_R)) * DRAG;
        ux += vu * w; uy += vv * w;
        let f = inside && r < STREAM ? 1 : this.sample(x - ux * dt, y - uy * dt);
        // nudge toward 0 or 1 (foam and crema don't really mix)
        const sh = f * f * (3 - 2 * f); f += (sh - f) * SHARPEN;
        t[k] = f;
      }
    }
    this.m = t; this.t = m;
    if (inside) { this.poured += dt; this.ripple(su, sv, vu, vv, dt); this.moves(vu, vv, dt); }
  }

  /** Count the moves: a blob is a pour held fairly still for a while, a pull-through a quick stroke. */
  moves(vu, vv, dt) {
    // Smoothed over ~0.15 s so a shaky hand still holds, and a wiggle (which
    // averages out) isn't mistaken for a pull-through.
    const k = Math.min(1, dt / 0.15), sm = this.sm || (this.sm = { u: 0, v: 0, s: 0 });
    sm.u += (vu - sm.u) * k; sm.v += (vv - sm.v) * k; sm.s += (Math.hypot(vu, vv) - sm.s) * k;
    // A hold is judged by net motion (a tremor averages out), not by average speed.
    const kind = Math.hypot(sm.u, sm.v) < 0.6 ? 'hold' : Math.hypot(sm.u, sm.v) > 1.6 ? 'pull' : null;
    const r = this.run;
    if (r && r.kind === kind) { r.t += dt; if (!r.counted && r.t >= (kind === 'hold' ? 0.3 : 0.14)) { r.counted = true; if (kind === 'hold') this.holds++; else this.pulls++; } }
    else this.run = kind ? { kind, t: dt, counted: false } : null;
  }
  /** Lifting the pitcher ends a move. */
  lift() { this.run = null; this.sm = null; this.fv = null; if (this.wig) this.wig.side = 0; }

  /**
   * Wiggling lays rosetta leaves: each time a side-to-side swing turns back,
   * the foam behind it folds over a thin line of crema — a crescent across
   * the swing, bowed toward where you came from. The outward flow then
   * spreads it like a real leaf.
   */
  ripple(su, sv, vu, vv, dt) {
    const w = this.wig || (this.wig = { side: 0, last: null, prev: null });
    const lat = vu;                                          // side to side is across the cup
    const side = Math.abs(lat) > 1 ? Math.sign(lat) : w.side;
    if (side && w.side && side !== w.side) {
      const pt = { u: su, v: sv };
      // a shaky hand isn't a swing: it has to have gone a fair way across
      if (w.last && Math.abs(pt.u - w.last.u) < 0.12) { w.side = side; return; }
      if (w.last) {
        const cu = (pt.u + w.last.u) / 2, cv = (pt.v + w.last.v) / 2, half = Math.max(0.1, Math.abs(pt.u - w.last.u) / 2 + 0.06);
        const back = w.prev ? Math.sign(cv - (w.prev.v + w.last.v) / 2) || 1 : 1;
        this.crescent(cu, cv, half, -back);
        this.leaves++;
      }
      w.prev = w.last; w.last = pt;
    }
    if (side) w.side = side;
  }

  /** Press a thin crema arc into the foam (only where it's white). */
  crescent(cu, cv, half, bow) {
    const thick = 0.022, depth = half * 0.55;
    for (let j = 0; j < N; j++) {
      const y = (j + 0.5) / N * 2 - 1;
      if (Math.abs(y - cv) > depth + 0.05) continue;
      for (let i = 0; i < N; i++) {
        const x = (i + 0.5) / N * 2 - 1, dx = (x - cu) / half;
        if (Math.abs(dx) > 1) continue;
        const arcY = cv + bow * depth * (1 - dx * dx);       // a parabola across the swing
        const d = Math.abs(y - arcY);
        if (d < thick) { const k = j * N + i; this.m[k] *= d / thick * 0.6; }
      }
    }
  }

  /** How much of the cup is foam (0..1 of the disc). */
  coverage() { let n = 0, c = 0; this.eachCup((k) => { c++; if (this.m[k] > 0.5) n++; }); return n / c; }
  eachCup(fn) { for (let j = 0; j < N; j++) { const y = (j + 0.5) / N * 2 - 1; for (let i = 0; i < N; i++) { const x = (i + 0.5) / N * 2 - 1; if (x * x + y * y < 1) fn(j * N + i, i, j); } } }
}

/**
 * The patterns, easiest first. A pour is a list of steps (surface coords):
 *   { hold: [u, v], t }               pour in place
 *   { to: [u, v], t, pour = true }    move there (pouring unless pour: false)
 *   { wiggle: [u0, v0, u1, v1], t, amp, hz }   pour while wiggling side to side from one point to another
 *   { say }                           a caption for the demo (applies to the next step)
 */
export const PATTERNS = [
  {
    key: 'dot', name: 'Monk’s Head', level: 0, ease: 1, needs: { holds: [1, 2], pulls: [0, 0], leaves: [0, 1] },
    tip: 'Hold still in the middle and let the white circle grow.',
    pour: [
      { say: 'Hold still in the middle…' },
      { at: [0, -0.05] }, { hold: [0, -0.05], t: 2.4 },
    ],
  },
  {
    key: 'heart', name: 'Heart', level: 1, ease: 1, needs: { holds: [1, 2], pulls: [1, 1], leaves: [0, 1] },
    tip: 'Grow a circle just above the middle, then pull quickly down through it.',
    pour: [
      { say: 'Grow a circle above the middle…' },
      { at: [0, -0.2] }, { hold: [0, -0.2], t: 2.0 },
      { say: 'Lift to the top edge…' },
      { to: [0, -0.62], t: 0.15, pour: false },
      { say: '…and pull straight down through it!' },
      { to: [0, 0.5], t: 0.4 },
    ],
  },
  {
    key: 'tulip', name: 'Tulip', level: 2, ease: 0.95, needs: { holds: [3, 4], pulls: [1, 1], leaves: [0, 1] },
    tip: 'Pour a blob near the top, lift, pour the next just below it, and a third below that. Then lift to the top and pull down through all three.',
    pour: [
      { say: 'First blob near the top…' },
      { at: [0, -0.45] }, { hold: [0, -0.45], t: 0.8 },
      { say: 'Lift, and pour a second one just below it…' },
      { to: [0, -0.02], t: 0.12, pour: false }, { hold: [0, -0.02], t: 0.65 },
      { say: '…and a third below that…' },
      { to: [0, 0.32], t: 0.12, pour: false }, { hold: [0, 0.32], t: 0.5 },
      { say: 'Lift to the top and pull through them all!' },
      { to: [0, -0.7], t: 0.15, pour: false }, { to: [0, 0.6], t: 0.45 },
    ],
  },
  {
    key: 'rosetta', name: 'Rosetta', level: 3, ease: 0.88, bonus: 1, needs: { holds: [1, 2], pulls: [1, 1], leaves: [4, 99] },
    tip: 'Start at the top, wiggle side to side as you drift toward you, then lift and pull back up the middle.',
    pour: [
      { say: 'Start a little blob at the top…' },
      { at: [0, -0.4] }, { hold: [0, -0.4], t: 0.6 },
      { say: 'Wiggle side to side as you drift toward you…' },
      { wiggle: [0, -0.4, 0, 0.45], t: 2.6, amp: 0.22, hz: 2.6 },
      { say: 'Lift, and pull back up through the middle!' },
      { to: [0, 0.6], t: 0.12, pour: false }, { to: [0, -0.68], t: 0.42 },
    ],
  },
];
export const PATTERN = new Map(PATTERNS.map((p) => [p.key, p]));

/**
 * Turn a pour into a timeline: pos(t) → { u, v, pouring, say } for t in
 * [0, total]. The demo plays it; the reference is simulated from it.
 */
export function timeline(pour) {
  const segs = [];
  let u = 0, v = 0, t = 0, say = '';
  for (const s of pour) {
    if (s.say) { say = s.say; continue; }
    if (s.at) { u = s.at[0]; v = s.at[1]; continue; }
    if (s.hold) { const [hu, hv] = s.hold; segs.push({ t0: t, t1: t + s.t, pos: () => [hu, hv], pouring: true, say }); u = hu; v = hv; t += s.t; continue; }
    if (s.to) { const [u0, v0] = [u, v], [u1, v1] = s.to; segs.push({ t0: t, t1: t + s.t, pos: (k) => [u0 + (u1 - u0) * k, v0 + (v1 - v0) * k], pouring: s.pour !== false, say }); u = u1; v = v1; t += s.t; continue; }
    if (s.wiggle) {
      const [a0, b0, a1, b1] = s.wiggle, T = s.t, amp = s.amp, hz = s.hz;
      segs.push({ t0: t, t1: t + T, pos: (k) => [a0 + (a1 - a0) * k + Math.sin(k * T * hz * Math.PI * 2) * amp * (1 - 0.5 * k), b0 + (b1 - b0) * k], pouring: true, say });
      u = a1; v = b1; t += T;
    }
  }
  const total = t;
  return {
    total,
    at(time) {
      const s = segs.find((x) => time >= x.t0 && time < x.t1) || segs[segs.length - 1];
      const k = Math.min(1, Math.max(0, (time - s.t0) / Math.max(1e-6, s.t1 - s.t0)));
      const [pu, pv] = s.pos(k);
      return { u: pu, v: pv, pouring: s.pouring && time < total, say: s.say };
    },
  };
}

/** Simulate a pour (optionally with mistakes) and return the finished surface. */
export function simulate(pattern, { dt = 1 / 60, jitter = 0, timing = 1, tremor = 0, rng = Math.random } = {}) {
  const s = new Surface(), tl = timeline(pattern.pour);
  let last = tl.at(0), drift = [0, 0], aim = [0, 0], next = 0;
  for (let t = 0; t < tl.total * timing; t += dt) {
    const p = tl.at(t / timing);
    // a hand that wanders a little off the line, smoothly (jitter ≈ cup radii × 10)
    if (t >= next) { aim = [(rng() - 0.5) * jitter * 0.2, (rng() - 0.5) * jitter * 0.2]; next = t + 0.3; }
    drift = [drift[0] + (aim[0] - drift[0]) * 0.08, drift[1] + (aim[1] - drift[1]) * 0.08];
    // tremor: a fast shake (≈9 Hz) of `tremor` cup radii, as from a hand on a phone
    const sh = tremor ? [Math.sin(t * 57 + 1.3) * tremor, Math.sin(t * 61) * tremor] : [0, 0];
    const u = p.u + drift[0] + sh[0], v = p.v + drift[1] + sh[1];
    const vu = (u - last.u) / dt, vv = (v - last.v) / dt;
    if (p.pouring) s.pour(dt, u, v, vu, vv); else s.lift();
    last = { u, v };
  }
  return s;
}

/** Foam masks → a 0..1 likeness, forgiving a small offset. */
export function likeness(a, b) {
  const A = a.m, B = b.m;
  let best = 0;
  for (let oy = -4; oy <= 4; oy += 2) for (let ox = -4; ox <= 4; ox += 2) {
    let inter = 0, uni = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const y = (j + 0.5) / N * 2 - 1, x = (i + 0.5) / N * 2 - 1;
      if (x * x + y * y >= 1) continue;
      const ia = A[j * N + i] > 0.5;
      const bi = i - ox, bj = j - oy;
      const ib = bi >= 0 && bj >= 0 && bi < N && bj < N && B[bj * N + bi] > 0.5;
      if (ia || ib) uni++;
      if (ia && ib) inter++;
    }
    if (uni) best = Math.max(best, inter / uni);
  }
  return best;
}

/**
 * The judge: how much the cup looks like the pattern, docked for each move
 * that's missing or extra (a dot is not a heart, however round it is).
 * Returns { score 0..1, look, faults: [text] }.
 */
export function judge(surface, ref, pattern) {
  const look = likeness(surface, ref);
  const faults = [];
  const n = pattern.needs;
  const check = (have, [lo, hi], few, many) => { if (have < lo) faults.push(few); else if (have > hi) faults.push(many); };
  check(surface.holds, n.holds, n.holds[0] > 1 ? `Needs ${n.holds[0]} blobs` : 'Hold still to grow the base', 'Too many blobs');
  check(surface.pulls, n.pulls, 'No pull-through', n.pulls[1] ? 'Pulled through more than once' : 'No pull-through on this one');
  check(surface.leaves, n.leaves, 'Wiggle more for the leaves', 'Too wiggly');
  const score = look * Math.pow(0.62, faults.length);
  return { score, look, faults, notes: faults.length ? [] : lookNotes(surface, ref) };
}

/** Why a cup with all the right moves still doesn't look like the pattern. */
function lookNotes(a, ref) {
  const fa = shape(a), fr = shape(ref), notes = [];
  if (!fa.n) return ['No foam on the coffee'];
  const area = fa.n / fr.n;
  if (area < 0.75) notes.push('Too little foam: hold a bit longer');
  else if (area > 1.35) notes.push('Too much foam: pour a little less');
  const off = Math.hypot(fa.cx - fr.cx, fa.cy - fr.cy);
  if (off > 0.14) notes.push(fa.cy < fr.cy - 0.1 ? 'A bit high: pour closer to the middle' : fa.cy > fr.cy + 0.1 ? 'A bit low: pour closer to the middle' : 'Off to one side: keep it centred');
  const tall = (fa.h / fa.w) / (fr.h / fr.w);
  if (tall > 1.3) notes.push('Too tall and thin');
  else if (tall < 0.75) notes.push('Too wide and squat');
  return notes;
}
function shape(s) {
  let n = 0, sx = 0, sy = 0, x0 = 1, x1 = -1, y0 = 1, y1 = -1;
  s.eachCup((k, i, j) => {
    if (s.m[k] <= 0.5) return;
    const x = (i + 0.5) / N * 2 - 1, y = (j + 0.5) / N * 2 - 1;
    n++; sx += x; sy += y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  });
  return { n, cx: n ? sx / n : 0, cy: n ? sy / n : 0, w: Math.max(0.05, x1 - x0), h: Math.max(0.05, y1 - y0) };
}

/** The judge's scale. */
export const RATINGS = [
  { key: 'perfect', name: 'Perfect!', min: 0.8, pts: 4 },
  { key: 'good', name: 'Good', min: 0.6, pts: 2 },
  { key: 'poor', name: 'Poor', min: 0.38, pts: 1 },
  { key: 'fail', name: 'Fail', min: -1, pts: 0 },
];
/** Rate a score; harder patterns (lower `ease`) need a little less likeness for each grade. */
export function rate(score, pattern = null) { const e = pattern?.ease ?? 1; return RATINGS.find((r) => score >= r.min * e); }
