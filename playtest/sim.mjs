#!/usr/bin/env node
/**
 * Headless bot playtests: thousands of ticks of the real DemoService (economy +
 * structsd combat keeper + SimulatorAi) driven by scripted player policies.
 * Fast and statistical — it answers "how does the game behave for this kind of
 * player over 45 minutes?" while the AI seats answer "how does it feel?".
 *
 *   node playtest/sim.mjs [--runs 12] [--ticks 900] [--out playtest/out/<run>/sim.json]
 *
 * Policies (each a player archetype, matching playtest/personas):
 *   afk        opens the game and watches (the cozy player who doesn't know what to do)
 *   cozy       hires a little, banks gold, never raids, panics when raided (random serves)
 *   economist  invests every gold where it earns most, hires to the cash limit
 *   raider     raids the richest rival as soon as it can, naive targeting
 *   tactician  raids & defends with focus fire on the Food Critic, re-raids after cooldown
 *
 * Also runs a challenge matrix: every rival × difficulty × targeting strategy
 * from a fresh restaurant, as challenger and as host.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const { DemoService } = await import('../src/services/DemoService.js');
const { rng } = await import('../src/lexicon/names.js');
const { is, isCommand, weaponField } = await import('../src/game/model.js');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const RUNS = Number(opt('runs', 12));
const TICKS = Number(opt('ticks', 900));
const OUTFILE = opt('out', path.join(HERE, 'out', process.env.PT_RUN || new Date().toISOString().slice(0, 10), 'sim.json'));

/* ── a fresh, deterministic kitchen ─────────────────────────────────────── */

function kitchen(seed, { difficulty = 'easy', rivalsMayChallenge = true } = {}) {
  const svc = new DemoService({ tickMs: 999999, difficulty, rivalsMayChallenge });
  svc.r = rng(`sim-${seed}`);
  svc.fresh();
  const s = svc.state;
  const offset = seed * 37;
  s.tick += offset; s.wallet.lastAction += offset;
  svc.nextIncoming = s.tick + 70 + Math.floor(svc.r() * 60);   // same as start()
  svc.recompute();
  svc.toasts = [];
  svc.addEventListener('toast', (e) => svc.toasts.push({ tick: s.tick, ...e.detail }));
  return svc;
}

/* ── shared battle tactics ───────────────────────────────────────────────── */

async function battleMove(svc, focus) {
  const s = svc.state, ch = s.challenge;
  if (!ch || ch.status !== 'ongoing') return null;
  const mine = [...ch.structs.values()].filter((x) => x.owner === s.me.id && !is.destroyed(x) && is.online(x));
  let foes = [...ch.structs.values()].filter((x) => x.owner !== s.me.id && !is.destroyed(x));
  if (focus) {
    // Critic first when we host; when visiting, take out whoever hits back hardest (lowest health first).
    if (ch.role === 'defender') foes.sort((a, b) => (isCommand(svc.typeOf(b)) - isCommand(svc.typeOf(a))) || a.health - b.health);
    else foes.sort((a, b) => a.health - b.health);
  } else foes = foes.sort(() => svc.r() - 0.5);
  for (const t of foes) for (const a of mine) for (const ws of ['primaryWeapon', 'secondaryWeapon']) {
    if (!svc.serveBlocker(a.id, t.id, ws)) { await svc.serve(a.id, t.id, ws); return { a: a.id, t: t.id, ws }; }
  }
  return null;
}

/* ── policies ────────────────────────────────────────────────────────────── */

const POLICIES = {
  async afk() {},
  async cozy(svc, m) {
    const s = svc.state;
    if (s.challenge?.status === 'ongoing') { if (svc.r() < 0.3) await battleMove(svc, false); return; }
    if (s.wallet.gold >= 10 && svc.r() < 0.1) await svc.investGold(null, 5);
    if (svc.r() < 0.05) await tryHire(svc, m, ['Starfighter', 'Frigate', 'Pursuit Fighter', 'Orbital Shield Generator']);
  },
  async economist(svc, m) {
    const s = svc.state;
    if (s.challenge?.status === 'ongoing') { await battleMove(svc, true); return; }
    const gen = svc.myStructs().find((x) => svc.typeOf(x).generatingRate && is.built(x) && !is.destroyed(x));
    if (s.wallet.gold >= 1) await svc.investGold(gen ? gen.id : null, s.wallet.gold);
    for (const name of ['Continental Power Plant', 'Ore Bunker', 'Orbital Shield Generator', 'Starfighter']) if (await tryHire(svc, m, [name])) break;
    if (s.restaurant.undiscovered <= 0 && s.crew.status === 'home' && !s.challenge) { await svc.openNewRestaurant(); m.explored++; }
  },
  async raider(svc, m) {
    const s = svc.state;
    if (!svc.manager() && !s.challenge) { await tryHire(svc, m, []); return; }
    if (s.challenge?.status === 'ongoing') { await battleMove(svc, false); return; }
    if (!s.challenge && s.crew.status === 'home' && svc.hustle() >= 8) {
      const r = (await svc.findRivals())[0];
      await svc.startChallenge(r.id); m.raidsStarted++;
    }
  },
  async tactician(svc, m) {
    const s = svc.state;
    if (!svc.manager() && !s.challenge) { await tryHire(svc, m, []); return; }
    if (s.challenge?.status === 'ongoing') { await battleMove(svc, true); return; }
    const gen = svc.myStructs().find((x) => svc.typeOf(x).generatingRate && is.built(x) && !is.destroyed(x));
    if (s.wallet.gold >= 5) await svc.investGold(gen ? gen.id : null, s.wallet.gold);
    if (!s.challenge && s.crew.status === 'home' && svc.hustle() >= 12 && s.tick - (m.lastRaid || 0) > 60) {
      const rivals = await svc.findRivals();
      const r = rivals.find((x) => x.crewHome === false && x.recipes > 0) || rivals[0];
      await svc.startChallenge(r.id); m.raidsStarted++; m.lastRaid = s.tick;
    }
  },
};

async function tryHire(svc, m, names) {
  // A fired Manager blocks everything else, so replace them first (as the Hire sheet prompts).
  if (!svc.manager()) names = ['Command Ship', ...names];
  for (const n of names) {
    const t = svc.state.types.named(n);
    const area = ['space', 'air', 'land', 'water'].find((a) => !svc.hireBlocker(t, a));
    const why = svc.hireBlocker(t, area || 'land');
    if (!area) { m.blockers[why] = (m.blockers[why] || 0) + 1; continue; }
    await svc.hire(t.id, area); m.hires.push({ tick: svc.state.tick, role: n });
    return true;
  }
  return false;
}

/* ── one long session ────────────────────────────────────────────────────── */

async function session(policy, seed, difficulty) {
  const svc = kitchen(seed, { difficulty });
  const s = svc.state, t0 = s.tick;
  const m = { policy, seed, difficulty, hires: [], blockers: {}, challenges: [], series: [], explored: 0, raidsStarted: 0, firstGoldTick: null, stallTick: null, errors: [] };
  let open = null;
  for (let i = 0; i < TICKS; i++) {
    try { await POLICIES[policy](svc, m); } catch (e) { m.errors.push(String(e.message).slice(0, 120)); }
    const goldBefore = s.wallet.gold;
    svc.step();
    if (m.firstGoldTick == null && s.wallet.gold > goldBefore) m.firstGoldTick = s.tick - t0;
    if (m.stallTick == null && s.restaurant.undiscovered <= 0 && s.wallet.recipes <= 0) m.stallTick = s.tick - t0;
    const ch = s.challenge;
    if (ch && !open) open = { role: ch.role, start: s.tick - t0, rival: ch.role === 'defender' ? `${ch.guest.name}'s crew` : ch.restaurantName };
    if (ch && ch.status !== 'ongoing' && open && !open.end) {
      Object.assign(open, { end: s.tick - t0, ticks: s.tick - t0 - open.start, status: ch.status, stolen: ch.result?.stolen || 0, myLosses: [...ch.structs.values()].filter((x) => x.owner === s.me.id && is.destroyed(x)).length, theirLosses: [...ch.structs.values()].filter((x) => x.owner !== s.me.id && is.destroyed(x)).length });
      m.challenges.push(open);
      svc.dismissChallenge();
      open = null;
    }
    if (i % 10 === 0) m.series.push({ t: s.tick - t0, gold: s.wallet.gold, recipes: s.wallet.recipes, undiscovered: s.restaurant.undiscovered, spare: Math.round(svc.spareCash() / 1e3), staff: svc.myStructs().filter((x) => !is.destroyed(x)).length, hustle: svc.hustle() });
  }
  m.final = { gold: s.wallet.gold, bank: s.wallet.bank, recipes: s.wallet.recipes, undiscovered: s.restaurant.undiscovered, spare: svc.spareCash(), staff: svc.myStructs().filter((x) => !is.destroyed(x)).length };
  m.toastsPerMinute = +(svc.toasts.length / (TICKS * 3 / 60)).toFixed(1);
  m.toastKinds = svc.toasts.reduce((o, x) => { const k = x.text.replace(/[A-Z][a-z]+ (the )?/g, '').slice(0, 28); o[k] = (o[k] || 0) + 1; return o; }, {});
  return m;
}

/* ── challenge matrix ────────────────────────────────────────────────────── */

async function matrix() {
  const rows = [];
  const diffs = ['easy', 'difficult', 'hard'];
  for (const difficulty of diffs) for (const strategy of ['idle', 'naive', 'focus']) for (const role of ['challenger', 'defender']) {
    const probe = kitchen(0, { difficulty, rivalsMayChallenge: false });
    const rivals = await probe.findRivals();
    for (let ri = 0; ri < rivals.length; ri++) for (let rep = 0; rep < 2; rep++) {
      const svc = kitchen(100 + ri * 7 + rep, { difficulty, rivalsMayChallenge: false });
      for (let i = 0; i < 12; i++) svc.step();       // bank some hustle first
      if (role === 'challenger') await svc.startChallenge(rivals[ri].id);
      else {
        // incomingChallenge picks a random rival; pin it by filtering.
        const keep = svc.rivals; svc.rivals = keep.filter((r) => r.id === rivals[ri].id); svc.incomingChallenge(); svc.rivals = keep;
      }
      const ch = svc.state.challenge;
      if (!ch) continue;
      let ticks = 0, moves = 0;
      while (ch.status === 'ongoing' && ticks < 400) {
        if (strategy !== 'idle' && await battleMove(svc, strategy === 'focus')) moves++;
        svc.step(); ticks++;
      }
      const iWon = role === 'challenger' ? ch.status === 'raidSuccessful' : ch.status === 'attackerDefeated';
      rows.push({ difficulty, strategy, role, rival: rivals[ri].restaurantName, rivalStaff: rivals[ri].staff, status: ch.status, won: iWon, ticks, moves, stolen: ch.result?.stolen || 0, needed: ch.heist.needed });
    }
  }
  return rows;
}

/* ── run ─────────────────────────────────────────────────────────────────── */

const t0 = Date.now();
const sessions = [];
for (const policy of Object.keys(POLICIES)) for (let k = 0; k < RUNS; k++) {
  const difficulty = ['easy', 'difficult', 'hard'][k % 3];
  sessions.push(await session(policy, k + 1, difficulty));
  process.stdout.write('.');
}
console.log(`\n${sessions.length} sessions × ${TICKS} ticks in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const t1 = Date.now();
const challengeMatrix = await matrix();
console.log(`${challengeMatrix.length} matrix challenges in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

// Summaries for the console (the report reads the raw file).
const by = (arr, key) => arr.reduce((o, x) => ((o[x[key]] ||= []).push(x), o), {});
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
for (const [p, list] of Object.entries(by(sessions, 'policy'))) {
  const ch = list.flatMap((x) => x.challenges);
  const wins = ch.filter((c) => (c.role === 'challenger' ? c.status === 'raidSuccessful' : c.status === 'attackerDefeated')).length;
  console.log(`${p.padEnd(10)} gold ${avg(list.map((x) => x.final.gold)).toFixed(0).padStart(4)}  bank ${avg(list.map((x) => x.final.bank)).toFixed(0).padStart(4)}  staff ${avg(list.map((x) => x.final.staff)).toFixed(1)}  1st gold @${avg(list.map((x) => x.firstGoldTick ?? TICKS)).toFixed(0)}t  stall @${avg(list.map((x) => x.stallTick ?? TICKS)).toFixed(0)}t  challenges ${ch.length} won ${wins}  toasts/min ${avg(list.map((x) => x.toastsPerMinute)).toFixed(1)}  errors ${list.reduce((n, x) => n + x.errors.length, 0)}`);
}
for (const [k, list] of Object.entries(by(challengeMatrix.map((r) => ({ ...r, key: `${r.role}/${r.difficulty}/${r.strategy}` })), 'key'))) {
  console.log(`${k.padEnd(28)} win ${(100 * avg(list.map((r) => +r.won))).toFixed(0).padStart(3)}%  avg ${avg(list.map((r) => r.ticks)).toFixed(0)} ticks  ${Object.entries(by(list, 'status')).map(([s, l]) => `${s}:${l.length}`).join(' ')}`);
}
fs.mkdirSync(path.dirname(OUTFILE), { recursive: true });
fs.writeFileSync(OUTFILE, JSON.stringify({ generated: new Date().toISOString(), ticks: TICKS, runs: RUNS, sessions, challengeMatrix }, null, 0));
console.log(`wrote ${path.relative(process.cwd(), OUTFILE)}`);
process.exit(0);
