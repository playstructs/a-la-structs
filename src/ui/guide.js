/**
 * Chef Biscuit's Recipe for Success: the new-owner guide.
 *
 * Nine objectives, revealed one at a time: the next appears only when the
 * current one is done. Each completes when the thing really happens in the
 * game (you hire someone, open their card, set a cover, play a shift
 * practice game, deposit gold, win a challenge), never by clicking "next", so nothing waits on the slow parts
 * of a real guild. Every objective explains why it matters. "Show me" opens
 * the right place and makes the control to press glow. Progress is kept per
 * owner in localStorage; the guide can be hidden or started over.
 */
import { h, clear, icon } from './dom.js';
import { portrait } from '../three/portraits.js';
import { OUTFITS } from '../three/outfits.js';
import { is, isCommand } from '../game/model.js';
import { roleOf, CATALOG_SECTIONS } from '../lexicon/roles.js';
import { sfx } from '../audio/sfx.js';
import { gameForType, isPlayable } from '../minigames/registry.js';

const GUIDE = { name: 'Chef Biscuit', species: 'hamster' };
const KEY = 'aLaStructs.guide.v2';

const mine = (app) => [...app.svc.state.structs.values()].filter((x) => !is.destroyed(x));
const byType = (app, type) => mine(app).find((x) => app.svc.typeOf(x)?.type === type);
/** A regular employee: crew who aren't the Manager. */
const isCrew = (app, x) => x.locationType === 'fleet' && !isCommand(app.svc.typeOf(x));
const anyCrew = (app) => mine(app).find((x) => isCrew(app, x));
/** A crew member who isn't covering anyone yet, ideally beside the Manager. */
const freeCrew = (app) => {
  const mgr = app.svc.manager();
  const free = mine(app).filter((x) => isCrew(app, x) && is.built(x) && is.online(x) && app.svc.typeOf(x)?.canDefend && !x.protects);
  return free.find((x) => x.ambit === mgr?.ambit) || free[0] || null;
};
/** A hired crew member who has a shift practice game, ideally one not covering anyone (less busy). */
const practiceCrew = (app) => {
  const ready = mine(app).filter((x) => isCrew(app, x) && is.built(x) && isPlayable(gameForType(app.svc.typeOf(x))));
  return ready.find((x) => !x.protects) || ready[0] || null;
};
const where = (section) => CATALOG_SECTIONS.find((x) => x.key === section)?.title;

/**
 * An objective about one kind of staff: hire one, or if you already have
 * one, meet them (open their card), so everyone reads why they matter.
 */
function staffObjective({ id, type, section, role, say, done }) {
  const have = (app) => (type ? byType(app, type) : anyCrew(app));
  return {
    id, say, done,
    todo: (app) => (have(app) ? `Tap ${type ? `your ${role}` : `one of your ${role}s`} to see what they do.` : `Hire a ${role} — you’ll find them under Hire › ${where(section)}.`),
    test: (app, g) => g.flags[`hired:${id}`] || g.flags[`met:${id}`],
    show: (app) => {
      const x = have(app);
      if (x) { app.selectStruct(x.id); return true; }
      app.openSheet('hire', section);
      return type ? `[data-hire="${type}"]:not([disabled])` : '[data-tut=hire]:not([disabled])';
    },
  };
}

/**
 * The objectives, in order. Each has:
 *   say   — Chef Biscuit explains why it matters (text, or (app) => text)
 *   todo  — the plain instruction (text, or (app) => text)
 *   done  — her line when it happens
 *   test  — (app, guide) => true once it's happened (game events set guide flags)
 *   show  — (app) => what "Show me" does: a selector to glow, true if it
 *           opened something, false if there's nothing to show yet
 */
export const STEPS = [
  {
    id: 'manager',
    say: 'Your Manager is the heart of the restaurant. Nobody can be hired or bought without them, and they lead your crew whenever you take on a rival. If a rival’s staff ever fully satisfy your Manager, your whole crew has to head home — so keep them safe.',
    todo: 'Tap your Manager to open their card.', done: 'There they are, clipboard and all!',
    test: (app, g) => g.flags['met:manager'],
    show: (app) => { const m = app.svc.manager(); if (!m) return false; app.selectStruct(m.id); return true; },
  },
  staffObjective({
    id: 'chef', type: 'Ore Extractor', section: 'kitchen', role: 'Chef', done: 'A Chef in the kitchen — the recipes will start coming.',
    say: (app) => `Everything you do takes hustle: it builds up by one every tick, and each action spends all of it, so pace yourself. Your Chef experiments in the kitchen and discovers recipes — they’re what everything else is made from. ${app.svc.mode === 'demo'
      ? 'Here in the demo kitchen a recipe takes about half a minute, but in a real restaurant group each one takes hours, so get a Chef working early.'
      : 'Each recipe takes hours, so get a Chef working early.'}`,
  }),
  staffObjective({
    id: 'sous', type: 'Ore Refinery', section: 'kitchen', role: 'Sous Chef', done: 'Recipes in, gold out. Lovely.',
    say: 'Recipes are precious, but a rival crew can copy them in a service challenge. Your Sous Chef perfects recipes into gold, and gold can never be copied. The sooner your recipes become gold, the safer your restaurant is.',
  }),
  staffObjective({
    id: 'crew', type: null, section: 'space', role: 'crew member', done: 'Welcome to the crew!',
    say: 'Bartenders, servers, cooks and the rest are your crew. They staff the floor, cover for each other, and when you take on a rival they go along as customers to complain at the other restaurant’s staff. Each one serves and complains in their own way and reaches different areas, so a mix works best.',
  }),
  {
    id: 'cover',
    say: 'A crew member can cover for anyone else you own. If they’re in the same area as whoever is being complained at, they step in and take the complaint themselves; from another area they can still answer back. Put sturdy crew in front of your Manager and your gear.',
    todo: (app) => (freeCrew(app) ? 'Open a crew member’s card and set them to cover for a teammate.' : 'Wait for a crew member to finish onboarding, then set them to cover for a teammate.'),
    done: 'Good teamwork. Nobody stands alone in this kitchen.',
    test: (app, g) => g.flags.cover,
    show: (app) => { const d = freeCrew(app); if (!d) return false; app.selectStruct(d.id); return '[data-tut=cover]'; },
  },
  {
    id: 'practice',
    say: 'Every crew role has its own shift practice game on their card — a quick timed challenge. Earn stars to unlock new uniforms (bronze, silver, then gold), and everyone in that role wears the one you pick.',
    todo: (app) => (practiceCrew(app) ? 'Open a crew member’s card and play their Shift practice game.' : 'Wait for a crew member to finish onboarding, then play their Shift practice game.'),
    done: 'Look at you go! Practice makes perfect — and fancy uniforms.',
    // Any finished run counts, including ones played before this step existed.
    test: (app, g) => g.flags.practiced || Object.keys(app.miniScores || {}).length > 0,
    show: (app) => { const x = practiceCrew(app); if (!x) return false; app.selectStruct(x.id); return '[data-tut=practice]'; },
  },
  {
    id: 'town',
    say: 'You’re not alone out here. Your restaurant group hangs out in town: walk around, peek into each other’s restaurants, and say hello in the group chat.',
    todo: 'Visit the town.', done: 'Isn’t it lovely? Come back any time.',
    test: (app, g) => g.flags.town,
    show: (app) => { app.setView('town'); return true; },
  },
  {
    id: 'invest',
    say: 'Gold is for growing. Deposit gold in your group’s bank and it pays you cash every tick, so you can afford more wages and keep everyone on shift. Your deposit also powers the group — it helps keep new members’ restaurants running while they find their feet.',
    todo: 'Open Group › Group bank and deposit some gold.', done: 'Steady takings — and the whole group is stronger for it.',
    test: (app, g) => g.flags.invested,
    show: (app) => { app.openPage('group', 'bank'); return '#bank-range'; },
  },
  {
    id: 'challenge',
    say: 'A service challenge is a friendly raid. Send your crew to a rival as customers and complain at their staff while the “Recipes copied” bar fills — but keep your Manager, posing as their Food Critic, from being fully satisfied. Fill the bar and you copy their recipes. When rivals visit you, serve their customers until their Food Critic is satisfied and the whole party leaves.',
    todo: 'Win a service challenge: send your crew from Rivals, or win a defence at home.', done: 'What a service! You’re a natural.',
    test: (app, g) => g.flags.won,
    show: (app) => { if (app.svc.state.challenge?.status === 'ongoing') { app.setView('challenge'); return true; } app.openRivals(); return '[data-tut=send]'; },
  },
];

const todoOf = (st, app) => (typeof st.todo === 'function' ? st.todo(app) : st.todo);
const sayOf = (st, app) => (typeof st.say === 'function' ? st.say(app) : st.say);

export class Guide {
  constructor(app) {
    this.app = app;
    this.el = null;
    this.flags = {};
    this.done = new Set();
    this.hidden = false;
    this.greeted = false;
  }

  key() { const s = this.app.svc.state; return `${KEY}:${this.app.svc.mode}:${s.me.id || 'me'}`; }

  load() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(this.key()) || '{}') || {}; } catch (e) { /* storage off */ }
    this.done = new Set(d.done || []);
    this.flags = d.flags || {};
    this.hidden = !!d.hidden;
    this.greeted = !!d.greeted;
  }

  save() {
    try { localStorage.setItem(this.key(), JSON.stringify({ done: [...this.done], flags: this.flags, hidden: this.hidden, greeted: this.greeted })); } catch (e) { /* storage off */ }
  }

  /** Forget this owner's progress (a new demo kitchen, or "Start over"). */
  static reset(mode, id) { try { localStorage.removeItem(`${KEY}:${mode}:${id || 'me'}`); } catch (e) { /* storage off */ } }

  steps() { return STEPS; }
  current() { return STEPS.find((s) => !this.done.has(s.id)) || null; }
  finished() { return !this.current(); }

  /** Start for this game: greet a new owner, or quietly show where they are. */
  start() {
    this.load();
    this.el?.remove();
    this.el = h('aside', { class: 'guide', 'aria-label': 'Chef Biscuit’s guide', 'aria-live': 'polite' });
    this.app.ui.appendChild(this.el);
    this.check(true);
    if (!this.greeted && !this.finished()) this.greet();
    else this.render();
    // A challenge won before the guide was watching still counts.
    if (!this.flags.won && this.app.svc.hasWonBefore) {
      const el = this.el;
      this.app.svc.hasWonBefore().then((won) => { if (won && this.el === el) this.flag('won'); });
    }
  }

  greet() {
    this.greeted = true; this.save();
    this.app.modal(h('img', { class: 'guide-face big', src: this.face(), alt: '' }), `Hello, I’m ${GUIDE.name}!`,
      `Welcome to ${this.app.svc.state.restaurant.name}. I ran a little bistro for forty years, and I’d love to show you the ropes — one objective at a time. You can hide me whenever you like.`,
      [['Show me around', () => { this.hidden = false; this.save(); this.render(); }], ['I’ll explore on my own', () => { this.hidden = true; this.save(); this.render(); }]]);
  }

  face() { return portrait(this.app.engine.renderer, { species: GUIDE.species, outfit: { ...OUTFITS.chef, hat: 'toque', neckColor: '#f2a65a' }, seed: 'guide-biscuit' }); }

  /* ── things that happened ─────────────────────────────────────────── */

  flag(name) {
    if (this.flags[name]) return;
    this.flags[name] = true;
    this.save();
    this.check();
  }

  /** You hired someone (from the Hire sheet). */
  noteHire(type) {
    if (!type) return;
    const t = type.type;
    if (t === 'Ore Extractor') this.flag('hired:chef');
    else if (t === 'Ore Refinery') this.flag('hired:sous');
    else if (type.category === 'fleet' && !isCommand(type)) this.flag('hired:crew');
  }

  /** You opened one of your own staff's cards. */
  noteSelect(x) {
    const t = this.app.svc.typeOf(x);
    if (!t) return;
    if (isCommand(t)) this.flag('met:manager');
    else if (t.type === 'Ore Extractor') this.flag('met:chef');
    else if (t.type === 'Ore Refinery') this.flag('met:sous');
    else if (isCrew(this.app, x)) this.flag('met:crew');
  }

  onFx(ev) {
    const me = this.app.svc.state.me.id;
    if (ev.kind === 'defense' && ev.on) {
      const d = this.app.svc.state.structs.get(ev.defender) || this.app.svc.state.challenge?.structs.get(ev.defender);
      if (d && d.owner === me) this.flag('cover');
    } else if (ev.kind === 'challengeEnd') {
      const won = ev.role === 'challenger' ? ev.status === 'raidSuccessful' : ev.status === 'attackerDefeated';
      if (won) this.flag('won');
    }
  }

  /**
   * Tick off the current objective if it's done, and reveal the next. Only
   * one objective completes per check, so each one gets its moment.
   */
  check(quiet = false) {
    if (!this.el) return;
    const st = this.current();
    // A just-revealed objective stays on screen a moment before it can tick off.
    const fresh = Date.now() < (this.revealedUntil || 0);
    let ok = false;
    if (st && !fresh) { try { ok = !!st.test(this.app, this); } catch (e) { ok = false; } }
    if (ok) {
      this.done.add(st.id);
      this.save();
      if (!quiet) this.celebrate(st);
      this.render(true);
      // Something already done for the next one (say, you hired a Sous Chef
      // early)? Reveal it, then tick it off a moment later.
      if (this.current() && !quiet) { this.revealedUntil = Date.now() + 2500; setTimeout(() => this.check(), 2600); }
      else if (this.current()) this.check(true);
      return;
    }
    if (quiet || this.todoSig() !== this.lastTodoSig) this.render();
  }

  todoSig() { const st = this.current(); return st ? `${st.id}:${todoOf(st, this.app)}` : ''; }

  celebrate(st) {
    sfx.hire();
    this.app.announce({ text: `${GUIDE.name}: ${st.done}`, tone: 'good' });
    if (this.finished()) setTimeout(() => this.app.modal(h('img', { class: 'guide-face big', src: this.face(), alt: '' }), 'Recipe for Success: complete!',
      'You’ve learned everything I know. The rest is yours to discover — and remember, gold can’t be copied. Bon appétit!', [['Thank you, Chef!', null]]), 1800);
  }

  /* ── the card ─────────────────────────────────────────────────────── */

  /** Done objectives get a tick, the current one a dot; later ones stay a surprise. */
  dots(st) {
    return h('div', { class: 'guide-dots', 'aria-hidden': 'true' }, ...STEPS.map((x) =>
      h('i', { class: this.done.has(x.id) ? 'done' : x === st ? 'now' : '' })));
  }

  render(revealed = false) {
    if (!this.el) return;
    this.lastTodoSig = this.todoSig();
    clear(this.el);
    const st = this.current();
    this.el.hidden = !st;
    if (!st) return;
    const n = STEPS.indexOf(st) + 1, todo = todoOf(st, this.app);
    if (this.hidden) {
      this.el.classList.add('pill');
      this.el.append(h('button', { class: 'guide-pill', 'aria-label': `Show ${GUIDE.name}’s guide: objective ${n} of ${STEPS.length}, ${todo}`, onclick: () => { this.hidden = false; this.save(); this.render(); } },
        h('img', { class: 'guide-face', src: this.face(), alt: '' }), h('span', {}, `${n}/${STEPS.length} · ${todo}`)));
      return;
    }
    this.el.classList.remove('pill');
    // a new objective pops in
    if (revealed) { this.el.style.animation = 'none'; void this.el.offsetWidth; this.el.style.animation = ''; }
    this.el.append(
      h('div', { class: 'guide-head' }, h('img', { class: 'guide-face', src: this.face(), alt: '' }),
        h('div', {}, h('b', {}, GUIDE.name), h('small', {}, `Objective ${n} of ${STEPS.length}`), this.dots(st)),
        h('button', { class: 'x', 'aria-label': 'Hide the guide', title: 'Hide', onclick: () => { this.hidden = true; this.save(); this.render(); } }, icon('close'))),
      h('p', { class: 'guide-say' }, sayOf(st, this.app)),
      h('p', { class: 'guide-todo' }, h('b', {}, 'Objective: '), todo),
      h('div', { class: 'guide-actions' }, h('button', { class: 'btn small', onclick: () => this.showMe(st) }, 'Show me')),
    );
  }

  /** Go where the objective happens and make the control to press glow; say so if there's nothing yet. */
  showMe(st) {
    let sel = null;
    try { sel = st.show?.(this.app); } catch (e) { sel = false; }
    if (sel === false || sel == null) {
      const todo = todoOf(st, this.app);
      this.app.announce({ text: `${GUIDE.name}: There’s nothing to show for that just yet — ${todo.charAt(0).toLowerCase()}${todo.slice(1)}`, tone: 'info' });
      return;
    }
    if (sel === true) return;
    // Sheets redraw on game ticks, replacing the button: keep the glow on
    // whatever matches for a few seconds rather than on one element.
    clearInterval(this.glowTimer);
    const until = Date.now() + 9000;
    let scrolled = false;
    this.glowTimer = setInterval(() => {
      const el = document.querySelector(sel);
      if (Date.now() > until) { clearInterval(this.glowTimer); document.querySelectorAll('.tut-glow').forEach((x) => x.classList.remove('tut-glow')); return; }
      if (!el) return;
      if (!scrolled) { scrolled = true; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      el.classList.add('tut-glow');
    }, 250);
  }

  restart() {
    Guide.reset(this.app.svc.mode, this.app.svc.state.me.id);
    this.start();
  }

  show() { this.hidden = false; this.save(); this.render(); }
}
