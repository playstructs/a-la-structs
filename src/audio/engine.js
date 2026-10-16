/**
 * The audio engine: one AudioContext, three buses (music, ambience, effects)
 * into a gentle compressor, a shared reverb, cached noise, and a few
 * building blocks the music, ambience and effects are made from. Everything
 * is synthesised live; there are no audio files.
 *
 * Browsers only allow sound after the player interacts, so nothing starts
 * until unlock(); scene and volume requests made before that are remembered.
 */
let ctx = null;
let master = null, comp = null, reverb = null, reverbIn = null;
const buses = {};
const volumes = { music: 0.6, ambience: 0.5, effects: 0.2 };
let enabled = true;
let unlocked = false;
const listeners = new Set();
const noiseCache = {};

/** Level of each bus at full slider, so the mix sits right at the defaults. */
const BUS_TRIM = { music: 0.42, ambience: 0.55, effects: 0.9 };

export function audioCtx() { return ctx; }
export function isRunning() { return !!(ctx && enabled && unlocked && ctx.state === 'running'); }
export function bus(name) { return buses[name]; }
export function reverbSend() { return reverbIn; }
export function now() { return ctx ? ctx.currentTime : 0; }

function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
  master = ctx.createGain(); master.gain.value = 0.9;
  comp.connect(master); master.connect(ctx.destination);

  reverb = ctx.createConvolver();
  reverb.buffer = impulse(2.4, 2.6);
  reverbIn = ctx.createGain(); reverbIn.gain.value = 1;
  const wet = ctx.createGain(); wet.gain.value = 0.32;
  reverbIn.connect(reverb); reverb.connect(wet); wet.connect(comp);

  for (const name of ['music', 'ambience', 'effects']) {
    const g = ctx.createGain();
    g.gain.value = BUS_TRIM[name] * volumes[name];
    g.connect(comp);
    buses[name] = g;
  }
  // Save the battery: no sound in a background tab.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (enabled && unlocked) ctx.resume().catch(() => {});
  });
}

/** A soft, warm room: stereo noise with an exponential tail, darker as it decays. */
function impulse(seconds, decay) {
  const rate = ctx.sampleRate, n = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, n, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const k = 0.5 + 0.45 * t;                 // more low-pass as it fades
      lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
      d[i] = lp * Math.pow(1 - t, decay) * (i < rate * 0.012 ? i / (rate * 0.012) : 1) * 3;
    }
  }
  return buf;
}

/** Call from the first click/tap/key. */
export function unlock() {
  if (!enabled) return;
  try { if (!ctx) build(); } catch (e) { return; }
  if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
  if (!unlocked) { unlocked = true; listeners.forEach((fn) => fn('unlock')); }
}

export function setEnabled(on) {
  enabled = !!on;
  if (!ctx) return;
  if (enabled && unlocked) ctx.resume().catch(() => {});
  else ctx.suspend().catch(() => {});
  listeners.forEach((fn) => fn(enabled ? 'on' : 'off'));
}
export function isEnabled() { return enabled; }

/** 0..1 per bus; smoothed so dragging a slider doesn't click. */
export function setVolume(name, v) {
  volumes[name] = Math.max(0, Math.min(1, Number(v) || 0));
  const g = buses[name];
  if (g) g.gain.setTargetAtTime(BUS_TRIM[name] * volumes[name], ctx.currentTime, 0.05);
}
export function getVolume(name) { return volumes[name]; }

/** Hear about unlock / on / off (the music and ambience start when they can). */
export function onAudio(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/* ── building blocks ──────────────────────────────────────────────────── */

/** 3 s of looping noise: 'white', 'pink' or 'brown'. */
export function noiseBuffer(kind = 'white') {
  if (noiseCache[kind]) return noiseCache[kind];
  const n = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5;
    } else d[i] = w;
  }
  return (noiseCache[kind] = buf);
}

/** A noise source (looping), started at t. Stop it yourself or give `dur`. */
export function noise(kind, t, dur = null) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(kind);
  s.loop = true;
  s.loopStart = Math.random() * 2;
  s.start(t, Math.random() * 2.5);
  if (dur != null) s.stop(t + dur);
  return s;
}

/** Attack/decay/sustain/release on a gain param. Returns the end time. */
export function adsr(param, t, { a = 0.005, d = 0.1, s = 0, r = 0.1, peak = 1, hold = 0 } = {}) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(peak, t + a);
  if (s > 0) {
    param.setTargetAtTime(peak * s, t + a, d / 3);
    param.setTargetAtTime(0.0001, t + a + hold, r / 4);
    return t + a + hold + r;
  }
  param.setTargetAtTime(0.0001, t + a, d / 3);
  return t + a + d * 1.5;
}

/**
 * Route a node to a bus (by name, or any node such as a piece's own fader)
 * with gain, pan (-1..1) and some reverb. Returns the gain node.
 */
export function out(node, dest, { gain = 1, pan = 0, wet = 0.2, keep = false } = {}) {
  const g = ctx.createGain(); g.gain.value = gain;
  let last = g;
  node.connect(g);
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); last = p; }
  last.connect(typeof dest === 'string' ? buses[dest] : dest);
  g.chain = [g];
  if (last !== g) g.chain.push(last);
  if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; last.connect(w); w.connect(reverbIn); g.chain.push(w); }
  // Long-lived sounds (keep) release g.chain themselves.
  if (!keep) pendingOut.push(...g.chain);
  return g;
}

// Routing nodes made by out() since the last cleanup(): a voice calls out()
// and then cleanup() for its own nodes, so these go with it.
let pendingOut = [];

/** Disconnect a set of nodes once they've gone quiet. */
export function cleanup(nodes, at) {
  const all = nodes.concat(pendingOut); pendingOut = [];
  const ms = Math.max(0, (at - ctx.currentTime) * 1000) + 120;
  setTimeout(() => all.forEach((n) => { try { n.disconnect(); } catch (e) { /* gone */ } }), ms);
}

export const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
