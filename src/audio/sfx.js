/**
 * Sound effects: the UI and game events, and the critters' work in the
 * restaurant (sfx.action). Synthesised from filtered noise and tuned
 * partials so they sound like things — a ceramic clink, a shop-door bell,
 * oil sizzling — rather than beeps. Also the front door to the audio system:
 * sfx.scene() picks the music and ambience, sfx.setVolume() the mix.
 */
import { unlock, setEnabled, isEnabled, isRunning, audioCtx, out, noise, cleanup, adsr, setVolume, getVolume, onAudio, midi } from './engine.js';
import { osc, gain, filter, bell, marimba, epiano, pad } from './instruments.js';
import { music } from './music.js';
import { ambience } from './ambience.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const T = () => audioCtx().currentTime;
const ok = () => isRunning();

/** A burst of filtered noise. */
function hiss(t, { dur = 0.1, type = 'bandpass', freq = 2000, q = 1, peak = 0.2, a = 0.002, kind = 'white', pan = 0, wet = 0.1, sweepTo = null, dest = 'effects' } = {}) {
  const n = noise(kind, t, dur + 0.3), f = filter(type, freq, q), g = gain(0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const end = adsr(g.gain, t, { a, d: dur, peak });
  n.connect(f); f.connect(g); out(g, dest, { pan, wet });
  cleanup([n, f, g], end + 0.1);
}

/** Struck object: tuned partials [[ratio, amp, decay]] off a base frequency. */
function strike(t, freq, partials, { peak = 0.2, pan = 0, wet = 0.2, dest = 'effects' } = {}) {
  const sum = gain(1), nodes = [sum];
  let endAll = t;
  for (const [r, amp, d] of partials) {
    const o = osc('sine', freq * r, t), g = gain(0);
    const end = adsr(g.gain, t, { a: 0.001, d, peak: amp * peak });
    o.connect(g); g.connect(sum); o.stop(end + 0.05); nodes.push(o, g); endAll = Math.max(endAll, end);
  }
  out(sum, dest, { pan, wet });
  cleanup(nodes, endAll + 0.1);
}

const CERAMIC = [[1, 1, 0.22], [1.63, 0.55, 0.16], [2.47, 0.3, 0.1], [3.9, 0.12, 0.06]];
const METAL = [[1, 1, 0.5], [2.62, 0.5, 0.35], [4.1, 0.3, 0.2], [6.3, 0.15, 0.12]];
const GLASS = [[1, 1, 0.9], [2.01, 0.25, 0.5], [3.02, 0.08, 0.3]];

/** A thump: a short falling sine with a knock of noise. */
function thump(t, { freq = 140, peak = 0.35, pan = 0, knock = 1500 } = {}) {
  const o = osc('sine', freq, t), g = gain(0);
  o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.12);
  const end = adsr(g.gain, t, { a: 0.002, d: 0.12, peak });
  o.connect(g); out(g, 'effects', { pan, wet: 0.08 }); o.stop(end + 0.05); cleanup([o, g], end + 0.1);
  hiss(t, { dur: 0.025, freq: knock, q: 1.5, peak: peak * 0.5, pan });
}

/** A little voice-like grumble through vowel formants (for complaints). */
function grumble(t, { f0 = 170, peak = 0.12, pan = 0 } = {}) {
  const src = osc('sawtooth', f0, t);
  src.frequency.setTargetAtTime(f0 * 0.7, t + 0.05, 0.1);
  const f1 = filter('bandpass', 520, 6), f2 = filter('bandpass', 900, 8), g1 = gain(1), g2 = gain(0.5), env = gain(0);
  f1.frequency.setTargetAtTime(330, t + 0.08, 0.06); f2.frequency.setTargetAtTime(720, t + 0.08, 0.06);
  src.connect(f1); src.connect(f2); f1.connect(g1); f2.connect(g2); g1.connect(env); g2.connect(env);
  const end = adsr(env.gain, t, { a: 0.03, d: 0.2, s: 0.7, hold: 0.16, r: 0.12, peak });
  out(env, 'effects', { pan, wet: 0.15 });
  src.stop(end + 0.05); cleanup([src, f1, f2, g1, g2, env], end + 0.1);
  hiss(t, { dur: 0.08, type: 'lowpass', freq: 700, peak: peak * 0.6, kind: 'pink', pan });
}

/* ── critter actions ──────────────────────────────────────────────────── */

let crackle = null;
/** Oil spitting: steady hiss with sparse pops, as a reusable buffer. */
function crackleBuffer() {
  if (crackle) return crackle;
  const c = audioCtx(), n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.08;
  for (let k = 0; k < 140; k++) {
    const at = Math.floor(Math.random() * (n - 400)), amp = rnd(0.3, 1), len = Math.floor(rnd(20, 160));
    for (let j = 0; j < len; j++) d[at + j] += (Math.random() * 2 - 1) * amp * Math.pow(1 - j / len, 2);
  }
  return (crackle = buf);
}

const ACTIONS = {
  sizzle(t, dur, o) {
    const s = audioCtx().createBufferSource(); s.buffer = crackleBuffer(); s.loop = true; s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.4);
    const hp = filter('highpass', 1800), g = gain(0);
    const end = adsr(g.gain, t, { a: 0.15, d: 0.3, s: 1, hold: dur, r: 0.3, peak: 0.22 * o.vol });
    s.connect(hp); hp.connect(g); out(g, 'effects', { pan: o.pan, wet: 0.1 }); cleanup([s, hp, g], end + 0.1);
  },
  espresso(t, dur, o) {
    // grinder whirr, then the steam wand hiss, then a few drips
    const m = osc('sawtooth', 135, t), bp = filter('bandpass', 900, 1.2), am = osc('square', 31, t), amG = gain(0.03 * o.vol), g = gain(0);
    am.connect(amG); amG.connect(g.gain);
    const gEnd = adsr(g.gain, t, { a: 0.05, d: 0.2, s: 1, hold: 0.55, r: 0.08, peak: 0.07 * o.vol });
    m.connect(bp); bp.connect(g); out(g, 'effects', { pan: o.pan, wet: 0.1 }); m.stop(gEnd); am.stop(gEnd); cleanup([m, bp, am, amG, g], gEnd + 0.1);
    hiss(t + 0.75, { dur: Math.max(0.8, dur - 0.9), freq: 3800, sweepTo: 6000, q: 0.8, peak: 0.1 * o.vol, a: 0.12, pan: o.pan, wet: 0.15 });
    for (let i = 0; i < 4; i++) strike(t + 0.8 + i * rnd(0.18, 0.3), rnd(900, 1300), [[1, 1, 0.05], [1.5, 0.4, 0.03]], { peak: 0.05 * o.vol, pan: o.pan });
  },
  pour(t, dur, o) {
    // liquid: noise through a resonant band that wobbles like a gurgle
    const n = noise('white', t, dur + 0.3), bp = filter('bandpass', 900, 5), g = gain(0);
    for (let k = 0; k < dur * 14; k++) bp.frequency.setValueAtTime(rnd(600, 1500), t + k / 14);
    const end = adsr(g.gain, t, { a: 0.08, d: 0.2, s: 1, hold: dur * 0.85, r: 0.15, peak: 0.12 * o.vol });
    n.connect(bp); bp.connect(g); out(g, 'effects', { pan: o.pan, wet: 0.15 }); cleanup([n, bp, g], end + 0.1);
  },
  shake(t, dur, o) {
    // ice in a shaker: shake-shake bursts with tiny ice clicks
    const strokes = Math.floor(dur * 5);
    for (let i = 0; i < strokes; i++) {
      const at = t + i * 0.2;
      hiss(at, { dur: 0.09, type: 'highpass', freq: 3500, peak: 0.08 * o.vol, a: 0.01, pan: o.pan });
      for (let k = 0; k < 3; k++) strike(at + rnd(0, 0.08), rnd(2400, 4200), [[1, 1, 0.025]], { peak: 0.04 * o.vol, pan: o.pan, wet: 0.05 });
    }
  },
  chop(t, dur, o) {
    const n = Math.max(2, Math.floor(dur / 0.28));
    for (let i = 0; i < n; i++) thump(t + i * rnd(0.24, 0.32), { freq: rnd(170, 210), peak: 0.16 * o.vol, pan: o.pan, knock: 2400 });
  },
  stir(t, dur, o) {
    // a spoon going round the pan, knocking the rim now and then
    const n = noise('pink', t, dur + 0.3), bp = filter('bandpass', 2200, 1.5), g = gain(0), lfo = osc('sine', 1.8, t), lfoG = gain(0.035 * o.vol);
    lfo.connect(lfoG); lfoG.connect(g.gain);
    const end = adsr(g.gain, t, { a: 0.2, d: 0.2, s: 1, hold: dur * 0.8, r: 0.2, peak: 0.04 * o.vol });
    n.connect(bp); bp.connect(g); out(g, 'effects', { pan: o.pan, wet: 0.1 }); lfo.stop(end); cleanup([n, bp, g, lfo, lfoG], end + 0.1);
    // a couple of dull taps of the spoon on the rim (short, so they never ring like chimes)
    for (let i = 0; i < 2; i++) hiss(t + rnd(0.3, dur), { dur: 0.03, freq: o.cup ? 2400 : 900, q: 2, peak: 0.05 * o.vol, pan: o.pan, wet: 0.05 });
  },
  knead(t, dur, o) {
    for (let i = 0; i < Math.floor(dur / 0.5); i++) {
      const at = t + i * 0.5;
      hiss(at, { dur: 0.12, type: 'lowpass', freq: 380, peak: 0.22 * o.vol, kind: 'brown', pan: o.pan, a: 0.01 });
      if (Math.random() < 0.4) hiss(at + 0.05, { dur: 0.25, freq: 3000, q: 0.5, peak: 0.02 * o.vol, pan: o.pan });   // a puff of flour
    }
  },
  scrub(t, dur, o) {
    // sponge strokes and a slosh of water
    const n = noise('white', t, dur + 0.3), bp = filter('bandpass', 1500, 1), g = gain(0), lfo = osc('sine', 5.5, t), lfoG = gain(0.04 * o.vol);
    lfo.connect(lfoG); lfoG.connect(g.gain);
    const end = adsr(g.gain, t, { a: 0.1, d: 0.2, s: 1, hold: dur * 0.85, r: 0.15, peak: 0.045 * o.vol });
    n.connect(bp); bp.connect(g); out(g, 'effects', { pan: o.pan, wet: 0.12 }); lfo.stop(end); cleanup([n, bp, g, lfo, lfoG], end + 0.1);
    for (let i = 0; i < 2; i++) ACTIONS.slosh(t + rnd(0, dur * 0.7), 0.5, o);
  },
  slosh(t, dur, o) {
    const n = noise('white', t, dur + 0.3), bp = filter('bandpass', 700, 3), g = gain(0);
    for (let k = 0; k < 8; k++) bp.frequency.setValueAtTime(rnd(450, 1100), t + k * dur / 8);
    const end = adsr(g.gain, t, { a: 0.05, d: dur, peak: 0.07 * o.vol });
    n.connect(bp); bp.connect(g); out(g, 'effects', { pan: o.pan, wet: 0.2 }); cleanup([n, bp, g], end + 0.1);
  },
  wipe(t, dur, o) {
    for (let i = 0; i < 2; i++) hiss(t + i * dur * 0.45, { dur: dur * 0.35, freq: 1100, sweepTo: 2200, q: 0.8, peak: 0.05 * o.vol, a: 0.06, pan: o.pan });
  },
  sweep(t, dur, o) {
    for (let i = 0; i < Math.floor(dur / 0.55); i++) hiss(t + i * 0.55, { dur: 0.3, type: 'highpass', freq: 2200, peak: 0.05 * o.vol, a: 0.08, pan: o.pan, kind: 'pink' });
  },
  register(t, dur, o) {
    // keys on the till, then the drawer and its bell
    const keys = Math.max(3, Math.floor(dur / 0.16) - 2);
    for (let i = 0; i < keys; i++) hiss(t + i * rnd(0.11, 0.17), { dur: 0.02, freq: rnd(2600, 3400), q: 3, peak: 0.08 * o.vol, pan: o.pan, wet: 0.05 });
    const at = t + keys * 0.15 + 0.1;
    hiss(at, { dur: 0.15, type: 'lowpass', freq: 900, peak: 0.08 * o.vol, pan: o.pan });
    bell(at + 0.05, 2637, { vel: 0.35 * o.vol, bus: 'effects', pan: o.pan, decay: 0.9, wet: 0.2 });
  },
  till(t, dur, o) {
    // two coins dropping in the till: short clinks, no ring
    const COIN = [[1, 1, 0.07], [2.3, 0.4, 0.04]];
    strike(t, 3100, COIN, { peak: 0.05 * o.vol, pan: o.pan, wet: 0.05 }); strike(t + 0.07, 3500, COIN, { peak: 0.04 * o.vol, pan: o.pan, wet: 0.05 });
  },
  scribble(t, dur, o) {
    const n = noise('white', t, dur + 0.3), bp = filter('bandpass', 4200, 2), g = gain(0);
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < dur * 9; k++) g.gain.setValueAtTime(Math.random() < 0.7 ? rnd(0.01, 0.03) * o.vol : 0.0001, t + k / 9);
    g.gain.setValueAtTime(0.0001, t + dur);
    n.connect(bp); bp.connect(g); out(g, 'effects', { pan: o.pan, wet: 0.05 }); cleanup([n, bp, g], t + dur + 0.2);
  },
  plate(t, dur, o) { strike(t, rnd(1800, 2100), CERAMIC, { peak: 0.09 * o.vol, pan: o.pan }); },
  glass(t, dur, o) { strike(t, rnd(2500, 2800), GLASS, { peak: 0.06 * o.vol, pan: o.pan, wet: 0.3 }); },
  thud(t, dur, o) { thump(t, { freq: 110, peak: 0.25 * o.vol, pan: o.pan, knock: 800 }); },
  clank(t, dur, o) { strike(t, rnd(380, 450), METAL, { peak: 0.08 * o.vol, pan: o.pan, wet: 0.25 }); },
  clap(t, dur, o) { for (let i = 0; i < 3; i++) hiss(t + i * 0.16, { dur: 0.05, freq: 1300, q: 1, peak: 0.12 * o.vol, pan: o.pan, wet: 0.2 }); },
  shutter(t, dur, o) { hiss(t, { dur: 0.015, freq: 3500, q: 2, peak: 0.12 * o.vol, pan: o.pan }); hiss(t + 0.06, { dur: 0.025, freq: 2200, q: 2, peak: 0.1 * o.vol, pan: o.pan }); },
  tap(t, dur, o) { for (let i = 0; i < 4; i++) hiss(t + i * rnd(0.15, 0.3), { dur: 0.012, freq: 1800, q: 3, peak: 0.05 * o.vol, pan: o.pan }); },
  whoosh(t, dur, o) { hiss(t, { dur: Math.min(1.2, dur), freq: 400, sweepTo: 1800, q: 1.5, peak: 0.05 * o.vol, a: 0.3, pan: o.pan, kind: 'pink' }); },
  cheer(t, dur, o) { ACTIONS.clap(t, dur, { ...o, vol: o.vol * 0.7 }); },
};

let busyUntil = [];
let lastAction = 0;
const MAX_ACTIONS = 3;      // at most this many at once
const MIN_GAP = 0.7;        // seconds between any two

/* ── the public API ───────────────────────────────────────────────────── */

export const sfx = {
  setEnabled(on) { setEnabled(on); },
  get enabled() { return isEnabled(); },
  unlock() { unlock(); },
  /** Music + ambience for a view: 'title' | 'home' | 'peek' | 'challenge' | 'town'. */
  scene(view) {
    const m = { title: 'title', home: 'restaurant', peek: 'restaurant', challenge: 'challenge', town: 'town' }[view] ?? null;
    music.play(m);
    ambience.play(view === 'title' ? null : view === 'challenge' ? 'challenge' : view === 'town' ? 'town' : m ? 'restaurant' : null);
  },
  setVolume(name, v) { setVolume(name, v); },
  volume(name) { return getVolume(name); },

  /**
   * A critter doing something in the restaurant. `pan` -1..1 and `vol` 0..1
   * come from where they are on screen. Busy kitchens are capped so the
   * mix doesn't turn to mush.
   */
  action(kind, { dur = 1.5, pan = 0, vol = 1, cup = false } = {}) {
    if (!ok() || !ACTIONS[kind] || vol < 0.04) return;
    const now = T();
    busyUntil = busyUntil.filter((x) => x > now);
    if (busyUntil.length >= MAX_ACTIONS || now - lastAction < MIN_GAP) return;
    busyUntil.push(now + dur);
    lastAction = now;
    try { ACTIONS[kind](now + 0.02, dur, { pan, vol, cup }); } catch (e) { console.warn('[sfx]', e); }
  },

  // UI
  click() { if (!ok()) return; const t = T(); hiss(t, { dur: 0.018, freq: 2400, q: 2.5, peak: 0.12 }); strike(t, 1180, [[1, 1, 0.03]], { peak: 0.05, wet: 0.05 }); },
  pop() {
    if (!ok()) return; const t = T();
    const o = osc('sine', 320, t), g = gain(0);
    o.frequency.exponentialRampToValueAtTime(920, t + 0.06);
    const end = adsr(g.gain, t, { a: 0.004, d: 0.07, peak: 0.16 });
    o.connect(g); out(g, 'effects', { wet: 0.1 }); o.stop(end + 0.05); cleanup([o, g], end + 0.1);
  },
  open() { if (!ok()) return; const t = T(); hiss(t, { dur: 0.16, freq: 700, sweepTo: 2600, q: 1.2, peak: 0.06, a: 0.04, kind: 'pink' }); marimba(t + 0.02, midi(72), { vel: 0.35, bus: 'effects' }); marimba(t + 0.09, midi(79), { vel: 0.3, bus: 'effects' }); },
  close() { if (!ok()) return; const t = T(); hiss(t, { dur: 0.14, freq: 2400, sweepTo: 700, q: 1.2, peak: 0.05, a: 0.03, kind: 'pink' }); marimba(t + 0.02, midi(79), { vel: 0.28, bus: 'effects' }); marimba(t + 0.08, midi(72), { vel: 0.3, bus: 'effects' }); },

  // the game
  coin() { if (!ok()) return; const t = T(); bell(t, midi(95), { vel: 0.3, bus: 'effects', decay: 0.5, wet: 0.2 }); bell(t + 0.08, midi(100), { vel: 0.3, bus: 'effects', decay: 0.9, wet: 0.25 }); hiss(t, { dur: 0.08, type: 'highpass', freq: 7000, peak: 0.03 }); },
  hire() { if (!ok()) return; const t = T(); [72, 76, 79, 84].forEach((n, i) => marimba(t + i * 0.075, midi(n), { vel: 0.5, bus: 'effects', pan: -0.2 + i * 0.13 })); bell(t + 0.32, midi(91), { vel: 0.25, bus: 'effects', decay: 1.2 }); },
  serve() { if (!ok()) return; const t = T(); strike(t, 1950, CERAMIC, { peak: 0.12, wet: 0.2 }); bell(t + 0.1, midi(100), { vel: 0.18, bus: 'effects', decay: 0.7 }); },
  complain() { if (!ok()) return; grumble(T(), { f0: rnd(150, 200), peak: 0.14 }); },
  satisfied() { if (!ok()) return; const t = T(); [84, 88, 91, 96].forEach((n, i) => bell(t + i * 0.07, midi(n), { vel: 0.32, bus: 'effects', decay: 1, pan: -0.3 + i * 0.2 })); hiss(t + 0.2, { dur: 0.5, type: 'highpass', freq: 7000, peak: 0.025, a: 0.05 }); },
  fired() {
    if (!ok()) return; const t = T();
    // a sad little wah-wah
    [[55, 0.32], [54, 0.32], [53, 0.7]].forEach(([n, d], i) => {
      const at = t + i * 0.34, o = osc('sawtooth', midi(n), at), lp = filter('lowpass', 500, 4), g = gain(0), vib = osc('sine', 5.5, at), vibG = gain(midi(n) * 0.012);
      lp.frequency.setValueAtTime(400, at); lp.frequency.linearRampToValueAtTime(1300, at + 0.12); lp.frequency.linearRampToValueAtTime(500, at + d);
      vib.connect(vibG); vibG.connect(o.frequency);
      const end = adsr(g.gain, at, { a: 0.03, d: 0.2, s: 0.8, hold: d * 0.7, r: 0.12, peak: 0.07 });
      o.connect(lp); lp.connect(g); out(g, 'effects', { wet: 0.2 }); o.stop(end + 0.05); vib.stop(end + 0.05); cleanup([o, lp, g, vib, vibG], end + 0.1);
    });
  },
  /** Customers at the door: the shop bell jingles, then a ding-dong. */
  alarm() {
    if (!ok()) return; const t = T();
    for (let i = 0; i < 7; i++) strike(t + i * rnd(0.04, 0.08), rnd(2600, 4400), [[1, 1, 0.35], [2.4, 0.4, 0.2]], { peak: 0.07, pan: rnd(-0.3, 0.3), wet: 0.3 });
    bell(t + 0.55, midi(88), { vel: 0.45, bus: 'effects', decay: 1.2 }); bell(t + 0.95, midi(84), { vel: 0.45, bus: 'effects', decay: 1.6 });
  },
  win() {
    if (!ok()) return; const t = T();
    [72, 76, 79, 84].forEach((n, i) => marimba(t + i * 0.09, midi(n), { vel: 0.55, bus: 'effects' }));
    [60, 64, 67, 71, 74].forEach((n) => epiano(t + 0.38, midi(n), 1.2, { vel: 0.35, bus: 'effects' }));
    bell(t + 0.38, midi(96), { vel: 0.3, bus: 'effects', decay: 1.8 });
  },
  lose() {
    if (!ok()) return; const t = T();
    [79, 76, 72, 69].forEach((n, i) => bell(t + i * 0.22, midi(n), { vel: 0.3, bus: 'effects', decay: 1.2 }));
    pad(t + 0.4, [57, 60, 64].map(midi), 1.4, { vel: 0.5, bus: 'effects', wet: 0.4, cutoff: 700 });
  },
  /* ── mini games: short cues, never throttled ─────────────────────────── */
  /** One of the critter work sounds, right now (sfx.action rations them for the restaurant). */
  work(kind, { dur = 0.4, pan = 0, vol = 1 } = {}) {
    if (!ok() || !ACTIONS[kind]) return;
    try { ACTIONS[kind](T() + 0.01, dur, { pan, vol, cup: false }); } catch (e) { console.warn('[sfx]', e); }
  },
  /** A marimba beat for rhythm games; `step` walks a little four-note riff. */
  beat(step = 0, { accent = false } = {}) {
    if (!ok()) return; const t = T();
    marimba(t, midi([67, 72, 71, 74][step % 4] + (accent ? 12 : 0)), { vel: accent ? 0.45 : 0.3, bus: 'effects' });
    hiss(t, { dur: 0.02, type: 'highpass', freq: 6000, peak: accent ? 0.05 : 0.03 });
  },
  countdown(last = false) { if (!ok()) return; bell(T(), midi(last ? 91 : 84), { vel: 0.35, bus: 'effects', decay: last ? 0.9 : 0.4 }); },
  good(streak = 0) {
    if (!ok()) return; const t = T(), up = Math.min(streak, 6);
    marimba(t, midi(76 + up), { vel: 0.45, bus: 'effects' }); marimba(t + 0.06, midi(83 + up), { vel: 0.4, bus: 'effects' });
  },
  miss() {
    if (!ok()) return; const t = T();
    thump(t, { freq: 120, peak: 0.22, knock: 600 });
    marimba(t + 0.02, midi(58), { vel: 0.35, bus: 'effects' }); marimba(t + 0.12, midi(57), { vel: 0.3, bus: 'effects' });
  },
  /** Crockery hitting the floor. */
  smash(n = 4) {
    if (!ok()) return; const t = T();
    hiss(t, { dur: 0.25, type: 'highpass', freq: 2500, peak: 0.12, kind: 'white' });
    for (let i = 0; i < Math.min(8, n + 2); i++) strike(t + i * rnd(0.02, 0.06), rnd(1600, 3400), CERAMIC, { peak: 0.08, pan: rnd(-0.4, 0.4) });
  },
  star(i = 0) { if (!ok()) return; const t = T(); bell(t, midi([84, 88, 91][i] || 96), { vel: 0.45, bus: 'effects', decay: 1.1 }); hiss(t, { dur: 0.3, type: 'highpass', freq: 7500, peak: 0.03 }); },
  chat() {
    if (!ok()) return; const t = T();
    for (const [at, f0, f1] of [[0, 600, 900], [0.07, 750, 1150]]) {
      const o = osc('sine', f0, t + at), g = gain(0);
      o.frequency.exponentialRampToValueAtTime(f1, t + at + 0.05);
      const end = adsr(g.gain, t + at, { a: 0.004, d: 0.06, peak: 0.1 });
      o.connect(g); out(g, 'effects', { wet: 0.15 }); o.stop(end + 0.05); cleanup([o, g], end + 0.1);
    }
  },
};

// Once sound is allowed, start whatever the current scene asked for.
onAudio((what) => { if (what === 'unlock' || what === 'on') { music.play(music.scene); } });
