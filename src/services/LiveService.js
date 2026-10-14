/**
 * A real Structs guild, through the structs-webapp game core.
 *
 * Everything that touches the chain — the wallet, the signing queue and its
 * charge-gated scheduling, the GRASS event stream, the guild API, and the
 * proof-of-work tasks that finish builds, mining, refining and raids — is the
 * webapp's own code from vendor/structs-webapp, wired up the way its index.js
 * does it, minus its screens. This file only reads that game state and
 * translates it into the restaurant.
 *
 * Players here are playing against regular Structs players. They see a
 * restaurant; their opponents see a planet.
 */
import './live/polyfills.js';
import { makeNoop } from './live/noop.js';
import { Service } from './Service.js';
import { TypeCatalog, normalizeStruct, is, isCommand, weaponField, hasWeapon, STATUS } from '../game/model.js';
import { roleOf } from '../lexicon/roles.js';
import { nameFor, speciesFor, restaurantNameFor } from '../lexicon/names.js';
import { AREAS, normalizeAmbit } from '../lexicon/areas.js';

import { GameState } from '../../vendor/structs-webapp/js/models/GameState.js';
import { GuildAPI } from '../../vendor/structs-webapp/js/api/GuildAPI.js';
import { WalletManager } from '../../vendor/structs-webapp/js/managers/WalletManager.js';
import { AuthManager } from '../../vendor/structs-webapp/js/managers/AuthManager.js';
import { GrassManager } from '../../vendor/structs-webapp/js/framework/GrassManager.js';
import { BlockListener } from '../../vendor/structs-webapp/js/grass_listeners/BlockListener.js';
import { RaidStatusListener } from '../../vendor/structs-webapp/js/grass_listeners/RaidStatusListener.js';
import { SigningClientManager } from '../../vendor/structs-webapp/js/managers/SigningClientManager.js';
import { PlanetManager } from '../../vendor/structs-webapp/js/managers/PlanetManager.js';
import { PlayerAddressManager } from '../../vendor/structs-webapp/js/managers/PlayerAddressManager.js';
import { PermissionManager } from '../../vendor/structs-webapp/js/managers/PermissionManager.js';
import { PlayerAddressPendingFactory } from '../../vendor/structs-webapp/js/factories/PlayerAddressPendingFactory.js';
import { AlphaManager } from '../../vendor/structs-webapp/js/managers/AlphaManager.js';
import { FleetManager } from '../../vendor/structs-webapp/js/managers/FleetManager.js';
import { RaidManager } from '../../vendor/structs-webapp/js/managers/RaidManager.js';
import { StructManager } from '../../vendor/structs-webapp/js/managers/StructManager.js';
import { TaskManager } from '../../vendor/structs-webapp/js/managers/TaskManager.js';
import { TaskStateFactory } from '../../vendor/structs-webapp/js/factories/TaskStateFactory.js';
import { DestroyedStructManager } from '../../vendor/structs-webapp/js/managers/DestroyedStructManager.js';
import { AnimationEventQueue } from '../../vendor/structs-webapp/js/data_structures/AnimationEventQueue.js';
import { PlanetRaidFactory } from '../../vendor/structs-webapp/js/factories/PlanetRaidFactory.js';
import { RaidSearchRequestDTO } from '../../vendor/structs-webapp/js/dtos/RaidSearchRequestDTO.js';
import { EVENTS } from '../../vendor/structs-webapp/js/constants/Events.js';
import { TASK } from '../../vendor/structs-webapp/js/constants/TaskConstants.js';
import { TASK_TYPES } from '../../vendor/structs-webapp/js/constants/TaskTypes.js';
import { PLAYER_TYPES } from '../../vendor/structs-webapp/js/constants/PlayerTypes.js';
import { RAID_STATUS } from '../../vendor/structs-webapp/js/constants/RaidStatus.js';
import { LOG_LEVEL } from '../../vendor/structs-webapp/js/constants/GrassConstants.js';
import { TX_STATUS } from '../../vendor/structs-webapp/js/models/SigningTransaction.js';

const P = PLAYER_TYPES;

/** Where the guild's services live. Defaults match the webapp: same host. */
export function liveEndpoints(overrides = {}) {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  const host = typeof location !== 'undefined' ? location.hostname : 'localhost';
  const wsProto = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss' : 'ws';
  const sameOrigin = (p) => `${wsProto}://${typeof location !== 'undefined' ? location.host : host}${p}`;
  return {
    api: overrides.api || env.VITE_GUILD_API_PATH || '/api',
    grass: overrides.grass || env.VITE_GRASS_URL || (env.VITE_PROXY_GRASS ? sameOrigin('/grass') : `ws://${host}:1443`),
    rpc: overrides.rpc || env.VITE_RPC_URL || (env.VITE_PROXY_RPC ? sameOrigin('/rpc') : `ws://${host}:26657`),
  };
}

export class LiveService extends Service {
  constructor(opts = {}) {
    super('live');
    this.endpoints = liveEndpoints(opts.endpoints || {});
    this.state.tickMs = 6000;
    this.opts = opts;
    this.wire();
  }

  /* ── wiring (mirrors structs-webapp/src/js/index.js, without its screens) ─ */

  wire() {
    if (this.opts.workerUrl) TASK.WORKER_PATH = this.opts.workerUrl;

    const gameState = this.gs = new GameState();
    globalThis.gameState = gameState;
    const guildAPI = this.api = new GuildAPI();
    guildAPI.apiUrl = this.endpoints.api;
    gameState.guildAPI = guildAPI;

    const walletManager = this.walletManager = new WalletManager();
    this.grass = new GrassManager(this.endpoints.grass, 'structs.>', gameState, LOG_LEVEL.NONE);
    this.blockGrass = new GrassManager(this.endpoints.grass, 'consensus', gameState);

    const scm = this.signing = new SigningClientManager(gameState);
    scm.wsUrl = this.endpoints.rpc;
    scm.queue.wsUrl = this.endpoints.rpc;
    globalThis.signingClientManager = scm;

    const structManager = this.structManager = new StructManager(gameState, guildAPI, scm);
    const planetManager = this.planetManager = new PlanetManager(gameState, scm, guildAPI);
    const playerAddressManager = this.playerAddressManager = new PlayerAddressManager(gameState, guildAPI);
    const permissionManager = new PermissionManager();
    const mapManager = this.mapManager = makeNoop('MapManager');
    const raidManager = this.raidManager = new RaidManager(gameState, guildAPI, this.grass, mapManager, structManager);
    const taskManager = this.taskManager = new TaskManager(gameState, guildAPI, scm, new TaskStateFactory());
    globalThis.taskManager = taskManager;
    const destroyed = new DestroyedStructManager(gameState, structManager);
    globalThis.destroyedStructManager = destroyed;

    const queue = new AnimationEventQueue();
    queue.initListeners();
    gameState.animationEventQueue = queue;
    // The webapp's map waits for each animation to finish. Ours animates from
    // the GRASS frames directly, so let the queue flow.
    window.addEventListener(EVENTS.ANIMATION, () => setTimeout(() => window.dispatchEvent(new CustomEvent(EVENTS.ANIMATION_END)), 0));

    gameState.alphaBaseMap = makeNoop('alphaBaseMap');
    gameState.raidMap = makeNoop('raidMap');
    gameState.previewMap = makeNoop('previewMap');

    this.auth = new AuthManager(gameState, guildAPI, walletManager, this.grass, scm, planetManager,
      playerAddressManager, new PlayerAddressPendingFactory(), raidManager, mapManager, taskManager,
      structManager, destroyed, permissionManager);
    guildAPI.setReauthenticator(() => this.auth.reauthenticate());
    this.alphaManager = new AlphaManager(gameState, scm);
    this.fleetManager = new FleetManager(gameState, scm);

    // Our own ear on the stream: everything that should move something on screen.
    const self = this;
    this.grass.registerListener({
      name: 'A_LA_STRUCTS', shouldUnregister: () => false,
      handler(msg) { self.onGrass(msg); },
    });
    this.blockGrass.registerListener(new BlockListener(gameState));
    this.blockGrass.registerListener({
      name: 'A_LA_STRUCTS_TICK', shouldUnregister: () => false,
      handler(msg) { if (msg.category === 'block') self.onBlock(); },
    });

    // Core game-state events → re-read.
    [EVENTS.ALPHA_COUNT_CHANGED, EVENTS.ORE_COUNT_CHANGED, EVENTS.ENERGY_USAGE_CHANGED, EVENTS.CHARGE_LEVEL_CHANGED,
      EVENTS.STRUCT_COUNT_CHANGED, EVENTS.FLEET_CHANGED, EVENTS.PLANET_RAID_STATUS_CHANGED, EVENTS.UNDISCOVERED_ORE_COUNT_CHANGED,
      EVENTS.SHIELD_HEALTH_CHANGED, EVENTS.TASK_STATE_CHANGED, EVENTS.TASK_COMPLETED, EVENTS.RENDER_STRUCT, EVENTS.LOGIN_COMPLETE,
    ].forEach((ev) => window.addEventListener(ev, () => this.schedulePull(ev)));
    window.addEventListener(EVENTS.SIGNING_TRANSACTION_SETTLED, (e) => this.onTxSettled(e));
  }

  /* ── session ──────────────────────────────────────────────────────────── */

  /** Connect to the guild and, if this browser already has a player, sign in. */
  async start() {
    const gs = this.gs;
    this.grass.init();
    this.blockGrass.init();
    await gs.load();
    gs.settings = await this.api.getSettings();
    gs.thisGuild = await this.api.getThisGuild();
    this.state.me.guildId = gs.thisGuild?.id;
    this.state.me.guildName = gs.thisGuild?.name || '';
    this.state.guildInfo = gs.thisGuild;
    setInterval(() => {
      this.grass.resumeCheck(); this.blockGrass.resumeCheck(); this.signing.resumeCheck(false).then();
    }, 30000);
    setTimeout(() => window.dispatchEvent(new CustomEvent(EVENTS.TASK_CMD_MANAGER_RESUME)), TASK.START_DELAY);
    const pid = gs.keyPlayers[P.PLAYER].id;
    if (pid && gs.mnemonic) {
      await this.auth.login(pid);
      await this.playerAddressManager.addPlayerAddressMeta();
      await this.afterLogin();
      return true;
    }
    return false;
  }

  hasSavedPlayer() { return !!(this.gs.keyPlayers[P.PLAYER].id && this.gs.mnemonic); }

  newRecoveryPhrase() { return this.walletManager.createMnemonic(); }

  /** Brand-new owner: joins this guild with a fresh recovery phrase. */
  async signUp(mnemonic, username) {
    const gs = this.gs;
    gs.mnemonic = mnemonic;
    gs.signupRequest.username = username || null;
    const ok = await this.auth.signup(mnemonic);
    if (!ok) throw new Error('The guild did not accept the sign-up.');
    await this.waitFor(() => gs.keyPlayers[P.PLAYER].player && gs.keyPlayers[P.PLAYER].planet, 180000, 'Waiting for your first restaurant to open…');
    gs.save();
    await this.afterLogin();
  }

  /** Existing owner on a new device: registers this browser using their recovery phrase. */
  async recover(mnemonic) {
    const gs = this.gs;
    const done = new Promise((resolve) => window.addEventListener(EVENTS.LOGIN_COMPLETE, resolve, { once: true }));
    const ok = await this.auth.loginWithMnemonic(mnemonic.trim());
    if (!ok) throw new Error('Couldn’t register this device. Check the recovery phrase and that you belong to this guild.');
    await Promise.race([done, this.waitFor(() => gs.keyPlayers[P.PLAYER].planet, 180000)]);
    gs.save();
    await this.afterLogin();
  }

  async waitFor(fn, ms, note) {
    if (note) this.toast(note, 'info');
    const t0 = Date.now();
    while (!fn()) {
      if (Date.now() - t0 > ms) throw new Error('Timed out waiting for the guild.');
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  async afterLogin() {
    this.pull();
    this.state.ready = true;
    this.emit(['all']);
  }

  logout() { try { localStorage.removeItem('gameState'); } catch (e) { /* ignore */ } location.reload(); }

  /* ── reading the core's game state ────────────────────────────────────── */

  schedulePull() {
    if (this.pullTimer) return;
    this.pullTimer = setTimeout(() => { this.pullTimer = null; this.pull(); this.emit(['structs', 'wallet', 'challenge']); }, 120);
  }

  onBlock() {
    this.state.tick = this.gs.currentBlockHeight;
    this.state.lastTickAt = Date.now();
    this.pullJobs();
    this.emit(['tick']);
  }

  pull() {
    const gs = this.gs, s = this.state;
    if (gs.structTypes && gs.structTypes.structTypes) this.syncTypes();
    const kp = gs.keyPlayers[P.PLAYER];
    const pl = kp.player;
    s.tick = gs.currentBlockHeight || s.tick;
    if (pl) {
      s.me = {
        ...s.me, id: pl.id, name: pl.username || `Owner ${pl.id}`, guildId: pl.guild_id, guildName: pl.guild_name || s.me.guildName,
        guildTag: pl.tag || '', planetId: pl.planet_id, fleetId: pl.fleet_id, address: pl.primary_address,
        species: s.me.species || speciesFor(pl.id, 'owner'),
      };
      s.wallet = {
        ...s.wallet,
        gold: Number(pl.alpha || 0),
        recipes: Number(pl.ore || 0),
        takings: Number(pl.capacity || 0) + Number(pl.connection_capacity || 0),
        payroll: Number(pl.load || 0) + Number(pl.structs_load || 0),
        lastAction: kp.lastActionBlockHeight || 0,
      };
    }
    if (kp.planet) {
      const pt = kp.planet;
      s.restaurant = {
        id: pt.id, name: s.restaurantNames?.[pt.id] || restaurantNameFor(pt.id, pl?.username),
        planetName: pt.name, undiscovered: Number(pt.undiscovered_ore || 0),
        slots: { space: Number(pt.space_slots || 0), air: Number(pt.air_slots || 0), land: Number(pt.land_slots || 0), water: Number(pt.water_slots || 0) },
        reputation: 0,
      };
    }
    s.crew = { status: kp.fleet?.isOnStation?.() ? 'home' : 'away', at: kp.fleet?.location_id || null };
    s.structs = new Map(Object.values(kp.structs || {}).map((x) => normalizeStruct(x, s.types)).filter((x) => !is.destroyed(x)).map((x) => [x.id, x]));
    s.restaurant.reputation = [...s.structs.values()].filter((x) => this.typeOf(x)?.type === 'Orbital Shield Generator' && is.online(x)).length;
    this.pullChallenge();
    this.pullJobs();
  }

  syncTypes() {
    const list = Object.values(this.gs.structTypes.structTypes || {});
    if (list.length && this.state.types.size !== list.length) this.state.types = new TypeCatalog(list);
  }

  pullJobs() {
    const tm = this.taskManager, s = this.state;
    s.jobs = new Map();
    for (const pid of Object.keys(tm.processes || {})) {
      const st = tm.processes[pid].state;
      let progress = 0;
      try { progress = Math.max(0, Math.min(1, tm.getProcessPercentCompleteEstimate(pid) || 0)); } catch (e) { /* estimate unavailable */ }
      const kind = { [TASK_TYPES.BUILD]: 'build', [TASK_TYPES.MINE]: 'mine', [TASK_TYPES.REFINE]: 'refine', [TASK_TYPES.RAID]: 'raid' }[st.task_type];
      const label = { build: 'Onboarding', mine: 'Recipe testing', refine: 'Perfecting a recipe', raid: 'Copying recipes' }[kind];
      s.jobs.set(st.object_id, { kind, progress, label, status: st.status });
      const struct = s.structs.get(st.object_id);
      if (struct && kind === 'build') struct.build = { progress };
    }
  }

  pullChallenge() {
    const gs = this.gs, s = this.state;
    const me = gs.keyPlayers[P.PLAYER];
    const enemy = gs.keyPlayers[P.RAID_ENEMY];
    const raider = gs.keyPlayers[P.PLANET_RAIDER];
    let role = null, host = null, guest = null, info = null;
    if (enemy.planetRaidInfo?.isRaidActive?.() || enemy.planetRaidInfo?.status === RAID_STATUS.REQUESTED) {
      role = 'challenger'; host = enemy; guest = me; info = enemy.planetRaidInfo;
    } else if (me.planetRaidInfo?.isRaidActive?.()) {
      role = 'defender'; host = me; guest = raider; info = me.planetRaidInfo;
    }
    if (!role) {
      if (s.challenge && s.challenge.status === 'ongoing') {
        const st = this.lastRaidStatus || 'attackerRetreated';
        s.challenge.status = st;
        s.challenge.result = { status: st, text: this.resultText(st, s.challenge.role), tone: this.resultTone(st, s.challenge.role) };
        this.fx({ kind: 'challengeEnd', status: st, role: s.challenge.role });
        this.toast(s.challenge.result.text, s.challenge.result.tone);
      }
      return;
    }
    const prev = s.challenge && s.challenge.role === role ? s.challenge : null;
    const structs = new Map();
    for (const kp of [host, guest]) {
      for (const x of Object.values(kp.structs || {})) {
        const n = normalizeStruct(x, s.types);
        if (kp === guest && n.locationType !== 'fleet') continue;            // only the visiting crew
        structs.set(n.id, n);
      }
    }
    const raidJob = [...s.jobs.values()].find((j) => j.kind === 'raid');
    s.challenge = {
      role, hostId: host.id, guestId: guest.id, planetId: info.planet_id,
      restaurantName: role === 'challenger' ? restaurantNameFor(info.planet_id, host.player?.username) : s.restaurant.name,
      host: { id: host.id, name: host.player?.username || `Owner ${host.id}`, species: role === 'defender' ? s.me.species : speciesFor(host.id, 'owner') },
      guest: { id: guest.id, name: guest.player?.username || `Owner ${guest.id}`, species: role === 'challenger' ? s.me.species : speciesFor(guest.id || 'x', 'owner') },
      structs,
      heist: { progress: raidJob ? raidJob.progress : (prev?.heist.progress || 0), needed: 0, reputation: 0, shield: host.planetShieldHealth },
      status: 'ongoing', log: prev?.log || [], result: null,
      hostHustle: host.getCharge?.(gs.currentBlockHeight) ?? 0,
    };
    this.lastRaidStatus = info.status;
  }

  resultText(st, role) {
    const guest = role === 'challenger';
    switch (st) {
      case 'raidSuccessful': return guest ? 'You copied their recipes!' : 'Their crew copied some of your recipes.';
      case 'attackerDefeated': return guest ? 'Your Food Critic was satisfied and the party went home.' : 'You satisfied their Food Critic — the party went home. Recipes safe!';
      case 'demilitarized': return 'The restaurant closed for good — everyone went home.';
      default: return guest ? 'Your crew headed home.' : 'The visiting crew left.';
    }
  }

  resultTone(st, role) {
    if (st === 'raidSuccessful') return role === 'challenger' ? 'good' : 'bad';
    if (st === 'attackerDefeated') return role === 'challenger' ? 'bad' : 'good';
    return 'info';
  }

  /** GRASS frames that should animate something. */
  onGrass(msg) {
    const ch = this.state.challenge;
    switch (msg.category) {
      case 'struct_attack': {
        const d = msg.detail || {};
        const involved = [d.attackerPlayerId, ...(d.eventAttackShotDetail || []).map((x) => x.targetPlayerId)];
        const keyIds = Object.values(this.gs.keyPlayers).map((k) => k.id).filter(Boolean);
        if (!involved.some((id) => keyIds.includes(id))) return;
        this.fx({ kind: 'attack', detail: d, hostId: ch?.hostId });
        if (ch) this.logAttack(d);
        break;
      }
      case 'struct_defense_add':
      case 'struct_defense_remove':
        this.fx({ kind: 'defense', defender: msg.detail.defender_struct_id, protected: msg.detail.protected_struct_id, on: msg.category === 'struct_defense_add' });
        break;
      case 'struct_move':
        this.fx({ kind: 'move', structId: msg.detail.struct_id, ambit: normalizeAmbit(msg.detail.ambit) });
        break;
      case 'struct_status': {
        const was = Number(msg.detail.status_old), now = Number(msg.detail.status);
        if (!(was & STATUS.DESTROYED) && (now & STATUS.DESTROYED)) this.fx({ kind: 'destroyed', structId: msg.detail.struct_id, hostId: ch?.hostId });
        if (!(was & STATUS.BUILT) && (now & STATUS.BUILT)) this.fx({ kind: 'built', structId: msg.detail.struct_id });
        if ((was & STATUS.HIDDEN) !== (now & STATUS.HIDDEN)) this.fx({ kind: 'stealth', structId: msg.detail.struct_id, on: !!(now & STATUS.HIDDEN) });
        break;
      }
      case 'raid_status':
        this.lastRaidStatus = msg.detail?.status || msg.status || this.lastRaidStatus;
        break;
      case 'ore':
        if (msg.subject?.endsWith(`.${this.state.me.id}`)) this.fx({ kind: 'job', job: 'mine' });
        break;
      default: break;
    }
    this.schedulePull();
  }

  logAttack(d) {
    const ch = this.state.challenge;
    const t = this.state.types.get(d.attackerStructTypeId);
    const hostSide = d.attackerPlayerId === ch.hostId;
    const role = roleOf(t);
    const action = (hostSide ? role.serve : role.complain)?.[d.weaponSystem];
    const last = (d.eventAttackShotDetail || []).slice(-1)[0] || {};
    const tt = this.state.types.get(last.targetStructTypeId);
    const who = hostSide ? `${nameFor(d.attackerStructId)} the ${role.role}` : `The ${role.customer?.persona || 'customer'}`;
    const whom = hostSide ? `the ${roleOf(tt).customer?.persona || 'customer'}` : `${nameFor(last.targetStructId)} the ${roleOf(tt).role}`;
    let text = `${who} ${action?.line || (hostSide ? 'served' : 'complained to')} ${whom}`;
    if (last.evaded) text += ' — no effect.';
    else if (last.blocked) text += ' — someone stepped in.';
    else if (last.targetDestroyed) text += hostSide ? ' — fully satisfied!' : ' — fired!';
    ch.log.unshift({ tick: this.state.tick, text, tone: hostSide ? 'good' : 'bad' });
  }

  onTxSettled(e) {
    // Failures of actions started here surface through settle(); this catches
    // the background ones (proof-of-work completions, raid completion).
    if (e.status && e.status !== TX_STATUS.SUCCEEDED && e.status !== TX_STATUS.CANCELLED && e.error && !this.awaiting) {
      this.toast(this.friendlyError(e.error), 'bad');
    }
  }

  /* ── actions ──────────────────────────────────────────────────────────── */

  async settle(promise, okText) {
    this.awaiting = (this.awaiting || 0) + 1;
    let tx;
    try { tx = await promise; } finally { this.awaiting--; }
    if (tx && tx.status && tx.status !== TX_STATUS.SUCCEEDED) throw new Error(this.friendlyError(tx.error || tx.lastError || 'The guild rejected it.'));
    if (okText) this.toast(okText, 'good');
    this.schedulePull();
    return tx;
  }

  hustle() {
    const kp = this.gs.keyPlayers[P.PLAYER];
    return Math.max(0, (this.gs.currentBlockHeight || 0) - (kp.lastActionBlockHeight || 0));
  }

  async hire(typeId, ambit, slot) {
    const t = this.state.types.get(typeId);
    const blocker = this.hireBlocker(t, ambit);
    if (blocker) throw new Error(blocker);
    const free = this.freeSlots(t, ambit);
    if (slot == null || !free.includes(slot)) slot = free[0];
    const role = roleOf(t);
    this.toast(role.kind === 'equipment' ? `Ordering a ${role.role}…` : `Posting a job ad for a ${role.role}…`, 'info');
    return this.settle(this.signing.queueMsgStructBuildInitiate(this.state.me.id, t.id, ambit, slot, t.buildCharge || 0),
      role.kind === 'equipment' ? `Your ${role.role} is on its way.` : `A new ${role.role} is onboarding.`);
  }

  async cancelHire(id) { return this.settle(this.signing.queueMsgStructBuildCancel(id)); }
  async clockIn(id) { const t = this.typeOf(this.find(id)); return this.settle(this.signing.queueMsgStructActivate(id, t.activateCharge || 0)); }
  async clockOut(id) { return this.settle(this.signing.queueMsgStructDeactivate(id)); }
  async cover(defId, protId) { const t = this.typeOf(this.find(defId)); return this.settle(this.signing.queueMsgStructDefenseSet(defId, protId, t.defendChangeCharge || 0)); }
  async uncover(defId) { const t = this.typeOf(this.find(defId)); return this.settle(this.signing.queueMsgStructDefenseClear(defId, t.defendChangeCharge || 0)); }
  async walkManager(ambit) {
    const m = this.manager();
    if (!m) throw new Error('No Manager');
    const t = this.typeOf(m);
    return this.settle(this.signing.queueMsgStructMove(m.id, m.locationType, ambit, m.slot || 0, t.moveCharge || 0));
  }
  async blendIn(id, on = true) {
    const t = this.typeOf(this.find(id));
    return this.settle(on ? this.signing.queueMsgStructStealthActivate(id, t.stealthActivateCharge || 0) : this.signing.queueMsgStructStealthDeactivate(id, t.stealthActivateCharge || 0));
  }
  async serve(attackerId, targetId, ws = 'primaryWeapon') {
    const t = this.typeOf(this.find(attackerId));
    this.toast('Order placed — the guild will settle it next tick.', 'info');
    return this.settle(this.signing.queueMsgStructAttack(attackerId, [targetId], ws, weaponField(t, ws, 'Charge') || 0));
  }
  async investGold(structId, amount) {
    amount = Math.floor(Number(amount));
    if (!(amount > 0)) throw new Error('Choose how much gold to invest.');
    if (structId) await this.alphaManager.structGeneratorInfuse(structId, amount);
    else await this.alphaManager.infuse(amount);
    this.toast(`Invested ${amount} gold.`, 'good');
    this.schedulePull();
  }

  find(id) {
    const s = this.state.structs.get(id) || this.state.challenge?.structs.get(id);
    if (!s) throw new Error('not found');
    return s;
  }

  serveBlocker(attackerId, targetId, ws) {
    const a = this.state.challenge?.structs.get(attackerId) || this.state.structs.get(attackerId);
    const tg = this.state.challenge?.structs.get(targetId);
    if (!a || !tg) return 'Not here';
    const at = this.typeOf(a);
    if (!hasWeapon(at, ws)) return 'No such move';
    if (!is.online(a)) return 'Off shift';
    if (is.destroyed(tg)) return 'Already left';
    let mask = weaponField(at, ws, 'Ambits') || 0;
    if (mask & 32) mask |= AREAS[a.ambit].bit;
    if (!(mask & AREAS[tg.ambit].bit)) return 'Can’t reach that area';
    if (is.hidden(tg) && tg.ambit !== a.ambit) return 'Blending in';
    const cost = weaponField(at, ws, 'Charge') || 0;
    if (this.hustle() < cost) return `Needs ${cost} hustle`;
    return null;
  }

  async openNewRestaurant() { await this.planetManager.findNewPlanet(); this.toast('Scouting for a new location…', 'info'); }

  /* ── town & rivals ────────────────────────────────────────────────────── */

  async getGroup() {
    const gid = this.state.me.guildId || this.gs.thisGuild?.id;
    const roster = gid ? await this.api.getGuildRoster(gid) : [];
    return {
      group: { id: gid, name: this.state.me.guildName || this.gs.thisGuild?.name, tag: this.state.me.guildTag },
      members: roster.map((m) => ({
        id: m.id, name: m.username || `Owner ${m.id}`, species: m.id === this.state.me.id ? this.state.me.species : speciesFor(m.id, 'owner'),
        restaurantName: m.planet_id ? restaurantNameFor(m.planet_id, m.username) : 'Looking for a location',
        planetId: m.planet_id, recipes: Number(m.ore || 0), staff: null, online: null, isMe: m.id === this.state.me.id,
        crewHome: m.fleet_status === 'onStation',
      })),
    };
  }

  async peekRestaurant(playerId) {
    const [player, structs] = await Promise.all([this.api.getPlayer(playerId), this.api.getStructsByPlayerId(playerId)]);
    return {
      player: { id: playerId, name: player.username || `Owner ${playerId}`, species: speciesFor(playerId, 'owner'), guildName: player.guild_name },
      restaurantName: restaurantNameFor(player.planet_id, player.username),
      structs: structs.map((x) => normalizeStruct(x, this.state.types)).filter((x) => !is.destroyed(x)),
    };
  }

  async findRivals(query = '') {
    const dto = new RaidSearchRequestDTO();
    dto.search_string = query || null;
    dto.min_ore = 0;
    dto.page = 1;
    const list = await this.api.raidSearch(dto);
    return list.filter((p) => p.id !== this.state.me.id).map((p) => ({
      id: p.id, name: p.username || `Owner ${p.id}`, species: speciesFor(p.id, 'owner'),
      restaurantName: p.planet_id ? restaurantNameFor(p.planet_id, p.username) : '—',
      guildName: p.guild_name || '', guildTag: p.tag || '', recipes: Number(p.ore || 0), gold: Number(p.alpha || 0),
      undiscovered: Number(p.undiscovered_ore || 0), crewHome: p.fleet_status === 'onStation',
      underChallenge: !!p.under_attack, planetId: p.planet_id, staff: null,
    }));
  }

  async startChallenge(rivalId, rival) {
    const gs = this.gs;
    const me = gs.keyPlayers[P.PLAYER];
    if (!me.isCommandStructAlive()) throw new Error('Your Manager has to lead the crew.');
    const r = rival || (await this.findRivals()).find((x) => x.id === rivalId);
    if (!r?.planetId) throw new Error('That rival has no restaurant to visit.');
    const raid = new PlanetRaidFactory().make({ fleet_id: me.player.fleet_id, planet_id: r.planetId, planet_owner: r.id, status: RAID_STATUS.REQUESTED });
    gs.setRaidPlanetRaidInfo(raid);
    this.grass.registerListener(new RaidStatusListener(gs, this.raidManager, this.mapManager));
    this.toast(`Sending your crew to ${r.restaurantName}…`, 'info');
    await this.fleetManager.moveFleet(r.planetId);
    this.schedulePull();
  }

  async goHome() {
    const me = this.gs.keyPlayers[P.PLAYER];
    await this.fleetManager.moveFleet(me.planet.id);
    this.toast('Calling the crew home…', 'info');
  }

  dismissChallenge() {
    if (this.state.challenge && this.state.challenge.status !== 'ongoing') { this.state.challenge = null; this.emit(['challenge']); }
  }
}
