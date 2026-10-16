/**
 * What the restaurant UI needs from a Structs backend.
 *
 * Two implementations:
 *   DemoService — an offline kitchen that runs the chain's combat rules locally
 *                 (structs-desktop's simulator port) against a computer player.
 *   LiveService — a real guild: the structs-webapp core (wallet, signing queue,
 *                 GRASS stream, guild API, proof-of-work tasks), unchanged.
 *
 * Events (CustomEvent on the service):
 *   change  { what: string[] }          state changed, re-render
 *   fx      { kind, ... }               something visible happened, animate it
 *   toast   { text, tone, who }         a line for the speech-bubble ticker
 */
import { TypeCatalog, is, isCommand, COMMAND } from '../game/model.js';
import { roleOf } from '../lexicon/roles.js';
import { AREAS, AMBIT_FLAG } from '../lexicon/areas.js';

/** Owner names follow the guild's rule: 3–20 letters, numbers, - or _. Returns why a name won't do, or null. */
export function nameProblem(name) {
  const n = String(name ?? '').trim();
  if (n.length < 3) return 'Names need at least 3 characters.';
  if (n.length > 20) return 'Names can be at most 20 characters.';
  if (!/^[A-Za-z0-9_-]+$/.test(n)) return 'Use only letters, numbers, - and _ (no spaces).';
  return null;
}

/** "Chrome on Mac OS X 10_15_7" from a user-agent string (structs-webapp's UserAgent, simplified). */
export function describeBrowser(ua = '') {
  const browser = /\bEdg\//.test(ua) ? 'Edge' : /\bFirefox\//.test(ua) ? 'Firefox' : /\bOPR\//.test(ua) ? 'Opera'
    : /\bSamsungBrowser\//.test(ua) ? 'Samsung Internet' : /\bChrome\//.test(ua) ? 'Chrome' : /\bSafari\//.test(ua) ? 'Safari' : 'A browser';
  const os = /iPhone|iPad/.test(ua) ? (/iPad/.test(ua) ? 'iPad' : 'iPhone') : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'an unknown device';
  return { browser, os, label: `${browser} on ${os}` };
}

/** Rows per page in the guild API's paged lists (PAGINATION_LIMITS.DEFAULT). */
export const PAGE_SIZE = 100;

export class Service extends EventTarget {
  constructor(mode) {
    super();
    this.mode = mode;
    this.state = {
      mode,
      ready: false,
      tick: 0,
      tickMs: 6000,
      lastTickAt: Date.now(),
      me: { id: null, name: 'You', species: 'cat', guildId: null, guildName: '', guildTag: '', planetId: null, fleetId: null },
      wallet: { gold: 0, recipes: 0, takings: 0, payroll: 0, lastAction: 0 },
      restaurant: { id: null, name: 'Your Restaurant', undiscovered: 0, slots: { space: 4, air: 4, land: 4, water: 4 }, reputation: 0 },
      crew: { status: 'home', at: null },
      types: new TypeCatalog(),
      structs: new Map(),
      jobs: new Map(),
      challenge: null,
      log: [],
    };
  }

  /* ── plumbing ─────────────────────────────────────────────────────────── */

  emit(what) { this.dispatchEvent(new CustomEvent('change', { detail: { what: [].concat(what) } })); }
  fx(ev) { this.dispatchEvent(new CustomEvent('fx', { detail: ev })); }
  toast(text, tone = 'info', who = null) {
    this.state.log.unshift({ tick: this.state.tick, text, tone });
    this.state.log.length = Math.min(this.state.log.length, 80);
    this.dispatchEvent(new CustomEvent('toast', { detail: { text, tone, who } }));
  }

  /* ── derived reads ────────────────────────────────────────────────────── */

  hustle() { return Math.max(0, this.state.tick - (this.state.wallet.lastAction || 0)); }
  spareCash() { return this.state.wallet.takings - this.state.wallet.payroll; }
  typeOf(s) { return this.state.types.get(s.typeId); }
  roleOf(s) { return roleOf(this.typeOf(s)); }

  myStructs() { return [...this.state.structs.values()]; }
  manager() { return this.myStructs().find((s) => isCommand(this.typeOf(s)) && !is.destroyed(s)) || null; }
  managerHome() { const m = this.manager(); return !!(m && is.built(m) && this.state.crew.status === 'home'); }

  /** Free slot numbers for a struct type in an area. */
  freeSlots(type, ambit) {
    const planet = type.category === 'planet';
    const cap = planet ? (this.state.restaurant.slots[ambit] ?? 4) : 4;
    const used = new Set(this.myStructs()
      .filter((s) => !is.destroyed(s) && s.ambit === ambit && (s.locationType === 'planet') === planet && !isCommand(this.typeOf(s)))
      .map((s) => s.slot));
    const out = [];
    for (let i = 0; i < cap; i++) if (!used.has(i)) out.push(i);
    return out;
  }

  countOf(type) { return this.myStructs().filter((s) => s.typeId === type.id && !is.destroyed(s)).length; }

  /**
   * Why a type can't be hired right now (StructManager.getDeploymentBlocker),
   * in restaurant words. null when it can.
   */
  hireBlocker(type, ambit) {
    if (!type) return 'Unknown role';
    // A fired Manager can be replaced (on chain, a destroyed Command Ship is rebuilt).
    if (type.type === COMMAND && this.manager()) return 'Every restaurant has exactly one Manager';
    if (type.buildLimit > 0 && this.countOf(type) >= type.buildLimit) return `You already have ${type.buildLimit === 1 ? 'one' : type.buildLimit}`;
    if (type.category === 'planet') {
      if (!this.manager()) return 'Hire a Manager first';
      if (this.state.crew.status !== 'home') return 'The Manager is out — call the crew home first';
      if (!this.state.restaurant.id) return 'You need a restaurant first';
    }
    const need = type.buildCharge || 0;
    if (this.hustle() < need) return `Needs ${need} hustle (you have ${this.hustle()})`;
    if (this.spareCash() < (type.buildDraw || 0)) return 'Not enough spare cash for onboarding';
    if (ambit && !((type.possibleAmbit || 0) & AMBIT_FLAG[ambit])) return `Can’t work in the ${AREAS[ambit].name}`;
    if (ambit && this.freeSlots(type, ambit).length === 0) return `No free spot in the ${AREAS[ambit].name}`;
    return null;
  }

  /** chain error text → restaurant words */
  friendlyError(e) {
    const m = String(e?.message || e || '');
    if (/insufficient charge/i.test(m)) return 'Not enough hustle yet — wait a tick or two.';
    if (/capacity|player_power|energy/i.test(m)) return 'Not enough spare cash to keep them on shift.';
    if (/out_of_range/.test(m)) return 'They can’t reach that area from where they work.';
    if (/hidden/.test(m)) return 'That one is blending into the crowd — you can only reach them from the same area.';
    if (/destroyed/.test(m)) return 'They’ve already left.';
    if (/offline/.test(m)) return 'They’re off shift.';
    if (/unreachable/.test(m)) return 'They’re not in the same restaurant.';
    if (/cannot_defend|cannot defend/.test(m)) return 'They can’t cover for anyone.';
    if (/not_in_range/.test(m)) return 'They can only cover for crew in the same restaurant.';
    if (/slot_occupied/.test(m)) return 'Someone is already standing there.';
    if (/immovable/.test(m)) return 'Only the Manager walks between areas.';
    if (/away/.test(m)) return 'The crew is away.';
    return m || 'That didn’t work.';
  }

  /* ── the actions (overridden) ─────────────────────────────────────────── */
  async start() {}
  async stop() {}
  async hire(/* typeId, ambit, slot */) { throw new Error('not implemented'); }
  async cancelHire(/* id */) { throw new Error('not implemented'); }
  async clockIn(/* id */) { throw new Error('not implemented'); }
  async clockOut(/* id */) { throw new Error('not implemented'); }
  async cover(/* defenderId, protectedId */) { throw new Error('not implemented'); }
  async uncover(/* defenderId */) { throw new Error('not implemented'); }
  async walkManager(/* ambit */) { throw new Error('not implemented'); }
  async blendIn(/* id, on */) { throw new Error('not implemented'); }
  async serve(/* attackerId, targetId, ws */) { throw new Error('not implemented'); }
  async investGold(/* structId|null, amount */) { throw new Error('not implemented'); }
  async findRivals(/* query */) { return []; }
  async getGroup() { return { group: null, members: [] }; }
  async peekRestaurant(/* playerId */) { return null; }
  async startChallenge(/* rival */) { throw new Error('not implemented'); }
  async goHome() { throw new Error('not implemented'); }
  async openNewRestaurant() { throw new Error('not implemented'); }

  /* ── the office: owner card, keys (devices), gold ─────────────────────── */
  /**
   * An owner's card. { id, isMe, name, address, species, guildId, guildName,
   * guildTag, restaurantName, gold, invested, takings, payroll,
   * restaurantsCompleted, challengesLaunched, recipesFound, recipesCopied,
   * recipesLost } — the counts are null when the guild doesn't track them.
   */
  async getProfile(/* playerId */) { throw new Error('not implemented'); }
  async rename(/* name */) { throw new Error('not implemented'); }
  /** Keys = the devices (addresses) signed in as this owner. */
  async listKeys() { return []; }
  async keyDetails(/* address */) { throw new Error('not implemented'); }
  async setKeyPermissions(/* address, { manage, send } */) { throw new Error('not implemented'); }
  async takeBackKey(/* address */) { throw new Error('not implemented'); }
  /** Start cutting a key for another device: resolves to the code to type there. */
  async cutKey() { throw new Error('not implemented'); }
  async approveKey(/* request, { manage, send } */) { throw new Error('not implemented'); }
  async refuseKey(/* request */) {}
  /** Things to warn about before this browser signs out: { assets, onlyManager, primary }. */
  async signOutWarnings() { return { assets: 0, onlyManager: false, primary: true }; }
  async signOut() {}
  async findRecipients(/* query, groupId */) { return []; }
  async sendGold(/* recipient, amount */) { throw new Error('not implemented'); }
  /** One page of the gold ledger: { items, total, pages }. */
  async ledger(/* page */) { return { items: [], total: 0, pages: 1 }; }
  async ledgerEntry(/* id */) { return null; }

  /* ── the group: profile, directory, members, bank ─────────────────────── */
  async groupProfile(/* groupId */) { throw new Error('not implemented'); }
  async groupDirectory() { return []; }
  async groupMembers(/* groupId */) { return []; }
  /** The group bank (reactor): { invested, clearing, takings, joinMinimum, ratio, commission, gold }. */
  async bank() { throw new Error('not implemented'); }
  async bankDeposit(/* amount */) { throw new Error('not implemented'); }
  async bankWithdraw(/* amount */) { throw new Error('not implemented'); }
  /** Groups to filter the rival search by: [{ id, name }]. */
  async rivalGroups() { return []; }

  /* ── shift practice (mini games) ──────────────────────────────────────── */
  /**
   * Best mini game scores: { [gameKey]: score }. The base keeps them in this
   * browser (the demo kitchen has no server); LiveService saves them to the
   * group server's mini_game_progress and keeps this copy as a fallback.
   */
  async miniGameScores() { return readLocalScores(this.scoreKey()); }
  /** Record a run; resolves to the best score now stored. */
  async saveMiniGameScore(game, score) { return writeLocalScore(this.scoreKey(), game, score); }
  scoreKey() { return `aLaStructs.miniGames.v1.${this.mode}.${this.state.me.id || 'me'}`; }
}

export function readLocalScores(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; }
}

export function writeLocalScore(key, game, score) {
  const all = readLocalScores(key);
  const best = Math.max(Number(all[game]) || 0, Math.max(0, Math.floor(Number(score) || 0)));
  all[game] = best;
  try { localStorage.setItem(key, JSON.stringify(all)); } catch (e) { /* storage unavailable */ }
  return best;
}

/** Takings the bank would pay for `invested` gold: ratio × (1 − commission), like ManageAlphaViewModel. */
export function bankTakings(invested, bank) {
  return Math.floor(Math.max(0, invested) * (bank.ratio || 0) * (1 - (bank.commission || 0)));
}
