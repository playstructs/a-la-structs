/**
 * The demo kitchen.
 *
 * Runs entirely in the browser. The economy (hiring, shifts, recipes, gold,
 * cash) follows the Structs rules closely but on a faster clock; service
 * challenges run on structs-desktop's SimulatorChain — a transcription of
 * structsd's combat keeper — against its SimulatorAi computer player, so every
 * serve, complaint, cover, dodge and comeback resolves exactly as it would on
 * chain.
 */
import '../../vendor/structs-desktop/simulator-types.js';
import '../../vendor/structs-desktop/simulator-chain.js';
import '../../vendor/structs-desktop/simulator-ai.js';
import { Service } from './Service.js';
import { TypeCatalog, STATUS, is, isCommand, normalizeStruct, COMMAND, weaponField, hasWeapon } from '../game/model.js';
import { roleOf } from '../lexicon/roles.js';
import { AREAS, AMBIT_FLAG } from '../lexicon/areas.js';
import { nameFor, rng } from '../lexicon/names.js';
import { MY_GROUP, RIVAL_GROUPS, buildRoster } from './demo/world.js';

const G = typeof window !== 'undefined' ? window : globalThis;
const SAVE_KEY = 'aLaStructs.demo.v1';
const OLD_SAVE_KEY = 'pawsAndPlates.demo.v1';   // before the rename; moved over once
const HOST_COMMAND_TYPE_ID = 9001;   // a home-defending Manager: losing them doesn't end the challenge

const START_ROSTER = [
  ['Command Ship', 'air', 0, 'fleet'],
  ['High Altitude Interceptor', 'air', 0, 'fleet'],
  ['Pursuit Fighter', 'air', 1, 'fleet'],
  ['Stealth Bomber', 'air', 2, 'fleet'],
  ['Battleship', 'space', 0, 'fleet'],
  ['Starfighter', 'space', 1, 'fleet'],
  ['Frigate', 'space', 2, 'fleet'],
  ['Tank', 'land', 0, 'fleet'],
  ['Mobile Artillery', 'land', 1, 'fleet'],
  ['SAM Launcher', 'land', 2, 'fleet'],
  ['Destroyer', 'water', 0, 'fleet'],
  ['Cruiser', 'water', 1, 'fleet'],
  ['Submersible', 'water', 2, 'fleet'],
  ['Ore Extractor', 'land', 0, 'planet'],
  ['Planetary Defense Cannon', 'land', 1, 'planet'],
  ['Field Generator', 'land', 2, 'planet'],
  ['Ore Refinery', 'water', 0, 'planet'],
  ['Orbital Shield Generator', 'space', 0, 'planet'],
  ['Jamming Satellite', 'space', 1, 'planet'],
];

const MINE_TICKS = 9;
const REFINE_TICKS = 7;
const BANK_RATE = 100000;     // cash per gold invested at the bank
const GEN_RATE = 100000;      // × generatingRate per gold invested in a generator

export class DemoService extends Service {
  constructor(opts = {}) {
    super('demo');
    const src = G.SimulatorTypes;
    this.Chain = G.SimulatorChain;
    this.Ai = G.SimulatorAi;
    this.state.types = new TypeCatalog(src.types);
    this.state.tickMs = opts.tickMs || 3000;
    this.difficulty = opts.difficulty || 'easy';
    this.rivalsMayChallenge = opts.rivalsMayChallenge ?? true;
    this.seq = 1;
    this.timer = null;
    this.chain = null;
    this.ai = null;
    this.aiCooldown = 0;
    this.nextIncoming = 0;
    this.r = rng('demo-kitchen');
    this.members = buildRoster(this.state.types, MY_GROUP, 7, 'whisker-row');
    this.rivals = [
      ...buildRoster(this.state.types, RIVAL_GROUPS[0], 6, 'gravy-train', { richer: true }),
      ...buildRoster(this.state.types, RIVAL_GROUPS[1], 5, 'night-owl'),
    ];
    this.profile = opts.profile || {};
    this.firstIncoming = opts.firstIncoming;
    this.startFresh = !!opts.fresh;   // Start New Game: ignore (and later overwrite) any old save
  }

  /** Is there a demo kitchen to continue? */
  static hasSave() {
    try { return localStorage.getItem(SAVE_KEY) != null || localStorage.getItem(OLD_SAVE_KEY) != null; } catch (e) { return false; }
  }

  /* ── lifecycle ────────────────────────────────────────────────────────── */

  async start() {
    if (this.startFresh || !this.load()) this.fresh();
    this.state.ready = true;
    this.state.lastTickAt = Date.now();
    this.nextIncoming = this.state.tick + (this.firstIncoming ?? this.raidGap(true));
    this.timer = setInterval(() => this.step(), this.state.tickMs);
    this.recompute();
    this.emit(['all']);
    if (this.forfeitNote) { this.toast(this.forfeitNote.text, this.forfeitNote.tone); this.forfeitNote = null; }
  }

  /** Leaving mid-challenge forfeits it, so a reload can't dodge a losing defence. */
  async stop() {
    clearInterval(this.timer); this.timer = null;
    if (this.chain && this.state.challenge?.status === 'ongoing') this.finishChallenge(this.state.challenge.role === 'defender' ? 'raidSuccessful' : 'attackerRetreated');
    this.save();
  }

  setSpeed(ms) {
    this.state.tickMs = ms;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.step(), ms);
    this.emit('tick');
  }

  fresh() {
    const s = this.state;
    s.tick = 1000;
    s.me = {
      id: '1-42', name: this.profile.name || 'You', species: this.profile.species || 'cat',
      guildId: MY_GROUP.id, guildName: MY_GROUP.name, guildTag: MY_GROUP.tag,
      planetId: '2-42', fleetId: '9-42', address: 'demo',
    };
    s.wallet = { gold: 30, recipes: 3, takings: 0, payroll: 0, lastAction: s.tick - 12, bank: 60 };
    s.restaurant = {
      id: '2-42', name: this.profile.restaurantName || 'The Cozy Spoon Bistro', undiscovered: 14,
      slots: { space: 4, air: 4, land: 4, water: 4 }, reputation: 0,
    };
    s.crew = { status: 'home', at: s.restaurant.id };
    s.structs = new Map();
    for (const [name, ambit, slot, loc] of START_ROSTER) {
      const t = s.types.named(name);
      const st = this.makeStruct(t, ambit, slot, loc, true);
      if (name === 'Field Generator') st.fuel = 12;
    }
    // A couple of covers so the floor feels managed.
    const mgr = this.manager();
    const server = this.myStructs().find((x) => this.typeOf(x).type === 'High Altitude Interceptor');
    if (mgr && server) server.protects = mgr.id;
  }

  makeStruct(t, ambit, slot, locationType, built = false) {
    const s = this.state;
    const id = `5-${42000 + this.seq++}`;
    const st = normalizeStruct({
      id, typeId: t.id, owner: s.me.id, locationType,
      locationId: locationType === 'fleet' ? s.me.fleetId : s.restaurant.id,
      ambit, slot: isCommand(t) ? 0 : slot, health: t.maxHealth,
      status: built ? (STATUS.MATERIALIZED | STATUS.BUILT | STATUS.ONLINE) : STATUS.MATERIALIZED,
    }, s.types);
    s.structs.set(id, st);
    return st;
  }

  save() {
    try {
      const s = this.state, ch = s.challenge;
      // A save taken mid-challenge records it, so a reload settles it as a forfeit.
      const forfeit = ch?.status === 'ongoing' ? { role: ch.role, guestName: ch.guest.name, restaurantName: ch.restaurantName } : null;
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1, tick: s.tick, me: s.me, wallet: s.wallet, restaurant: s.restaurant, crew: { status: 'home', at: s.restaurant.id },
        structs: [...s.structs.values()], jobs: [...s.jobs.entries()], seq: this.seq, forfeit,
      }));
    } catch (e) { /* storage may be unavailable */ }
  }

  load() {
    try {
      const old = localStorage.getItem(OLD_SAVE_KEY);
      if (old != null) {
        if (localStorage.getItem(SAVE_KEY) == null) localStorage.setItem(SAVE_KEY, old);
        localStorage.removeItem(OLD_SAVE_KEY);
      }
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (d.v !== 1) return false;
      const s = this.state;
      s.tick = d.tick; s.me = d.me; s.wallet = d.wallet; s.restaurant = d.restaurant; s.crew = d.crew;
      s.structs = new Map(d.structs.filter((x) => !is.destroyed(x)).map((x) => [x.id, { ...x, status: x.status & ~STATUS.HIDDEN }]));
      s.jobs = new Map(d.jobs || []);
      this.seq = d.seq || 100;
      if (d.forfeit) this.settleForfeit(d.forfeit);
      if (this.profile.name) s.me.name = this.profile.name;
      if (this.profile.species) s.me.species = this.profile.species;
      return true;
    } catch (e) { return false; }
  }

  /** A challenge was still running when the page went away: settle it as a forfeit. */
  settleForfeit(f) {
    const s = this.state;
    if (f.role === 'defender') {
      const stolen = Math.max(0, s.wallet.recipes - this.frozenRecipes(this.myStructs()));
      s.wallet.recipes -= stolen;
      this.forfeitNote = { tone: 'bad', text: stolen
        ? `You left during ${f.guestName}’s visit, so their crew copied ${stolen} of your recipes.`
        : `You left during ${f.guestName}’s visit. They found no recipes to copy.` };
    } else {
      this.forfeitNote = { tone: 'info', text: `You left during the challenge at ${f.restaurantName}, so your crew came home empty-handed.` };
    }
  }

  /** Recipes the host's Extra Freezers keep safe from copying. */
  frozenRecipes(structs) {
    return 4 * structs.filter((x) => { const t = this.typeOf(x); return t?.type === 'Ore Bunker' && is.built(x) && is.online(x) && !is.destroyed(x); }).length;
  }

  reset() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } this.chain = null; this.state.challenge = null; this.fresh(); this.recompute(); this.emit(['all']); }

  /* ── economy ──────────────────────────────────────────────────────────── */

  recompute() {
    const s = this.state;
    let payroll = 0, takings = (s.wallet.bank || 0) * BANK_RATE, rep = 0;
    for (const st of s.structs.values()) {
      const t = this.typeOf(st);
      if (!t || is.destroyed(st)) continue;
      if (!is.built(st)) payroll += t.buildDraw || 0;
      else if (is.online(st)) payroll += t.passiveDraw || 0;
      if (is.built(st) && is.online(st) && t.generatingRate) takings += (st.fuel || 0) * t.generatingRate * GEN_RATE;
      if (is.built(st) && is.online(st) && t.type === 'Orbital Shield Generator') rep++;
    }
    s.wallet.payroll = payroll;
    s.wallet.takings = takings;
    s.restaurant.reputation = rep;
  }

  step() {
    const s = this.state;
    s.tick++;
    s.lastTickAt = Date.now();
    const what = ['tick'];

    // Onboarding / deliveries
    for (const st of s.structs.values()) {
      if (st.build && !is.built(st)) {
        st.build.progress = Math.min(1, (s.tick - st.build.startTick) / (st.build.doneTick - st.build.startTick));
        if (s.tick >= st.build.doneTick) {
          st.status |= STATUS.BUILT | STATUS.ONLINE;
          st.build = null;
          const role = this.roleOf(st);
          this.fx({ kind: 'built', structId: st.id });
          this.toast(role.kind === 'equipment'
            ? `Your new ${role.role} has been delivered and switched on.`
            : `${nameFor(st.id)} the ${role.role} finished onboarding and clocked in!`, 'good', st.id);
          what.push('structs');
        }
      }
    }

    // Kitchen jobs: recipe testing (mining) and perfecting (refining)
    {
      for (const st of s.structs.values()) {
        const t = this.typeOf(st);
        if (!t || !is.built(st) || !is.online(st) || is.destroyed(st)) { s.jobs.delete(st.id); continue; }
        if (t.planetaryMining && t.planetaryMining !== 'noPlanetaryMining') {
          if (s.restaurant.undiscovered <= 0) { s.jobs.set(st.id, { kind: 'mine', progress: 0, label: 'Out of ideas — open a new restaurant', stalled: true }); continue; }
          if (this.underChallenge()) { s.jobs.set(st.id, { kind: 'mine', progress: s.jobs.get(st.id)?.progress || 0, label: 'Paused — service challenge!', stalled: true }); continue; }
          const j = s.jobs.get(st.id) || { kind: 'mine', progress: 0 };
          j.progress += 1 / MINE_TICKS; j.label = 'Recipe testing'; j.stalled = false;
          if (j.progress >= 1) {
            j.progress = 0; s.restaurant.undiscovered--; s.wallet.recipes++;
            this.fx({ kind: 'job', structId: st.id, job: 'mine' });
            this.toast(`Chef ${nameFor(st.id)} discovered a new recipe!`, 'good', st.id);
            if (s.restaurant.undiscovered === 0) this.toast('That was the last recipe to discover here. Open a new restaurant (Staff menu) to keep the gold coming.', 'info', st.id);
            what.push('wallet');
          }
          s.jobs.set(st.id, j);
        }
        if (t.planetaryRefinery && t.planetaryRefinery !== 'noPlanetaryRefinery') {
          if (s.wallet.recipes <= 0) { s.jobs.set(st.id, { kind: 'refine', progress: 0, label: 'Waiting for a recipe', stalled: true }); continue; }
          if (this.underChallenge()) { s.jobs.set(st.id, { kind: 'refine', progress: s.jobs.get(st.id)?.progress || 0, label: 'Paused — service challenge!', stalled: true }); continue; }
          const j = s.jobs.get(st.id) || { kind: 'refine', progress: 0 };
          j.progress += 1 / REFINE_TICKS; j.label = 'Perfecting a recipe'; j.stalled = false;
          if (j.progress >= 1) {
            j.progress = 0; s.wallet.recipes--; s.wallet.gold += 1;
            this.fx({ kind: 'job', structId: st.id, job: 'refine' });
            this.toast(`Sous Chef ${nameFor(st.id)} sold a perfected dish: +1 gold.`, 'good', st.id);
            what.push('wallet');
          }
          s.jobs.set(st.id, j);
        }
      }
    }

    if (this.chain) this.challengeBlock(what);
    else if (this.rivalsMayChallenge && s.tick >= this.nextIncoming) this.incomingChallenge();

    this.ambientChatter();
    this.recompute();
    if (s.tick % 5 === 0) this.save();
    this.emit(what);
  }

  /**
   * Ticks until the next rival drops in. "Gently" also means less often, and
   * the first visit comes later so there's time to settle in.
   */
  raidGap(first = false) {
    const [min, spread] = { easy: [320, 160], difficult: [220, 120], hard: [160, 120] }[this.difficulty] || [220, 120];
    return Math.floor((first ? min * 0.6 : min) + this.r() * spread);
  }

  underChallenge() { return !!(this.state.challenge && this.state.challenge.role === 'defender'); }

  discharge() {
    this.state.wallet.lastAction = this.state.tick;
    const p = this.chain?.players[this.state.me.id];
    if (p) p.lastAction = this.state.tick;
  }

  needHustle(n) {
    if (this.hustle() < n) throw new Error(`insufficient charge: ${this.hustle()} < ${n}`);
  }

  get(id) {
    const s = this.state.structs.get(id) || this.state.challenge?.structs.get(id);
    if (!s) throw new Error('not found');
    return s;
  }

  inChain(id) { return !!(this.chain && this.chain.structs[id]); }

  submit(msg) {
    const hash = this.chain.submit(this.state.me.id, msg);
    this.pending = this.pending || new Map();
    this.pending.set(hash, msg);
    this.toast('Order placed — it happens next tick.', 'info');
    return hash;
  }

  /* ── actions ──────────────────────────────────────────────────────────── */

  async hire(typeId, ambit, slot) {
    const s = this.state;
    const t = s.types.get(typeId);
    const blocker = this.hireBlocker(t, ambit);
    if (blocker) throw new Error(blocker);
    const free = this.freeSlots(t, ambit);
    if (slot == null || !free.includes(slot)) slot = free[0];
    const st = this.makeStruct(t, ambit, slot, t.category === 'planet' ? 'planet' : 'fleet', false);
    const ticks = Math.max(2, Math.round((t.buildDifficulty || 200) / 90));
    st.build = { startTick: s.tick, doneTick: s.tick + ticks, progress: 0 };
    this.discharge();
    this.recompute();
    this.fx({ kind: 'hired', structId: st.id });
    const role = roleOf(t);
    this.toast(role.kind === 'equipment'
      ? `A ${role.role} is on its way to the ${AREAS[ambit].name}.`
      : `${nameFor(st.id)} the ${role.role} is onboarding in the ${AREAS[ambit].name}.`, 'good', st.id);
    this.emit(['structs', 'wallet']);
    return st.id;
  }

  async cancelHire(id) {
    const st = this.get(id);
    if (is.built(st)) throw new Error('Already onboarded');
    this.state.structs.delete(id);
    this.recompute();
    this.fx({ kind: 'removed', structId: id });
    this.emit(['structs', 'wallet']);
  }

  async clockIn(id) {
    if (this.inChain(id)) return this.submit({ '@type': '/structs.structs.MsgStructActivate', structId: id });
    const st = this.get(id); const t = this.typeOf(st);
    if (!is.built(st)) throw new Error('struct is building');
    if (is.online(st)) throw new Error('struct is online (activation)');
    if (this.spareCash() < (t.passiveDraw || 0)) throw new Error('capacity_exceeded');
    this.needHustle(t.activateCharge || 0);
    this.discharge();
    st.status |= STATUS.ONLINE;
    this.recompute();
    this.fx({ kind: 'status', structId: id });
    this.emit(['structs', 'wallet']);
  }

  async clockOut(id) {
    if (this.inChain(id)) return this.submit({ '@type': '/structs.structs.MsgStructDeactivate', structId: id });
    const st = this.get(id);
    if (!is.online(st)) throw new Error('struct is offline (deactivate)');
    st.status &= ~STATUS.ONLINE;
    st.status &= ~STATUS.HIDDEN;
    this.state.jobs.delete(id);
    this.recompute();
    this.fx({ kind: 'status', structId: id });
    this.emit(['structs', 'wallet']);
  }

  async cover(defenderId, protectedId) {
    if (this.inChain(defenderId)) return this.submit({ '@type': '/structs.structs.MsgStructDefenseSet', defenderStructId: defenderId, protectedStructId: protectedId });
    const d = this.get(defenderId), p = this.get(protectedId), t = this.typeOf(d);
    if (!t.canDefend) throw new Error('cannot_defend');
    if (!is.online(d)) throw new Error('offline');
    if (d.id === p.id) throw new Error('self_defense');
    if (d.locationId !== p.locationId) throw new Error('not_in_range');
    this.needHustle(t.defendChangeCharge || 0);
    this.discharge();
    d.protects = p.id;
    this.fx({ kind: 'defense', defender: d.id, protected: p.id, on: true });
    this.emit(['structs', 'wallet']);
  }

  async uncover(defenderId) {
    if (this.inChain(defenderId)) return this.submit({ '@type': '/structs.structs.MsgStructDefenseClear', defenderStructId: defenderId });
    const d = this.get(defenderId), t = this.typeOf(d);
    if (!d.protects) throw new Error('not defending');
    this.needHustle(t.defendChangeCharge || 0);
    this.discharge();
    const was = d.protects; d.protects = null;
    this.fx({ kind: 'defense', defender: d.id, protected: was, on: false });
    this.emit(['structs', 'wallet']);
  }

  async walkManager(ambit) {
    const m = this.manager();
    if (!m) throw new Error('No Manager');
    if (this.inChain(m.id)) return this.submit({ '@type': '/structs.structs.MsgStructMove', structId: m.id, locationType: 'fleet', ambit, slot: 0 });
    const t = this.typeOf(m);
    if (!((t.possibleAmbit || 0) & AMBIT_FLAG[ambit])) throw new Error('invalid_ambit');
    this.needHustle(t.moveCharge || 0);
    this.discharge();
    m.ambit = ambit;
    this.fx({ kind: 'move', structId: m.id, ambit });
    this.emit(['structs', 'wallet']);
  }

  async blendIn(id, on = true) {
    if (this.inChain(id)) return this.submit({ '@type': on ? '/structs.structs.MsgStructStealthActivate' : '/structs.structs.MsgStructStealthDeactivate', structId: id });
    const st = this.get(id), t = this.typeOf(st);
    if (t.unitDefenses !== 'stealthMode') throw new Error('no stealth');
    this.needHustle(t.stealthActivateCharge || 0);
    this.discharge();
    if (on) st.status |= STATUS.HIDDEN; else st.status &= ~STATUS.HIDDEN;
    this.fx({ kind: 'stealth', structId: id, on });
    this.emit(['structs', 'wallet']);
  }

  async serve(attackerId, targetId, ws = 'primaryWeapon') {
    if (!this.chain) throw new Error('There are no customers to serve right now.');
    if (!this.inChain(attackerId)) throw new Error('They aren’t part of this service.');
    const ch = this.state.challenge;
    // Lucky Cat: may knock a guided complaint aimed at the host off course.
    if (ch.role === 'challenger') {
      const t = this.typeOf(this.chain.structs[attackerId]);
      if (weaponField(t, ws, 'Control') === 'guided' && this.luckyCatRoll(ch.hostId)) {
        this.discharge();
        if (this.chain.players[this.state.me.id]) this.chain.players[this.state.me.id].lastAction = this.state.tick;
        this.fx({ kind: 'deflect', attackerId, targetId });
        this.chlog(`Their Lucky Cat waved — your complaint went off course!`, 'bad');
        this.emit(['wallet', 'challenge']);
        return null;
      }
    }
    return this.submit({ '@type': '/structs.structs.MsgStructAttack', operatingStructId: attackerId, targetStructId: [targetId], weaponSystem: ws });
  }

  async investGold(structId, amount) {
    const s = this.state;
    amount = Math.floor(Number(amount));
    if (!(amount > 0)) throw new Error('Choose how much gold to invest.');
    if (amount > s.wallet.gold) throw new Error('You don’t have that much gold.');
    if (structId) {
      const st = this.get(structId), t = this.typeOf(st);
      if (!t.generatingRate) throw new Error('That doesn’t bring in cash.');
      st.fuel = (st.fuel || 0) + amount;
      this.toast(`Invested ${amount} gold in your ${roleOf(t).role}: +${(amount * t.generatingRate * GEN_RATE / 1e6).toFixed(1)}M takings per tick.`, 'good', structId);
    } else {
      s.wallet.bank = (s.wallet.bank || 0) + amount;
      this.toast(`Deposited ${amount} gold at the bank: +${(amount * BANK_RATE / 1e6).toFixed(1)}M takings.`, 'good');
    }
    s.wallet.gold -= amount;
    this.recompute();
    this.emit(['wallet']);
  }

  async openNewRestaurant() {
    const s = this.state;
    if (s.crew.status !== 'home') throw new Error('Call the crew home first.');
    // Planetary structs stay with the old restaurant (released), as on chain.
    for (const st of [...s.structs.values()]) if (st.locationType === 'planet') s.structs.delete(st.id);
    const n = Math.floor(Math.random() * 900 + 100);
    s.restaurant = { id: `2-${n}`, name: s.restaurant.name.replace(/( No\. \d+)?$/, ` No. ${Math.floor(Math.random() * 9) + 2}`), undiscovered: 14, slots: { space: 4, air: 4, land: 4, water: 4 }, reputation: 0 };
    s.crew.at = s.restaurant.id;
    s.jobs.clear();
    this.recompute();
    this.toast('Grand opening! A fresh restaurant full of undiscovered recipes. Re-hire your kitchen team and gear.', 'good');
    this.emit(['all']);
  }

  /* ── town ─────────────────────────────────────────────────────────────── */

  async getGroup() {
    const me = this.state.me;
    const self = {
      id: me.id, name: me.name, species: me.species, restaurantName: this.state.restaurant.name, planetId: this.state.restaurant.id,
      recipes: this.state.wallet.recipes, staff: this.myStructs().filter((x) => !is.destroyed(x)).length, online: true, isMe: true,
      reputation: this.state.restaurant.reputation,
    };
    return {
      group: MY_GROUP,
      members: [self, ...this.members.map((m) => ({
        id: m.id, name: m.name, species: m.species, restaurantName: m.restaurantName, planetId: m.planetId,
        recipes: m.recipes, staff: m.structs.length, online: m.online, reputation: m.reputation,
      }))],
    };
  }

  async peekRestaurant(playerId) {
    if (playerId === this.state.me.id) return { player: this.state.me, restaurantName: this.state.restaurant.name, structs: this.myStructs() };
    const p = [...this.members, ...this.rivals].find((x) => x.id === playerId);
    if (!p) return null;
    return {
      player: { id: p.id, name: p.name, species: p.species, guildName: p.guildName },
      restaurantName: p.restaurantName,
      structs: p.structs.map((x) => normalizeStruct(x, this.state.types)),
    };
  }

  async findRivals(query = '') {
    const q = query.trim().toLowerCase();
    return this.rivals
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.restaurantName.toLowerCase().includes(q) || r.guildName.toLowerCase().includes(q))
      .map((r) => ({
        id: r.id, name: r.name, species: r.species, restaurantName: r.restaurantName, guildName: r.guildName, guildTag: r.guildTag,
        recipes: r.recipes, reputation: r.reputation, crewHome: r.crewHome,
        staff: r.structs.filter((x) => !is.destroyed(normalizeStruct(x, this.state.types))).length,
        underChallenge: false, planetId: r.planetId,
      }))
      .sort((a, b) => b.recipes - a.recipes);
  }

  /* ── service challenges ──────────────────────────────────────────────── */

  luckyCatRoll(hostId) {
    const host = hostId === this.state.me.id ? this.myStructs() : (this.state.challenge?.hostStructs || []);
    const cats = host.filter((x) => { const t = this.typeOf(x); return t?.type === 'Jamming Satellite' && is.built(x) && is.online(x) && !is.destroyed(x); });
    return cats.length > 0 && this.r() < 0.3;
  }

  chainTypes() {
    const types = this.state.types.all().map((t) => ({ ...t }));
    const cmd = types.find((t) => t.type === COMMAND);
    types.push({ ...cmd, id: HOST_COMMAND_TYPE_ID, triggerRaidDefeatByDestruction: false });
    return types;
  }

  /**
   * Build a SimulatorChain with the guest's crew and the host's whole
   * restaurant (crew on station + kitchen team + equipment) as one battlefield.
   */
  buildChain(host, guest) {
    const seed = `${host.id}:${guest.id}:${this.state.tick}`;
    const toChain = (owner, list, isHost) => list
      .filter((x) => is.built(x) && !is.destroyed(x))
      .filter((x) => isHost || x.locationType === 'fleet')
      .map((x) => ({
        id: x.id, owner, ambit: x.ambit, slot: x.slot,
        typeId: isHost && isCommand(this.typeOf(x)) ? HOST_COMMAND_TYPE_ID : x.typeId,
        protects: x.protects || null,
      }));
    const hostList = toChain(host.id, host.structs, true);
    const guestList = toChain(guest.id, guest.structs, false);
    const ids = new Set([...hostList, ...guestList].map((x) => x.id));
    [...hostList, ...guestList].forEach((x) => { if (x.protects && !ids.has(x.protects)) x.protects = null; });
    const chain = new this.Chain({
      types: this.chainTypes(), seed, height: this.state.tick, planetId: host.planetId,
      players: [
        { id: host.id, name: host.name, fleetId: host.fleetId, charge: host.charge, homePlanetId: host.planetId },
        { id: guest.id, name: guest.name, fleetId: guest.fleetId, charge: guest.charge },
      ],
      structs: [...hostList, ...guestList],
    });
    // The chain constructor starts everyone fresh; carry real health and shifts over.
    const all = new Map([...host.structs, ...guest.structs].map((x) => [x.id, x]));
    for (const id of Object.keys(chain.structs)) {
      const c = chain.structs[id], src = all.get(id);
      c.health = src.health;
      const wasOnline = is.online(src);
      if (!wasOnline) chain.goOffline(c);
      if (is.hidden(src)) c.status |= STATUS.HIDDEN;
    }
    // The host's restaurant is home: their fleet is not "at battle" in the
    // away sense, but it is present and reachable.
    return chain;
  }

  rivalAsSide(r) {
    return {
      id: r.id, name: r.name, species: r.species, planetId: r.planetId, fleetId: r.fleetId,
      charge: 4 + Math.floor(this.r() * 4),
      structs: r.structs.map((x) => normalizeStruct(x, this.state.types)),
      restaurantName: r.restaurantName,
    };
  }

  meAsSide() {
    const s = this.state;
    return {
      id: s.me.id, name: s.me.name, species: s.me.species, planetId: s.restaurant.id, fleetId: s.me.fleetId,
      charge: this.hustle(), structs: this.myStructs(), restaurantName: s.restaurant.name,
    };
  }

  async startChallenge(rivalId) {
    const s = this.state;
    if (this.chain) throw new Error('You’re already in a service challenge.');
    if (s.crew.status !== 'home') throw new Error('Your crew is already out.');
    const mgr = this.manager();
    if (!mgr || !is.built(mgr)) throw new Error('Your Manager has to lead the crew.');
    const rival = this.rivals.find((r) => r.id === rivalId);
    if (!rival) throw new Error('Rival not found.');
    const host = this.rivalAsSide(rival), guest = this.meAsSide();
    this.beginChallenge('challenger', host, guest, rival);
    s.crew = { status: 'away', at: rival.planetId };
    this.toast(`Your crew walks into ${rival.restaurantName} as customers. Complain until you can copy their recipes — and keep your Food Critic unsatisfied!`, 'info');
    this.emit(['all']);
  }

  incomingChallenge() {
    const s = this.state;
    this.nextIncoming = s.tick + this.raidGap();
    if (s.crew.status !== 'home' || this.chain) return;
    const candidates = this.rivals.filter((r) => r.structs.some((x) => this.typeOf(x)?.type === COMMAND));
    if (!candidates.length) return;
    const rival = candidates[Math.floor(this.r() * candidates.length)];
    const guest = this.rivalAsSide(rival), host = this.meAsSide();
    this.beginChallenge('defender', host, guest, rival);
    this.toast(`Customers incoming! ${rival.name}’s crew from ${rival.restaurantName} just walked in. Serve them well — satisfy their Food Critic to send them home!`, 'bad');
    this.fx({ kind: 'alarm' });
    this.emit(['challenge', 'structs']);
  }

  beginChallenge(role, host, guest, rival) {
    const s = this.state;
    this.chain = this.buildChain(host, guest);
    const aiSide = role === 'challenger' ? host.id : guest.id;
    this.ai = new this.Ai(aiSide, this.difficulty, `${host.id}${guest.id}${s.tick}`);
    this.aiCooldown = 2;
    this.rival = rival;
    const rep = host.structs.filter((x) => { const t = this.typeOf(x); return t?.type === 'Orbital Shield Generator' && is.online(x) && is.built(x) && !is.destroyed(x); }).length;
    s.challenge = {
      role, hostId: host.id, guestId: guest.id, planetId: host.planetId,
      restaurantName: host.restaurantName,
      host: { id: host.id, name: host.name, species: host.species },
      guest: { id: guest.id, name: guest.name, species: guest.species },
      hostStructs: host.structs,
      structs: new Map(),
      heist: { progress: 0, needed: 30 + 12 * rep, reputation: rep },
      status: 'ongoing', startedTick: s.tick, log: [], result: null,
    };
    this.syncFromChain();
    this.chlog(role === 'challenger'
      ? `Your crew sat down at ${host.restaurantName}.`
      : `${guest.name}’s crew sat down at your restaurant.`, 'info');
    this.fx({ kind: 'challengeStart', role });
    this.save();
  }

  chlog(text, tone = 'info') {
    const ch = this.state.challenge;
    if (!ch) return;
    ch.log.unshift({ tick: this.state.tick, text, tone });
    ch.log.length = Math.min(ch.log.length, 60);
  }

  syncFromChain() {
    const ch = this.state.challenge, chain = this.chain;
    if (!ch || !chain) return;
    for (const id of Object.keys(chain.structs)) {
      const c = chain.structs[id];
      const prev = ch.structs.get(id) || this.state.structs.get(id) || ch.hostStructs.find((x) => x.id === id);
      const typeId = c.typeId === HOST_COMMAND_TYPE_ID ? this.state.types.named(COMMAND).id : c.typeId;
      const n = {
        ...(prev || {}), id, typeId, owner: c.owner, ambit: c.ambit, slot: c.slot, health: c.health,
        maxHealth: this.state.types.get(typeId).maxHealth, status: c.status, protects: c.protectedStructId,
        locationType: prev?.locationType || 'fleet', locationId: prev?.locationId || c.locationId,
      };
      ch.structs.set(id, n);
      if (c.owner === this.state.me.id && this.state.structs.has(id)) {
        const mine = this.state.structs.get(id);
        mine.health = c.health; mine.status = c.status; mine.protects = c.protectedStructId; mine.ambit = c.ambit; mine.slot = c.slot;
      }
    }
    const me = chain.players[this.state.me.id];
    if (me) this.state.wallet.lastAction = me.lastAction;
  }

  /** One block of the challenge chain. */
  challengeBlock(what) {
    const ch = this.state.challenge, chain = this.chain;
    const me = this.state.me.id;
    // The computer player thinks between blocks.
    if (--this.aiCooldown <= 0) {
      const msg = this.ai.decide(chain);
      if (msg) {
        const t = msg.operatingStructId && chain.typeOf(chain.structs[msg.operatingStructId]);
        if (t && ch.role === 'defender' && weaponField(t, msg.weaponSystem, 'Control') === 'guided' && this.luckyCatRoll(this.state.me.id)) {
          chain.players[this.ai.pid].lastAction = this.state.tick;
          this.fx({ kind: 'deflect', attackerId: msg.operatingStructId, targetId: msg.targetStructId[0] });
          this.chlog('Your Lucky Cat waved — their complaint went right off course!', 'good');
        } else chain.submit(this.ai.pid, msg);
        this.aiCooldown = this.difficulty === 'hard' ? 2 : this.difficulty === 'difficult' ? 4 : 5;
      } else this.aiCooldown = 1;
    }
    // Keep chain height in step with the kitchen clock.
    chain.height = this.state.tick - 1;
    const block = chain.produceBlock();
    for (const tx of block.txs) {
      if (!tx.ok && tx.signer === me) this.toast(this.friendlyError(tx.error), 'bad');
    }
    for (const ev of block.events) this.onChainEvent(ev);
    this.swingCooks(block);
    this.syncFromChain();

    // Recipe heist progress: only while the guest crew is still at the table.
    const guestFleet = chain.players[ch.guestId]?.fleetId;
    const guestPresent = chain.fleetsAtBattle().includes(guestFleet);
    if (ch.status === 'ongoing' && guestPresent) {
      ch.heist.progress = Math.min(1, ch.heist.progress + 1 / ch.heist.needed);
      if (ch.heist.progress >= 1) this.finishChallenge('raidSuccessful');
    } else if (ch.status === 'ongoing' && !guestPresent) {
      this.finishChallenge('attackerDefeated');
    }
    what.push('challenge', 'structs');
  }

  onChainEvent(ev) {
    const ch = this.state.challenge;
    const nameOf = (id) => {
      const st = ch.structs.get(id) || this.state.structs.get(id);
      if (!st) return 'Someone';
      const role = roleOf(this.typeOf(st));
      if (st.owner !== ch.hostId) return `the ${role.customer?.persona || 'customer'} (${nameFor(id)})`;
      return role.kind === 'equipment' ? `the ${role.role}` : `${nameFor(id)} the ${role.role}`;
    };
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    switch (ev.category) {
      case 'struct_attack': {
        const d = ev.detail;
        this.fx({ kind: 'attack', detail: d, hostId: ch.hostId });
        const attackerIsHost = d.attackerPlayerId === ch.hostId;
        const role = roleOf(this.state.types.get(d.attackerStructTypeId === HOST_COMMAND_TYPE_ID ? 1 : d.attackerStructTypeId));
        const action = (attackerIsHost ? role.serve : role.complain)?.[d.weaponSystem];
        const last = d.eventAttackShotDetail[d.eventAttackShotDetail.length - 1] || {};
        const target = nameOf(last.targetStructId);
        let text = `${cap(nameOf(d.attackerStructId))} ${action?.line || (attackerIsHost ? 'served' : 'complained to')} ${target}`;
        if (last.evaded) text += attackerIsHost ? ' — but they changed their mind.' : ' — but it was shrugged off.';
        else if (last.blocked) text += ` — ${nameOf(last.blockedByStructId)} stepped in.`;
        else if (last.targetDestroyed) text += attackerIsHost ? ' — fully satisfied! They’re heading out happy.'
          : roleOf(this.typeOf(ch.structs.get(last.targetStructId) || {})).kind === 'equipment' ? ' — and that broke it!' : ' — and that was the last straw. Fired!';
        else text += '.';
        this.chlog(text, attackerIsHost ? 'good' : 'bad');
        break;
      }
      case 'struct_defense_add':
        this.fx({ kind: 'defense', defender: ev.detail.defender_struct_id, protected: ev.detail.protected_struct_id, on: true });
        this.chlog(`${cap(nameOf(ev.detail.defender_struct_id))} is now covering ${nameOf(ev.detail.protected_struct_id)}.`);
        break;
      case 'struct_defense_remove':
        this.fx({ kind: 'defense', defender: ev.detail.defender_struct_id, protected: ev.detail.protected_struct_id, on: false });
        break;
      case 'struct_move':
        this.fx({ kind: 'move', structId: ev.detail.struct_id, ambit: ev.detail.ambit });
        this.chlog(`${cap(nameOf(ev.detail.struct_id))} walked over to the ${AREAS[ev.detail.ambit]?.name}.`);
        break;
      case 'struct_status': {
        const was = ev.detail.status_old, now = ev.detail.status;
        if (!(was & STATUS.DESTROYED) && (now & STATUS.DESTROYED)) this.fx({ kind: 'destroyed', structId: ev.detail.struct_id, hostId: ch.hostId });
        if (!(was & STATUS.HIDDEN) && (now & STATUS.HIDDEN)) this.fx({ kind: 'stealth', structId: ev.detail.struct_id, on: true });
        if ((was & STATUS.HIDDEN) && !(now & STATUS.HIDDEN)) this.fx({ kind: 'stealth', structId: ev.detail.struct_id, on: false });
        if ((was & STATUS.ONLINE) !== (now & STATUS.ONLINE)) this.fx({ kind: 'status', structId: ev.detail.struct_id });
        break;
      }
      case 'raid_status':
        if (ev.detail.status === 'attackerDefeated') this.finishChallenge('attackerDefeated');
        break;
      default: break;
    }
  }

  /** Swing Cooks (planetary defense cannon) serve any guest who just complained. */
  swingCooks(block) {
    const ch = this.state.challenge, chain = this.chain;
    if (!ch || ch.status !== 'ongoing') return;
    const cooks = Object.values(chain.structs).filter((c) => c.owner === ch.hostId && !chain.isDestroyed(c) && chain.isOnline(c)
      && chain.typeOf(c).planetaryDefenses === 'defensiveCannon');
    if (!cooks.length) return;
    for (const ev of block.events) {
      if (ev.category !== 'struct_attack' || ev.detail.attackerPlayerId !== ch.guestId) continue;
      const attacker = chain.structs[ev.detail.attackerStructId];
      if (!attacker || chain.isDestroyed(attacker)) continue;
      const cook = cooks[0];
      chain.ctx = { tx: null, typed: [], before: {}, order: [], counterSpent: {}, blockSeed: 0 };
      const before = attacker.health;
      if (chain.decrementHealth(attacker, 1) === 0) chain.destroy(attacker);
      const detail = {
        attackerPlayerId: ch.hostId, attackerStructId: cook.id, attackerStructTypeId: cook.typeId, attackerStructType: 'Planetary Defense Cannon',
        attackerStructOperatingAmbit: cook.ambit, weaponSystem: 'planetaryDefenses',
        eventAttackShotDetail: [{ targetStructId: attacker.id, targetHealthBefore: before, targetHealthAfter: attacker.health, damage: 1, targetDestroyed: chain.isDestroyed(attacker), targetPlayerId: attacker.owner }],
      };
      const extra = chain.ctx.typed.concat(chain.commitFrames(chain.ctx));
      chain.ctx = null;
      this.fx({ kind: 'attack', detail, hostId: ch.hostId });
      this.chlog(`${nameFor(cook.id)} the Swing Cook jumped in and served the complainer.`, 'good');
      extra.forEach((e) => { if (e.category !== 'struct_attack') this.onChainEvent(e); });
    }
  }

  async goHome() {
    const ch = this.state.challenge;
    if (!ch) throw new Error('Your crew is already home.');
    if (ch.role !== 'challenger') throw new Error('It’s your restaurant — you can’t leave! Satisfy their critic instead.');
    this.finishChallenge('attackerRetreated');
  }

  finishChallenge(status) {
    const s = this.state, ch = s.challenge;
    if (!ch || ch.status !== 'ongoing') return;
    ch.status = status;
    const iWasGuest = ch.role === 'challenger';
    let text, tone;
    const hostRecipes = iWasGuest ? this.rival.recipes : s.wallet.recipes;
    const frozen = this.frozenRecipes(iWasGuest ? ch.hostStructs : this.myStructs());
    const stolen = status === 'raidSuccessful' ? Math.max(0, hostRecipes - frozen) : 0;
    const kept = frozen && hostRecipes ? (iWasGuest ? ' Their Extra Freezer kept some safe.' : ' Your Extra Freezer kept some safe.') : '';
    if (status === 'raidSuccessful') {
      if (iWasGuest) {
        s.wallet.recipes += stolen; this.rival.recipes -= stolen;
        text = stolen ? `You copied ${stolen} recipe${stolen === 1 ? '' : 's'} from ${ch.restaurantName}!${kept}` : `You stayed the whole service, but there were no recipes to copy at ${ch.restaurantName}.${kept}`;
        tone = stolen ? 'good' : 'info';
      } else {
        s.wallet.recipes -= stolen;
        text = stolen ? `${ch.guest.name}’s crew copied ${stolen} of your recipes.${kept}` : `${ch.guest.name}’s crew stayed the whole service, but found no recipes to copy.${kept}`;
        tone = stolen ? 'bad' : 'info';
      }
    } else if (status === 'attackerDefeated') {
      text = iWasGuest ? 'Your Food Critic was satisfied and the party went home. No recipes this time.' : 'You satisfied their Food Critic — the whole party went home happy. Your recipes are safe!';
      tone = iWasGuest ? 'bad' : 'good';
    } else {
      text = 'Your crew headed home.'; tone = 'info';
    }
    ch.result = { status, stolen, text, tone };
    this.chlog(text, tone);
    this.toast(text, tone);
    this.fx({ kind: 'challengeEnd', status, role: ch.role });

    // Write the battle back: fired staff are gone, everyone else keeps their morale.
    const chain = this.chain;
    for (const st of [...s.structs.values()]) {
      const c = chain.structs[st.id];
      if (!c) continue;
      st.health = c.health; st.status = c.status & ~STATUS.HIDDEN; st.protects = null;
      if (is.destroyed(st)) s.structs.delete(st.id);
    }
    if (!this.manager()) this.toast('Your Manager was fired! Hire a new one from Hire before anyone else can be hired or bought.', 'bad');
    if (this.rival) {
      this.rival.structs = this.rival.structs.filter((x) => { const c = chain.structs[x.id]; if (!c) return true; x.health = c.health; return !chain.isDestroyed(c); });
      // A defeated rival hires replacements eventually; keep them playable.
      if (!this.rival.structs.some((x) => this.typeOf(x)?.type === COMMAND)) {
        const t = s.types.named(COMMAND);
        this.rival.structs.push({ id: `5-${90000 + this.seq++}`, typeId: t.id, owner: this.rival.id, locationType: 'fleet', locationId: this.rival.fleetId, ambit: 'land', slot: 0, health: t.maxHealth, status: 7 });
      }
    }
    this.chain = null; this.ai = null;
    s.crew = { status: 'home', at: s.restaurant.id };
    // Keep the summary on screen; the UI clears it.
    setTimeout(() => { if (s.challenge === ch) { s.challenge = null; this.emit(['challenge', 'structs']); } }, 9000);
    this.recompute();
    this.save();
  }

  dismissChallenge() { if (this.state.challenge && this.state.challenge.status !== 'ongoing') { this.state.challenge = null; this.emit(['challenge', 'structs']); } }

  /* ── ambience ─────────────────────────────────────────────────────────── */

  ambientChatter() { /* chat is driven by the Hangout's demo bots */ }

  /** Which weapon systems a struct can use against a target right now (for the action bar). */
  serveOptions(attackerId, targetId) {
    const chain = this.chain;
    if (!chain) return [];
    const a = chain.structs[attackerId], t = chain.structs[targetId];
    if (!a || !t) return [];
    return ['primaryWeapon', 'secondaryWeapon'].filter((ws) => hasWeapon(chain.typeOf(a), ws) && !chain.canAttack(a, t, ws));
  }

  /** Why `attacker` can't use `ws` on `target`, or null. */
  serveBlocker(attackerId, targetId, ws) {
    const chain = this.chain;
    if (!chain) return 'No challenge';
    const a = chain.structs[attackerId], t = chain.structs[targetId];
    if (!a || !t) return 'Not here';
    if (!chain.isOnline(a)) return 'Off shift';
    const why = chain.canAttack(a, t, ws);
    if (why) return this.friendlyError(why);
    const cost = weaponField(chain.typeOf(a), ws, 'Charge') || 0;
    if (this.hustle() < cost) return `Needs ${cost} hustle`;
    return null;
  }
}
