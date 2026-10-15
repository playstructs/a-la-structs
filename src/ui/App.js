/**
 * À la Structs — the app shell. Owns the 3D engine, the active backend
 * (demo kitchen or live guild), the scenes, the HUD and the sheets, and
 * routes clicks into game actions.
 */
import { Engine } from '../three/Engine.js';
import { RestaurantScene } from '../three/scenes/RestaurantScene.js';
import { ChallengeScene } from '../three/scenes/ChallengeScene.js';
import { TownScene } from '../three/scenes/TownScene.js';
import { portrait } from '../three/portraits.js';
import { DemoService } from '../services/DemoService.js';
import { Hangout, botsFromMembers } from '../services/Hangout.js';
import { h, clear, icon, holdFocus } from './dom.js';
import * as Panels from './panels.js';
import { sfx } from '../audio/sfx.js';
import { BRAND, TERMS, ACTIONS, CHALLENGE_STATUS } from '../lexicon/terms.js';
import { roleOf } from '../lexicon/roles.js';
import { AREAS } from '../lexicon/areas.js';
import { nameFor, SPECIES, SPECIES_NAMES, speciesFor } from '../lexicon/names.js';
import { is, isCommand, cash, gold, weaponField } from '../game/model.js';
import { OUTFITS } from '../three/outfits.js';

const PREFS_KEY = 'aLaStructs.prefs.v1';
const OLD_PREFS_KEY = 'pawsAndPlates.prefs.v1';   // before the rename; moved over once

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
    window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const pop = [...this.ui.querySelectorAll('.modal-back')].pop();
      if (pop) [...pop.querySelectorAll('.modal button')].pop()?.click();
      else if (this.targeting) this.endTargeting();
      else this.closeSheet();
    });
    this.showTitle();
  }

  /* ── title screen ─────────────────────────────────────────────────────── */

  showTitle() {
    this.view = 'title';
    clear(this.ui);
    // A live restaurant behind the menu.
    const preview = new DemoService({ tickMs: 999999 });
    preview.fresh(); preview.recompute();
    this.previewScene = new RestaurantScene({ name: BRAND.name, ownerId: 'title' });
    this.previewScene.sync([...preview.state.structs.values()], { types: preview.state.types, ownerSpecies: this.prefs.species || 'cat', crewAway: false, jobs: new Map() });
    this.engine.setScene(this.previewScene);
    this.engine.controls.autoRotate = true;
    this.engine.controls.autoRotateSpeed = 0.35;

    const st = { mode: 'demo', species: this.prefs.species || 'cat', name: this.prefs.name || '', restaurant: this.prefs.restaurant || '' };
    const card = h('div', { class: 'title-card' });
    const wrap = h('div', { class: 'title' }, card);
    this.ui.appendChild(wrap);

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
      const nameIn = h('input', { id: 'owner-name', value: st.name, placeholder: 'Your name', maxlength: '24', oninput: (e) => { st.name = e.target.value; } });
      const restIn = h('input', { id: 'rest-name', value: st.restaurant, placeholder: 'The Cozy Spoon Bistro', maxlength: '32', oninput: (e) => { st.restaurant = e.target.value; } });
      card.append(h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', { for: 'owner-name' }, 'Owner name'), nameIn),
        h('div', { class: 'field' }, h('label', { for: 'rest-name' }, 'Restaurant name'), restIn)));
      const liveOk = this.flavor === 'full' && this.loadLive;
      card.append(h('div', { class: 'mode-cards' },
        h('button', { class: `mode-card ${st.mode === 'demo' ? 'on' : ''}`, onclick: () => { st.mode = 'demo'; render(); } }, h('b', {}, 'Demo kitchen'), h('small', {}, 'Plays offline against computer rivals, with the real combat rules.')),
        h('button', { class: `mode-card ${st.mode === 'live' ? 'on' : ''}`, disabled: !liveOk, onclick: () => { st.mode = 'live'; render(); } }, h('b', {}, 'Open for real'), h('small', {}, liveOk ? 'Join a Structs guild and take on real players.' : 'Run À la Structs on your machine to connect to a guild.'))));
      card.append(h('button', { class: 'btn wide', onclick: () => this.start(st) }, st.mode === 'demo' ? 'Open the doors' : 'Connect to the guild'));
      restore();
    };
    render();
  }

  async start(st) {
    sfx.unlock(); sfx.open();
    this.prefs.species = st.species; this.prefs.name = st.name.trim(); this.prefs.restaurant = st.restaurant.trim();
    this.savePrefs();
    this.engine.controls.autoRotate = false;
    if (st.mode === 'live') return this.startLive(st);
    const svc = new DemoService({
      tickMs: this.prefs.tickMs || 3000, difficulty: this.prefs.difficulty || 'easy', rivalsMayChallenge: this.prefs.rivalsMayChallenge ?? true,
      profile: { name: this.prefs.name || 'You', species: st.species, restaurantName: this.prefs.restaurant || undefined },
      firstIncoming: /rush/.test(location.hash) ? 6 : undefined,
    });
    await this.useService(svc);
    await svc.start();
    if (this.prefs.restaurant) svc.state.restaurant.name = this.prefs.restaurant;
    this.enterGame();
  }

  /* ── live guild login ─────────────────────────────────────────────────── */

  async startLive(st) {
    clear(this.ui);
    const card = h('div', { class: 'title-card' });
    this.ui.appendChild(h('div', { class: 'title' }, card));
    const say = (title, ...rest) => { clear(card); card.append(h('div', { class: 'logo' }, h('h1', { style: { fontSize: '2rem' } }, title)), ...rest); };
    say('Ringing the guild…', h('p', { style: { textAlign: 'center' } }, 'Connecting to the guild’s kitchen.'));
    let svc, mod;
    try { mod = await this.loadLive(); } catch (e) {
      console.error(e);
      return say('Couldn’t load the guild client', h('div', { class: 'note warn' }, String(e.message || e)), h('button', { class: 'btn wide ghost', onclick: () => this.showTitle() }, 'Back'));
    }
    // Same-origin mode (GUILD_URL proxy, or served by the guild itself) skips the picker.
    const sameOrigin = !!((import.meta.env || {}).VITE_GUILD_PROXY);
    const guild = sameOrigin ? null : await this.pickGuild(mod, say);
    if (!sameOrigin && !guild) return this.showTitle();
    say('Ringing the guild…', h('p', { style: { textAlign: 'center' } }, `Connecting to ${guild?.name || 'the guild'}’s kitchen.`));
    try {
      svc = new mod.LiveService({ workerUrl: mod.workerUrl, guild });
      this.liveMod = mod;
      await this.useService(svc);
      const signedIn = await svc.start();
      if (signedIn) { this.applyProfile(); return this.enterGame(); }
    } catch (e) {
      console.error(e);
      const hint = sameOrigin ? 'Check that the guild in GUILD_URL is running (see README).' : 'The guild’s services may be down, or may not accept requests from this page (CORS).';
      return say('Couldn’t reach the guild', h('div', { class: 'note warn' }, `${e.message || e}. ${hint}`), h('button', { class: 'btn wide ghost', onclick: () => location.reload() }, 'Back'));
    }
    const guildName = svc.state.guildInfo?.name || 'this guild';
    const choose = () => say(`Welcome to ${guildName}`,
      h('p', { style: { textAlign: 'center', margin: 0 } }, 'Is this your first restaurant here?'),
      h('div', { class: 'mode-cards' },
        h('button', { class: 'mode-card', onclick: () => fresh() }, h('b', {}, 'I’m new'), h('small', {}, 'Open your first restaurant. You’ll get a recovery phrase to keep.')),
        h('button', { class: 'mode-card', onclick: () => recover() }, h('b', {}, 'I already play'), h('small', {}, 'Sign in on this device with your recovery phrase.'))),
      h('button', { class: 'btn wide ghost', onclick: () => this.showTitle() }, 'Back'));
    const fresh = () => {
      const phrase = svc.newRecoveryPhrase();
      const copy = h('button', { class: 'btn small ghost', onclick: () => { navigator.clipboard?.writeText(phrase).then(() => { copy.textContent = 'Copied'; }, () => {}); } }, 'Copy');
      say('Your recovery phrase',
        h('div', { class: 'note warn' }, 'Write these words down somewhere safe. They are the only way back into your restaurant on another device. Nobody — including us — can recover them for you.'),
        h('div', { class: 'phrase' }, phrase), copy,
        h('button', { class: 'btn wide', onclick: async () => {
          say('Opening your restaurant…', h('p', { style: { textAlign: 'center' } }, 'Signing you up with the guild and scouting a location. This can take a minute.'));
          try { await svc.signUp(phrase, this.prefs.name); this.applyProfile(); this.enterGame(); } catch (e) { say('Sign-up didn’t go through', h('div', { class: 'note warn' }, e.message), h('button', { class: 'btn wide ghost', onclick: choose }, 'Back')); }
        } }, 'I’ve saved it — open my restaurant'));
    };
    const recover = () => {
      const ta = h('textarea', { id: 'phrase', placeholder: 'twelve or twenty-four words…', autocomplete: 'off', spellcheck: 'false' });
      say('Sign in',
        h('div', { class: 'field' }, h('label', { for: 'phrase' }, 'Recovery phrase'), ta, h('small', {}, 'This registers this browser as one of your devices. Your phrase never leaves this page.')),
        h('button', { class: 'btn wide', onclick: async () => {
          say('Checking your phrase…', h('p', { style: { textAlign: 'center' } }, 'Registering this device with the guild. Hang tight.'));
          try { await svc.recover(ta.value); this.applyProfile(); this.enterGame(); } catch (e) { say('That didn’t work', h('div', { class: 'note warn' }, e.message), h('button', { class: 'btn wide ghost', onclick: recover }, 'Try again')); }
        } }, 'Sign in'),
        h('button', { class: 'btn wide ghost', onclick: choose }, 'Back'));
    };
    choose();
  }

  /**
   * Choose a guild by id. Its services come from the guild's own published
   * config (on-chain record → endpoint → services), not from this app.
   * Resolves to the resolved guild, or null on Back.
   */
  pickGuild(mod, say) {
    const env = import.meta.env || {};
    const last = mod.lastGuild();
    let chosen = this.prefs.guildId || last?.id || env.VITE_GUILD_ID || '0-1';
    return new Promise((resolve) => {
      const input = h('input', { id: 'guild-id', value: chosen, placeholder: '0-1', autocomplete: 'off', spellcheck: 'false', oninput: (e) => { chosen = e.target.value.trim(); } });
      const list = h('div', { class: 'guild-list', role: 'listbox', 'aria-label': 'Guilds on the chain' }, h('small', {}, 'Looking up guilds on the chain…'));
      const err = h('div', { class: 'note warn', hidden: true });
      const go = h('button', { class: 'btn wide', onclick: async () => {
        if (!chosen) return;
        go.disabled = true; go.textContent = 'Reading the guild’s config…'; err.hidden = true;
        try {
          const g = await mod.resolveGuild(chosen, mod.DEFAULT_REACTOR);
          this.prefs.guildId = g.id; this.savePrefs();
          resolve(g);
        } catch (e) {
          err.textContent = e.message || String(e); err.hidden = false;
          go.disabled = false; go.textContent = 'Connect';
        }
      } }, 'Connect');
      say('Pick your restaurant group',
        h('p', { style: { textAlign: 'center', margin: 0 } }, 'Every Structs guild publishes where its services live. Choose one and we’ll read it from there.'),
        h('div', { class: 'field' }, h('label', { for: 'guild-id' }, 'Guild id'), input),
        list, err, go,
        h('button', { class: 'btn wide ghost', onclick: () => resolve(null) }, 'Back'));
      mod.browsableGuilds(mod.DEFAULT_REACTOR).then((rows) => {
        clear(list);
        if (!rows.length) { list.append(h('small', {}, 'No guilds found on the chain.')); return; }
        for (const r of rows) {
          list.append(h('button', {
            class: `guild-row ${r.id === chosen ? 'on' : ''}`, role: 'option', 'aria-selected': r.id === chosen ? 'true' : 'false', disabled: !r.ok, title: r.ok ? (r.description || r.name) : r.why,
            onclick: () => { chosen = r.id; input.value = r.id; list.querySelectorAll('.guild-row').forEach((b) => { const on = b.dataset.id === r.id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }); },
            'data-id': r.id,
          }, h('b', {}, r.name), h('small', {}, [r.id, r.tag && `[${r.tag}]`, r.why].filter(Boolean).join(' · '))));
        }
      }, (e) => { clear(list); list.append(h('small', {}, `Couldn’t list guilds (${e.message || e}). You can still type an id.`)); });
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
  }

  /* ── main game ────────────────────────────────────────────────────────── */

  enterGame() {
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
    if (!this.prefs.welcomed) {
      this.prefs.welcomed = true; this.savePrefs();
      this.modal(icon('store', 'big-icon'), `Welcome to ${this.svc.state.restaurant.name}!`,
        `Your crew is already at work. Tap anyone (or open Staff) to see what they do. Hire more help, keep your Chef discovering recipes and your Sous Chef turning them into gold — and when you’re ready, send your crew across town for a service challenge. Rival crews drop in too: practise defending from Rivals, or turn visits off in Settings.`,
        [['Let’s cook', null]]);
    }
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
      this.enterTown();
    } else if (view === 'peek') {
      this.engine.setScene(opts.scene);
      this.readOnly = true;
      this.peekStructs = new Map(opts.structs.map((x) => [x.id, x]));
      this.overlay.appendChild(h('div', { class: 'peek-banner' }, h('span', {}, opts.rival ? `Sizing up ${opts.title}` : `Visiting ${opts.title}`),
        opts.rival && opts.member ? h('button', { class: 'btn small berry', onclick: () => this.challenge(opts.member) }, 'Send the crew') : null,
        h('button', { class: 'btn small ghost', onclick: () => this.setView(opts.from || 'home') }, icon('back'), 'Leave')));
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
    if (this.sheet && (all || w.has('structs') || w.has('wallet') || w.has('challenge') || (w.has('tick') && this.sheet.kind === 'staff'))) this.refreshSheet();
    this.renderHud();
    this.renderDock();
  }

  challengeId(ch) { return `${ch.hostId}:${ch.guestId}:${ch.startedTick ?? ''}`; }

  onFx(ev) {
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

  renderHud() {
    if (!this.hudTop || !this.svc) return;
    const s = this.svc.state;
    const hustle = this.svc.hustle();
    const spare = this.svc.spareCash();
    const sinceTick = (Date.now() - s.lastTickAt) / s.tickMs;
    const pipsN = Math.min(10, hustle);
    const hustlePips = h('span', { class: 'hustle', 'aria-hidden': 'true' });
    for (let i = 0; i < 10; i++) hustlePips.appendChild(h('i', { class: i < pipsN ? 'on' : '' }));
    const ownerImg = Panels.ownerFace(this, s.me.id || 'me', s.me.species);
    const html = [
      h('div', { class: 'pill owner-pill' }, h('img', { src: ownerImg, alt: '' }), h('div', { class: 'who' }, h('b', {}, s.restaurant.name), h('small', {}, `${s.me.name}${s.me.guildName ? ` · ${s.me.guildName}` : ''}`)),
        h('span', { class: `mode-badge ${this.svc.mode}` }, this.svc.mode === 'demo' ? 'Demo' : 'Live')),
      h('div', { class: 'stats' },
        h('div', { class: 'pill stat', title: `${TERMS.charge}: builds up one point every tick. Every action spends it all.` }, icon('hustle'), h('span', { class: 'val' }, String(hustle)), hustlePips),
        h('div', { class: 'pill stat', title: `${TERMS.alpha}: invest it to bring in more cash.` }, icon('gold'), h('span', { class: 'val' }, gold(s.wallet.gold)), h('small', {}, 'gold')),
        h('div', { class: 'pill stat', title: `${TERMS.ore} ready to perfect, and ${TERMS.undiscoveredOre.toLowerCase()} still in this restaurant.` }, icon('recipe'), h('span', { class: 'val' }, String(s.wallet.recipes)), icon('mystery'), h('span', { class: 'val' }, String(s.restaurant.undiscovered))),
        h('div', { class: 'pill stat', title: `Spare cash per tick: ${TERMS.capacity.toLowerCase()} ${cash(s.wallet.takings)} minus ${TERMS.load.toLowerCase()} ${cash(s.wallet.payroll)}.` }, icon('cash'), h('span', { class: 'val', style: { color: spare < 0 ? 'var(--bad)' : '' } }, cash(spare)), h('small', {}, 'spare')),
        h('div', { class: 'pill stat clock-pill', title: `${TERMS.block} ${s.tick.toLocaleString('en-US')}` }, icon('clock'), h('span', { class: 'val' }, `${Math.max(0, Math.ceil((1 - Math.min(1, sinceTick)) * s.tickMs / 1000))}s`), h('small', {}, 'next tick')),
      ),
    ];
    clear(this.hudTop).append(...html);
  }

  renderDock() {
    if (!this.dock) return;
    const s = this.svc.state;
    const ch = s.challenge;
    const items = [
      ['home', 'store', 'Restaurant', () => this.setView('home')],
      ['hire', 'hire', 'Hire', () => this.openSheet('hire', this.lastHireSection || 'space')],
      ['roster', 'staff', 'Staff', () => this.openSheet('roster')],
      ['rivals', 'bell', 'Rivals', () => this.openSheet('rivals')],
      ['town', 'town', 'Town', () => this.setView('town')],
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
    this.toasts.push({ text, tone });
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
    if (kind === 'hire') this.lastHireSection = arg;
    this.sheet = { kind, arg };
    if (kind === 'rivals') {
      this.renderSheet(Panels.rivalsSheet(this, null, arg || ''));
      try { this.rivals = await this.svc.findRivals(arg || ''); } catch (e) { this.rivals = []; this.announce({ text: this.svc.friendlyError(e), tone: 'bad' }); }
      if (this.sheet?.kind === 'rivals') this.renderSheet(Panels.rivalsSheet(this, this.rivals, arg || ''));
    } else this.refreshSheet();
    this.renderDock();
  }

  refreshSheet() {
    if (!this.sheet) return;
    const { kind, arg } = this.sheet;
    let content;
    if (kind === 'staff') content = Panels.staffSheet(this, arg);
    else if (kind === 'hire') content = Panels.hireSheet(this, arg);
    else if (kind === 'roster') content = Panels.rosterSheet(this);
    else if (kind === 'settings') { if (document.activeElement?.closest?.('.sheet')) return; content = Panels.settingsSheet(this); }
    else if (kind === 'notebook') content = Panels.notebookSheet(this);
    else if (kind === 'rivals') { if (document.activeElement?.id === 'rival-search') return; content = Panels.rivalsSheet(this, this.rivals, arg || ''); }
    if (content) this.renderSheet(content);
  }

  renderSheet({ title, body, foot }) {
    const scroll = this.sheetEl?.querySelector('.body')?.scrollTop || 0;
    const restore = holdFocus(this.sheetEl);
    const same = this.sheetEl && this.sheetEl.dataset.kind === this.sheet.kind && this.sheetEl.dataset.arg === String(this.sheet.arg ?? '');
    this.sheetEl?.remove();
    const el = h('section', { class: 'sheet', 'aria-label': title, 'data-kind': this.sheet.kind, 'data-arg': String(this.sheet.arg ?? '') },
      h('header', {}, h('h2', {}, title), h('button', { class: 'x', 'aria-label': 'Close', onclick: () => { sfx.close(); this.closeSheet(); } }, icon('close'))),
      h('div', { class: 'body' }, ...body),
      foot && foot.length ? h('div', { class: 'foot' }, ...foot) : null);
    if (same) el.style.animation = 'none';
    this.ui.appendChild(el);
    this.sheetEl = el;
    if (same) el.querySelector('.body').scrollTop = scroll;
    restore(el);
  }

  closeSheet() {
    this.sheetEl?.remove(); this.sheetEl = null; this.sheet = null;
    this.scene()?.select?.call(this.scene(), null);
    this.renderDock();
  }

  scene() { return this.view === 'challenge' ? this.challengeScene : this.view === 'home' ? this.homeScene : this.view === 'peek' ? this.engine.active : null; }

  /* ── selection & targeting ───────────────────────────────────────────── */

  onSelect(id) {
    if (!id) { if (this.sheet?.kind === 'staff') { this.sheetEl?.remove(); this.sheetEl = null; this.sheet = null; this.renderDock(); } return; }
    if (this.targeting) {
      const t = this.targeting;
      if (t.valid.has(id)) {
        this.endTargeting();
        if (t.kind === 'serve') this.act(() => this.svc.serve(t.sourceId, id, t.ws));
        else if (t.kind === 'cover') this.act(() => this.svc.cover(t.sourceId, id));
        sfx.pop();
        return;
      }
      if (id !== t.sourceId) { this.announce({ text: t.kind === 'serve' ? 'They can’t reach that one — pick a highlighted target.' : 'Pick a highlighted teammate in the same restaurant.', tone: 'bad' }); return; }
    }
    sfx.pop();
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
    const valid = new Set([...pool.values()].filter((x) => x.owner === s.me.id && x.id !== defenderId && !is.destroyed(x) && x.locationId === d.locationId).map((x) => x.id));
    if (!valid.size) { this.announce({ text: 'Nobody nearby to cover for.', tone: 'bad' }); return; }
    this.startTargeting({ kind: 'cover', sourceId: defenderId, valid, hint: `Who should ${nameFor(defenderId)} cover for?` });
  }

  startTargeting(t) {
    this.targeting = t;
    document.body.classList.add('targeting');
    this.closeSheetQuiet();
    this.hintEl?.remove();
    // Every valid target is also a button, so nobody has to find (or reach) it in the 3D room.
    const pool = this.view === 'challenge' && this.svc.state.challenge ? this.svc.state.challenge.structs : this.svc.state.structs;
    const targets = [...t.valid].map((id) => pool.get(id)).filter(Boolean).map((x) => {
      const need = t.kind === 'serve' ? (x.owner === this.svc.state.challenge?.guestId ? `${x.maxHealth - x.health}/${x.maxHealth} satisfied` : `${x.health}/${x.maxHealth} morale`) : '';
      return h('button', { class: 'chip-btn', onclick: () => this.onSelect(x.id) }, this.whoIs(x.id), need ? h('small', {}, ` · ${need}`) : null);
    });
    this.hintEl = h('div', { class: 'targeting-hint', role: 'dialog', 'aria-label': t.hint },
      h('span', {}, t.hint), h('button', { class: 'btn small ghost', onclick: () => this.endTargeting() }, 'Cancel'),
      h('div', { class: 'targets' }, ...targets));
    this.ui.appendChild(this.hintEl);
    this.hintEl.querySelector('.targets button')?.focus({ preventScroll: true });
    if (this.view === 'challenge') this.challengeScene.setTargeting({ attackerId: t.sourceId, valid: t.valid });
  }

  closeSheetQuiet() { this.sheetEl?.remove(); this.sheetEl = null; this.sheet = null; }

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
      this.closeSheet();
      if (id && this.view === 'home') setTimeout(() => this.homeScene.select(id), 250);
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
    this.overlay.append(
      h('div', { class: 'ch-banner', role: 'status' },
        h('div', { class: 'row' },
          h('h3', {}, icon('bell'), h('span', {}, guest ? `At ${ch.restaurantName}` : `${ch.guest.name}’s crew is dining here!`)),
          guest && ch.status === 'ongoing' ? h('button', { class: 'btn small ghost', onclick: () => this.act(() => this.svc.goHome()) }, 'Go home') : null,
          h('button', { class: 'btn small ghost', 'aria-label': 'How it works', onclick: () => { this.chHelp = !this.chHelp; this.renderChallengeHud(); } }, '?')),
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

  showChallengeResult(ch) {
    if (!ch?.result || !this.svc) return;
    const r = ch.result;
    const guest = ch.role === 'challenger';
    const title = { raidSuccessful: r.stolen ? (guest ? 'Recipes copied!' : 'They copied your recipes') : 'Nothing to copy', attackerDefeated: guest ? 'Your critic is satisfied' : 'Critic satisfied — party over!', attackerRetreated: 'Crew headed home' }[r.status] || CHALLENGE_STATUS[r.status] || 'Service over';
    this.modal(icon(r.tone === 'good' ? 'sparkle' : r.tone === 'bad' ? 'grumble' : 'door', 'big-icon'), title, r.text, [['Back to my restaurant', () => { this.svc.dismissChallenge?.(); this.setView('home'); }]]);
  }

  /* ── peeking & town ───────────────────────────────────────────────────── */

  async peek(playerId, rival = false, from = null) {
    this.closeSheet();
    if (playerId === this.svc.state.me.id) return this.setView('home');
    try {
      const p = await this.svc.peekRestaurant(playerId);
      if (!p) throw new Error('Couldn’t find that restaurant.');
      const sc = new RestaurantScene({ name: p.restaurantName, ownerId: p.player.id, mode: 'peek' });
      sc.sync(p.structs, { types: this.svc.state.types, ownerSpecies: p.player.species, crewAway: false, jobs: new Map() });
      sc.addEventListener('select', (e) => this.onSelect(e.detail.id));
      const member = (this.rivals || []).find((r) => r.id === playerId) || (rival ? { id: playerId, restaurantName: p.restaurantName, name: p.player.name } : null);
      this.setView('peek', { scene: sc, structs: p.structs, title: p.restaurantName, rival, member, from: from || (this.view === 'town' ? 'town' : 'home') });
    } catch (e) { this.announce({ text: this.svc.friendlyError(e), tone: 'bad' }); }
  }

  async enterTown() {
    const s = this.svc.state;
    let g = { group: null, members: [] };
    try { g = await this.svc.getGroup(); } catch (e) { this.announce({ text: 'Couldn’t load your restaurant group.', tone: 'bad' }); }
    if (!this.townScene) {
      this.townScene = new TownScene({ me: { id: s.me.id || 'me', name: s.me.name, species: s.me.species }, group: g.group });
      this.townScene.addEventListener('peek', (e) => this.peek(e.detail.playerId, e.detail.rival, 'town'));
      this.townScene.hangout = this.hangout;
    }
    this.townScene.setMembers(g.members);
    try { this.townScene.setRivals(await this.svc.findRivals('')); } catch (e) { /* rivals optional */ }
    this.engine.setScene(this.townScene);
    if (this.hangout) this.townScene.setPeers([...this.hangout.peers.values()]);
    this.renderTownUi(g);
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
    this.updateChatTitle();
    this.overlay.append(
      h('div', { class: 'town-hint' }, h('kbd', {}, 'WASD'), ' or click to walk · ', h('kbd', {}, 'E'), ' to peek inside · ', h('kbd', {}, 'Space'), ' to wave'),
      chat);
    this.updateOnline();
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
    this.chatTitle.textContent = live ? `${this.matrix.roomName || this.chatGroupName} · guild chat` : `${this.chatGroupName} chat`;
    this.chatTitle.title = live ? 'Messages go to your guild’s Matrix room' : 'Town square chat';
  }

  /** Live only: sign in to the guild's Matrix chat; the town square keeps presence. */
  async startMatrixChat() {
    if (this.svc?.mode !== 'live' || this.matrix || this.matrixStarting) return;
    this.matrixStarting = true;
    const s = this.svc.state;
    try {
      const { homeserver, session } = await this.svc.chatSignIn();
      const chat = new this.liveMod.MatrixChat({ homeserver, session, selfId: s.me.id, room: this.svc.guild?.matrixRoom || null, guild: { id: s.me.guildId, name: s.me.guildName } });
      chat.addEventListener('chat', (e) => { this.appendChat(e.detail); this.townScene?.chat(e.detail); if (this.view === 'town' && e.detail.from !== s.me.id) sfx.chat(); });
      chat.addEventListener('status', (e) => {
        this.updateChatTitle();
        if (e.detail.ended) { this.announce({ text: e.detail.message, tone: 'bad' }); this.matrix = null; }
      });
      chat.addEventListener('error', (e) => this.announce({ text: e.detail.message, tone: 'bad' }));
      await chat.start();
      this.matrix = chat;
      // Replace the square's local chat with the room's history.
      if (this.chatLog) { clear(this.chatLog); for (const m of chat.history) this.appendChat(m); }
      this.updateChatTitle();
    } catch (e) {
      console.warn('[chat]', e);
      this.announce({ text: `Guild chat isn’t available: ${e.message || e}. Using the town square instead.`, tone: 'info' });
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
    this.startMatrixChat();
  }

  /* ── misc ─────────────────────────────────────────────────────────────── */

  setProfile(p) {
    const s = this.svc.state;
    if (p.species) { s.me.species = p.species; this.prefs.species = p.species; }
    if (p.name != null) { s.me.name = p.name.trim() || s.me.name; this.prefs.name = s.me.name; }
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

  toggleSound() {
    this.prefs.sound = this.prefs.sound === false;
    sfx.setEnabled(this.prefs.sound !== false);
    this.savePrefs();
    this.openSheet('settings');
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
    if (this.svc?.mode === 'live') { Promise.resolve(this.matrix?.stop()).finally(() => this.svc.logout()); return; }
    clearInterval(this.hudTimer);
    this.svc?.stop();
    this.hangout?.stop(); this.hangout = null;
    this.townScene?.dispose(); this.townScene = null;
    this.challengeScene?.dispose(); this.challengeScene = null;
    this.svc = null; this.hudTop = null; this.dock = null; this.sheet = null; this.sheetEl = null;
    this.showTitle();
  }
}
