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
import { Service, nameProblem, describeBrowser, PAGE_SIZE } from './Service.js';
import { forgetSession } from './session.js';
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
import { CreateActivationCodeRequestDTO } from '../../vendor/structs-webapp/js/dtos/CreateActivationCodeRequestDTO.js';
import { SetAddressPermissionsRequestDTO } from '../../vendor/structs-webapp/js/dtos/SetAddressPermissionsRequestDTO.js';
import { TransferSearchRequestDTO } from '../../vendor/structs-webapp/js/dtos/TransferSearchRequestDTO.js';
import { PERMISSIONS } from '../../vendor/structs-webapp/js/constants/Permissions.js';
import { EVENTS } from '../../vendor/structs-webapp/js/constants/Events.js';
import { TASK } from '../../vendor/structs-webapp/js/constants/TaskConstants.js';
import { TASK_TYPES } from '../../vendor/structs-webapp/js/constants/TaskTypes.js';
import { PLAYER_TYPES } from '../../vendor/structs-webapp/js/constants/PlayerTypes.js';
import { RAID_STATUS } from '../../vendor/structs-webapp/js/constants/RaidStatus.js';
const RAID_ENDED = new Set([RAID_STATUS.ATTACKER_DEFEATED, RAID_STATUS.ATTACKER_RETREATED, RAID_STATUS.RAID_SUCCESSFUL, RAID_STATUS.DEMILITARIZED]);
import { LOG_LEVEL } from '../../vendor/structs-webapp/js/constants/GrassConstants.js';
import { TX_STATUS } from '../../vendor/structs-webapp/js/models/SigningTransaction.js';
import { signInViaGuild, discoverHomeserver, matrixDeviceId } from './live/MatrixChat.js';
import { playerIdForAddress } from './live/guildConfig.js';

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

/** The address a recovery phrase signs as. Throws a readable error for a mistyped phrase. */
export async function addressForPhrase(mnemonic) {
  let wallet;
  try { wallet = await new WalletManager().createWallet(mnemonic.trim().toLowerCase().split(/\s+/).join(' ')); } catch (e) {
    throw new Error('That isn’t a valid recovery phrase. Check the words and their order.');
  }
  return (await wallet.getAccounts())[0].address;
}

/** Make `new Worker(url)` for this one URL start a module worker. */
function startAsModuleWorker(url) {
  const Native = globalThis.Worker;
  if (!Native || Native.moduleUrl === url) return;
  globalThis.Worker = class extends Native {
    static moduleUrl = url;
    constructor(u, opts) { super(u, String(u) === url ? { ...opts, type: 'module' } : opts); }
  };
}

export class LiveService extends Service {
  /**
   * @param {object} [opts]
   * @param {object} [opts.guild]  resolved guild (live/guildConfig.js resolveGuild):
   *   { id, api, grass, rpc, matrix, name }. Without it the page must be served
   *   through the guild (or the dev proxy) and uses same-origin /api.
   */
  constructor(opts = {}) {
    super('live');
    this.guild = opts.guild || null;
    const fromGuild = this.guild ? { api: this.guild.api, grass: this.guild.grass, rpc: this.guild.rpc } : {};
    this.endpoints = liveEndpoints({ ...fromGuild, ...(opts.endpoints || {}) });
    this.state.tickMs = 6000;
    this.opts = opts;
    this.wire();
  }

  /* ── wiring (mirrors structs-webapp/src/js/index.js, without its screens) ─ */

  wire() {
    if (this.opts.workerUrl) {
      TASK.WORKER_PATH = this.opts.workerUrl;
      // The dev server serves workers as ES modules (…?worker_file&type=module),
      // but the core starts its proof-of-work worker as a classic script, which
      // dies on its first import: hires never finish onboarding and recipes are
      // never tested or perfected. Start that worker as a module instead.
      // (`vite build` bundles it as a classic script, so this is dev only.)
      if (/[?&]type=module\b/.test(this.opts.workerUrl)) startAsModuleWorker(this.opts.workerUrl);
    }

    const gameState = this.gs = new GameState();
    // The core reports a rejected transaction only as "Broadcast rejected: code N"
    // and drops the chain's reason. Wrap the signing client as it's set so we
    // keep that reason (rawLog) and can tell the player what actually went wrong.
    let signingClient = null;
    Object.defineProperty(gameState, 'signingClient', {
      configurable: true, enumerable: true,
      get: () => signingClient,
      set: (c) => { signingClient = c ? this.keepRejections(c) : c; },
    });
    globalThis.gameState = gameState;
    const guildAPI = this.api = new GuildAPI();
    guildAPI.apiUrl = this.endpoints.api;
    gameState.guildAPI = guildAPI;
    // Talking to the guild API on another origin (CORS): our own guild gets
    // credentials so its session cookie comes along. The vendored ajaxer
    // never sets them, so wrap its send() rather than edit vendor code.
    if (/^https?:\/\//.test(this.endpoints.api) && new URL(this.endpoints.api).origin !== location.origin) {
      guildAPI.ajax.send = (method, url, data) => fetch(url, {
        method, redirect: 'follow', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
    }

    const walletManager = this.walletManager = new WalletManager();
    this.grass = new GrassManager(this.endpoints.grass, 'structs.>', gameState, LOG_LEVEL.NONE);
    this.blockGrass = new GrassManager(this.endpoints.grass, 'consensus', gameState);

    const scm = this.signing = new SigningClientManager(gameState);
    scm.wsUrl = this.endpoints.rpc;
    scm.queue.wsUrl = this.endpoints.rpc;
    globalThis.signingClientManager = scm;
    // The queue already saves itself (per signing address) and replays after a
    // reload. It gives up on the first failure, though, so give orders that
    // failed for a passing reason — a dropped socket, a busy node, a sequence
    // race between two tabs — another couple of tries. Rule failures (not
    // enough hustle, out of reach…) still fail at once.
    scm.queue.canRetry = (tx) => {
      const again = tx.attempts < 1 + ORDER_RETRIES && isTransient(tx.error);
      if (again) this.toast('An order didn’t reach the restaurant group — trying again…', 'info');
      return again;
    };

    const structManager = this.structManager = new StructManager(gameState, guildAPI, scm);
    const planetManager = this.planetManager = new PlanetManager(gameState, scm, guildAPI);
    const playerAddressManager = this.playerAddressManager = new PlayerAddressManager(gameState, guildAPI);
    const permissionManager = this.permissionManager = new PermissionManager();
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
    this.state.me.guildName = gs.thisGuild?.name || this.guild?.name || '';
    this.state.guildInfo = gs.thisGuild;
    setInterval(() => {
      this.grass.resumeCheck(); this.blockGrass.resumeCheck(); this.signing.resumeCheck(false).then();
    }, 30000);
    this.watchForResume();
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

  /**
   * Sign in to the guild's Matrix chat with the same signed login the guild API
   * uses. Returns { homeserver, session } for live/MatrixChat.js.
   */
  async chatSignIn() {
    const gs = this.gs;
    if (!gs.signingAccount || !gs.thisGuild) throw new Error('Sign in to your restaurant group first');
    const login = await this.auth.buildLoginRequest();
    const session = await signInViaGuild(this.endpoints.api, {
      address: login.address, pubkey: login.pubkey, signature: login.signature,
      guild_id: login.guild_id, unix_timestamp: login.unix_timestamp,
    }, matrixDeviceId());
    const homeserver = this.guild?.matrix || import.meta.env?.VITE_MATRIX_HOMESERVER || await discoverHomeserver(session.user_id);
    return { homeserver, session };
  }

  hasSavedPlayer() { return !!(this.gs.keyPlayers[P.PLAYER].id && this.gs.mnemonic); }

  newRecoveryPhrase() { return this.walletManager.createMnemonic(); }

  /** Brand-new owner: joins this guild with a fresh recovery phrase. */
  async signUp(mnemonic, username) {
    const gs = this.gs;
    gs.mnemonic = mnemonic;
    gs.signupRequest.username = username || null;
    const ok = await this.auth.signup(mnemonic);
    if (!ok) throw new Error('The restaurant group didn’t accept the sign-up.');
    // The webapp waits for the PLAYER_CREATED frame on GRASS. If the stream is
    // down that never comes, so also watch the chain directly (LCD) and finish
    // the login ourselves if GRASS hasn't a few seconds after the player lands.
    this.watchSignupOnChain(gs.signingAccount.address);
    await this.waitFor(() => gs.keyPlayers[P.PLAYER].player && gs.keyPlayers[P.PLAYER].planet, 180000, 'Waiting for your first restaurant to open…');
    gs.save();
    await this.afterLogin();
  }

  /** Existing owner on a new device: registers this browser using their recovery phrase. */
  async recover(mnemonic) {
    const gs = this.gs;
    const done = new Promise((resolve) => window.addEventListener(EVENTS.LOGIN_COMPLETE, resolve, { once: true }));
    const ok = await this.auth.loginWithMnemonic(mnemonic.trim());
    if (!ok) throw new Error('Couldn’t register this device. Check the recovery phrase and that you belong to this restaurant group.');
    await Promise.race([done, this.waitFor(() => gs.keyPlayers[P.PLAYER].planet, 180000)]);
    gs.save();
    await this.afterLogin();
  }

  async watchSignupOnChain(address) {
    const reactor = this.guild?.reactor;
    const t0 = Date.now();
    let n = 0;
    while (Date.now() - t0 < 240000 && !this.gs.keyPlayers[P.PLAYER].id) {
      await new Promise((r) => setTimeout(r, n++ < 5 ? 3000 : 6000));
      const id = await playerIdForAddress(address, reactor);
      if (!id) continue;
      await new Promise((r) => setTimeout(r, 8000)); // give GRASS its chance first
      if (this.gs.keyPlayers[P.PLAYER].id) return;
      console.info('[signup] player found on chain, finishing login without GRASS');
      await this.auth.login(id);
      if (!this.gs.keyPlayers[P.PLAYER].planet) await this.planetManager.findNewPlanet();
      return;
    }
  }

  async waitFor(fn, ms, note) {
    if (note) this.toast(note, 'info');
    const t0 = Date.now();
    while (!fn()) {
      if (Date.now() - t0 > ms) throw new Error('Timed out waiting for the restaurant group.');
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  /**
   * A tab that slept or went offline can come back with sockets that look open
   * but carry nothing. Re-check the event stream and the signing connection
   * whenever the page comes back (structs-webapp index.js does the same).
   */
  watchForResume() {
    if (this.resumeWired) return;
    this.resumeWired = true;
    const resume = () => {
      this.grass.resumeCheck(); this.blockGrass.resumeCheck();
      if (this.gs.wallet) this.signing.resumeCheck(true).then();
    };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resume(); });
    window.addEventListener('pageshow', (e) => { if (e.persisted) resume(); });
    window.addEventListener('online', () => { resume(); this.toast('Back online — reconnecting to your restaurant group.', 'info'); });
    window.addEventListener('offline', () => this.toast('You’re offline. Orders wait until you’re back.', 'bad'));
    window.addEventListener('focus', () => resume());
  }

  async afterLogin() {
    this.watchKeyRevoked();
    this.pull();
    this.state.ready = true;
    this.emit(['all']);
  }

  logout() { forgetSession(); location.reload(); }

  /** If another device takes back this browser's key, sign out here too. */
  watchKeyRevoked() {
    const gid = this.gs.thisGuild?.id, me = this.myAddress();
    if (!gid || !me || this.revokeWatched) return;
    this.revokeWatched = true;
    this.grass.registerListener({
      name: 'A_LA_STRUCTS_KEY_REVOKED', shouldUnregister: () => false,
      handler: (m) => {
        if (m.category === 'player_address' && m.status === 'revoked' && m.address === me && m.subject === `structs.player.${gid}.${this.state.me.id}`) {
          this.dispatchEvent(new CustomEvent('revoked'));
        }
      },
    });
  }

  /* ── signing in with a key code (a device someone already signed in approves this one) ── */

  async lookupKeyCode(code) {
    code = String(code || '').trim();
    if (!code) throw new Error('Type the key code shown on your other device.');
    const info = await this.api.getActivationCodeInfo(encodeURIComponent(code)).catch(() => null);
    if (!info?.player_id) throw new Error('That key code doesn’t match a restaurant in this group. Check it — codes only work for a little while.');
    return { code, playerId: String(info.player_id), name: info.username || `Owner ${info.player_id}`, tag: info.tag || '', species: speciesFor(String(info.player_id), 'owner'), raw: info };
  }

  /**
   * Ask for a key: this browser makes a fresh device key and the guild shows
   * the request on the owner's other device. Resolves to { address, approved },
   * where `approved` settles once that device says yes (cancellable).
   */
  async requestKey(owner) {
    const gs = this.gs;
    const ok = await this.auth.addNewDevice(owner.raw);
    if (!ok) throw new Error('The restaurant group didn’t take the request. The code may have expired — make a new one.');
    const gid = gs.thisGuild.id, addr = gs.signingAccount.address;
    const frame = this.waitForFrame(`A_LA_STRUCTS_KEY_GRANTED`,
      (m) => m.category === 'player_address' && m.subject === `structs.player.${gid}.${owner.playerId}` && m.status === 'approved' && m.address === addr);
    // GRASS can miss it, so also ask the chain now and then.
    let polling = true;
    const poll = (async () => {
      while (polling) {
        await new Promise((r) => setTimeout(r, 5000));
        if (polling && (await playerIdForAddress(addr, this.guild?.reactor).catch(() => null)) === owner.playerId) return true;
      }
      return new Promise(() => {});
    })();
    const approved = Promise.race([frame, poll]).finally(() => { polling = false; frame.cancel(); });
    approved.cancel = () => { polling = false; frame.cancel(); };
    return { address: addr, approved };
  }

  /** The other device said yes: sign in as that owner with this browser's new key. */
  async completeKeySignIn(owner) {
    const gs = this.gs;
    const done = new Promise((resolve) => window.addEventListener(EVENTS.LOGIN_COMPLETE, resolve, { once: true }));
    const ok = await this.auth.login(owner.playerId);
    if (!ok) throw new Error('The restaurant group didn’t let this key in. Try again from your other device.');
    await Promise.race([done, this.waitFor(() => gs.keyPlayers[P.PLAYER].planet, 180000)]);
    gs.save();
    await this.afterLogin();
  }

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
        // How it ended: the chain's raid_status message, else the raid info's own final status.
        const final = (s.challenge.role === 'challenger' ? enemy : me).planetRaidInfo?.status;
        const st = [this.lastRaidStatus, final].find((x) => RAID_ENDED.has(x)) || 'attackerRetreated';
        s.challenge.status = st;
        const stolen = st === 'raidSuccessful' ? (this.lastSeized || 0) : 0;
        s.challenge.result = { status: st, stolen, text: this.resultText(st, s.challenge.role, stolen), tone: this.resultTone(st, s.challenge.role) };
        this.lastSeized = 0;
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
        // The chain only lets crew at this restaurant serve each other, so leave
        // out anyone whose crew is away somewhere else.
        n.at = this.whereIs(n, kp);
        if (n.at && info.planet_id && n.at !== info.planet_id) continue;
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
    // Keep an ending the raid_status message already told us about: the raid
    // info can still say "ongoing" for a refresh or two after the raid ends.
    if (!prev || !RAID_ENDED.has(this.lastRaidStatus)) this.lastRaidStatus = info.status;
  }

  resultText(st, role, stolen = 0) {
    const guest = role === 'challenger';
    const n = `${stolen} recipe${stolen === 1 ? '' : 's'}`;
    switch (st) {
      case 'raidSuccessful': return guest ? (stolen ? `You copied ${n}!` : 'You stayed the whole service, but there were no recipes to copy.') : (stolen ? `Their crew copied ${n} from you.` : 'Their crew stayed the whole service, but found no recipes to copy.');
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
  /** One of my structs, or one in the challenge I'm in. */
  isOurs(id) { return !!id && (this.state.structs.has(id) || !!this.state.challenge?.structs?.has(id)); }

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
        // The stream carries everyone's structs; only ours (or this challenge's) matter here.
        if (!this.isOurs(msg.detail.defender_struct_id) && !this.isOurs(msg.detail.protected_struct_id)) break;
        this.fx({ kind: 'defense', defender: msg.detail.defender_struct_id, protected: msg.detail.protected_struct_id, on: msg.category === 'struct_defense_add' });
        break;
      case 'struct_move':
        if (!this.isOurs(msg.detail.struct_id)) break;
        this.fx({ kind: 'move', structId: msg.detail.struct_id, ambit: normalizeAmbit(msg.detail.ambit) });
        break;
      case 'struct_status': {
        // Somebody else's struct finishing onboarding isn't news here (it used to ring the hire jingle).
        if (!this.isOurs(msg.detail.struct_id)) break;
        const was = Number(msg.detail.status_old), now = Number(msg.detail.status);
        if (!(was & STATUS.DESTROYED) && (now & STATUS.DESTROYED)) this.fx({ kind: 'destroyed', structId: msg.detail.struct_id, hostId: ch?.hostId });
        if (!(was & STATUS.BUILT) && (now & STATUS.BUILT)) this.fx({ kind: 'built', structId: msg.detail.struct_id });
        if ((was & STATUS.HIDDEN) !== (now & STATUS.HIDDEN)) this.fx({ kind: 'stealth', structId: msg.detail.struct_id, on: !!(now & STATUS.HIDDEN) });
        break;
      }
      case 'raid_status':
        this.lastRaidStatus = msg.detail?.status || msg.status || this.lastRaidStatus;
        if (msg.detail?.seized_ore != null) this.lastSeized = Number(msg.detail.seized_ore) || 0;
        break;
      case 'ore': {
        // The stream re-sends the current ore count; only a rise is a new recipe.
        const me = this.state.me.id;
        if (msg.subject !== `structs.grid.player.${me}.${me}`) break;
        const ore = Number(msg.value);
        if (Number.isFinite(ore)) {
          if (this.lastOre != null && ore > this.lastOre) this.fx({ kind: 'job', job: 'mine' });
          this.lastOre = ore;
        }
        break;
      }
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
      this.toast(this.friendlyError(this.whyFailed(e)), 'bad');
    }
  }

  /* ── actions ──────────────────────────────────────────────────────────── */

  /** Remember why the chain refused a transaction (the core only keeps the code). */
  keepRejections(client) {
    if (client.__keepsRejections) return client;
    const send = client.signAndBroadcast.bind(client);
    client.signAndBroadcast = async (...args) => {
      const res = await send(...args);
      if (res && res.code) {
        const typeUrl = args[1]?.[0]?.typeUrl;
        this.lastRejection = { code: res.code, reason: String(res.rawLog || res.log || ''), typeUrl, at: Date.now() };
        console.warn('[chain] rejected', typeUrl, `code ${res.code}:`, this.lastRejection.reason);
      }
      return res;
    };
    client.__keepsRejections = true;
    return client;
  }

  /** The chain's own reason for a failed transaction, if we caught it, else the core's error text. */
  whyFailed(tx) {
    const r = this.lastRejection;
    const typeUrl = tx?.message?.typeUrl || tx?.typeUrl;
    if (r && r.reason && Date.now() - r.at < 120000 && (!typeUrl || !r.typeUrl || r.typeUrl === typeUrl)) {
      // "failed to execute message; message index: 0: <reason>: <codespace error>"
      return r.reason.replace(/^failed to execute message; message index: \d+: /, '');
    }
    return tx?.error || tx?.lastError || 'The restaurant group rejected it.';
  }

  async settle(promise, okText) {
    this.awaiting = (this.awaiting || 0) + 1;
    let tx;
    try { tx = await promise; } finally { this.awaiting--; }
    if (tx && tx.status && tx.status !== TX_STATUS.SUCCEEDED) throw new Error(this.friendlyError(this.whyFailed(tx)));
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
    this.toast('Order placed — it’ll be settled next tick.', 'info');
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

  /** Which planet a struct is at: its own for planet crew, its fleet's for fleet crew. */
  whereIs(n, kp) {
    if (n.locationType !== 'fleet') return n.locationId;
    const fleet = kp?.fleet;
    return fleet && (!n.locationId || n.locationId === fleet.id) ? (fleet.location_id ?? null) : null;
  }

  serveBlocker(attackerId, targetId, ws) {
    const a = this.state.challenge?.structs.get(attackerId) || this.state.structs.get(attackerId);
    const tg = this.state.challenge?.structs.get(targetId);
    if (!a || !tg) return 'Not here';
    const at = this.typeOf(a);
    if (!hasWeapon(at, ws)) return 'No such move';
    if (!is.built(a)) return 'Still onboarding';
    if (!is.online(a)) return 'Off shift';
    if (is.destroyed(tg)) return 'Already left';
    if (!is.built(tg)) return 'Not ready yet';
    const here = this.state.challenge?.planetId;
    const aAt = a.at !== undefined ? a.at : this.whereIs(a, this.gs?.keyPlayers[P.PLAYER]);
    if (here && aAt && aAt !== here) return 'Not at this restaurant';
    if (here && tg.at && tg.at !== here) return 'Not at this restaurant';
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
    const s = this.state, me = s.me.id;
    const members = roster.map((m) => ({
      id: m.id, name: m.username || `Owner ${m.id}`, species: m.id === me ? s.me.species : speciesFor(m.id, 'owner'),
      restaurantName: m.planet_id ? restaurantNameFor(m.planet_id, m.username) : 'Looking for a location',
      planetId: m.planet_id, recipes: Number(m.ore || 0), staff: null, online: null, isMe: m.id === me,
      crewHome: m.fleet_status === 'onStation',
    }));
    // The roster's planet_id is often empty or stale, but the raid search
    // (filtered to our group) knows who has a restaurant: fill it in from there,
    // and add anyone the search finds that the roster missed.
    if (gid) {
      const byId = new Map(members.map((m) => [m.id, m]));
      for (let page = 1; page <= 5; page++) {
        let res;
        try { res = await this.searchRivals({ groupId: gid, page }); } catch (e) { break; }
        for (const r of res.list) {
          if (!r.planetId) continue;
          const m = byId.get(r.id);
          if (m) Object.assign(m, { planetId: r.planetId, restaurantName: r.restaurantName, recipes: r.recipes, crewHome: r.crewHome });
          else { const add = { ...r, online: null, isMe: false }; members.push(add); byId.set(r.id, add); }
        }
        if (page >= res.pages) break;
      }
    }
    // For ourselves, trust our own player state and restaurant name.
    if (me && s.restaurant?.id) {
      let self = members.find((m) => m.isMe);
      if (!self) members.unshift(self = { id: me, name: s.me.name, species: s.me.species, isMe: true, staff: null, online: true });
      Object.assign(self, { planetId: s.restaurant.id, restaurantName: s.restaurant.name, recipes: s.wallet.recipes, crewHome: s.crew.status === 'home' });
    }
    return {
      group: { id: gid, name: s.me.guildName || this.gs.thisGuild?.name, tag: s.me.guildTag },
      members,
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

  async findRivals(query = '') { return (await this.searchRivals({ query })).list; }

  /**
   * The webapp's Scan: { query, minRecipes, groupId, crewOut, notBusy, page }
   * → { list, total, pages }.
   */
  async searchRivals({ query = '', minRecipes = 0, groupId = null, crewOut = false, notBusy = false, page = 1 } = {}) {
    const dto = new RaidSearchRequestDTO();
    dto.search_string = query ? encodeURIComponent(query) : null;
    dto.guild_id = groupId || null;
    dto.min_ore = Math.max(0, Math.floor(Number(minRecipes) || 0));
    dto.fleet_away_only = crewOut ? 1 : 0;
    dto.not_under_attack = notBusy ? 1 : 0;
    dto.page = page;
    const [list, total] = await Promise.all([this.api.raidSearch(dto), this.api.raidSearchCount(dto).catch(() => null)]);
    const rows = list.filter((p) => p.id !== this.state.me.id).map((p) => this.rivalRow(p));
    const count = total ?? list.length;
    return { list: rows, total: count, pages: Math.max(1, Math.ceil(count / PAGE_SIZE)), page };
  }

  rivalRow(p) {
    return {
      id: p.id, name: p.username || `Owner ${p.id}`, species: speciesFor(p.id, 'owner'),
      restaurantName: p.planet_id ? restaurantNameFor(p.planet_id, p.username) : '—',
      guildName: p.guild_name || '', guildTag: p.tag || '', recipes: Number(p.ore || 0), gold: Number(p.alpha || 0),
      undiscovered: Number(p.undiscovered_ore || 0), crewHome: p.fleet_status !== 'away',
      underChallenge: Number(p.under_attack) === 1, planetId: p.planet_id, staff: null,
    };
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

  /* ── the office: owner card, keys, gold ───────────────────────────────── */

  myAddress() { return this.gs.signingAccount?.address || null; }

  /**
   * Whether this owner has won a challenge before — so the guide can tick off
   * a win from before it was watching. Asks the group's raids-won count, which
   * includes defences and wins with nothing to copy. A group server without
   * that count falls back to recipes copied from rivals.
   */
  async hasWonBefore() {
    const id = this.state.me.id;
    try { return Number(await this.api.getSingleDataValue(`${this.api.apiUrl}/player/${id}/raid/won`, 'count')) > 0; } catch (e) { /* older group server */ }
    try { return Number((await this.api.getPlayerOreStats(id, true))?.seized) > 0; } catch (e) { return false; }
  }

  async getProfile(playerId = this.state.me.id) {
    const isMe = playerId === this.state.me.id;
    const api = this.api;
    const soft = (p) => p.catch(() => null);
    const [player, infusion, ore, completed, launched] = await Promise.all([
      isMe ? this.gs.keyPlayers[P.PLAYER].player : api.getPlayer(playerId),
      soft(api.getInfusionByPlayerId(playerId)), soft(api.getPlayerOreStats(playerId, true)),
      soft(api.getPlayerPlanetsCompleted(playerId, true)), soft(api.getPlayerRaidsLaunched(playerId, true)),
    ]);
    if (!player) throw new Error('Couldn’t find that owner.');
    const num = (x) => (x == null || Number.isNaN(Number(x)) ? null : Number(x));
    return {
      id: playerId, isMe, name: player.username || `Owner ${playerId}`, address: player.primary_address,
      species: isMe ? this.state.me.species : speciesFor(playerId, 'owner'),
      guildId: player.guild_id, guildName: player.guild_name || (isMe ? this.state.me.guildName : ''), guildTag: player.tag || '',
      restaurantName: player.planet_id ? (isMe ? this.state.restaurant.name : restaurantNameFor(player.planet_id, player.username)) : null,
      gold: Number(player.alpha || 0), invested: Number(infusion?.fuel || 0),
      takings: Number(player.capacity || 0) + Number(player.connection_capacity || 0),
      payroll: Number(player.load || 0) + Number(player.structs_load || 0),
      restaurantsCompleted: num(completed), challengesLaunched: num(launched),
      recipesFound: num(ore?.mined), recipesCopied: num(ore?.seized), recipesLost: num(ore?.forfeited),
    };
  }

  /** On chain the owner name is the player's username (MsgPlayerUpdateName). */
  async rename(name) {
    name = String(name || '').trim();
    const problem = nameProblem(name);
    if (problem) throw new Error(problem);
    const mine = await this.keyDetails(this.myAddress()).catch(() => null);
    if (mine && !mine.canManage) throw new Error('This key can’t change the owner name. Use a key that can manage keys.');
    await this.settle(this.signing.queueMsgPlayerUpdateName(this.state.me.id, name), 'New name on the door — everyone in town sees it next tick.');
    const pl = this.gs.keyPlayers[P.PLAYER].player;
    if (pl) pl.username = name;
    this.pull();
    this.emit(['wallet']);
  }

  keyFrom(a, primary) {
    const ua = describeBrowser(a.user_agent || '');
    return {
      address: a.address, isThis: a.address === this.myAddress(), isPrimary: a.address === primary,
      ip: a.ip || null, browser: ua.browser, os: ua.os, label: ua.label,
      lastActive: a.block_time ? new Date(a.block_time) : null,
      permissions: Number(a.permissions || 0),
      canManage: hasAll(a.permissions, MANAGE_KEYS), canSend: hasAll(a.permissions, SEND_GOLD),
      gold: Number(a.alpha || 0), status: a.status,
    };
  }

  async listKeys() {
    const primary = this.gs.keyPlayers[P.PLAYER].player?.primary_address;
    const list = await this.api.getPlayerAddressList(this.state.me.id);
    const keys = list.map((a) => this.keyFrom(a, primary));
    // The order the webapp shows: this browser, the main key, then the rest.
    return keys.sort((a, b) => (b.isThis - a.isThis) || (b.isPrimary - a.isPrimary) || ((b.lastActive || 0) - (a.lastActive || 0)));
  }

  async keyDetails(address) {
    const primary = this.gs.keyPlayers[P.PLAYER].player?.primary_address;
    return this.keyFrom(await this.api.getPlayerAddress(address), primary);
  }

  async setKeyPermissions(address, { manage, send }) {
    const me = await this.keyDetails(this.myAddress());
    if (!me.canManage) throw new Error('This key can’t change other keys.');
    const req = new SetAddressPermissionsRequestDTO();
    req.address = address;
    req.permissions = this.permissionManager.getDefaultPlayerPermissions() | (manage ? MANAGE_KEYS : 0) | (send ? SEND_GOLD : 0);
    const r = await this.api.setAddressPermissions(req);
    if (!r.success) throw new Error('The restaurant group didn’t save that change.');
    this.toast('Key updated.', 'good');
  }

  /** MsgAddressRevoke. Taking back this browser's own key signs it out. */
  async takeBackKey(address) {
    const primary = this.gs.keyPlayers[P.PLAYER].player?.primary_address;
    if (address === primary) throw new Error('The main key can’t be taken back — it belongs to your recovery phrase.');
    await this.settle(this.signing.queueMsgAddressRevoke(address), address === this.myAddress() ? null : 'Key taken back. That device is signed out.');
    this.api.getPlayerAddressCount(this.state.me.id, true).catch(() => {});
  }

  /** Watch GRASS for one frame, resolving with it (or rejecting after `ms`). */
  waitForFrame(name, match, ms = 15 * 60 * 1000) {
    let done = false;
    let cancel;
    const p = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { done = true; reject(new Error('That took too long. Try again.')); }, ms);
      this.grass.registerListener({
        name, shouldUnregister: () => done,
        handler(msg) { if (!done && match(msg)) { done = true; clearTimeout(timer); resolve(msg); } },
      });
      cancel = () => { if (!done) { done = true; clearTimeout(timer); reject(new Error('cancelled')); } };
    });
    p.cancel = cancel;
    return p;
  }

  /**
   * Cut a key: ask the guild for an activation code, then wait for the new
   * device to ask for it. Resolves to { code, request } — `request` is a
   * promise of the device's pending registration (cancellable).
   */
  async cutKey() {
    const me = await this.keyDetails(this.myAddress());
    if (!me.canManage) throw new Error('This key can’t cut new keys. Use a key that can manage keys.');
    const req = new CreateActivationCodeRequestDTO();
    req.logged_in_address = this.myAddress();
    req.guild_id = this.gs.thisGuild.id;
    const r = await this.api.createActivationCode(req);
    if (!r.success || !r.data?.code) throw new Error('The restaurant group couldn’t make a key code right now.');
    const code = String(r.data.code);
    const request = this.waitForFrame(`A_LA_STRUCTS_KEY_REQUEST_${code}`,
      (m) => m.category === 'player_address_pending' && m.subject === `structs.address.register.${code}` && !m.permissions);
    const out = request.then((m) => {
      const p = new PlayerAddressPendingFactory().make(m);
      const ua = describeBrowser(p.user_agent || '');
      return { code, address: p.address, ip: p.ip, label: ua.label, browser: ua.browser, os: ua.os, raw: p };
    });
    out.cancel = request.cancel;
    return { code, request: out };
  }

  /** Approve a device's pending key with the chosen permissions (MsgAddressRegister). */
  async approveKey(request, { manage, send }) {
    const p = request.raw;
    p.permissions = this.permissionManager.getDefaultPlayerPermissions() | (manage ? MANAGE_KEYS : 0) | (send ? SEND_GOLD : 0);
    const gid = this.gs.thisGuild.id, pid = this.state.me.id;
    const approved = this.waitForFrame(`A_LA_STRUCTS_KEY_APPROVED_${p.code}`,
      (m) => m.category === 'player_address' && m.subject === `structs.player.${gid}.${pid}` && m.status === 'approved' && m.address === p.address, 3 * 60 * 1000);
    const ok = await this.auth.activateDevice(p);
    if (!ok) { approved.cancel(); throw new Error('The restaurant group didn’t accept that key.'); }
    await approved.catch(() => {});   // the chain may be slow to say so; the key works either way
    this.api.getPlayerAddressCount(pid, true).catch(() => {});
    this.toast('New key handed over. That device is signing in.', 'good');
  }

  async refuseKey(request) {
    try { await this.api.deleteActivationCode(request.code); } catch (e) { /* the code expires anyway */ }
  }

  /**
   * Sign this browser out. Like the webapp: a key that isn't the main one is
   * taken back on chain first; the main one just ends the guild session.
   */
  async signOutWarnings() {
    const me = await this.keyDetails(this.myAddress());
    let onlyManager = false;
    if (me.canManage) onlyManager = (await this.listKeys()).filter((k) => k.canManage).length === 1;
    return { assets: me.isPrimary ? 0 : me.gold, onlyManager, primary: me.isPrimary };
  }

  async signOut() {
    const me = await this.keyDetails(this.myAddress()).catch(() => null);
    if (me && !me.isPrimary) { try { await this.signing.queueMsgAddressRevoke(me.address); } catch (e) { console.warn('[signout] revoke failed', e); } }
    try { await this.api.logout(); } catch (e) { /* the session ends with the page either way */ }
    forgetSession();
    location.reload();
  }

  async findRecipients(query, groupId = null) {
    const dto = new TransferSearchRequestDTO();
    dto.search_string = encodeURIComponent(String(query || '').trim());
    dto.guild_id = groupId || null;
    const list = await this.api.transferSearch(dto);
    return list.filter((p) => p.id !== this.state.me.id).map((p) => ({
      id: p.id, address: p.address, name: p.username || `Owner ${p.id}`, species: speciesFor(p.id, 'owner'),
      guildName: p.guild_name || '', guildTag: p.tag || '',
      restaurantName: p.planet_id ? restaurantNameFor(p.planet_id, p.username) : null,
    }));
  }

  async sendGold(recipient, amount) {
    amount = Math.floor(Number(amount));
    if (!(amount > 0)) throw new Error('Choose how much gold to send.');
    if (amount > this.state.wallet.gold) throw new Error('You don’t have that much gold.');
    const me = await this.keyDetails(this.myAddress()).catch(() => null);
    if (me && !me.canSend) throw new Error('This key isn’t allowed to send gold. Ask a key that manages keys to allow it.');
    const from = this.gs.keyPlayers[P.PLAYER].player.primary_address;
    await this.settle(this.signing.queueMsgPlayerSend(from, recipient.address, [{ denom: 'ualpha', amount: this.alphaManager.convertAlphaToUAlpha(amount) }]),
      `Sent ${amount} gold to ${recipient.name}.`);
  }

  ledgerRow(t) {
    const out = t.action === 'sent' || t.direction === 'debit' || Number(t.amount) < 0;
    return {
      id: t.id, time: t.time ? new Date(t.time) : null, amount: Math.abs(Number(t.amount || 0)), out,
      kind: t.action || (out ? 'sent' : 'received'), counterparty: t.counterparty, counterpartyId: t.counterparty_player_id,
      counterpartyName: t.counterparty_username || (t.counterparty_player_id ? `Owner ${t.counterparty_player_id}` : null),
      tick: t.block_height ? Number(t.block_height) : null,
    };
  }

  async ledger(page = 1) {
    const [items, total] = await Promise.all([this.api.getTransactions(this.state.me.id, page), this.api.countTransactions(this.state.me.id)]);
    return { items: items.map((t) => this.ledgerRow(t)), total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  }

  async ledgerEntry(id) { return this.ledgerRow(await this.api.getTransaction(id)); }

  /* ── the group: profile, directory, members, bank ─────────────────────── */

  async groupProfile(groupId = this.state.me.guildId) {
    const soft = (p) => p.catch(() => null);
    const [g, power, members, completed] = await Promise.all([
      this.api.getGuild(groupId), soft(this.api.getGuildPowerStats(groupId, true)),
      soft(this.api.countGuildMembers(groupId, true)), soft(this.api.countGuildPlanetsCompleted(groupId, true)),
    ]);
    const socials = g.socials || {};
    return {
      id: g.id, name: g.name || `Group ${g.id}`, tag: g.tag || '', description: g.description || '', logo: safeUrl(g.logo),
      website: safeUrl(g.website), discord: safeUrl(socials.discord_server), isMine: g.id === this.state.me.guildId,
      joinMinimum: Number(g.join_infusion_minimum || 0), ratio: Number(g.reactor_ratio || 0), commission: Number(g.default_commission || 0),
      invested: power ? Number(power.total_fuel || 0) : null, takings: power ? Number(power.total_capacity || 0) : null,
      payroll: power ? Number(power.total_load || 0) : null, avgTakings: power ? Number(power.avg_connection_capacity || 0) : null,
      members, restaurantsCompleted: completed,
    };
  }

  async groupDirectory() {
    const list = await this.api.getGuildsDirectory(true);
    return list.map((g) => ({ id: g.guild_id, name: g.name || `Group ${g.guild_id}`, logo: safeUrl(g.logo), gold: Number(g.alpha || 0), members: Number(g.members || 0), isMine: g.guild_id === this.state.me.guildId }));
  }

  async groupMembers(groupId = this.state.me.guildId) {
    const roster = await this.api.getGuildRoster(groupId);
    return roster.map((m) => ({
      id: m.id, name: m.username || `Owner ${m.id}`, species: m.id === this.state.me.id ? this.state.me.species : speciesFor(m.id, 'owner'),
      restaurantName: m.planet_id ? (m.id === this.state.me.id ? this.state.restaurant.name : restaurantNameFor(m.planet_id, m.username)) : null,
      recipes: Number(m.ore || 0), gold: Number(m.alpha || 0), crewHome: m.fleet_status !== 'away', underChallenge: Number(m.under_attack) === 1, isMe: m.id === this.state.me.id,
    }));
  }

  async bank() {
    const g = this.gs.thisGuild;
    const inf = await this.api.getInfusionByPlayerId(this.state.me.id);
    return {
      invested: Number(inf.fuel || 0), clearing: Number(inf.defusing || 0), takings: Number(inf.power || 0),
      joinMinimum: Number(g.join_infusion_minimum || 0), ratio: Number(g.reactor_ratio || 0), commission: Number(g.default_commission || 0),
      gold: this.state.wallet.gold,
    };
  }

  async bankDeposit(amount) {
    amount = Math.floor(Number(amount));
    if (!(amount > 0)) throw new Error('Choose how much gold to deposit.');
    if (amount > this.state.wallet.gold) throw new Error('You don’t have that much gold.');
    const from = this.gs.keyPlayers[P.PLAYER].player.primary_address;
    await this.settle(this.signing.queueMsgReactorInfuse(from, this.gs.thisGuild.validator, { denom: 'ualpha', amount: this.alphaManager.convertAlphaToUAlpha(amount) }),
      `Deposited ${amount} gold. Takings go up next tick.`);
    this.refreshPlayer();
  }

  async bankWithdraw(amount) {
    amount = Math.floor(Number(amount));
    if (!(amount > 0)) throw new Error('Choose how much gold to withdraw.');
    const b = await this.bank();
    if (amount > b.invested) throw new Error('You haven’t deposited that much.');
    if (b.invested - amount < b.joinMinimum) throw new Error(`Your group asks members to keep at least ${b.joinMinimum} gold in the bank.`);
    const from = this.gs.keyPlayers[P.PLAYER].player.primary_address;
    await this.settle(this.signing.queueMsgReactorDefuse(from, this.gs.thisGuild.validator, { denom: 'ualpha', amount: this.alphaManager.convertAlphaToUAlpha(amount) }),
      `Withdrawing ${amount} gold — it clears before you can spend it.`);
    this.refreshPlayer();
  }

  refreshPlayer() {
    this.api.getPlayer(this.state.me.id).then((pl) => { this.gs.keyPlayers[P.PLAYER].setPlayer(pl); this.schedulePull(); }, () => {});
  }

  async rivalGroups() {
    const list = await this.api.getGuildFilterList();
    return list.map((g) => ({ id: g.id, name: g.name || `Group ${g.id}` }));
  }
}

const ORDER_RETRIES = 2;
/** Failures worth another try: the order may never have reached the chain. */
function isTransient(err) {
  const m = String(err || '');
  if (/insufficient|not enough|out_of_range|destroyed|offline|unauthorized|permission|invalid/i.test(m)) return false;
  return /timeout|timed out|network|socket|fetch|ECONN|connection|disconnect|closed|account sequence|sequence mismatch|\b50[234]\b|unavailable|broadcast/i.test(m);
}

const MANAGE_KEYS = PERMISSIONS.ADMIN | PERMISSIONS.UPDATE | PERMISSIONS.DELETE;
const SEND_GOLD = PERMISSIONS.ASSETS_ALL;
const hasAll = (p, mask) => (Number(p || 0) & mask) === mask;

/** Only http(s) links from guild data make it onto the page. */
function safeUrl(u) {
  try { const x = new URL(String(u || '')); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; }
}
