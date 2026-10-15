/**
 * Background music, generated as it plays. Each scene has its own piece: a
 * chord loop, a groove, and melodies written by a small seeded composer in
 * AABA phrases, so it sounds like a tune rather than random notes, and it
 * keeps changing. Switching scene crossfades from one piece to the next.
 */
import { audioCtx, bus, isRunning, midi } from './engine.js';
import { epiano, bass, pluck, bell, marimba, flute, pad, kick, brush, shaker, rim, gain, routeMusic } from './instruments.js';

const LOOKAHEAD = 0.3;     // seconds of music scheduled ahead
const TICK_MS = 60;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ── a tiny composer ──────────────────────────────────────────────────── */

const RHYTHMS = {
  // 16 steps per bar; each entry is [startStep, lengthInSteps]
  calm: [[[0, 6], [8, 4], [12, 4]], [[0, 8], [8, 8]], [[2, 4], [8, 6]], [[0, 4], [4, 4], [10, 6]], [[0, 12]]],
  lilting: [[[0, 3], [3, 3], [6, 4], [12, 4]], [[0, 4], [6, 2], [8, 6]], [[2, 2], [4, 4], [10, 4], [14, 2]], [[0, 6], [6, 2], [8, 8]]],
  busy: [[[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]], [[0, 3], [3, 3], [6, 2], [8, 4], [12, 2], [14, 2]], [[0, 4], [4, 2], [6, 2], [8, 8]]],
};

/**
 * One 4-bar phrase over `chords` (arrays of midi notes). Strong beats land on
 * chord tones, the rest step through the scale; the line ends on a chord tone.
 */
function phrase(r, chords, scale, { style = 'lilting', lo = 67, hi = 84, rest = 0.15 } = {}) {
  const pool = (lo2, hi2) => { const out = []; for (let n = lo2; n <= hi2; n++) if (scale.includes(n % 12)) out.push(n); return out; };
  const notes = pool(lo, hi);
  let cur = notes[Math.floor(notes.length / 2)];
  const events = [];
  chords.forEach((chord, bar) => {
    const pcs = chord.map((n) => n % 12);
    const pattern = RHYTHMS[style][Math.floor(r() * RHYTHMS[style].length)];
    pattern.forEach(([st, len], k) => {
      if (k > 0 && r() < rest) return;
      const strong = st % 8 === 0;
      const cands = notes.filter((n) => Math.abs(n - cur) <= (strong ? 7 : 4) && (!strong || pcs.includes(n % 12)));
      const pick = cands.length ? cands[Math.floor(r() * cands.length)] : cur;
      cur = pick;
      events.push({ step: bar * 16 + st, len, note: pick });
    });
  });
  // land on a chord tone of the last chord
  const last = events[events.length - 1];
  if (last) { const pcs = chords[chords.length - 1].map((n) => n % 12); while (!pcs.includes(last.note % 12)) last.note--; }
  return events;
}

/** 16 bars as A A B A; each section a 4-bar phrase over the progression. */
function song(seed, prog, scale, opts) {
  const r = rng(seed);
  const A = phrase(r, prog.slice(0, 4), scale, opts);
  const B = phrase(r, prog.slice(4, 8).length ? prog.slice(4, 8) : prog.slice(0, 4), scale, { ...opts, lo: opts.lo + 3, hi: opts.hi + 3 });
  const A2 = A.map((e) => ({ ...e }));
  if (A2.length) A2[A2.length - 1].note = A2[0].note;   // a little variation on the return
  const out = [];
  [A, A, B, A2].forEach((sec, i) => sec.forEach((e) => out.push({ ...e, step: e.step + i * 64 })));
  return out;
}

/* ── the pieces ───────────────────────────────────────────────────────── */

const F_MAJ = [5, 7, 9, 10, 0, 2, 4];
const G_MAJ = [7, 9, 11, 0, 2, 4, 6];
const A_MIN = [9, 11, 0, 2, 4, 5, 7];
const EB_MAJ = [3, 5, 7, 8, 10, 0, 2];
const D_MAJ = [2, 4, 6, 7, 9, 11, 1];
const BB_MAJ = [10, 0, 2, 3, 5, 7, 9];
const C_PENTA = [0, 2, 4, 7, 9];
const ch = (...n) => n;

const PIECES = {
  /** Your restaurant: lo-fi café bossa — Rhodes, upright bass, brushes. */
  restaurant: {
    level: 0.8, bpm: 84, swing: 0.16,
    prog: [ch(55, 58, 62, 65, 69), ch(52, 58, 60, 64, 69), ch(53, 57, 60, 64, 67), ch(50, 53, 57, 60, 64),
      ch(58, 62, 65, 69), ch(57, 60, 64, 67), ch(55, 58, 62, 65), ch(52, 58, 60, 64)],
    bassRoots: [43, 36, 41, 38, 46, 45, 43, 36],
    scale: F_MAJ, melody: { style: 'lilting', lo: 69, hi: 84, rest: 0.3 },
    step(p, s, t, sp) {
      const bar = Math.floor(s / 16) % p.prog.length, b = s % 16;
      const chord = p.prog[bar], root = p.def.bassRoots[bar];
      // bossa comping
      if ([0, 3, 6, 10, 13].includes(b) && (b !== 13 || p.r() < 0.6)) chord.forEach((n, i) => epiano(t + i * 0.008, midi(n), sp * (b === 0 ? 3 : 2), { vel: 0.32, pan: -0.2 }));
      // bass: root, fifth, approach
      if (b === 0) bass(t, midi(root), sp * 5);
      if (b === 6) bass(t, midi(root + 7), sp * 3, { vel: 0.5 });
      if (b === 8) bass(t, midi(root + 7), sp * 4, { vel: 0.55 });
      if (b === 14 && p.r() < 0.5) bass(t, midi(p.def.bassRoots[(bar + 1) % p.def.bassRoots.length] + 1), sp * 2, { vel: 0.45 });
      // brushes, rim, shaker
      if (b === 4 || b === 12) brush(t, { vel: 0.55 });
      if (b % 2 === 0) shaker(t, { vel: b % 4 === 0 ? 0.25 : 0.45 });
      if ([0, 3, 6, 10, 12].includes(b) && s % 32 < 16) rim(t, { vel: 0.18 });
      if (b === 0 && s % 64 === 0) kick(t, { vel: 0.3 });
      // vibraphone-ish melody
      for (const e of p.notesAt(s)) bell(t, midi(e.note), { vel: 0.42, decay: 0.9 + e.len * sp * 0.6, pan: 0.18, wet: 0.3 });
    },
  },

  /** Guild town: folksy fingerpicked guitar, a wooden flute, a shaker. */
  town: {
    level: 1.55, bpm: 100, swing: 0.08,
    prog: [ch(55, 59, 62), ch(50, 54, 57), ch(52, 55, 59), ch(48, 52, 55), ch(55, 59, 62), ch(48, 52, 55), ch(50, 54, 57), ch(55, 59, 62)],
    scale: G_MAJ, melody: { style: 'lilting', lo: 71, hi: 86, rest: 0.2 },
    step(p, s, t, sp) {
      const chord = p.chord(s), b = s % 16;
      // Travis-style picking: bass on the beat, chord tones between
      if (b % 4 === 0) pluck(t, midi(chord[0] - 12 + (b % 8 === 4 ? 7 : 0)), { vel: 0.6, pan: -0.25, decay: 0.9 });
      if (b % 2 === 0 && b % 4 !== 0) pluck(t, midi(chord[(b / 2) % 3] + 12), { vel: 0.35, pan: -0.1, decay: 0.7 });
      if (b % 4 === 3 && p.r() < 0.35) pluck(t, midi(chord[2]), { vel: 0.25, pan: -0.1, decay: 0.5 });
      if (b % 2 === 1) shaker(t, { vel: 0.3, pan: 0.35 });
      if (b === 0 || b === 8) kick(t, { vel: 0.22 });
      for (const e of p.notesAt(s)) flute(t, midi(e.note), e.len * sp * 0.92, { vel: 0.55, pan: 0.2 });
    },
  },

  /** A service challenge: perky marimba and pizzicato bass, a little tension. */
  challenge: {
    level: 1.75, bpm: 116, swing: 0,
    prog: [ch(57, 60, 64), ch(53, 57, 60), ch(55, 59, 62), ch(52, 56, 59, 62), ch(57, 60, 64), ch(50, 53, 57), ch(52, 56, 59), ch(52, 56, 59, 62)],
    scale: A_MIN, melody: { style: 'busy', lo: 69, hi: 84, rest: 0.25 },
    step(p, s, t, sp) {
      const chord = p.chord(s), b = s % 16;
      if (b % 2 === 0) marimba(t, midi(chord[[0, 1, 2, 1][(b / 2) % 4]] + 12), { vel: 0.38, pan: -0.2 });
      if (b % 4 === 0 || b === 6) pluck(t, midi(chord[0] - 12 + (b === 8 ? 7 : 0)), { vel: 0.55, decay: 0.25, wet: 0.05 });
      if (b === 0 || b === 8 || (b === 10 && p.r() < 0.4)) kick(t, { vel: 0.4 });
      if (b === 4 || b === 12) { rim(t, { vel: 0.35 }); brush(t, { vel: 0.35 }); }
      if (b % 2 === 1) shaker(t, { vel: 0.35 });
      for (const e of p.notesAt(s)) bell(t, midi(e.note), { vel: 0.4, decay: 0.7, pan: 0.2, wet: 0.25 });
    },
  },

  /** Lo-fi on a rainy afternoon: lazy Rhodes, a soft boom-bap, a music-box hook. */
  rainy: {
    level: 1.0, bpm: 74, swing: 0.2,
    prog: [ch(51, 55, 58, 62), ch(50, 53, 57, 60), ch(48, 51, 55, 58, 62), ch(46, 50, 53, 57),
      ch(56, 60, 63, 67), ch(55, 58, 62, 65), ch(53, 56, 60, 63), ch(50, 53, 56, 58)],
    bassRoots: [39, 38, 36, 34, 44, 43, 41, 46],
    scale: EB_MAJ, melody: { style: 'calm', lo: 70, hi: 84, rest: 0.3 },
    step(p, s, t, sp) {
      const bar = Math.floor(s / 16) % p.prog.length, b = s % 16, chord = p.prog[bar], root = p.def.bassRoots[bar];
      if (b === 0 || (b === 10 && p.r() < 0.7)) chord.forEach((n, i) => epiano(t + i * 0.018, midi(n), sp * (b === 0 ? 8 : 4), { vel: b === 0 ? 0.3 : 0.22, pan: -0.15 }));
      if (b === 0) bass(t, midi(root), sp * 6, { vel: 0.6 });
      if (b === 7 || b === 10) bass(t, midi(root + (b === 7 ? 12 : 7)), sp * 2, { vel: 0.4 });
      if (b === 0 || b === 10 || (b === 7 && p.r() < 0.4)) kick(t, { vel: 0.45 });
      if (b === 4 || b === 12) brush(t, { vel: 0.8 });
      if (b % 2 === 0) shaker(t, { vel: b % 4 === 2 ? 0.4 : 0.2 });
      for (const e of p.notesAt(s)) bell(t, midi(e.note), { vel: 0.38, decay: 1.4, pan: 0.2, wet: 0.4 });
    },
  },

  /** Market morning: a bright ukulele strum, claps of brush, a marimba tune. */
  market: {
    level: 1.6, bpm: 112, swing: 0.06,
    prog: [ch(62, 66, 69), ch(61, 64, 69), ch(59, 62, 66), ch(59, 62, 67), ch(59, 62, 67), ch(62, 66, 69), ch(59, 64, 67), ch(57, 61, 64)],
    scale: D_MAJ, melody: { style: 'lilting', lo: 74, hi: 88, rest: 0.2 },
    step(p, s, t, sp) {
      const chord = p.chord(s), b = s % 16;
      if ([0, 3, 6, 8, 10, 12, 14].includes(b)) {
        const down = b % 4 !== 2, v = b === 0 || b === 8 ? 0.5 : 0.32;
        (down ? chord : [...chord].reverse()).forEach((n, i) => pluck(t + i * 0.014, midi(n), { vel: v, pan: -0.2, decay: 0.45, wet: 0.15 }));
      }
      if (b === 0 || b === 8) pluck(t, midi(chord[0] - 24 + (b === 8 ? 7 : 0)), { vel: 0.55, decay: 0.4, wet: 0.05 });
      if (b === 0 || b === 8) kick(t, { vel: 0.3 });
      if (b === 4 || b === 12) { brush(t, { vel: 0.6 }); rim(t, { vel: 0.22 }); }
      if (b % 2 === 1) shaker(t, { vel: 0.3, pan: 0.3 });
      for (const e of p.notesAt(s)) marimba(t, midi(e.note), { vel: 0.5, pan: 0.2, wet: 0.25 });
    },
  },

  /** Jazz brunch: swing, a walking bass, Rhodes stabs on two and four. */
  brunch: {
    level: 0.72, bpm: 132, swing: 0.22,
    prog: [ch(58, 62, 65, 67), ch(55, 59, 62, 65), ch(55, 58, 60, 63), ch(57, 60, 63, 65),
      ch(57, 60, 62, 65), ch(55, 59, 62, 65), ch(55, 58, 60, 63), ch(57, 60, 63, 65)],
    walks: [[46, 50, 53, 54], [43, 47, 50, 49], [48, 51, 55, 52], [41, 45, 48, 49], [50, 53, 57, 56], [43, 47, 50, 49], [48, 51, 55, 52], [41, 45, 48, 47]],
    scale: BB_MAJ, melody: { style: 'lilting', lo: 70, hi: 84, rest: 0.25 },
    step(p, s, t, sp) {
      const bar = Math.floor(s / 16) % p.prog.length, b = s % 16, chord = p.prog[bar];
      if (b % 4 === 0) bass(t, midi(p.def.walks[bar][b / 4]), sp * 3.6, { vel: 0.55 });
      if (b === 4 || b === 12 || (b === 14 && p.r() < 0.3)) chord.forEach((n, i) => epiano(t + i * 0.006, midi(n), sp * 1.6, { vel: 0.26, pan: -0.2 }));
      if ([0, 4, 6, 8, 12, 14].includes(b)) shaker(t, { vel: b % 4 === 2 ? 0.25 : 0.5, pan: 0.25 });
      if (b === 4 || b === 12) brush(t, { vel: 0.4 });
      for (const e of p.notesAt(s)) bell(t, midi(e.note), { vel: 0.4, decay: 0.8, pan: 0.15, wet: 0.3 });
    },
  },

  /** A tea garden: pentatonic marimba ripples and a wooden flute. */
  teagarden: {
    level: 1.1, bpm: 92, swing: 0,
    prog: [ch(48, 55, 62, 64), ch(45, 52, 55, 60), ch(41, 48, 55, 57, 64), ch(43, 50, 55, 60),
      ch(48, 55, 62, 64), ch(45, 52, 55, 60), ch(43, 50, 55, 62), ch(48, 55, 60, 64)],
    scale: C_PENTA, melody: { style: 'calm', lo: 72, hi: 86, rest: 0.25 },
    step(p, s, t, sp) {
      const chord = p.chord(s), b = s % 16;
      if (b % 2 === 0) { const notes = chord.slice(1), n = notes[[0, 1, 2, 1, 0, 2, 1, 2][(b / 2) % 8] % notes.length]; marimba(t, midi(n + 12), { vel: 0.3, pan: -0.25 }); }
      if (b === 0) { bass(t, midi(chord[0]), sp * 12, { vel: 0.4 }); kick(t, { vel: 0.2 }); }
      if (b % 4 === 2) shaker(t, { vel: 0.25, pan: 0.3 });
      for (const e of p.notesAt(s)) flute(t, midi(e.note), e.len * sp * 0.92, { vel: 0.5, pan: 0.2, wet: 0.45 });
    },
  },
};

/** Song names for the settings. The first three are the scenes' own; the title screen plays Rainy Window. */
export const SONGS = [
  { id: 'restaurant', title: 'Café Bossa' },
  { id: 'town', title: 'Town Square Folk' },
  { id: 'challenge', title: 'Service Rush' },
  { id: 'rainy', title: 'Rainy Window' },
  { id: 'market', title: 'Market Morning' },
  { id: 'brunch', title: 'Jazz Brunch' },
  { id: 'teagarden', title: 'Tea Garden' },
];

/* ── the player ───────────────────────────────────────────────────────── */

class Player {
  constructor(name) {
    this.name = name;
    this.def = PIECES[name];
    this.seed = Math.floor(Math.random() * 1e9);
    this.r = rng(this.seed ^ 0x9e3779b9);
    this.prog = this.def.prog;
    this.fader = gain(0);
    this.fader.connect(bus('music'));
    // songs are trimmed to sit at about the same loudness
    this.fader.gain.setTargetAtTime(this.def.level ?? 1, audioCtx().currentTime, 0.9);
    this.stepDur = 60 / this.def.bpm / 4;
    this.next = audioCtx().currentTime + 0.12;
    this.s = 0;
    this.compose(0);
  }
  /** A fresh 16-bar melody every time the form comes round. */
  compose(fromStep) {
    this.forms = fromStep ? (this.forms || 0) + 1 : 0;
    const notes = song(this.seed + fromStep, this.prog, this.def.scale, this.def.melody);
    this.byStep = new Map();
    for (const e of notes) { const k = e.step + fromStep; if (!this.byStep.has(k)) this.byStep.set(k, []); this.byStep.get(k).push(e); }
    this.songEnd = fromStep + 256;
  }
  chord(s) { return this.prog[Math.floor(s / 16) % this.prog.length]; }
  notesAt(s) { return this.byStep.get(s) || []; }
  pump(until) {
    while (this.next < until) {
      if (this.s >= this.songEnd) this.compose(this.s);
      // swing the off-beat eighths
      const swing = (this.s % 4 === 2) ? this.def.swing * this.stepDur * 2 : 0;
      routeMusic(this.fader);
      try { this.def.step(this, this.s, this.next + swing, this.stepDur); } catch (e) { console.warn('[music]', e); }
      routeMusic(null);
      this.next += this.stepDur; this.s++;
    }
  }
  fadeOut(sec = 1.8) {
    const c = audioCtx();
    this.fader.gain.cancelScheduledValues(c.currentTime);
    this.fader.gain.setTargetAtTime(0, c.currentTime, sec / 3);
    this.stopAt = c.currentTime + sec;
    setTimeout(() => { try { this.fader.disconnect(); } catch (e) { /* gone */ } }, (sec + 2) * 1000);
  }
}

/* ── what plays ───────────────────────────────────────────────────────── */

/** Each screen's own song, for 'Fits the scene'. */
const SCENE_SONG = { title: 'rainy', restaurant: 'restaurant', town: 'town', challenge: 'challenge' };
const ROTATE_FORMS = 2;     // in shuffle, each song plays its 16-bar form this many times
let current = null, fading = [], timer = null, scene = null;
let mode = 'shuffle', chosen = null;   // Shuffle all unless the player picks otherwise
let queue = [], qi = 0;
const listeners = new Set();

function shuffled() {
  const ids = SONGS.map((x) => x.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  // don't start a new round with the song that just played
  if (current && ids[0] === current.name && ids.length > 1) [ids[0], ids[1]] = [ids[1], ids[0]];
  return ids;
}

/** The song that should be playing now. */
function target() {
  if (!scene) return null;
  if (mode === 'one' && PIECES[chosen]) return chosen;
  if (mode === 'shuffle') {
    if (!queue.length) { queue = shuffled(); qi = 0; }
    return queue[qi];
  }
  return SCENE_SONG[scene] || null;
}

function advance() {
  qi++;
  if (qi >= queue.length) { queue = shuffled(); qi = 0; }
}

function pump() {
  if (!isRunning()) return;
  const c = audioCtx();
  if (mode === 'shuffle' && current && current.forms >= ROTATE_FORMS) { current.forms = -1e9; advance(); }
  const want = target();
  if (want !== (current?.name ?? null)) {
    if (current) { current.fadeOut(2.5); fading.push(current); }
    current = want && PIECES[want] ? new Player(want) : null;
    listeners.forEach((fn) => fn(music.nowPlaying));
  }
  const until = c.currentTime + LOOKAHEAD;
  current?.pump(until);
  fading = fading.filter((p) => { if (c.currentTime < p.stopAt) { p.pump(Math.min(until, p.stopAt)); return true; } return false; });
}

function ensureTimer() { if (!timer) timer = setInterval(pump, TICK_MS); }

export const music = {
  /** The screen we're on: 'title' | 'restaurant' | 'town' | 'challenge' | null. */
  play(name) { scene = name; ensureTimer(); pump(); },
  get scene() { return scene; },
  /**
   * What the player picked: 'scene' (each screen its own song), 'shuffle'
   * (every song in turn), or 'one' with a song id that plays everywhere.
   */
  setChoice({ mode: m = 'shuffle', song = null } = {}) {
    mode = ['scene', 'shuffle', 'one'].includes(m) ? m : 'shuffle';
    chosen = song && PIECES[song] ? song : PIECES[chosen] ? chosen : null;   // a removed song falls back to the scene's
    if (mode === 'shuffle') { queue = shuffled(); qi = 0; }
    ensureTimer(); pump();
  },
  get choice() { return { mode, song: chosen }; },
  /** Shuffle: go to the next song now. */
  skip() { if (mode !== 'shuffle') return; if (!queue.length) queue = shuffled(); advance(); pump(); },
  get nowPlaying() { const id = current?.name; return id ? (SONGS.find((x) => x.id === id) || { id, title: id }) : null; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
