/**
 * The guild directory: which guilds exist and where their services live.
 *
 * There is no central registry. The chain is the list, and each guild
 * describes itself in a `guild.json` at the `endpoint` on its chain record:
 *
 *   { "guild": { "id": "0-5", "name": "…", "tag": "…",
 *       "services": { "guild_api": "https://…/api",
 *                     "grass_nats_websocket": "wss://…",
 *                     "matrix": "https://…" } } }
 *
 * A guild controls its guild.json, so everything in it is treated as hostile
 * input: size-capped, identity-checked against the chain, service URLs limited
 * to https/wss on public hostnames (so a guild can't point players' browsers
 * into their own network), no redirects. Same rules as structs.xyz
 * (ONBOARDING.md §2).
 */

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

/** Chain REST (LCD). Answers CORS for any origin. */
export const DEFAULT_REACTOR = (env.VITE_LCD_URL || env.VITE_REACTOR_API || 'https://public.testnet.structs.network').replace(/\/+$/, '');
/** Chain RPC websocket for signing. */
export const DEFAULT_RPC = env.VITE_RPC_URL || 'wss://public.testnet.structs.network:26657';
/** Event stream used when the chosen guild doesn't publish a usable one. `off` disables. */
export const DEFAULT_GRASS = env.VITE_GRASS_URL === 'off' ? null : (env.VITE_GRASS_URL || 'wss://beta.playstructs.com:1443');

const CACHE_KEY = 'aLaStructs.guildConfig.v1';
const DIR_KEY = 'aLaStructs.guildDirectory.v1';
const DIR_TTL = 10 * 60 * 1000;
const MAX_JSON = 64 * 1024;
const GUILD_JSON_MS = 2500;
const LCD_MS = 10000;
const MAX_GUILDS = 80;

export const NOT_SHARED = 'doesn’t share its guild.json with other sites (CORS)';

/* ── URL hygiene ──────────────────────────────────────────────────────────── */

const isLoopbackHost = (h) => /^(127\.\d+\.\d+\.\d+|localhost|\[::1\])$/i.test(h);
const devnet = () => {
  try { return isLoopbackHost(location.hostname) && isLoopbackHost(new URL(DEFAULT_REACTOR).hostname); } catch (e) { return false; }
};

/**
 * A service URL a guild may send players to: https/wss, a public DNS name,
 * no credentials. Loopback only on a devnet (page and LCD both on loopback).
 */
export function okUrl(u, schemes = ['https:', 'wss:']) {
  let x;
  try { x = new URL(String(u)); } catch (e) { return null; }
  if (x.username || x.password) return null;
  const h = x.hostname.toLowerCase();
  if (isLoopbackHost(h)) {
    if (!devnet()) return null;
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(x.protocol)) return null;
    return x.href;
  }
  if (!schemes.includes(x.protocol)) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.startsWith('[')) return null;                 // IP literals
  if (!h.includes('.') || /\.(local|internal|lan|home|arpa|localhost)$/.test(h)) return null;
  if (/(^|\.)(nip\.io|sslip\.io|xip\.io|traefik\.me|localtest\.me|lvh\.me)$/.test(h)) return null; // wildcard DNS
  return x.href;
}
const httpsUrl = (u) => okUrl(u, ['https:']);
const wssUrl = (u) => okUrl(u, ['wss:']);
/** Logo/website links: http(s) only, so no javascript: URLs. */
const safeLink = (u) => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; } };
const trimSlash = (u) => (u ? String(u).replace(/\/+$/, '') : u);
const clip = (s, n) => (typeof s === 'string' ? s.slice(0, n) : null);

/* ── fetching ─────────────────────────────────────────────────────────────── */

async function readJson(res) {
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_JSON) throw new Error('guild.json unreadable (too large)');
  const text = await res.text();
  if (text.length > MAX_JSON) throw new Error('guild.json unreadable (too large)');
  return JSON.parse(text);
}

async function lcd(path, reactor = DEFAULT_REACTOR) {
  const res = await fetch(`${reactor}${path}`, { credentials: 'omit', signal: AbortSignal.timeout(LCD_MS), headers: { Accept: 'application/json' } });
  if (!res.ok) throw Object.assign(new Error(`chain REST answered ${res.status}`), { status: res.status });
  return res.json();
}

/** Fetch a guild.json under the hostile-input rules. Throws with a status message. */
export async function fetchGuildJson(endpoint) {
  const url = httpsUrl(endpoint);
  if (!url) throw new Error('no endpoint');
  try {
    const res = await fetch(url, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(GUILD_JSON_MS), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('guild.json unreachable');
    try { return await readJson(res); } catch (e) { throw new Error(e.message.startsWith('guild.json') ? e.message : 'guild.json unreadable'); }
  } catch (e) {
    if (e.message.startsWith('guild.json')) throw e;
    // A TypeError is either "down" or "answered without CORS". An opaque
    // no-cors probe tells them apart.
    try { await fetch(url, { mode: 'no-cors', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(GUILD_JSON_MS) }); } catch (e2) { throw new Error('guild.json unreachable'); }
    throw new Error(NOT_SHARED);
  }
}

/* ── reading guild.json ───────────────────────────────────────────────────── */

/**
 * Validate a guild.json against its chain record and pull out what we use.
 * Explicit local overrides (VITE_GRASS_URL, GRASS_URL relay, VITE_RPC_URL) win.
 */
export function readGuildJson(json, record) {
  const g = json && typeof json === 'object' ? (json.guild && typeof json.guild === 'object' ? json.guild : json) : null;
  if (!g) throw new Error('guild.json unreadable');
  if (g.id != null && String(g.id) !== String(record.id)) throw new Error('guild.json names another guild');
  const s = (g.services && typeof g.services === 'object') ? g.services : {};
  const api = httpsUrl(s.guild_api);
  const ownGrass = trimSlash(wssUrl(s.grass_nats_websocket));
  const relay = (p) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${p}`;
  const grass = env.VITE_PROXY_GRASS ? relay('/grass') : (env.VITE_GRASS_URL && env.VITE_GRASS_URL !== 'off' ? env.VITE_GRASS_URL : (ownGrass || DEFAULT_GRASS));
  return {
    id: String(record.id),
    endpoint: record.endpoint,
    name: clip(g.name, 80) || `Guild ${record.id}`,
    tag: clip(g.tag, 12) || '',
    description: clip(g.description, 600) || '',
    logo: safeLink(g.logo),
    website: safeLink(g.website),
    api: api ? trimSlash(api) : null,
    grass,
    grassIsOwn: !!ownGrass && grass === ownGrass,
    rpc: env.VITE_PROXY_RPC ? relay('/rpc') : DEFAULT_RPC,
    matrix: httpsUrl(s.matrix || s.matrix_homeserver) ? trimSlash(httpsUrl(s.matrix || s.matrix_homeserver)) : null,
    matrixRoom: typeof s.matrix_room === 'string' ? s.matrix_room.slice(0, 255) : null,
  };
}

/* ── the chain side ───────────────────────────────────────────────────────── */

/** Every guild record on chain. */
export async function listGuilds(reactor = DEFAULT_REACTOR) {
  const out = [];
  let key = '';
  for (let page = 0; page < 20; page++) {
    const q = `?pagination.limit=5000${key ? `&pagination.key=${encodeURIComponent(key)}` : ''}`;
    const j = await lcd(`/structs/guild${q}`, reactor);
    out.push(...(j.Guild || j.guild || []));
    key = j.pagination?.next_key;
    if (!key) break;
  }
  return out;
}

export async function getGuildRecord(guildId, reactor = DEFAULT_REACTOR) {
  const j = await lcd(`/structs/guild/${encodeURIComponent(guildId)}`, reactor);
  const g = j.Guild || j.guild || j;
  if (!g || !g.id) throw new Error(`Guild ${guildId} isn’t on the chain`);
  return g;
}

/** Player id for an address, or null if it isn't a player yet. */
export async function playerIdForAddress(address, reactor = DEFAULT_REACTOR) {
  try {
    const j = await lcd(`/structs/address/${encodeURIComponent(address)}`, reactor);
    const id = j.playerId || j.player_id || null;
    return id && id !== '1-0' ? String(id) : null;
  } catch (e) { return null; }
}

/** The guild a player belongs to, or null. */
export async function guildIdForPlayer(playerId, reactor = DEFAULT_REACTOR) {
  const j = await lcd(`/structs/player/${encodeURIComponent(playerId)}`, reactor);
  const p = j.Player || j.player || j;
  const id = p?.guildId || p?.guild_id;
  return id ? String(id) : null;
}

/** The guild answers its API with CORS for this page (GET /timestamp). False only on a CORS refusal. */
export async function canReach(api) {
  try {
    const res = await fetch(`${api}/timestamp`, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(4000) });
    return res.ok || res.status < 500;
  } catch (e) {
    try { await fetch(`${api}/timestamp`, { mode: 'no-cors', credentials: 'omit', signal: AbortSignal.timeout(4000) }); return false; } catch (e2) { return null; }
  }
}

/* ── directory ────────────────────────────────────────────────────────────── */

/**
 * Guilds for the picker, with a status each. `ok` means it can take browser
 * players from this page: a guild API that answers with CORS.
 */
export async function browsableGuilds(reactor = DEFAULT_REACTOR) {
  try {
    const c = JSON.parse(localStorage.getItem(DIR_KEY) || 'null');
    if (c && c.reactor === reactor && Date.now() - c.at < DIR_TTL) return c.rows;
  } catch (e) { /* storage off */ }
  const records = (await listGuilds(reactor)).slice(0, MAX_GUILDS);
  const rows = await Promise.all(records.map(async (r) => {
    try {
      const g = readGuildJson(await fetchGuildJson(r.endpoint), r);
      if (!g.api) return { ...g, ok: false, why: 'no guild API (can’t take signups)' };
      const reach = await canReach(g.api);
      if (reach === false) return { ...g, ok: false, why: 'guild API refuses this site (CORS)' };
      return { ...g, ok: true, why: reach === null ? 'guild API didn’t answer just now' : '' };
    } catch (e) {
      return { id: String(r.id), name: `Guild ${r.id}`, endpoint: r.endpoint, ok: false, unreadable: true, why: e.message };
    }
  }));
  rows.sort((a, b) => (b.ok - a.ok) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  if (rows.some((r) => !/unreachable/.test(r.why || ''))) {
    try { localStorage.setItem(DIR_KEY, JSON.stringify({ reactor, at: Date.now(), rows })); } catch (e) { /* storage off */ }
  }
  return rows;
}

/** Guild id → validated services. */
export async function resolveGuild(guildId, reactor = DEFAULT_REACTOR) {
  const record = await getGuildRecord(guildId, reactor);
  const g = readGuildJson(await fetchGuildJson(record.endpoint), record);
  if (!g.api) throw new Error(`${g.name} doesn’t run a guild API, so it can’t take browser players`);
  if (!g.grass) throw new Error('No event stream available (the guild has none and VITE_GRASS_URL is off)');
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ id: g.id, name: g.name, at: Date.now() })); } catch (e) { /* storage off */ }
  return { ...g, reactor };
}

/** The guild this browser last connected to, if any. */
export function lastGuild() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
}
