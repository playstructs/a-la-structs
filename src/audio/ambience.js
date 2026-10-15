/**
 * Background soundscapes under the music.
 *   restaurant — a murmur of diners you can't quite make out, room tone,
 *                cutlery and cups now and then
 *   challenge  — the same room, busier
 *   town       — birds, a breeze in the leaves, the square's fountain,
 *                a bicycle bell far off
 * The murmur is "walla": a few synthetic talkers, each a pitched voice shaped
 * by vowel formant filters syllable by syllable, then muffled and spread
 * around the room so no words come through.
 */
import { audioCtx, bus, isRunning, noise, out, cleanup, adsr } from './engine.js';
import { osc, gain, filter, bell } from './instruments.js';

const TICK_MS = 200;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** Vowel formants (F1, F2, F3) in Hz. */
const VOWELS = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240], [660, 1720, 2410], [490, 1350, 1690]];

class Talker {
  constructor(scape, { pitch, pan, level }) {
    const t = audioCtx().currentTime;
    this.pitch = pitch;
    this.src = osc('sawtooth', pitch, t);
    this.breath = noise('pink', t);
    const breathG = gain(0.05);
    this.breath.connect(breathG);
    this.mixIn = gain(1);
    this.src.connect(this.mixIn); breathG.connect(this.mixIn);
    this.f = [0, 1, 2].map((i) => filter('bandpass', VOWELS[0][i], [7, 10, 12][i]));
    const fg = [1.0, 0.55, 0.25].map((v) => gain(v));
    this.amp = gain(0);
    this.f.forEach((f, i) => { this.mixIn.connect(f); f.connect(fg[i]); fg[i].connect(this.amp); });
    const muffle = filter('lowpass', 1400, 0.4);
    this.amp.connect(muffle);
    this.outG = out(muffle, scape.fader, { gain: level, pan, wet: 0.5, keep: true });
    this.nodes = [this.src, this.breath, breathG, this.mixIn, ...this.f, ...fg, this.amp, muffle, ...this.outG.chain];
    this.nextAt = t + rnd(0, 2.5);
  }
  /** Queue the next phrase (or pause) once we're close to it. */
  pump(now) {
    if (this.nextAt > now + 1.2) return;
    const t0 = Math.max(this.nextAt, now + 0.05);
    const syll = Math.floor(rnd(4, 16));
    let t = t0;
    const base = this.pitch * rnd(0.92, 1.12);
    for (let i = 0; i < syll; i++) {
      const d = rnd(0.09, 0.24), v = pick(VOWELS);
      this.f.forEach((f, k) => f.frequency.setTargetAtTime(v[k] * rnd(0.92, 1.08), t, 0.02));
      // a gently falling sentence melody with little lifts
      this.src.frequency.setTargetAtTime(base * (1 + 0.18 * Math.sin(i * 1.7) - 0.15 * (i / syll)), t, 0.04);
      this.amp.gain.setTargetAtTime(rnd(0.5, 1), t, 0.018);
      this.amp.gain.setTargetAtTime(rnd(0.05, 0.25), t + d * 0.8, 0.015);   // consonant dip
      t += d;
    }
    this.amp.gain.setTargetAtTime(0, t, 0.05);
    this.nextAt = t + (Math.random() < 0.3 ? rnd(2, 6) : rnd(0.25, 1.4));
  }
  stop(at) { this.src.stop(at); this.breath.stop(at); cleanup(this.nodes, at); }
}

/** One soundscape: its own fader so scenes crossfade. */
class Scape {
  constructor(kind) {
    this.kind = kind;
    const c = audioCtx();
    this.fader = gain(0);
    this.fader.connect(bus('ambience'));
    this.fader.gain.setTargetAtTime(1, c.currentTime, 1.2);
    this.loops = [];
    this.talkers = [];
    this.events = [];
    const t = c.currentTime;
    if (kind === 'restaurant' || kind === 'challenge') {
      const busy = kind === 'challenge';
      // room tone: a warm, low hum of a busy room
      const room = noise('brown', t), lp = filter('lowpass', 320), g = gain(busy ? 0.22 : 0.16);
      room.connect(lp); lp.connect(g); g.connect(this.fader);
      this.loops.push(room, lp, g);
      const n = busy ? 7 : 5;
      for (let i = 0; i < n; i++) {
        this.talkers.push(new Talker(this, { pitch: pick([105, 118, 132, 165, 190, 215, 240]) * rnd(0.95, 1.05), pan: rnd(-0.8, 0.8), level: rnd(0.08, 0.14) * (busy ? 1.15 : 1) }));
      }
      this.events.push({ next: t + rnd(0.5, 2), every: busy ? [0.8, 3] : [1.2, 4.5], play: (at) => clink(this.fader, at) });
    } else if (kind === 'town') {
      // breeze: soft low noise whose brightness drifts
      const air = noise('pink', t), lp = filter('lowpass', 600, 0.3), g = gain(0.12);
      air.connect(lp); lp.connect(g); g.connect(this.fader);
      this.breeze = { lp, g };
      // the fountain in the square: a soft, bubbling splash
      const water = noise('white', t), bp = filter('bandpass', 1800, 0.6), hp = filter('highpass', 600), wg = gain(0.035);
      water.connect(bp); bp.connect(hp); hp.connect(wg); wg.connect(this.fader);
      this.water = { bp, wg };
      this.loops.push(air, lp, g, water, bp, hp, wg);
      this.events.push({ next: t + rnd(0.3, 1.5), every: [0.9, 4], play: (at) => birdsong(this.fader, at) });
      this.events.push({ next: t + rnd(3, 8), every: [5, 14], play: (at) => rustle(this.fader, at) });
      this.events.push({ next: t + rnd(20, 40), every: [30, 70], play: (at) => bicycleBell(this.fader, at) });
    }
  }
  pump(now) {
    for (const tk of this.talkers) tk.pump(now);
    for (const e of this.events) {
      if (e.next < now + 0.4) { e.play(Math.max(e.next, now + 0.02)); e.next = now + rnd(...e.every); }
    }
    if (this.breeze) {
      this.breeze.lp.frequency.setTargetAtTime(rnd(350, 1000), now, 1.5);
      this.breeze.g.gain.setTargetAtTime(rnd(0.07, 0.16), now, 2);
    }
    if (this.water) this.water.bp.frequency.setTargetAtTime(rnd(1300, 2600), now, 0.08);
  }
  fadeOut(sec = 1.5) {
    const c = audioCtx(), end = c.currentTime + sec + 0.5;
    this.fader.gain.cancelScheduledValues(c.currentTime);
    this.fader.gain.setTargetAtTime(0, c.currentTime, sec / 3);
    this.dead = true;
    for (const tk of this.talkers) tk.stop(end);
    for (const n of this.loops) { try { n.stop?.(end); } catch (e) { /* not a source */ } }
    cleanup([...this.loops, this.fader], end + 0.2);
  }
}

/* ── one-off sounds in a scape ────────────────────────────────────────── */

/** Cutlery on a plate, a cup set on its saucer, or two glasses. */
function clink(dest, t) {
  const kind = pick(['fork', 'fork', 'cup', 'glass']);
  const partials = kind === 'fork' ? [[3150, 1], [4720, 0.5], [6930, 0.25]] : kind === 'cup' ? [[1280, 1], [2710, 0.45], [4100, 0.2]] : [[2650, 1], [5300, 0.3]];
  const decay = kind === 'glass' ? 0.6 : kind === 'cup' ? 0.18 : 0.12;
  const level = rnd(0.012, 0.03), pan = rnd(-0.8, 0.8);
  const hits = kind === 'fork' && Math.random() < 0.5 ? 2 : 1;
  for (let h = 0; h < hits; h++) {
    const th = t + h * rnd(0.08, 0.16), sum = gain(1), nodes = [sum];
    let end = th;
    for (const [f, a] of partials) {
      const o = osc('sine', f * rnd(0.97, 1.03), th), g = gain(0);
      end = Math.max(end, adsr(g.gain, th, { a: 0.001, d: decay, peak: a * level }));
      o.connect(g); g.connect(sum); o.stop(end + 0.05); nodes.push(o, g);
    }
    out(sum, dest, { pan, wet: 0.5 });
    cleanup(nodes, end + 0.1);
  }
}

/** A few kinds of songbird, plus the odd dove. */
function birdsong(dest, t) {
  const pan = rnd(-0.9, 0.9), level = rnd(0.02, 0.05);
  const chirp = (at, f0, f1, dur, lvl = level) => {
    const o = osc('sine', f0, at), g = gain(0);
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const end = adsr(g.gain, at, { a: dur * 0.2, d: dur * 0.6, peak: lvl });
    o.connect(g); out(g, dest, { pan, wet: 0.45 });
    o.stop(end + 0.03); cleanup([o, g], end + 0.05);
  };
  const species = pick(['warbler', 'warbler', 'feebee', 'trill', 'robin', 'dove']);
  if (species === 'warbler') {
    let at = t; const n = Math.floor(rnd(4, 9));
    for (let i = 0; i < n; i++) { const f = rnd(2600, 5200), d = rnd(0.05, 0.11); chirp(at, f, f * rnd(0.75, 1.35), d); at += d + rnd(0.02, 0.07); }
  } else if (species === 'feebee') {
    const f = rnd(3100, 3600);
    chirp(t, f, f * 0.98, 0.32); chirp(t + 0.42, f * 0.84, f * 0.82, 0.38);
  } else if (species === 'trill') {
    const f = rnd(4200, 6000), n = Math.floor(rnd(10, 22));
    for (let i = 0; i < n; i++) chirp(t + i * 0.045, f * 1.05, f * 0.9, 0.03, level * 0.8);
  } else if (species === 'robin') {
    let at = t;
    for (let p = 0; p < 3; p++) { const f = rnd(2200, 3200); chirp(at, f, f * 1.25, 0.12); chirp(at + 0.14, f * 1.2, f * 0.95, 0.14); at += rnd(0.45, 0.7); }
  } else {
    // a mourning dove, low and soft
    const coo = (at, f, d) => chirp(at, f, f * 0.92, d, level * 0.9);
    coo(t, 560, 0.35); coo(t + 0.5, 600, 0.5); coo(t + 1.15, 520, 0.4); coo(t + 1.65, 520, 0.4);
  }
}

/** Leaves stirring when the wind picks up. */
function rustle(dest, t) {
  const dur = rnd(1.2, 3), n = noise('white', t, dur + 0.3), hp = filter('highpass', 2500), bp = filter('bandpass', rnd(3500, 6000), 0.8), g = gain(0);
  g.gain.setValueAtTime(0.0001, t);
  for (let k = 0; k < 10; k++) g.gain.linearRampToValueAtTime(rnd(0.005, 0.025), t + (k + 1) * dur / 10);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2);
  n.connect(hp); hp.connect(bp); bp.connect(g); out(g, dest, { pan: rnd(-0.7, 0.7), wet: 0.3 });
  cleanup([n, hp, bp, g], t + dur + 0.4);
}

/** Somebody's bicycle bell, a street away. */
function bicycleBell(dest, t) {
  const pan = rnd(-0.8, 0.8);
  bell(t, 2350, { vel: 0.18, bus: dest, pan, decay: 0.7, wet: 0.6 });
  bell(t + 0.16, 2350, { vel: 0.14, bus: dest, pan, decay: 0.9, wet: 0.6 });
}

/* ── control ──────────────────────────────────────────────────────────── */

let current = null, wanted = null, timer = null;

function pump() {
  if (!isRunning()) return;
  const now = audioCtx().currentTime;
  if (wanted !== (current?.kind ?? null)) {
    current?.fadeOut();
    current = wanted ? new Scape(wanted) : null;
  }
  current?.pump(now);
}

export const ambience = {
  /** 'restaurant' | 'challenge' | 'town' | null */
  play(kind) {
    wanted = kind;
    if (!timer) timer = setInterval(pump, TICK_MS);
    pump();
  },
};
