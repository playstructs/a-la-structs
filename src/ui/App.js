/**
 * À la Structs — the app shell. Owns the 3D engine, the active backend
 * (demo kitchen or live guild), the scenes, the HUD and the sheets, and
 * routes clicks into game actions.
 */
import { Engine } from '../three/Engine.js';
import { RestaurantScene } from '../three/scenes/RestaurantScene.js';
import { ChallengeScene } from '../three/scenes/ChallengeScene.js';
import { TownScene, ownerOutfit } from '../three/scenes/TownScene.js';
import { portrait } from '../three/portraits.js';
import { DemoService } from '../services/DemoService.js';
import { Hangout, botsFromMembers } from '../services/Hangout.js';
import { h, clear, icon, holdFocus } from './dom.js';
import * as Panels from './panels.js';
import { OFFICE } from './office.js';
import { GROUP } from './group.js';
import { loading } from './widgets.js';
import { keyFob } from './dom.js';
import { nameProblem } from '../services/Service.js';
import { forgetSession } from '../services/session.js';
import { sfx } from '../audio/sfx.js';
import { music } from '../audio/music.js';
import { Guide } from './guide.js';
import { BRAND, TERMS, ACTIONS, CHALLENGE_STATUS } from '../lexicon/terms.js';
import { roleOf } from '../lexicon/roles.js';
import { AREAS } from '../lexicon/areas.js';
import { nameFor, SPECIES, SPECIES_NAMES, speciesFor, awningFor } from '../lexicon/names.js';
import { is, isCommand, cash, gold, weaponField } from '../game/model.js';
import { OUTFITS } from '../three/outfits.js';

const PREFS_KEY = 'aLaStructs.prefs.v1';

/**
 * An error for players: the chain and guild software call a restaurant group
 * a "guild" (and its config file guild.json); say it our way.
 */
function plainError(e) {
  return String(e?.message || e || 'Something went wrong')
    .replace(/guild\.json unreachable/gi, 'the restaurant group’s details can’t be reached')
    .replace(/guild\.json unreadable/gi, 'the restaurant group’s details can’t be read')
    .replace(/guild\.json names another guild/gi, 'the restaurant group’s details describe a different group')
    .replace(/\bguild API\b/gi, 'restaurant group’s server')
    .replace(/\bguilds\b/g, 'restaurant groups').replace(/\bGuilds\b/g, 'Restaurant groups')
    .replace(/\bguild\b/g, 'restaurant group').replace(/\bGuild\b/g, 'Restaurant group');
}

/** A guild player signed in on this browser before (the webapp core keeps the phrase in `gameState`). */
function savedSession() {
  try {
    const g = JSON.parse(localStorage.getItem('gameState') || 'null');
    return g?.mnemonic && g?.thisPlayerId ? { playerId: String(g.thisPlayerId) } : null;
  } catch (e) { return null; }
}
const OLD_PREFS_KEY = 'pawsAndPlates.prefs.v1';   // before the rename; moved over once

/** Sheets made of pages (see office.js / group.js): kind → { page: { title, load, render, leave } }. */
const PAGES = { office: OFFICE, group: GROUP };

export class App {
  constructor(root, { flavor = 'full', loadLive = null, hangoutUrl = null } = {}) {
    this.root = root;
    this.flavor = flavor;
    this.loadLive = loadLive;           // () => import('../services/LiveService.js')
    this.hangoutUrl = hangoutUrl;
    this.prefs = this.loadPrefs();
    this.view = 'title';
    this.sheet = null;
    this.toasts = [];
    this.targeting = null;
    this.drafts = {};
    this.build();
  }

  /* ── prefs ────────────────────────────────────────────────────────────── */
  loadPrefs() {
    try {
      const old = localStorage.getItem(OLD_PREFS_KEY);
      if (old != null) {
        if (localStorage.getItem(PREFS_KEY) == null) localStorage.setItem(PREFS_KEY, old);
        localStorage.removeItem(OLD_PREFS_KEY);
      }
      return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    } catch (e) { return {}; }
  }
  savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch (e) { /* storage unavailable */ } }

  /* ── skeleton ─────────────────────────────────────────────────────────── */

  build() {
    clear(this.root);
    this.stage = h('div', { id: 'stage' });
    this.ui = h('div', { id: 'ui' });
    this.root.append(this.stage, this.ui);
    this.engine = new Engine(this.stage, { quality: this.prefs.quality || 'high' });
    sfx.setEnabled(this.prefs.sound !== false);
    for (const [name, v] of Object.entries(this.prefs.volume || {})) sfx.setVolume(name, v);
    music.setChoice(this.prefs.music || {});
    // Keep "Now playing" in Settings current.
    music.onChange(() => { if (this.sheet?.kind === 'settings') this.refreshSheet(); });
    // Browsers only allow sound after the player does something.
    const unlock = () => { sfx.unlock(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const pop = [...this.ui.querySelectorAll('.modal-back')].pop();
      if (this.tipKey) this.hideHudTip(true);
      else if (pop) [...pop.querySelectorAll('.modal button')].pop()?.click();
      else if (this.targeting) this.endTargeting();
      else this.closeSheet();
    });
    // Signed in on this browser before? Go straight back in.
    const saved = this.liveOk() && savedSession();
    if (saved) this.resumeLive(saved); else this.showTitle();
  }

  /* ── title screen ─────────────────────────────────────────────────────── */

  showTitle() {
    this.titleBackdrop();
    this.titlePage(
      h('div', { class: 'logo' }, h('h1', {}, 'À la ', h('span', {}, 'Structs')), h('p', {}, BRAND.tagline)),
      h('div', { class: 'title-menu' },
        h('button', { class: 'btn wide', onclick: () => this.showNewGame() }, 'Start New Game'),
        h('button', { class: 'btn wide ghost', onclick: () => this.showContinue() }, 'Continue')));
    this.ui.querySelector('.title-menu button')?.focus({ preventScroll: true });
  }

  /** The live restaurant behind every title screen (built once, kept while you move between them). */
  titleBackdrop() {
    if (this.view === 'title' && this.previewScene && this.engine.active === this.previewScene) return;
    this.view = 'title';
    sfx.scene('title');
    const preview = new DemoService({ tickMs: 999999 });
    preview.fresh(); preview.recompute();
    this.previewScene = new RestaurantScene({ name: BRAND.name, ownerId: 'title', quiet: true });
    this.previewScene.sync([...preview.state.structs.values()], { types: preview.state.types, ownerSpecies: this.prefs.species || 'cat', crewAway: false, jobs: new Map() });
    this.engine.setScene(this.previewScene);
    // A slow orbit, unless the player asked for less motion.
    this.engine.controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.engine.controls.autoRotateSpeed = 0.35;
  }

  /** Replace the title card's contents. */
  titlePage(...nodes) {
    this.titleBackdrop();
    clear(this.ui);
    const card = h('div', { class: 'title-card' }, ...nodes);
    this.ui.appendChild(h('div', { class: 'title' }, card));
    return card;
  }

  /** A title page with a heading. */
  titleSay(title, ...rest) {
    return this.titlePage(h('div', { class: 'logo' }, h('h1', { style: { fontSize: '2rem' } }, title)), ...rest);
  }

  liveOk() { return this.flavor === 'full' && !!this.loadLive; }

  /** Start New Game: critter, names, and demo kitchen or a real guild. */
  showNewGame() {
    const st = { mode: 'demo', species: this.prefs.species || 'cat', name: this.prefs.name || '', restaurant: this.prefs.restaurant || '' };
    const card = this.titlePage();
    const render = () => {
      const restore = holdFocus(card);
      clear(card);
      card.append(
        h('div', { class: 'logo' }, h('h1', {}, 'À la ', h('span', {}, 'Structs')), h('p', {}, BRAND.tagline)),
      );
      const grid = h('div', { class: 'species-grid', role: 'radiogroup', 'aria-label': 'Choose your critter' });
      for (const sp of SPECIES) {
        grid.appendChild(h('button', { class: sp === st.species ? 'on' : '', role: 'radio', 'aria-checked': sp === st.species ? 'true' : 'false', title: SPECIES_NAMES[sp], 'aria-label': SPECIES_NAMES[sp], onclick: () => { st.species = sp; sfx.pop(); render(); } },
          h('img', { src: portrait(this.engine.renderer, { species: sp, outfit: { ...OUTFITS.casual, apron: '#fff7e8', apronStyle: 'waist' }, seed: 'title-' + sp }), alt: '' })));
      }
      card.append(h('div', { class: 'field' }, h('label', {}, 'Choose your critter'), grid));
      const nameHint = h('small', { id: 'owner-name-hint' });
      const showName = () => {
        const why = st.name.trim() ? nameProblem(st.name) : null;
        nameHint.textContent = why || '3–20 letters, numbers, - or _';
        nameHint.className = why ? 'bad' : '';
        nameIn.setAttribute('aria-invalid', why ? 'true' : 'false');
      };
      const nameIn = h('input', { id: 'owner-name', value: st.name, placeholder: 'Your name', maxlength: '20', autocomplete: 'nickname', 'aria-describedby': 'owner-name-hint', oninput: (e) => { st.name = e.target.value; showName(); } });
      showName();
      const restIn = h('input', { id: 'rest-name', value: st.restaurant, placeholder: 'The Cozy Spoon Bistro', maxlength: '32', oninput: (e) => { st.restaurant = e.target.value; } });
      card.append(h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', { for: 'owner-name' }, 'Owner name'), nameIn, nameHint),
        h('div', { class: 'field' }, h('label', { for: 'rest-name' }, 'Restaurant name'), restIn)));
      const liveOk = this.liveOk();
      card.append(h('div', { class: 'mode-cards' },
        h('button', { class: `mode-card ${st.mode === 'demo' ? 'on' : ''}`, onclick: () => { st.mode = 'demo'; render(); } }, h('b', {}, 'Demo kitchen'), h('small', {}, 'Plays offline against computer rivals, with the real combat rules.')),
        h('button', { class: `mode-card ${st.mode === 'live' ? 'on' : ''}`, disabled: !liveOk, onclick: () => { st.mode = 'live'; render(); } }, h('b', {}, 'Open for real'), h('small', {}, liveOk ? 'Join a real restaurant group and take on real players.' : 'Run À la Structs on your machine to join a restaurant group.'))));
      card.append(h('button', { class: 'btn wide', onclick: () => {
        const why = nameProblem(st.name);
        if (why) { showName(); nameHint.textContent = why; nameHint.className = 'bad'; nameIn.focus(); return; }
        this.start(st);
      } }, st.mode === 'demo' ? 'Open the doors' : 'Pick a restaurant group'));
      card.append(h('button', { class: 'btn wide ghost', onclick: () => this.showTitle() }, 'Back'));
      restore();
    };
    render();
  }

  /** Continue: sign back in with a recovery phrase (or pick up the demo kitchen). */
  showContinue(error = '', phrase = '') {
    const demoSave = DemoService.hasSave();
    const nodes = [];
    if (this.liveOk()) {
      const ta = h('textarea', { id: 'phrase', placeholder: 'twelve or twenty-four words…', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'none' });
      ta.value = phrase;
      const err = h('div', { class: 'note warn', hidden: !error }, error);
      const go = h('button', { class: 'btn wide', onclick: () => this.continueLive(ta.value, go, err) }, 'Sign in');
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go.click(); } });
      nodes.push(
        h('div', { class: 'field' }, h('label', { for: 'phrase' }, 'Your recovery phrase'), ta,
          h('small', {}, 'We’ll find your restaurant and sign this browser in. Your phrase never leaves this page.')),
        err, go,
        h('div', { class: 'or' }, h('span', {}, 'or')),
        h('button', { class: 'btn wide sea', onclick: () => this.keyCodeSignIn() }, icon('key'), 'Use a key code from another device'));
    } else {
      nodes.push(h('div', { class: 'note' }, 'Signing in to a restaurant group needs À la Structs running on your machine.'));
    }
    if (demoSave) nodes.push(h('button', { class: 'btn wide sea', onclick: () => this.start({ mode: 'demo', species: this.prefs.species || 'cat', name: this.prefs.name || '', restaurant: this.prefs.restaurant || '' }, { resume: true }) }, 'Continue the demo kitchen'));
    nodes.push(h('button', { class: 'btn wide ghost', onclick: () => this.showTitle() }, 'Back'));
    this.titleSay('Welcome back', ...nodes);
    this.ui.querySelector('#phrase')?.focus({ preventScroll: true });
  }

  async start(st, { resume = false } = {}) {
    sfx.unlock(); sfx.open();
    this.prefs.species = st.species; this.prefs.name = st.name.trim(); this.prefs.restaurant = st.restaurant.trim();
    this.savePrefs();
    if (st.mode === 'live') return this.startLive(st);
    // A new game replaces the demo kitchen on this browser, so ask first.
    if (!resume && DemoService.hasSave() && !st.confirmed) {
      return this.confirm('Start a new demo kitchen?', 'Your current demo restaurant, staff and gold will be replaced. To keep playing it, go Back and choose Continue.', 'Start fresh', () => this.start({ ...st, confirmed: true }));
    }
    const svc = new DemoService({
      tickMs: this.prefs.tickMs || 3000, difficulty: this.prefs.difficulty || 'easy', rivalsMayChallenge: this.prefs.rivalsMayChallenge ?? true,
      profile: { name: this.prefs.name || 'You', species: st.species, restaurantName: this.prefs.restaurant || undefined },
      firstIncoming: /rush/.test(location.hash) ? 6 : undefined, fresh: !resume,
    });
    await this.useService(svc);
    await svc.start();
    if (this.prefs.restaurant && !resume) svc.state.restaurant.name = this.prefs.restaurant;
    if (!resume) Guide.reset('demo', svc.state.me.id);   // a new kitchen starts the guide over
    this.enterGame();
  }

  /* ── live guild login ─────────────────────────────────────────────────── */

  /** Same-origin mode (GUILD_URL proxy, or served by the guild itself): no guild lookup. */
  sameOriginGuild() { return !!((import.meta.env || {}).VITE_GUILD_PROXY); }

  async loadLiveModule() {
    try { return await this.loadLive(); } catch (e) {
      console.error(e);
      this.titleSay('Couldn’t load the restaurant group client', h('div', { class: 'note warn' }, plainError(e)), h('button', { class: 'btn wide ghost', onclick: () => this.showTitle() }, 'Back'));
      return null;
    }
  }

  /** Create the live service for a guild and connect. Resolves to whether a saved player signed in. */
  async connectLive(mod, guild) {
    const svc = new mod.LiveService({ workerUrl: mod.workerUrl, guild });
    this.liveMod = mod;
    await this.useService(svc);
    return svc.start();
  }

  liveFailed(e, back = () => this.showTitle()) {
    console.error(e);
    const hint = this.sameOriginGuild() ? 'Check that the restaurant group in GUILD_URL is running (see README).' : 'The restaurant group’s services may be down, or may not accept requests from this page (CORS).';
    this.titleSay('Couldn’t reach the restaurant group', h('div', { class: 'note warn' }, `${plainError(e)}. ${hint}`), h('button', { class: 'btn wide ghost', onclick: back }, 'Back'));
  }

  /** Start New Game → Open for real: pick a group, then get a fresh recovery phrase. */
  async startLive() {
    this.titleSay('Ringing the restaurant group…', h('p', { style: { textAlign: 'center' } }, 'Looking up restaurant groups.'));
    const mod = await this.loadLiveModule();
    if (!mod) return;
    const guild = this.sameOriginGuild() ? null : await this.pickGuild(mod);
    if (!this.sameOriginGuild() && !guild) return this.showNewGame();
    this.titleSay('Ringing the restaurant group…', h('p', { style: { textAlign: 'center' } }, `Connecting to ${guild?.name || 'the restaurant group'}’s kitchen.`));
    let signedIn;
    try { signedIn = await this.connectLive(mod, guild); } catch (e) { return this.liveFailed(e); }
    if (signedIn) { this.applyProfile(); return this.enterGame(); }
    const svc = this.svc;
    const phrase = svc.newRecoveryPhrase();
    const copy = h('button', { class: 'btn small ghost', onclick: () => { navigator.clipboard?.writeText(phrase).then(() => { copy.textContent = 'Copied'; }, () => {}); } }, 'Copy');
    this.titleSay('Your recovery phrase',
      h('div', { class: 'note warn' }, 'Write these words down somewhere safe. They are the only way back into your restaurant on another device. Nobody — including us — can recover them for you.'),
      h('div', { class: 'phrase' }, phrase), copy,
      h('button', { class: 'btn wide', onclick: async () => {
        this.titleSay('Opening your restaurant…', h('p', { style: { textAlign: 'center' } }, 'Signing you up with the restaurant group and scouting a location. This can take a minute.'));
        try { await svc.signUp(phrase, this.prefs.name); this.applyProfile(); this.enterGame(); } catch (e) {
          this.titleSay('Sign-up didn’t go through', h('div', { class: 'note warn' }, e.message), h('button', { class: 'btn wide ghost', onclick: () => location.reload() }, 'Back'));
        }
      } }, 'I’ve saved it — open my restaurant'),
      h('button', { class: 'btn wide ghost', onclick: () => location.reload() }, 'Back'));
  }

  /** Continue → Sign in: the phrase tells us the owner, the chain tells us their guild. */
  async continueLive(raw, go, err) {
    const phrase = String(raw || '').trim().toLowerCase().split(/\s+/).join(' ');
    if (!phrase) return;
    const fail = (m) => { err.textContent = m; err.hidden = false; go.disabled = false; go.textContent = 'Sign in'; };
    go.disabled = true; go.textContent = 'Finding your restaurant…'; err.hidden = true;
    let mod, guild = null;
    try {
      mod = await this.loadLive();
      if (!this.sameOriginGuild()) {
        const address = await mod.addressForPhrase(phrase);
        const pid = await mod.playerIdForAddress(address, mod.DEFAULT_REACTOR);
        if (!pid) return fail('No restaurant uses this recovery phrase. To open one, go Back and choose Start New Game.');
        const gid = await mod.guildIdForPlayer(pid, mod.DEFAULT_REACTOR);
        if (!gid) return fail('This owner isn’t in a restaurant group, so there’s nowhere to sign in to.');
        guild = await mod.resolveGuild(gid, mod.DEFAULT_REACTOR);
      }
    } catch (e) { return fail(plainError(e)); }
    this.titleSay('Signing you in…', h('p', { style: { textAlign: 'center' } }, `Registering this browser with ${guild?.name || 'your restaurant group'}. Hang tight.`));
    try {
      const signedIn = await this.connectLive(mod, guild);
      if (!signedIn) await this.svc.recover(phrase);
      this.applyProfile(); this.enterGame();
    } catch (e) {
      console.error(e);
      this.titleSay('That didn’t work', h('div', { class: 'note warn' }, plainError(e)), h('button', { class: 'btn wide ghost', onclick: () => location.reload() }, 'Try again'));
    }
  }

  /** A phrase is saved on this browser: skip the menus and sign straight back in. */
  async resumeLive(saved) {
    this.titleSay('Opening your restaurant…', h('p', { style: { textAlign: 'center' } }, 'Signing you back in.'));
    const signOut = () => { forgetSession(); location.reload(); };
    try {
      const mod = await this.loadLive();
      let guild = null;
      if (!this.sameOriginGuild()) {
        const gid = await mod.guildIdForPlayer(saved.playerId, mod.DEFAULT_REACTOR).catch(() => null) || mod.lastGuild()?.id;
        if (!gid) throw new Error('Couldn’t find which restaurant group you play in');
        guild = await mod.resolveGuild(gid, mod.DEFAULT_REACTOR);
      }
      if (!await this.connectLive(mod, guild)) throw new Error('Your saved sign-in wasn’t accepted');
      this.applyProfile(); this.enterGame();
    } catch (e) {
      console.error(e);
      this.titleSay('Couldn’t sign you back in', h('div', { class: 'note warn' }, `${plainError(e)}.`),
        h('button', { class: 'btn wide', onclick: () => location.reload() }, 'Try again'),
        h('button', { class: 'btn wide ghost', onclick: () => this.confirm('Sign out on this browser?', 'You’ll need your recovery phrase to sign back in.', 'Sign out', signOut) }, 'Sign out'));
    }
  }

  /**
   * Choose a restaurant group. Each guild's services come from its own
   * published guild.json; groups whose guild.json can't be read are left out.
   * Resolves to the resolved guild, or null on Back.
   */
  pickGuild(mod, { action = 'Join this group', title = 'Pick your restaurant group', blurb = 'Your restaurant opens in the group you join. You can play against anyone in town.' } = {}) {
    const env = import.meta.env || {};
    let chosen = this.prefs.guildId || mod.lastGuild()?.id || env.VITE_GUILD_ID || null;
    return new Promise((resolve) => {
      const list = h('div', { class: 'guild-list', role: 'listbox', 'aria-label': 'Restaurant groups' }, h('small', {}, 'Looking up restaurant groups…'));
      const err = h('div', { class: 'note warn', hidden: true });
      const go = h('button', { class: 'btn wide', disabled: true, onclick: async () => {
        if (!chosen) return;
        go.disabled = true; go.textContent = 'Reading the group’s details…'; err.hidden = true;
        try {
          const g = await mod.resolveGuild(chosen, mod.DEFAULT_REACTOR);
          this.prefs.guildId = g.id; this.savePrefs();
          resolve(g);
        } catch (e) {
          err.textContent = plainError(e); err.hidden = false;
          go.disabled = false; go.textContent = action;
        }
      } }, action);
      this.titleSay(title,
        h('p', { style: { textAlign: 'center', margin: 0 } }, blurb),
        list, err, go,
        h('button', { class: 'btn wide ghost', onclick: () => resolve(null) }, 'Back'));
      const pick = (id) => {
        chosen = id; go.disabled = !id;
        list.querySelectorAll('.guild-row').forEach((b) => { const on = b.dataset.id === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      };
      mod.browsableGuilds(mod.DEFAULT_REACTOR).then((all) => {
        clear(list);
        // A guild whose guild.json can't be read can't be joined from here at all.
        const rows = all.filter((r) => !r.unreadable && 'api' in r);
        if (!rows.length) { list.append(h('small', {}, 'No restaurant groups are open right now. Try again in a little while.')); return; }
        if (!rows.some((r) => r.ok && r.id === chosen)) chosen = rows.find((r) => r.ok)?.id || null;
        for (const r of rows) {
          const d = (r.description || '').trim();
          const about = r.ok ? (d.length > 120 ? `${d.slice(0, 120).replace(/\s+\S*$/, '')}…` : d) : r.why;
          list.append(h('button', {
            class: 'guild-row', role: 'option', 'aria-selected': 'false', disabled: !r.ok, title: r.ok ? (r.description || r.name) : r.why, 'data-id': r.id,
            onclick: () => pick(r.id),
          }, h('b', {}, r.name), about ? h('small', {}, about) : null));
        }
        pick(chosen);
      }, (e) => { clear(list); list.append(h('small', {}, `Couldn’t look up restaurant groups (${e.message || e}). Try again in a little while.`)); });
    });
  }

  applyProfile() {
    const s = this.svc.state;
    if (this.prefs.species) s.me.species = this.prefs.species;
    if (this.prefs.restaurant && this.svc.mode === 'live') { s.restaurantNames = { ...(s.restaurantNames || {}), [s.restaurant.id]: this.prefs.restaurant }; s.restaurant.name = this.prefs.restaurant; }
  }

  async useService(svc) {
    if (this.svc) { this.svc.stop?.(); }
    this.svc = svc;
    svc.addEventListener('change', (e) => { if (this.svc === svc) this.onChange(e.detail.what); });
    svc.addEventListener('fx', (e) => { if (this.svc === svc) this.onFx(e.detail); });
    svc.addEventListener('toast', (e) => { if (this.svc === svc) this.announce(e.detail); });
    svc.addEventListener('revoked', () => {
      if (this.svc !== svc) return;
      this.modal(icon('key', 'big-icon'), 'This browser’s key was taken back',
        'Someone signed in as you took back this browser’s key from another device, so you’re signed out here. Sign in again with your recovery phrase or a new key code.',
        [['OK', () => svc.logout()]]);
    });
  }

  /* ── main game ────────────────────────────────────────────────────────── */

  enterGame() {
    this.engine.controls.autoRotate = false;
    clear(this.ui);
    this.hudTop = h('div', { class: 'hud-top' });
    this.dock = h('nav', { class: 'dock', 'aria-label': 'Main menu' });
    this.announcer = h('div', { class: 'announcer', 'aria-live': 'polite' });
    this.overlay = h('div', { id: 'overlay' });
    this.ui.append(this.hudTop, this.dock, this.announcer, this.overlay);
    this.homeScene = this.makeHomeScene();
    this.setView('home');
    this.renderHud();
    this.renderDock();
    this.startHangout();
    // Chef Biscuit greets new owners and walks them through their first day.
    this.guide = new Guide(this);
    this.guide.start();
    this.hudTimer = setInterval(() => this.renderHud(), 500);
  }

  makeHomeScene() {
    const s = this.svc.state;
    const sc = new RestaurantScene({ name: s.restaurant.name, ownerId: s.restaurant.id || s.me.id, mode: 'home' });
    sc.addEventListener('select', (e) => this.onSelect(e.detail.id));
    return sc;
  }

  setView(view, opts = {}) {
    if (this.view === view && !opts.force) return;
    this.endTargeting();
    this.closeSheet();
    this.view = view;
    sfx.scene(view);
    document.body.classList.toggle('in-challenge', view === 'challenge');
    this.peekStructs = null;
    this.readOnly = false;
    this.overlay && clear(this.overlay);
    if (view === 'home') {
      if (!this.homeScene || this.homeScene.opts.name !== this.svc.state.restaurant.name) this.homeScene = this.makeHomeScene();
      this.syncHome();
      this.engine.setScene(this.homeScene);
    } else if (view === 'challenge') {
      this.ensureChallengeScene();
      this.engine.setScene(this.challengeScene);
      this.syncChallenge();
      this.renderChallengeHud();
    } else if (view === 'town') {
      this.townReady = this.enterTown();
      this.guide?.flag('town');
    } else if (view === 'peek') {
      this.engine.setScene(opts.scene);
      this.readOnly = true;
      this.peekStructs = new Map(opts.structs.map((x) => [x.id, x]));
      this.overlay.appendChild(h('div', { class: 'peek-banner' }, h('span', {}, opts.rival ? `Sizing up ${opts.title}` : `Visiting ${opts.title}`),
        opts.rival && opts.member ? h('button', { class: 'btn small berry', onclick: () => this.challenge(opts.member) }, 'Send the crew') : null,
        h('button', { class: 'btn small ghost', onclick: () => this.leavePeek(opts) }, icon('back'), 'Leave')));
    }
    this.renderDock();
  }

  syncHome() {
    const s = this.svc.state;
    this.homeScene.sync([...s.structs.values()], { types: s.types, ownerSpecies: s.me.species, ownerSeed: s.me.id || 'me', crewAway: s.crew.status === 'away', jobs: s.jobs });
  }

  ensureChallengeScene() {
    const ch = this.svc.state.challenge;
    if (!ch) return;
    const key = `${ch.hostId}:${ch.guestId}:${ch.startedTick ?? ch.planetId}`;
    if (this.challengeKey === key && this.challengeScene) return;
    this.challengeKey = key;
    this.chStart = Date.now();
    this.challengeScene?.dispose();
    this.challengeScene = new ChallengeScene({ name: ch.restaurantName, ownerId: ch.planetId || ch.hostId });
    this.challengeScene.addEventListener('select', (e) => this.onSelect(e.detail.id));
  }

  syncChallenge() {
    const s = this.svc.state, ch = s.challenge;
    if (!ch || !this.challengeScene) return;
    this.challengeScene.sync([...ch.structs.values()], { types: s.types, hostId: ch.hostId, ownerSpecies: ch.host.species, ownerSeed: ch.hostId === s.me.id ? (s.me.id || 'me') : ch.hostId, guestSpecies: ch.guest.species, jobs: s.jobs });
  }

  onChange(what) {
    const s = this.svc.state;
    this.guide?.check();
    const w = new Set(what);
    const all = w.has('all');
    // A challenge appeared?
    if (s.challenge && s.challenge.status === 'ongoing' && this.view !== 'challenge' && this.lastChallengeSeen !== this.challengeId(s.challenge)) {
      this.lastChallengeSeen = this.challengeId(s.challenge);
      sfx.alarm();
      this.setView('challenge');
    }
    if (!s.challenge && this.view === 'challenge') this.setView('home');
    if (this.view === 'home' && (all || w.has('structs') || w.has('tick'))) {
      if (this.homeScene.opts.name !== s.restaurant.name) this.setView('home', { force: true });
      else this.syncHome();
      if (w.has('tick')) this.homeScene.refreshJobs(s.jobs);
    }
    if (this.view === 'challenge' && (all || w.has('challenge') || w.has('structs'))) {
      this.syncChallenge();
      this.renderChallengeHud();
    }
    // Settings shows nothing from the game, so it only redraws when you change something there.
    if (this.sheet && this.sheet.kind !== 'settings' && (all || w.has('structs') || w.has('wallet') || w.has('challenge') || (w.has('tick') && this.sheet.kind === 'staff'))) this.refreshSheet();
    this.renderHud();
    this.renderDock();
  }

  challengeId(ch) { return `${ch.hostId}:${ch.guestId}:${ch.startedTick ?? ''}`; }

  onFx(ev) {
    this.guide?.onFx(ev);
    const sc = this.view === 'challenge' ? this.challengeScene : this.view === 'home' ? this.homeScene : null;
    sc?.onFx(ev);
    switch (ev.kind) {
      case 'attack': {
        const ch = this.svc.state.challenge;
        const hostSide = ev.detail.attackerPlayerId === (ch?.hostId ?? ev.hostId);
        const last = (ev.detail.eventAttackShotDetail || []).slice(-1)[0] || {};
        setTimeout(() => (hostSide ? sfx.serve() : sfx.complain()), 300);
        if (last.targetDestroyed) setTimeout(() => (hostSide ? sfx.satisfied() : sfx.fired()), 1200);
        break;
      }
      case 'job': sfx.coin(); break;
      case 'built': case 'hired': sfx.hire(); break;
      case 'challengeEnd': {
        const ch = this.svc.state.challenge;
        const won = (ev.status === 'raidSuccessful') === (ev.role === 'challenger') && ev.status !== 'attackerRetreated';
        if (ev.status !== 'attackerRetreated') (won ? sfx.win : sfx.lose)();
        setTimeout(() => this.showChallengeResult(ch), 1600);
        break;
      }
      default: break;
    }
  }

  /* ── HUD ──────────────────────────────────────────────────────────────── */

  /**
   * The top bar. Built once per game and then only its text changes: it
   * updates every half second, and rebuilding it would reset hover, focus and
   * any open explanation.
   */
  renderHud() {
    if (!this.hudTop || !this.svc) return;
    const s = this.svc.state;
    if (!this.hud || this.hud.root !== this.hudTop) this.buildHud();
    const hud = this.hud;

    const ownerSig = `${s.me.id}|${s.me.species}|${s.restaurant.name}|${s.me.name}|${s.me.guildName}|${this.svc.mode}`;
    if (hud.ownerSig !== ownerSig) {
      hud.ownerSig = ownerSig;
      hud.ownerImg.src = Panels.ownerFace(this, s.me.id || 'me', s.me.species);
      hud.restaurant.textContent = s.restaurant.name;
      hud.who.textContent = `${s.me.name}${s.me.guildName ? ` · ${s.me.guildName}` : ''}`;
      hud.badge.className = `mode-badge ${this.svc.mode}`;
      hud.badge.textContent = this.svc.mode === 'demo' ? 'Demo' : 'Live';
    }
    const v = this.hudValues();
    hud.vals.hustle.textContent = String(v.hustle);
    hud.pips.forEach((p, i) => p.classList.toggle('on', i < Math.min(10, v.hustle)));
    hud.vals.gold.textContent = gold(v.gold);
    hud.vals.recipes.textContent = String(v.recipes);
    hud.vals.undiscovered.textContent = String(v.undiscovered);
    hud.vals.spare.textContent = cash(v.spare);
    hud.vals.spare.style.color = v.spare < 0 ? 'var(--bad)' : '';
    hud.vals.clock.textContent = `${v.nextTick}s`;
    for (const [key, btn] of Object.entries(hud.stats)) btn.setAttribute('aria-label', this.hudTipText(key, v).title);
    if (this.tipKey) this.fillHudTip(v);
  }

  hudValues() {
    const s = this.svc.state;
    const sinceTick = (Date.now() - s.lastTickAt) / s.tickMs;
    return {
      hustle: this.svc.hustle(), gold: s.wallet.gold, recipes: s.wallet.recipes, undiscovered: s.restaurant.undiscovered,
      takings: s.wallet.takings, payroll: s.wallet.payroll, spare: this.svc.spareCash(),
      nextTick: Math.max(0, Math.ceil((1 - Math.min(1, sinceTick)) * s.tickMs / 1000)), tickSecs: s.tickMs / 1000, tick: s.tick,
    };
  }

  /** What each stat means, with the current numbers. */
  hudTipText(key, v) {
    const demo = this.svc.mode === 'demo';
    switch (key) {
      case 'hustle': return { title: `${TERMS.charge}: ${v.hustle}`, text: `Builds up by 1 every tick. Every action — hiring, clocking in, serving — needs a minimum amount (shown on its button) and uses up all of your hustle when you do it.` };
      case 'gold': return { title: `${TERMS.alpha}: ${gold(v.gold)}`, text: 'Your Sous Chef earns 1 gold for each recipe they perfect. Invest gold in your Light-Up Pole Sign (open its card) to bring in more cash every tick.' };
      case 'recipes': return { title: `${TERMS.ore}: ${v.recipes} ready · ${v.undiscovered} undiscovered`, text: `Ready recipes wait for your Sous Chef to perfect them into gold. Undiscovered ones are still here for your Chef to find${v.undiscovered ? '' : ' — none are left, so open a new restaurant from the Staff menu'}.` };
      case 'spare': return { title: `Spare cash: ${cash(v.spare)} per tick`, text: `${TERMS.capacity} ${cash(v.takings)} minus ${TERMS.load.toLowerCase()} ${cash(v.payroll)}. Every hire needs spare cash for their wage${v.spare < 0 ? ' — you’re short, so staff can’t all stay on shift' : ''}.` };
      case 'clock': return { title: `Next ${TERMS.block.toLowerCase()} in ${v.nextTick}s`, text: `Everything in the kitchen happens on the tick, every ${v.tickSecs} seconds. This is ${TERMS.block.toLowerCase()} ${v.tick.toLocaleString('en-US')}.${demo ? ' Change the pace in Settings.' : ''}` };
      default: return { title: '', text: '' };
    }
  }

  buildHud() {
    const stat = (key, cls, ...kids) => {
      const b = h('button', { class: `pill stat ${cls}`, type: 'button', 'data-tip': key }, ...kids);
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !this.tipPinned) this.showHudTip(key); });
      b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !this.tipPinned) this.hideHudTip(); });
      b.addEventListener('focus', () => { if (!this.tipPinned) this.showHudTip(key); });
      b.addEventListener('blur', () => { if (!this.tipPinned) this.hideHudTip(); });
      b.addEventListener('click', () => {
        if (this.tipPinned && this.tipKey === key) return this.hideHudTip(true);
        this.showHudTip(key, true);
      });
      return b;
    };
    const val = () => h('span', { class: 'val' });
    const vals = { hustle: val(), gold: val(), recipes: val(), undiscovered: val(), spare: val(), clock: val() };
    const pipsEl = h('span', { class: 'hustle', 'aria-hidden': 'true' });
    const pips = [...Array(10)].map(() => pipsEl.appendChild(h('i')));
    const stats = {
      hustle: stat('hustle', '', icon('hustle'), vals.hustle, pipsEl),
      gold: stat('gold', '', icon('gold'), vals.gold, h('small', {}, 'gold')),
      recipes: stat('recipes', '', icon('recipe'), vals.recipes, icon('mystery'), vals.undiscovered),
      spare: stat('spare', '', icon('cash'), vals.spare, h('small', {}, 'spare')),
      clock: stat('clock', 'clock-pill', icon('clock'), vals.clock, h('small', {}, 'next tick')),
    };
    const ownerImg = h('img', { alt: '' }), restaurant = h('b'), who = h('small'), badge = h('span', { class: 'mode-badge' });
    clear(this.hudTop).append(
      h('button', { class: 'pill owner-pill', type: 'button', title: 'Open the Office', onclick: () => { sfx.click(); this.openPage('office'); } }, ownerImg, h('div', { class: 'who' }, restaurant, who), badge),
      h('div', { class: 'stats' }, ...Object.values(stats)));
    this.hudTip?.remove();
    this.hudTip = h('div', { class: 'hud-tip', id: 'hud-tip', role: 'tooltip', hidden: true });
    this.ui.appendChild(this.hudTip);
    this.tipKey = null; this.tipPinned = false;
    this.hud = { root: this.hudTop, ownerImg, restaurant, who, badge, vals, pips, stats, ownerSig: null };
    if (!this.tipOutside) {
      // A pinned explanation closes when you click or tap anywhere else.
      this.tipOutside = (e) => { if (this.tipPinned && !e.target.closest?.('.stat, .hud-tip')) this.hideHudTip(true); };
      document.addEventListener('pointerdown', this.tipOutside, true);
    }
  }

  showHudTip(key, pin = false) {
    const btn = this.hud?.stats[key];
    if (!btn || !this.hudTip) return;
    for (const b of Object.values(this.hud.stats)) { b.removeAttribute('aria-describedby'); b.setAttribute('aria-expanded', 'false'); }
    this.tipKey = key; this.tipPinned = pin;
    btn.setAttribute('aria-describedby', 'hud-tip');
    btn.setAttribute('aria-expanded', pin ? 'true' : 'false');
    this.hudTip.hidden = false;
    this.fillHudTip(this.hudValues());
  }

  hideHudTip(unpin = false) {
    if (unpin) this.tipPinned = false;
    if (this.tipPinned || !this.hudTip) return;
    for (const b of Object.values(this.hud?.stats || {})) { b.removeAttribute('aria-describedby'); b.setAttribute('aria-expanded', 'false'); }
    this.tipKey = null;
    this.hudTip.hidden = true;
  }

  fillHudTip(v) {
    const btn = this.hud?.stats[this.tipKey], tip = this.hudTip;
    if (!btn || !tip) return;
    const { title, text } = this.hudTipText(this.tipKey, v);
    clear(tip).append(h('b', {}, title), h('span', {}, text));
    // Under its stat, kept on screen.
    const r = btn.getBoundingClientRect(), w = tip.offsetWidth;
    tip.style.top = `${Math.round(r.bottom + 8)}px`;
    tip.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)))}px`;
  }

  renderDock() {
    if (!this.dock) return;
    const s = this.svc.state;
    const ch = s.challenge;
    const items = [
      ['home', 'store', 'Restaurant', () => this.setView('home')],
      ['hire', 'hire', 'Hire', () => this.openSheet('hire', this.lastHireSection || 'space')],
      ['roster', 'staff', 'Staff', () => this.openSheet('roster')],
      ['rivals', 'bell', 'Rivals', () => this.openRivals()],
      ['group', 'group', 'Group', () => this.openPage('group')],
      ['town', 'town', 'Town', () => this.setView('town')],
      ['office', 'office', 'Office', () => this.openPage('office')],
      ['settings', 'gear', 'Settings', () => this.openSheet('settings')],
    ];
    if (ch) items.splice(1, 0, ['challenge', 'grumble', 'Challenge', () => this.setView('challenge')]);
    // Only one tab is current: the open sheet, else the view.
    const current = this.sheet && items.some(([k]) => k === this.sheet.kind) ? this.sheet.kind : this.view;
    const alert = ch?.status === 'ongoing' && this.view !== 'challenge';
    const sig = `${items.map(([k]) => k).join()}|${current}|${alert}`;
    if (this.dockSig === sig && this.dock.childElementCount) return;
    this.dockSig = sig;
    const restore = holdFocus(this.dock);
    clear(this.dock);
    for (const [key, ic, label, fn] of items) {
      const on = key === current;
      const b = h('button', { class: `${on ? 'on' : ''} ${key === 'challenge' && alert ? 'alert' : ''}`, 'aria-current': on ? 'page' : null, onclick: () => { sfx.click(); fn(); } }, icon(ic), label);
      this.dock.appendChild(b);
    }
    restore();
  }

  /* ── announcer ────────────────────────────────────────────────────────── */

  announce({ text, tone }) {
    this.toasts.push({ text: plainError(text), tone });
    if (!this.toastBusy) this.nextToast();
  }

  nextToast() {
    const t = this.toasts.shift();
    if (!t || !this.announcer) { this.toastBusy = false; if (this.announcer) clear(this.announcer); return; }
    this.toastBusy = true;
    const s = this.svc.state;
    const mgr = this.svc.manager();
    const img = mgr ? Panels.face(this, mgr, s.types.get(mgr.typeId)) : Panels.ownerFace(this, s.me.id || 'me', s.me.species);
    clear(this.announcer).append(h('img', { src: img, alt: '' }), h('div', { class: `bubble ${t.tone || ''}` }, t.text));
    this.announcer.style.pointerEvents = 'auto';
    this.announcer.onclick = () => this.openSheet('notebook');
    setTimeout(() => this.nextToast(), Math.min(6000, 2200 + t.text.length * 35) / (this.toasts.length > 2 ? 2 : 1));
  }

  /* ── sheets ───────────────────────────────────────────────────────────── */

  async openSheet(kind, arg) {
    if (kind === 'rivals') return this.openRivals();
    this.leavePage();
    if (kind === 'hire') this.lastHireSection = arg;
    this.sheet = { kind, arg };
    this.refreshSheet(true);   // asked for by a click, so always redraw
    this.renderDock();
  }

  /* ── paged sheets (office, group) ─────────────────────────────────────── */

  /**
   * Open a page of a paged sheet. Pages opened from another page stack up, so
   * the header gets a back button; `push: false` replaces the current page.
   */
  async openPage(kind, page = 'index', params = {}, { push = true } = {}) {
    const prev = this.sheet && PAGES[this.sheet.kind] ? this.sheet : null;
    this.leavePage();
    const stack = prev ? (push ? [...prev.stack, { kind: prev.kind, page: prev.arg, params: prev.params }] : prev.stack) : [];
    // Opening a section's front page from the dock starts that section afresh.
    const fresh = page === 'index' && (!prev || prev.kind !== kind) && !Object.keys(params).length && push;
    this.sheet = { kind, arg: page, params, stack: fresh ? [] : stack, data: undefined, error: null, key: `${page}|${params.id ?? params.address ?? params.page ?? ''}` };
    this.refreshSheet(true);
    this.renderDock();
    return this.loadPage(this.sheet);
  }

  async loadPage(sheet = this.sheet) {
    const def = PAGES[sheet.kind]?.[sheet.arg];
    if (!def?.load) { sheet.data = null; return; }
    sheet.error = null;
    try { sheet.data = await def.load(this, sheet.params); } catch (e) { console.warn(e); sheet.error = this.svc.friendlyError(e); }
    if (this.sheet === sheet) this.refreshSheet(true);
  }

  /** Re-fetch the page on screen (after an action changed what it shows). */
  reloadPage() { return this.sheet && PAGES[this.sheet.kind] ? this.loadPage(this.sheet) : null; }

  pageBack() {
    const s = this.sheet;
    if (!s?.stack?.length) return this.closeSheet();
    this.leavePage();
    const top = s.stack[s.stack.length - 1];
    this.sheet = { kind: top.kind, arg: top.page, params: top.params, stack: s.stack.slice(0, -1), data: undefined, error: null, key: `${top.page}|${top.params.id ?? top.params.address ?? top.params.page ?? ''}` };
    this.refreshSheet(true);
    this.renderDock();
    return this.loadPage(this.sheet);
  }

  /** Let the page on screen tidy up (cancel a wait, drop a draft). */
  leavePage() {
    const s = this.sheet;
    if (s && PAGES[s.kind]) PAGES[s.kind][s.arg]?.leave?.(this);
  }

  pageContent() {
    const s = this.sheet, def = PAGES[s.kind][s.arg];
    const title = typeof def.title === 'function' ? def.title(this, s.data, s.params) : def.title;
    let out;
    if (s.error) out = { body: [h('div', { class: 'note warn' }, s.error), h('button', { class: 'btn small ghost', style: { justifySelf: 'start' }, onclick: () => { s.error = null; s.data = undefined; this.refreshSheet(true); this.loadPage(s); } }, 'Try again')] };
    else if (s.data === undefined && def.load) out = { body: [loading()] };
    else out = def.render(this, s.data, s.params);
    return { title, ...out, back: s.stack.length ? () => { sfx.close(); this.pageBack(); } : null };
  }

  /* ── rivals ───────────────────────────────────────────────────────────── */

  /** Open the rivals sheet, optionally changing the search (filters reset the page to 1). */
  async openRivals(patch = null) {
    this.leavePage();
    const f = this.rivalFilters ??= { query: '', minRecipes: 0, groupId: null, crewOut: false, notBusy: false, page: 1 };
    if (patch) Object.assign(f, 'page' in patch ? patch : { ...patch, page: 1 });
    this.sheet = { kind: 'rivals', arg: '' };
    this.rivalResult = null;
    this.refreshSheet(true);
    this.renderDock();
    if (!this.rivalGroupList) this.svc.rivalGroups().then((g) => { this.rivalGroupList = g; if (this.sheet?.kind === 'rivals') this.refreshSheet(true); }, () => { this.rivalGroupList = []; });
    const ask = { ...f };
    try { this.rivalResult = await this.svc.searchRivals(ask); } catch (e) { this.rivalResult = { list: [], total: 0, pages: 1, page: 1 }; this.announce({ text: this.svc.friendlyError(e), tone: 'bad' }); }
    if (JSON.stringify(this.rivalFilters) !== JSON.stringify(ask)) return;   // a newer search is on its way
    this.rivals = this.rivalResult.list;
    if (this.sheet?.kind === 'rivals') this.refreshSheet(true);
  }

  refreshSheet(force = false) {
    if (!this.sheet) return;
    const { kind, arg } = this.sheet;
    // Don't redraw under someone typing (a re-render would reset the field).
    if (!force && document.activeElement?.closest?.('.sheet') && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    let content;
    if (kind === 'staff') content = Panels.staffSheet(this, arg);
    else if (kind === 'hire') content = Panels.hireSheet(this, arg);
    else if (kind === 'roster') content = Panels.rosterSheet(this);
    else if (kind === 'settings') content = Panels.settingsSheet(this);
    else if (kind === 'notebook') content = Panels.notebookSheet(this);
    else if (kind === 'rivals') content = Panels.rivalsSheet(this, this.rivalResult, this.rivalFilters);
    else if (PAGES[kind]) content = this.pageContent();
    if (content) this.renderSheet(content);
  }

  renderSheet({ title, body, foot, back }) {
    const scroll = this.sheetEl?.querySelector('.body')?.scrollTop || 0;
    const restore = holdFocus(this.sheetEl);
    const key = String(this.sheet.key ?? this.sheet.arg ?? '');
    const same = this.sheetEl && this.sheetEl.dataset.kind === this.sheet.kind && this.sheetEl.dataset.arg === key;
    this.sheetEl?.remove();
    const el = h('section', { class: 'sheet', 'aria-label': title, 'data-kind': this.sheet.kind, 'data-arg': key },
      h('header', {}, back ? h('button', { class: 'x back', 'aria-label': 'Back', onclick: back }, icon('back')) : null, h('h2', {}, title), h('button', { class: 'x', 'aria-label': 'Close', onclick: () => { sfx.close(); this.closeSheet(); } }, icon('close'))),
      h('div', { class: 'body' }, ...body),
      foot && foot.length ? h('div', { class: 'foot' }, ...foot) : null);
    if (same) el.style.animation = 'none';
    this.ui.appendChild(el);
    this.sheetEl = el;
    if (same) el.querySelector('.body').scrollTop = scroll;
    restore(el);
  }

  closeSheet() {
    this.leavePage();
    this.sheetEl?.remove(); this.sheetEl = null; this.sheet = null;
    this.scene()?.select?.call(this.scene(), null);
    this.renderDock();
  }

  scene() { return this.view === 'challenge' ? this.challengeScene : this.view === 'home' ? this.homeScene : this.view === 'peek' ? this.engine.active : null; }

  /* ── selection & targeting ───────────────────────────────────────────── */

  onSelect(id) {
    if (!id) { if (this.sheet?.kind === 'staff') { this.sheetEl?.remove(); this.sheetEl = null; this.sheet = null; this.renderDock(); } return; }
    // Only open a card for someone who's actually here.
    const known = this.svc.state.structs.has(id) || this.svc.state.challenge?.structs.has(id) || this.peekStructs?.has(id);
    if (!known) return;
    if (!this.readOnly && this.svc.state.structs.has(id)) this.guide?.noteSelect(this.svc.state.structs.get(id));
    if (this.targeting) {
      const t = this.targeting;
      if (t.valid.has(id)) {
        this.endTargeting();
        if (t.kind === 'serve') this.act(() => this.svc.serve(t.sourceId, id, t.ws));
        else if (t.kind === 'cover') this.act(() => this.svc.cover(t.sourceId, id));
        sfx.pop();
        return;
      }
      if (id !== t.sourceId) { this.announce({ text: t.kind === 'serve' ? 'They can’t reach that one — pick a highlighted target.' : 'Pick one of your highlighted staff or equipment.', tone: 'bad' }); return; }
    }
    sfx.pop();
    this.leavePage();
    this.sheet = { kind: 'staff', arg: id };
    this.refreshSheet();
    this.renderDock();
  }

  selectStruct(id) {
    // In a challenge, crew on the floor are picked there instead of leaving it.
    if (this.view === 'challenge' && this.svc.state.challenge?.structs.has(id)) return this.challengeScene.select(id);
    if (this.view !== 'home') this.setView('home');
    this.homeScene.select(id);
  }

  /** "Mochi the Barista", "the Soft-Serve Machine", "Food Critic (Mochi)" — for buttons and lists. */
  whoIs(id) {
    const s = this.svc.state, ch = s.challenge;
    const st = ch?.structs.get(id) || s.structs.get(id);
    if (!st) return 'Someone';
    const t = s.types.get(st.typeId), role = roleOf(t);
    if (ch && st.owner === ch.guestId) return `${isCommand(t) ? 'Food Critic' : role.customer?.persona || 'Customer'} (${nameFor(id)})`;
    return role.kind === 'equipment' ? role.role : `${nameFor(id)} the ${role.role}`;
  }

  beginServe(attackerId, ws) {
    const s = this.svc.state, ch = s.challenge;
    if (!ch) return;
    const valid = new Set();
    for (const t of ch.structs.values()) {
      if (t.owner === s.me.id || is.destroyed(t)) continue;
      const why = this.svc.serveBlocker(attackerId, t.id, ws);
      if (!why || /hustle/.test(why)) valid.add(t.id);
    }
    if (!valid.size) { this.announce({ text: 'Nobody they can reach right now.', tone: 'bad' }); return; }
    const cost = weaponField(s.types.get(ch.structs.get(attackerId).typeId), ws, 'Charge') || 0;
    this.startTargeting({ kind: 'serve', sourceId: attackerId, ws, valid, hint: `${ch.role === 'challenger' ? 'Who should they complain to?' : 'Who should they serve?'} (needs ${cost} hustle — goes out next tick)` });
  }

  beginCover(defenderId) {
    const s = this.svc.state;
    const pool = this.view === 'challenge' && s.challenge ? s.challenge.structs : s.structs;
    const d = pool.get(defenderId) || s.structs.get(defenderId);
    // Anyone of yours can be covered; only a defender in the same area takes the hits for them.
    const valid = new Set([...pool.values()].filter((x) => x.owner === s.me.id && x.id !== defenderId && !is.destroyed(x)).map((x) => x.id));
    if (!valid.size) { this.announce({ text: 'Nobody to cover for yet.', tone: 'bad' }); return; }
    this.startTargeting({ kind: 'cover', sourceId: defenderId, sourceArea: d.ambit, valid, hint: `Who should ${nameFor(defenderId)} cover for? They take hits only for someone in the ${AREAS[d.ambit]?.name || 'same area'}.` });
  }

  startTargeting(t) {
    this.targeting = t;
    document.body.classList.add('targeting');
    this.closeSheetQuiet();
    this.hintEl?.remove();
    // Every valid target is also a button, so nobody has to find (or reach) it in the 3D room.
    const pool = this.view === 'challenge' && this.svc.state.challenge ? this.svc.state.challenge.structs : this.svc.state.structs;
    const targets = [...t.valid].map((id) => pool.get(id)).filter(Boolean).map((x) => {
      const need = t.kind === 'serve' ? (x.owner === this.svc.state.challenge?.guestId ? `${x.maxHealth - x.health}/${x.maxHealth} satisfied` : `${x.health}/${x.maxHealth} morale`)
        : x.ambit === t.sourceArea ? 'same area · takes hits for them' : `${AREAS[x.ambit]?.short || 'other area'} · won’t take hits`;
      return h('button', { class: 'chip-btn', onclick: () => this.onSelect(x.id) }, this.whoIs(x.id), need ? h('small', {}, ` · ${need}`) : null);
    });
    this.hintEl = h('div', { class: 'targeting-hint', role: 'dialog', 'aria-label': t.hint },
      h('span', {}, t.hint), h('button', { class: 'btn small ghost', onclick: () => this.endTargeting() }, 'Cancel'),
      h('div', { class: 'targets' }, ...targets));
    this.ui.appendChild(this.hintEl);
    this.hintEl.querySelector('.targets button')?.focus({ preventScroll: true });
    if (this.view === 'challenge') this.challengeScene.setTargeting({ attackerId: t.sourceId, valid: t.valid });
  }

  closeSheetQuiet() { this.leavePage(); this.sheetEl?.remove(); this.sheetEl = null; this.sheet = null; }

  endTargeting() {
    if (!this.targeting) return;
    this.targeting = null;
    document.body.classList.remove('targeting');
    this.hintEl?.remove(); this.hintEl = null;
    if (this.challengeScene) this.challengeScene.setTargeting(null);
  }

  async act(fn) {
    try { await fn(); sfx.click(); } catch (e) { sfx.complain(); this.announce({ text: this.svc.friendlyError(e), tone: 'bad' }); }
    this.refreshSheet();
    this.renderHud();
  }

  async hire(typeId, area) {
    try {
      const id = await this.svc.hire(typeId, area);
      this.guide?.noteHire(this.svc.state.types.get(typeId));
      this.closeSheet();
      // Show the new hire's card. (On a guild hire() resolves to the signed
      // transaction; the new staff member's id only arrives later from the chain.)
      if (typeof id === 'string' && this.view === 'home') setTimeout(() => { if (this.svc.state.structs.has(id)) this.homeScene.select(id); }, 250);
    } catch (e) { sfx.complain(); this.announce({ text: this.svc.friendlyError(e), tone: 'bad' }); }
  }

  /* ── challenges ───────────────────────────────────────────────────────── */

  async challenge(rival) {
    this.closeSheet();
    try { await this.svc.startChallenge(rival.id, rival); }
    catch (e) { sfx.complain(); this.announce({ text: this.svc.friendlyError(e), tone: 'bad' }); }
  }

  renderChallengeHud() {
    const s = this.svc.state, ch = s.challenge;
    if (!this.overlay) return;
    const restore = holdFocus(this.overlay);
    clear(this.overlay);
    if (!ch || this.view !== 'challenge') return;
    const guest = ch.role === 'challenger';
    const all = [...ch.structs.values()];
    const customers = all.filter((x) => x.owner === ch.guestId);
    const staff = all.filter((x) => x.owner === ch.hostId);
    const satisfied = customers.filter((x) => is.destroyed(x)).length;
    const fired = staff.filter((x) => is.destroyed(x)).length;
    const pct = Math.round((ch.heist?.progress || 0) * 100);
    const critic = customers.find((x) => isCommand(s.types.get(x.typeId)));
    const criticLeft = critic ? critic.health : 0;
    // Folded down to a small pill: just the copied bar, out of the way of the room.
    if (this.chMin) {
      this.overlay.append(
        h('div', { class: 'ch-banner min', role: 'status' },
          h('div', { class: 'row' }, icon('bell'), h('small', {}, `Recipes copied ${pct}%`), h('div', { class: `progress ${guest ? '' : 'berry'}` }, h('i', { style: { width: `${pct}%` } })),
            h('button', { class: 'btn small ghost', 'aria-label': 'Show the challenge details', 'aria-expanded': 'false', onclick: () => { this.chMin = false; this.renderChallengeHud(); } }, '▾'))),
        h('div', { class: 'ch-log', 'aria-label': 'What’s happening' }, ...(ch.log || []).slice(0, 4).map((l) => h('div', { class: l.tone || '' }, l.text))),
      );
      if (this.hintEl) this.ui.appendChild(this.hintEl);
      restore();
      return;
    }
    this.overlay.append(
      h('div', { class: 'ch-banner', role: 'status' },
        h('div', { class: 'row' },
          h('h3', {}, icon('bell'), h('span', {}, guest ? `At ${ch.restaurantName}` : `${ch.guest.name}’s crew is dining here!`)),
          guest && ch.status === 'ongoing' ? h('button', { class: 'btn small ghost', onclick: () => this.act(() => this.svc.goHome()) }, 'Go home') : null,
          h('button', { class: 'btn small ghost', 'aria-label': 'How it works', onclick: () => { this.chHelp = !this.chHelp; this.renderChallengeHud(); } }, '?'),
          h('button', { class: 'btn small ghost', 'aria-label': 'Fold the challenge card away', 'aria-expanded': 'true', onclick: () => { this.chMin = true; this.chHelp = false; this.renderChallengeHud(); } }, '▴')),
        Date.now() - (this.chStart || 0) < 15000 || this.chHelp ? h('p', {}, guest
          ? 'Your crew are the customers. Tap one of them, pick a complaint, then tap a staff member. Stay until you’ve copied their recipes — if they satisfy your Food Critic, you all go home.'
          : 'Tap one of your staff, pick how to serve, then tap a customer. Satisfy their Food Critic and the whole party leaves — before they copy your recipes.') : null,
        h('div', { class: 'row' }, h('small', {}, `Recipes copied ${pct}%`), h('div', { class: `progress ${guest ? '' : 'berry'}` }, h('i', { style: { width: `${pct}%` } }))),
        h('div', { class: 'row chips' },
          h('span', { class: 'tagchip' }, icon('heart'), `${satisfied} satisfied`),
          h('span', { class: 'tagchip' }, icon('grumble'), `${fired} fired`),
          critic ? h('span', { class: 'tagchip' }, `Critic: ${critic.maxHealth - criticLeft}/${critic.maxHealth} satisfied`) : null,
          h('span', { class: 'tagchip' }, icon('hustle'), `${this.svc.hustle()}`))),
      h('div', { class: 'ch-log', 'aria-label': 'What’s happening' }, ...(ch.log || []).slice(0, 6).map((l) => h('div', { class: l.tone || '' }, l.text))),
    );
    if (this.hintEl) this.ui.appendChild(this.hintEl);
    restore();
  }

  /**
   * How a challenge ended, told in two beats: a stamp across the screen
   * (the webapp's victory/defeat banner), then the Manager walks you through
   * what happened (its dialogue sequences), recipes won or lost included.
   */
  showChallengeResult(ch) {
    if (!ch?.result || !this.svc) return;
    const r = ch.result;
    const guest = ch.role === 'challenger';
    const n = r.stolen || 0;
    const recipes = `${n} recipe${n === 1 ? '' : 's'}`;
    const done = () => { this.svc.dismissChallenge?.(); this.setView('home'); };
    let stamp = null, steps;
    if (r.status === 'raidSuccessful' && guest) {
      stamp = { text: n ? 'Recipes copied!' : 'Full service', tone: 'good' };
      steps = n ? [`We did it! We sat through the whole service at ${ch.restaurantName} and copied ${recipes}.`, 'They’re in our recipe box now. Your Sous Chef will perfect them into gold.']
        : [`We stayed the whole service at ${ch.restaurantName}… but there wasn’t a single recipe to copy.`, 'Next time, look for a rival with more recipes ready — the search can filter for that.'];
    } else if (r.status === 'raidSuccessful') {
      stamp = { text: n ? 'Recipes copied' : 'Close call', tone: n ? 'bad' : 'info' };
      steps = n ? [`${ch.guest.name}’s crew stayed through service and copied ${recipes} from us.`, 'Soft-Serve Machines keep our reputation up, so copying takes longer. More staff covering the Manager helps too.']
        : [`${ch.guest.name}’s crew stayed through service, but there was nothing for them to copy.`, 'Our recipe box was empty — lucky us.'];
    } else if (r.status === 'attackerDefeated' && guest) {
      stamp = { text: 'Party’s over', tone: 'bad' };
      steps = [`Their staff at ${ch.restaurantName} fully satisfied our Food Critic, so the whole crew had to go home.`, 'No recipes this time. Hire a few more grumpy customers — and cover our Manager — before we try again.'];
    } else if (r.status === 'attackerDefeated') {
      stamp = { text: 'Five stars!', tone: 'good' };
      steps = [`We satisfied ${ch.guest.name}’s Food Critic and the whole party went home happy!`, 'Every one of our recipes is safe.'];
    } else {
      steps = [r.text || 'The crew headed home.'];
    }
    const story = () => this.story(steps, { title: { raidSuccessful: guest ? 'Back from service' : 'They’ve left', attackerDefeated: guest ? 'Sent home' : 'Party over!', attackerRetreated: 'Crew headed home' }[r.status] || CHALLENGE_STATUS[r.status] || 'Service over', tone: r.tone, onDone: done });
    if (stamp) this.stampBanner(stamp, story); else story();
  }

  /** A rubber stamp slammed across the screen; tap (or wait) to continue. */
  stampBanner({ text, tone }, then) {
    const el = h('div', { class: `stamp-back ${tone}`, role: 'alert', tabindex: '-1' }, h('div', { class: 'stamp' }, text), h('small', {}, 'Tap to continue'));
    let gone = false;
    const go = () => { if (gone) return; gone = true; el.remove(); then?.(); };
    el.addEventListener('click', go);
    el.addEventListener('keydown', go);
    this.ui.appendChild(el);
    el.focus();
    setTimeout(go, 3200);
  }

  /** The Manager talks you through something, one bubble at a time. */
  story(lines, { title, tone, onDone }) {
    const s = this.svc.state, mgr = this.svc.manager();
    const img = mgr ? Panels.face(this, mgr, s.types.get(mgr.typeId)) : Panels.ownerFace(this, s.me.id || 'me', s.me.species);
    const back = h('div', { class: 'modal-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    let i = 0;
    const show = () => {
      const last = i === lines.length - 1;
      clear(back).append(h('div', { class: `modal story ${tone || ''}` },
        h('h2', {}, title),
        h('div', { class: 'story-line' }, h('img', { src: img, alt: '' }), h('div', { class: 'bubble', 'aria-live': 'polite' }, lines[i])),
        h('div', { class: 'story-dots', 'aria-hidden': 'true' }, ...lines.map((_, k) => h('i', { class: k === i ? 'on' : '' }))),
        h('button', { class: 'btn', onclick: () => { if (last) { back.remove(); onDone?.(); } else { i++; show(); } } }, last ? 'Back to my restaurant' : 'Next', last ? null : icon('next'))));
      back.querySelector('button')?.focus();
    };
    this.ui.appendChild(back);
    show();
  }

  /* ── peeking & town ───────────────────────────────────────────────────── */

  /**
   * Visit someone's restaurant: a cozy iris wipe closes (on the doorway, when
   * you walked in from town) while the restaurant loads, then opens on its
   * dining room as you walk in through the front door.
   */
  async peek(playerId, rival = false, from = null, at = null) {
    if (this.peeking) return;
    this.peeking = true;
    this.closeSheet();
    const back = from || (this.view === 'town' ? 'town' : 'home');
    try {
      if (playerId === this.svc.state.me.id) {
        await this.iris('close', at);
        this.setView('home');
        await this.iris('open');
        return;
      }
      const closing = this.iris('close', at);
      let p = null, err = null;
      try { p = await this.svc.peekRestaurant(playerId); } catch (e) { err = e; }
      await closing;
      if (!p) {
        if (back === 'town' && this.view === 'town') this.townScene?.exitLot(playerId);
        await this.iris('open');
        this.announce({ text: err ? this.svc.friendlyError(err) : 'Couldn’t find that restaurant.', tone: 'bad' });
        return;
      }
      const sc = new RestaurantScene({ name: p.restaurantName, ownerId: p.player.id, mode: 'peek' });
      sc.sync(p.structs, { types: this.svc.state.types, ownerSpecies: p.player.species, crewAway: false, jobs: new Map() });
      sc.addEventListener('select', (e) => this.onSelect(e.detail.id));
      const member = (this.rivals || []).find((r) => r.id === playerId) || (rival ? { id: playerId, restaurantName: p.restaurantName, name: p.player.name } : null);
      this.peekingId = playerId;
      this.setView('peek', { scene: sc, structs: p.structs, title: p.restaurantName, rival, member, from: back });
      // You, walking in through their front door.
      const me = this.svc.state.me;
      sc.visitorArrives({ species: me.species, outfit: ownerOutfit(awningFor(me.id || 'me')[0]), seed: me.id || 'me' });
      await this.iris('open');
    } finally { this.peeking = false; }
  }

  /** Leave a restaurant you're visiting: wipe back to where you came from, stepping out of its door in town. */
  async leavePeek(opts) {
    if (this.peeking) return;
    this.peeking = true;
    try {
      await this.iris('close');
      const id = this.peekingId;
      this.setView(opts.from || 'home');
      if ((opts.from || 'home') === 'town') { await this.townReady; this.townScene?.exitLot(id); }
      await this.iris('open');
    } finally { this.peeking = false; }
  }

  /**
   * The scene-change wipe: a circle closing to (x, y) or opening from the
   * middle, like the end of an old cartoon. A plain fade with reduced motion.
   */
  iris(dir, at = null) {
    return new Promise((resolve) => {
      let el = this.irisEl;
      if (!el) { el = this.irisEl = h('div', { class: 'iris', 'aria-hidden': 'true' }); document.body.appendChild(el); }
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const W = window.innerWidth, H = window.innerHeight;
      const x = at && Number.isFinite(at.x) ? at.x : W / 2, y = at && Number.isFinite(at.y) ? at.y : H / 2;
      const full = 2 * Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 40;
      el.classList.toggle('fade', reduce);
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      el.hidden = false;
      const ms = reduce ? 250 : dir === 'close' ? 520 : 600;
      el.style.transition = 'none';
      if (reduce) el.style.opacity = dir === 'close' ? '0' : '1';
      else el.style.width = el.style.height = `${dir === 'close' ? full : 0}px`;
      void el.offsetWidth;
      el.style.transition = '';
      if (reduce) el.style.opacity = dir === 'close' ? '1' : '0';
      else el.style.width = el.style.height = `${dir === 'close' ? 0 : full}px`;
      setTimeout(() => { if (dir === 'open') el.hidden = true; resolve(); }, ms + 30);
    });
  }


  async enterTown() {
    const s = this.svc.state;
    let g = { group: null, members: [] };
    try { g = await this.svc.getGroup(); } catch (e) { this.announce({ text: 'Couldn’t load your restaurant group.', tone: 'bad' }); }
    if (!this.townScene) {
      this.townScene = new TownScene({ me: { id: s.me.id || 'me', name: s.me.name, species: s.me.species }, group: g.group });
      this.townScene.addEventListener('peek', (e) => this.peek(e.detail.playerId, e.detail.rival, 'town', e.detail.at));
      this.townScene.hangout = this.hangout;
    }
    // Members between restaurants (no planet) have no lot in town; they're still in Group › Members.
    this.townScene.setMembers(g.members.filter((m) => m.isMe || m.planetId));
    // Across the bridge: other groups only (the search can include our own members).
    const ours = new Set(g.members.map((m) => m.id));
    try { this.townScene.setRivals((await this.svc.findRivals('')).filter((r) => !ours.has(r.id))); } catch (e) { /* rivals optional */ }
    this.engine.setScene(this.townScene);
    if (this.hangout) this.townScene.setPeers([...this.hangout.peers.values()]);
    this.renderTownUi(g);
    // Guild chat lives in the town: sign in to it the first time you come here.
    this.startMatrixChat();
  }

  renderTownUi(g) {
    clear(this.overlay);
    const log = h('div', { class: 'log', 'aria-live': 'polite' });
    const input = h('input', { id: 'chat-input', placeholder: 'Say something to the group…', maxlength: '240', autocomplete: 'off', 'aria-label': 'Chat message' });
    const form = h('form', { onsubmit: (e) => { e.preventDefault(); this.sayInTown(input.value); input.value = ''; } }, input, h('button', { class: 'btn small sea', type: 'submit' }, 'Send'));
    this.onlineEl = h('span', { class: 'online' });
    const narrow = window.innerWidth < 720;
    const chat = h('section', { class: `chat ${narrow ? 'min' : ''}`, 'aria-label': 'Group chat' });
    this.chatTitle = h('span', {}, `${g.group?.name || 'Group'} chat`);
    this.chatGroupName = g.group?.name || 'Group';
    const head = h('button', { class: 'chat-head', 'aria-expanded': narrow ? 'false' : 'true', onclick: () => { const min = chat.classList.toggle('min'); head.setAttribute('aria-expanded', min ? 'false' : 'true'); } }, icon('chat'), this.chatTitle, this.onlineEl);
    chat.append(head, log, form);
    this.chatLog = log;
    const past = this.matrix?.live ? this.matrix.history : (this.hangout?.history || []);
    for (const m of past) this.appendChat(m);
    if (!this.matrix?.live && this.chatNoteText) this.chatLog.appendChild(h('div', { class: 'msg sys' }, this.chatNoteText));
    this.updateChatTitle();
    this.overlay.append(
      h('div', { class: 'town-hint' }, h('kbd', {}, 'WASD'), ' or click to walk · ', h('kbd', {}, 'E'), ' to peek inside · ', h('kbd', {}, 'Space'), ' to wave'),
      chat);
    this.updateOnline();
  }

  /** A quiet line in the town chat (never a pop-up over the restaurant). */
  chatNote(text) {
    this.chatNoteText = text;
    if (!this.chatLog) return;
    this.chatLog.appendChild(h('div', { class: 'msg sys' }, text));
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  appendChat(m) {
    if (!this.chatLog) return;
    const me = m.from === this.svc.state.me.id;
    this.chatLog.appendChild(h('div', { class: `msg ${me ? 'me' : ''}` }, h('b', {}, m.name || (me ? this.svc.state.me.name : 'Someone')), m.text));
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  updateOnline() {
    if (!this.onlineEl || !this.hangout) return;
    const n = this.hangout.peers.size + 1;
    this.onlineEl.textContent = `${n} in town`;
  }

  /** Town chat goes to the guild's Matrix room when we're signed in to it. */
  sayInTown(text) {
    if (this.matrix?.live) this.matrix.say(text, this.svc.state.me.name);
    else this.hangout?.say(text);
  }

  updateChatTitle() {
    if (!this.chatTitle) return;
    const live = this.matrix?.live;
    this.chatTitle.textContent = live ? `${this.matrix.roomName || this.chatGroupName} · group chat` : `${this.chatGroupName} chat`;
    this.chatTitle.title = live ? 'Messages go to your restaurant group’s chat room' : 'Town square chat';
  }

  /** Live only: sign in to the guild's Matrix chat; the town square keeps presence. */
  async startMatrixChat() {
    if (this.svc?.mode !== 'live' || this.matrix || this.matrixStarting || Date.now() < (this.matrixRetryAt || 0)) return;
    this.matrixStarting = true;
    const s = this.svc.state;
    try {
      const { homeserver, session } = await this.svc.chatSignIn();
      const chat = new this.liveMod.MatrixChat({ homeserver, session, selfId: s.me.id, room: this.svc.guild?.matrixRoom || null, guild: { id: s.me.guildId, name: s.me.guildName } });
      chat.addEventListener('chat', (e) => { this.appendChat(e.detail); this.townScene?.chat(e.detail); if (this.view === 'town' && e.detail.from !== s.me.id) sfx.chat(); });
      chat.addEventListener('status', (e) => {
        this.updateChatTitle();
        if (e.detail.ended) { this.chatNote(e.detail.message); this.matrix = null; }
      });
      chat.addEventListener('error', (e) => this.chatNote(e.detail.message));
      await chat.start();
      this.matrix = chat;
      // Replace the square's local chat with the room's history.
      if (this.chatLog) { clear(this.chatLog); for (const m of chat.history) this.appendChat(m); }
      this.chatNoteText = null;
      this.updateChatTitle();
    } catch (e) {
      console.warn('[chat]', e);
      this.matrixRetryAt = Date.now() + 5 * 60000;   // try again on a later visit, not every time
      this.chatNote(`Group chat isn’t available (${e.message || e}), so you’re chatting in the town square.`);
    } finally { this.matrixStarting = false; }
  }

  startHangout() {
    const s = this.svc.state;
    this.hangout?.stop();
    const room = `group:${s.me.guildId || 'none'}`;
    const make = async () => {
      let bots = [];
      if (this.svc.mode === 'demo') { try { bots = botsFromMembers((await this.svc.getGroup()).members); } catch (e) { bots = []; } }
      this.hangout = new Hangout({ url: this.hangoutUrl, room, me: { id: s.me.id || 'me', name: s.me.name, species: s.me.species, restaurant: s.restaurant.name }, bots });
      this.hangout.addEventListener('presence', (e) => { this.townScene?.setPeers(e.detail.peers); this.updateOnline(); });
      this.hangout.addEventListener('move', (e) => this.townScene?.peerMoved(e.detail));
      this.hangout.addEventListener('chat', (e) => { this.appendChat(e.detail); this.townScene?.chat(e.detail); if (this.view === 'town' && e.detail.from !== s.me.id) sfx.chat(); });
      this.hangout.start();
      if (this.townScene) this.townScene.hangout = this.hangout;
    };
    make();
  }

  /* ── misc ─────────────────────────────────────────────────────────────── */

  async setProfile(p) {
    const s = this.svc.state;
    if (p.species) { s.me.species = p.species; this.prefs.species = p.species; }
    if (p.name != null && p.name.trim() !== s.me.name) {
      // The owner name is the player's name on chain, so it goes through the service.
      try { await this.svc.rename(p.name); } catch (e) { sfx.complain(); this.announce({ text: this.svc.friendlyError(e), tone: 'bad' }); return; }
      this.prefs.name = s.me.name;
    }
    this.savePrefs();
    this.svc.save?.();
    this.hangout?.setMe({ name: s.me.name, species: s.me.species });
    this.hangout?.announce('here');
    if (this.townScene) { this.townScene.dispose(); this.townScene = null; }
    this.homeScene = this.makeHomeScene();
    if (this.view === 'home') this.setView('home', { force: true });
    this.openSheet('settings');
    this.renderHud();
  }

  /** After an on-chain rename: tell the town and redraw the HUD. */
  afterRename() {
    const s = this.svc.state;
    this.hangout?.setMe({ name: s.me.name, species: s.me.species });
    this.hangout?.announce('here');
    if (this.townScene) { this.townScene.dispose(); this.townScene = null; }
    this.renderHud();
  }

  sfxPing() { sfx.alarm(); }

  /** Demo: back to the title (asks first mid-challenge, since leaving forfeits). */
  leaveDemo() {
    const st = this.svc.state;
    if (st.challenge?.status === 'ongoing') {
      return this.confirm('Leave mid-challenge?', st.challenge.role === 'defender' ? 'Leaving now forfeits the challenge: their crew copies your recipes.' : 'Leaving now forfeits the challenge: your crew comes home empty-handed.', 'Leave anyway', () => this.backToTitle());
    }
    this.backToTitle();
  }

  /**
   * Live sign-out, with the webapp's two warnings: gold sitting on this key
   * (only the main key's gold is the restaurant's), and being the last key
   * that can manage keys.
   */
  async signOutFlow() {
    let w = { assets: 0, onlyManager: false, primary: true };
    try { w = await this.svc.signOutWarnings(); } catch (e) { console.warn('[signout]', e); }
    const go = () => this.confirm('Sign out on this browser?',
      w.primary ? 'You’ll need your recovery phrase, or a key code from another device, to sign back in here.'
        : 'This browser’s key is handed back, so it can’t be used again. To come back, use a key code from another device or your recovery phrase.',
      'Sign out', () => this.backToTitle());
    const steps = [];
    if (w.assets > 0) steps.push(['Gold on this key', `This browser’s key holds ${gold(w.assets)} gold of its own. After you sign out it stays at that key’s address, out of reach from here. Send it to your restaurant first if you need it.`]);
    if (w.onlyManager) steps.push(['Last key that manages keys', 'No other device can cut keys or take them back. After you sign out, only your recovery phrase can do that.']);
    const next = () => { const st = steps.shift(); if (!st) return go(); this.modal(icon('info', 'big-icon'), st[0], st[1], [['Sign out anyway', next, 'berry'], ['Never mind', null]]); };
    next();
  }

  /**
   * Continue → Use a key code: sign in on this browser without the recovery
   * phrase. Pick the group, type the code from another device, confirm it's
   * your restaurant, then wait for that device to approve this one.
   */
  async keyCodeSignIn() {
    const mod = await this.loadLiveModule();
    if (!mod) return;
    const guild = this.sameOriginGuild() ? null : await this.pickGuild(mod, { action: 'Use this group', title: 'Which group is your restaurant in?', blurb: 'Key codes work in the group that made them.' });
    if (!this.sameOriginGuild() && !guild) return this.showContinue();
    this.titleSay('Ringing the restaurant group…', loading(`Connecting to ${guild?.name || 'the restaurant group'}.`));
    let signedIn;
    try { signedIn = await this.connectLive(mod, guild); } catch (e) { return this.liveFailed(e, () => this.showContinue()); }
    if (signedIn) { this.applyProfile(); return this.enterGame(); }
    const svc = this.svc;
    const askCode = (error = '', value = '') => {
      const inp = h('input', { id: 'key-code', value, placeholder: 'e.g. 4F7KQ2', autocomplete: 'one-time-code', autocapitalize: 'characters', spellcheck: 'false', class: 'code-input' });
      const err = h('div', { class: 'note warn', hidden: !error }, error);
      const go = h('button', { class: 'btn wide', type: 'submit' }, 'Find my restaurant');
      this.titleSay('Use a key code',
        h('ol', { class: 'steps' },
          h('li', {}, 'On a device that’s already signed in, open ', h('b', {}, 'Office → Key ring'), '.'),
          h('li', {}, 'Tap ', h('b', {}, 'Cut a new key'), ' and type the code it shows here.')),
        h('form', { class: 'field', onsubmit: async (e) => {
          e.preventDefault();
          go.disabled = true; go.textContent = 'Looking it up…'; err.hidden = true;
          try { confirmOwner(await svc.lookupKeyCode(inp.value)); } catch (x) { askCode(svc.friendlyError(x), inp.value); }
        } }, h('label', { for: 'key-code' }, 'Key code'), inp, err, go),
        h('button', { class: 'btn wide ghost', onclick: () => location.reload() }, 'Back'));
      inp.focus({ preventScroll: true });
    };
    const confirmOwner = (owner) => {
      this.titleSay('Is this your restaurant?',
        h('div', { class: 'owner-confirm' }, h('img', { src: Panels.ownerFace(this, owner.playerId, owner.species), alt: '' }),
          h('div', {}, h('b', {}, owner.tag ? `[${owner.tag}] ${owner.name}` : owner.name), h('small', {}, `Owner #${owner.playerId} · ${guild?.name || 'this group'}`))),
        h('button', { class: 'btn wide', onclick: () => request(owner) }, 'Yes, that’s me'),
        h('button', { class: 'btn wide ghost', onclick: () => askCode('', '') }, 'No, that’s not me'));
    };
    const request = async (owner) => {
      this.titleSay('Asking for a key…', loading('Sending the request.'));
      let req;
      try { req = await svc.requestKey(owner); } catch (e) { return askCode(svc.friendlyError(e)); }
      this.titleSay('Waiting for approval',
        h('div', { class: 'owner-confirm' }, keyFob(req.address, 'big'), h('div', {}, h('b', {}, 'This browser’s new key'), h('small', {}, 'Check it matches the one on your other device.'))),
        h('p', { style: { textAlign: 'center', margin: 0 } }, 'Approve the request on your other device. You can choose there what this key may do.'),
        loading('Waiting for your other device…'),
        h('button', { class: 'btn wide ghost', onclick: () => { req.approved.cancel(); location.reload(); } }, 'Cancel'));
      try { await req.approved; } catch (e) {
        if (/cancel/.test(e.message)) return;
        return this.titleSay('The key didn’t arrive', h('div', { class: 'note warn' }, svc.friendlyError(e)), h('button', { class: 'btn wide ghost', onclick: () => location.reload() }, 'Start again'));
      }
      sfx.hire();
      this.titleSay('Key received!', loading('Signing you in…'));
      try { await svc.completeKeySignIn(owner); this.applyProfile(); this.enterGame(); } catch (e) {
        console.error(e);
        this.titleSay('That didn’t work', h('div', { class: 'note warn' }, svc.friendlyError(e)), h('button', { class: 'btn wide ghost', onclick: () => location.reload() }, 'Try again'));
      }
    };
    askCode();
  }

  toggleSound() {
    this.prefs.sound = this.prefs.sound === false;
    sfx.setEnabled(this.prefs.sound !== false);
    this.savePrefs();
    this.openSheet('settings');
  }

  /** Which music plays: { mode: 'scene' | 'shuffle' | 'one', song }. */
  setMusicChoice(choice) {
    music.setChoice({ ...music.choice, ...choice });
    this.prefs.music = music.choice;
    this.savePrefs();
    this.openSheet('settings');
  }

  /** Music / ambience / effects level, 0..1. */
  setVolume(name, v) {
    sfx.setVolume(name, v);
    this.prefs.volume = { ...(this.prefs.volume || {}), [name]: sfx.volume(name) };
    this.savePrefs();
  }

  modal(iconEl, title, text, buttons) {
    const back = h('div', { class: 'modal-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    const close = () => back.remove();
    back.appendChild(h('div', { class: 'modal' }, iconEl, h('h2', {}, title), h('p', {}, text),
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } },
        ...buttons.map(([label, fn, cls], i) => h('button', { class: `btn ${cls || (i ? 'ghost' : '')}`, onclick: () => { close(); fn?.(); } }, label)))));
    this.ui.appendChild(back);
    back.querySelector('button')?.focus();
  }

  confirm(title, text, yes, fn) { this.modal(icon('info', 'big-icon'), title, text, [[yes, fn, 'berry'], ['Never mind', null]]); }

  backToTitle() {
    if (this.svc?.mode === 'live') { Promise.resolve(this.matrix?.stop()).finally(() => this.svc.signOut()); return; }
    clearInterval(this.hudTimer);
    this.svc?.stop();
    this.hangout?.stop(); this.hangout = null;
    this.townScene?.dispose(); this.townScene = null;
    this.challengeScene?.dispose(); this.challengeScene = null;
    this.svc = null; this.hudTop = null; this.dock = null; this.sheet = null; this.sheetEl = null; this.guide = null;
    this.showTitle();
  }
}
