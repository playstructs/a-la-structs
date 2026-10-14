/**
 * Bloops and dings, synthesised on the fly (no audio files). Starts muted
 * until the first click, as browsers require.
 */
let ctx = null;
let enabled = true;
let master = null;

function ac() {
  if (!enabled) return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.22; master.connect(ctx.destination);
    } catch (e) { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, { at = 0, dur = 0.12, type = 'sine', vol = 1, slide = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise({ at = 0, dur = 0.2, vol = 0.4, freq = 1200 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
  const g = c.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t);
}

export const sfx = {
  setEnabled(on) { enabled = on; if (!on && ctx) ctx.suspend().catch(() => {}); },
  get enabled() { return enabled; },
  unlock() { ac(); },
  click() { tone(660, { dur: 0.06, type: 'triangle', vol: 0.5 }); },
  pop() { tone(520, { dur: 0.09, type: 'sine', slide: 380, vol: 0.6 }); },
  open() { tone(440, { dur: 0.08, type: 'triangle' }); tone(660, { at: 0.06, dur: 0.1, type: 'triangle' }); },
  close() { tone(600, { dur: 0.07, type: 'triangle' }); tone(420, { at: 0.05, dur: 0.09, type: 'triangle' }); },
  coin() { tone(988, { dur: 0.08, type: 'square', vol: 0.25 }); tone(1319, { at: 0.07, dur: 0.18, type: 'square', vol: 0.25 }); },
  hire() { [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.14, type: 'triangle', vol: 0.5 })); },
  serve() { noise({ dur: 0.15, vol: 0.25, freq: 2200 }); tone(1568, { at: 0.12, dur: 0.25, type: 'sine', vol: 0.5 }); },
  complain() { tone(180, { dur: 0.22, type: 'sawtooth', vol: 0.3, slide: -60 }); tone(150, { at: 0.12, dur: 0.22, type: 'sawtooth', vol: 0.25, slide: -40 }); },
  satisfied() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.18, type: 'sine', vol: 0.45 })); },
  fired() { [392, 370, 349, 262].forEach((f, i) => tone(f, { at: i * 0.22, dur: 0.3, type: 'sawtooth', vol: 0.18, slide: i === 3 ? -40 : 0 })); },
  alarm() { for (let i = 0; i < 3; i++) { tone(1046, { at: i * 0.28, dur: 0.2, type: 'triangle', vol: 0.5 }); tone(1318, { at: i * 0.28 + 0.1, dur: 0.15, type: 'triangle', vol: 0.4 }); } },
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.1, dur: 0.2, type: 'triangle', vol: 0.5 })); },
  lose() { [523, 466, 415, 349].forEach((f, i) => tone(f, { at: i * 0.18, dur: 0.25, type: 'triangle', vol: 0.4 })); },
  chat() { tone(880, { dur: 0.05, type: 'sine', vol: 0.35 }); tone(1175, { at: 0.05, dur: 0.07, type: 'sine', vol: 0.3 }); },
};
