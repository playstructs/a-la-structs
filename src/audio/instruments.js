/**
 * Synth voices. Each plays one note at time `t` into a bus and cleans up
 * after itself. Kept soft and warm: sine/FM tones, filtered noise, gentle
 * attacks — nothing that beeps.
 */
import { audioCtx, out, noise, cleanup, adsr } from './engine.js';

const osc = (type, freq, t) => { const o = audioCtx().createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.start(t); return o; };
const gain = (v = 0) => { const g = audioCtx().createGain(); g.gain.value = v; return g; };
const filter = (type, freq, q = 0.7) => { const f = audioCtx().createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; };

/** Rhodes-ish electric piano: a 1:1 FM tine with a bell-y attack that mellows. */
export function epiano(t, freq, dur, { vel = 0.5, bus = 'music', pan = 0, wet = 0.25 } = {}) {
  const c = audioCtx();
  const car = osc('sine', freq, t), mod = osc('sine', freq, t), modG = gain(0);
  modG.gain.setValueAtTime(freq * 2.2 * vel, t);
  modG.gain.setTargetAtTime(freq * 0.35 * vel, t, 0.12);
  mod.connect(modG); modG.connect(car.frequency);
  const tine = osc('sine', freq * 4.01, t), tineG = gain(0);
  adsr(tineG.gain, t, { a: 0.002, d: 0.18, peak: 0.08 * vel });
  const env = gain(0);
  const end = adsr(env.gain, t, { a: 0.006, d: 1.4, s: 0.45, hold: dur, r: 0.45, peak: 0.32 * vel });
  car.connect(env); tine.connect(tineG); tineG.connect(env);
  const lp = filter('lowpass', 2600); env.connect(lp);
  out(lp, bus, { pan, wet });
  [car, mod, tine].forEach((o) => o.stop(end + 0.05));
  cleanup([car, mod, modG, tine, tineG, env, lp], end + 0.1);
  void c;
}

/** Round upright-ish bass: sine plus a little triangle, plucked. */
export function bass(t, freq, dur, { vel = 0.6, bus = 'music', wet = 0.05 } = {}) {
  const s = osc('sine', freq, t), tr = osc('triangle', freq, t), trG = gain(0.35);
  const env = gain(0);
  const end = adsr(env.gain, t, { a: 0.008, d: 0.5, s: 0.55, hold: dur * 0.85, r: 0.12, peak: 0.55 * vel });
  const lp = filter('lowpass', 700);
  s.connect(env); tr.connect(trG); trG.connect(env); env.connect(lp);
  out(lp, bus, { wet });
  [s, tr].forEach((o) => o.stop(end + 0.05));
  cleanup([s, tr, trG, env, lp], end + 0.1);
}

/** Nylon-string pluck: a bright saw whose filter closes quickly. */
export function pluck(t, freq, { vel = 0.5, bus = 'music', pan = 0, decay = 1.2, wet = 0.22 } = {}) {
  const a = osc('sawtooth', freq, t), b = osc('triangle', freq * 1.003, t);
  const lp = filter('lowpass', 3200, 1.2);
  lp.frequency.setValueAtTime(Math.min(5200, freq * 9), t);
  lp.frequency.setTargetAtTime(freq * 1.6, t, 0.07);
  const env = gain(0);
  const end = adsr(env.gain, t, { a: 0.003, d: decay, peak: 0.22 * vel });
  a.connect(lp); b.connect(lp); lp.connect(env);
  out(env, bus, { pan, wet });
  [a, b].forEach((o) => o.stop(end + 0.05));
  cleanup([a, b, lp, env], end + 0.1);
}

/** Music box / glockenspiel: inharmonic partials, long shimmering decay. */
export function bell(t, freq, { vel = 0.5, bus = 'music', pan = 0, decay = 1.6, wet = 0.35 } = {}) {
  const parts = [[1, 1, decay], [2.756, 0.32, decay * 0.45], [5.404, 0.12, decay * 0.22], [8.93, 0.05, decay * 0.12]];
  const nodes = [];
  let endAll = t;
  const sum = gain(1);
  for (const [r, amp, d] of parts) {
    const o = osc('sine', freq * r, t), g = gain(0);
    const end = adsr(g.gain, t, { a: 0.002, d, peak: amp * 0.22 * vel });
    o.connect(g); g.connect(sum); o.stop(end + 0.05);
    endAll = Math.max(endAll, end);
    nodes.push(o, g);
  }
  out(sum, bus, { pan, wet });
  cleanup([...nodes, sum], endAll + 0.1);
}

/** Wooden marimba: fundamental plus a quick 4x overtone. */
export function marimba(t, freq, { vel = 0.5, bus = 'music', pan = 0, wet = 0.2 } = {}) {
  const f = osc('sine', freq, t), o4 = osc('sine', freq * 3.99, t), o10 = osc('sine', freq * 9.9, t);
  const g = gain(0), g4 = gain(0), g10 = gain(0);
  const end = adsr(g.gain, t, { a: 0.002, d: 0.55, peak: 0.36 * vel });
  adsr(g4.gain, t, { a: 0.001, d: 0.06, peak: 0.12 * vel });
  adsr(g10.gain, t, { a: 0.001, d: 0.02, peak: 0.05 * vel });
  f.connect(g); o4.connect(g4); o10.connect(g10);
  const sum = gain(1); [g, g4, g10].forEach((x) => x.connect(sum));
  out(sum, bus, { pan, wet });
  [f, o4, o10].forEach((x) => x.stop(end + 0.05));
  cleanup([f, o4, o10, g, g4, g10, sum], end + 0.1);
}

/** Breathy wooden flute: sine with a slow vibrato and a puff of air. */
export function flute(t, freq, dur, { vel = 0.5, bus = 'music', pan = 0, wet = 0.35 } = {}) {
  const o = osc('sine', freq, t), o2 = osc('triangle', freq * 2, t), o2g = gain(0.06);
  const vib = osc('sine', 5.2, t), vibG = gain(0);
  vibG.gain.setValueAtTime(0, t); vibG.gain.linearRampToValueAtTime(freq * 0.006, t + Math.min(0.6, dur));
  vib.connect(vibG); vibG.connect(o.frequency); vibG.connect(o2.frequency);
  const env = gain(0);
  const end = adsr(env.gain, t, { a: 0.07, d: 0.3, s: 0.8, hold: dur, r: 0.18, peak: 0.2 * vel });
  o.connect(env); o2.connect(o2g); o2g.connect(env);
  const air = noise('white', t, dur + 0.4), bp = filter('bandpass', freq * 2, 2.5), airG = gain(0);
  adsr(airG.gain, t, { a: 0.03, d: 0.25, s: 0.3, hold: dur, r: 0.1, peak: 0.04 * vel });
  air.connect(bp); bp.connect(airG); airG.connect(env);
  out(env, bus, { pan, wet });
  [o, o2, vib].forEach((x) => x.stop(end + 0.05));
  cleanup([o, o2, o2g, vib, vibG, env, air, bp, airG], end + 0.1);
}

/** Warm pad chord: detuned saws through a soft low-pass, slow swell. */
export function pad(t, freqs, dur, { vel = 0.5, bus = 'music', wet = 0.45, cutoff = 900 } = {}) {
  const sum = gain(0), lp = filter('lowpass', cutoff, 0.5);
  const end = adsr(sum.gain, t, { a: Math.min(1.6, dur * 0.4), d: 0.5, s: 1, hold: dur, r: 1.2, peak: 0.07 * vel });
  const nodes = [];
  for (const f of freqs) for (const det of [-6, 5]) {
    const o = osc('sawtooth', f, t); o.detune.value = det; o.connect(lp); o.stop(end + 0.05); nodes.push(o);
  }
  lp.connect(sum);
  out(sum, bus, { wet });
  cleanup([...nodes, lp, sum], end + 0.1);
}

/* ── soft drums ───────────────────────────────────────────────────────── */

export function kick(t, { vel = 0.6, bus = 'music' } = {}) {
  const o = osc('sine', 110, t), g = gain(0);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  const end = adsr(g.gain, t, { a: 0.003, d: 0.28, peak: 0.6 * vel });
  o.connect(g); out(g, bus, { wet: 0 });
  o.stop(end + 0.05); cleanup([o, g], end + 0.1);
}

/** Brushed snare: a soft swish of noise. */
export function brush(t, { vel = 0.5, bus = 'music', long = false, pan = 0 } = {}) {
  const n = noise('white', t, long ? 0.6 : 0.3), bp = filter('bandpass', 3200, 0.6), g = gain(0);
  const end = adsr(g.gain, t, { a: long ? 0.06 : 0.004, d: long ? 0.35 : 0.14, peak: 0.12 * vel });
  n.connect(bp); bp.connect(g); out(g, bus, { pan, wet: 0.12 });
  cleanup([n, bp, g], end + 0.1);
}

export function shaker(t, { vel = 0.4, bus = 'music', pan = 0.2 } = {}) {
  const n = noise('white', t, 0.12), hp = filter('highpass', 6500), g = gain(0);
  const end = adsr(g.gain, t, { a: 0.012, d: 0.05, peak: 0.08 * vel });
  n.connect(hp); hp.connect(g); out(g, bus, { pan, wet: 0.05 });
  cleanup([n, hp, g], end + 0.1);
}

export function rim(t, { vel = 0.4, bus = 'music', pan = -0.15 } = {}) {
  const o = osc('triangle', 1700, t), g = gain(0), bp = filter('bandpass', 1700, 6);
  const end = adsr(g.gain, t, { a: 0.001, d: 0.03, peak: 0.25 * vel });
  o.connect(bp); bp.connect(g); out(g, bus, { pan, wet: 0.1 });
  o.stop(end + 0.05); cleanup([o, g, bp], end + 0.1);
}

export { osc, gain, filter };
