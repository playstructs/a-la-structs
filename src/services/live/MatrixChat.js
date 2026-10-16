/**
 * Group chat on the guild's own Matrix homeserver.
 *
 * Sign-in is one POST: the browser signs the same LOGIN_GUILD message it uses
 * for the guild API, and the guild's `POST {guild_api}/auth/matrix` walks the
 * Matrix auth service on its side and hands back tokens. No pop-up, no
 * redirect, no relay — the same on 127.0.0.1 and on a real domain.
 *
 * After that this is a small Matrix client: /sync long-poll for one room, send
 * m.text, refresh the access token at the auth service's token endpoint (the
 * client id is a public client), revoke on the way out.
 *
 * Messages land in the same chat log as the town square, and everyone else in
 * the guild — whatever client they use — sees them as ordinary guild chat.
 */

const TIMEOUT_MS = 25000;
const POLL_MS = 30000;

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const DEVICE_KEY = 'aLaStructs.matrix.device.v1';

/** A stable Matrix device id for this browser, so sign-ins don't pile up devices. */
export function matrixDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      const a = new Uint8Array(8); crypto.getRandomValues(a);
      id = 'ALS' + Array.from(a, (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (e) { return 'ALSEPHEMERAL'; }
}

const redact = (u) => { try { const x = new URL(u); return x.origin + x.pathname; } catch (e) { return '(url)'; } };

async function req(url, { method = 'GET', token = null, json, form, signal, timeout = TIMEOUT_MS } = {}) {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ctl.abort(), timeout);
  const headers = { Accept: 'application/json' };
  let body;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
  try {
    const res = await fetch(url, { method, headers, body, signal: ctl.signal, credentials: 'omit', redirect: 'error' });
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }
    return { status: res.status, ok: res.ok, data };
  } catch (e) {
    if (signal?.aborted) throw Object.assign(new Error('stopped'), { stopped: true });
    throw new Error(e.name === 'AbortError' ? `${redact(url)} timed out` : `Couldn’t reach ${redact(url)}`);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

const httpsOrLoopback = (u) => {
  try { const x = new URL(u); return x.protocol === 'https:' || (x.protocol === 'http:' && /^(127\.0\.0\.1|localhost|\[::1\])$/.test(x.hostname)); } catch (e) { return false; }
};

/**
 * Exchange a signed guild login for Matrix tokens.
 * @param {string} guildApi  e.g. http://crew.oh.energy/api
 * @param {object} login     { address, pubkey, signature, guild_id, unix_timestamp }
 */
export async function signInViaGuild(guildApi, login, deviceId = matrixDeviceId()) {
  const r = await req(`${guildApi.replace(/\/+$/, '')}/auth/matrix`, { method: 'POST', json: { ...login, device_id: deviceId } });
  if (r.status === 404) throw new Error('This restaurant group doesn’t offer chat sign-in yet');
  const d = r.data?.data;
  if (!r.ok || !r.data?.success || !d?.access_token) throw new Error(r.data?.errors?.[0] || r.data?.error || `Chat sign-in was refused (${r.status})`);
  for (const k of ['token_endpoint', 'revocation_endpoint']) if (d[k] && !httpsOrLoopback(d[k])) throw new Error('The restaurant group returned an insecure sign-in address; not using it');
  return { ...d, device_id: d.device_id || deviceId, expires_at: Date.now() + Math.max(60, Number(d.expires_in || 300)) * 1000 };
}

/** Find the homeserver for a Matrix user via the standard well-known lookup. */
export async function discoverHomeserver(userId) {
  const server = String(userId || '').split(':').slice(1).join(':');
  if (!server) return null;
  try {
    const r = await req(`https://${server}/.well-known/matrix/client`, { timeout: 8000 });
    const base = r.data?.['m.homeserver']?.base_url;
    if (base && httpsOrLoopback(base)) return base.replace(/\/+$/, '');
  } catch (e) { /* fall through */ }
  return `https://${server}`;
}

export class MatrixChat extends EventTarget {
  /**
   * @param {object} o
   * @param {string} o.homeserver   client-server API base URL
   * @param {object} o.session      result of signInViaGuild
   * @param {string} o.selfId       our player id (chat entries from us use it)
   * @param {string} [o.room]       room id or alias to use
   * @param {{id?: string, name?: string}} [o.guild]  helps pick the guild room
   */
  constructor({ homeserver, session, selfId, room = null, guild = {} }) {
    super();
    this.hs = homeserver.replace(/\/+$/, '');
    this.session = session;
    this.selfId = selfId;
    this.roomHint = room || env.VITE_MATRIX_ROOM || null;
    this.guild = guild;
    this.roomId = null;
    this.roomName = '';
    this.names = new Map();     // user id → display name
    this.history = [];
    this.sentTxns = new Set();
    this.ctl = new AbortController();
    this.live = false;
  }

  url(p) { return `${this.hs}/_matrix/client/v3${p}`; }

  async call(p, opts = {}) {
    await this.freshen();
    let r = await req(this.url(p), { ...opts, token: this.session.access_token, signal: this.ctl.signal });
    if (r.status === 401 && await this.refresh()) r = await req(this.url(p), { ...opts, token: this.session.access_token, signal: this.ctl.signal });
    if (r.status === 401) { this.fail('Chat session ended. Rejoin the town to sign in again.'); throw Object.assign(new Error('unauthorised'), { stopped: true }); }
    return r;
  }

  /** Refresh a minute before expiry. */
  async freshen() { if (this.session.refresh_token && Date.now() > this.session.expires_at - 60000) await this.refresh(); }

  async refresh() {
    const s = this.session;
    if (!s.refresh_token || !s.token_endpoint) return false;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const r = await req(s.token_endpoint, { method: 'POST', form: { grant_type: 'refresh_token', refresh_token: s.refresh_token, client_id: s.client_id } });
        if (!r.ok || !r.data?.access_token) return false;
        s.access_token = r.data.access_token;
        if (r.data.refresh_token) s.refresh_token = r.data.refresh_token;
        s.expires_at = Date.now() + Math.max(60, Number(r.data.expires_in || 300)) * 1000;
        return true;
      } catch (e) { return false; } finally { this.refreshing = null; }
    })();
    return this.refreshing;
  }

  async start() {
    // An auth service can hand back someone else's stale session: make sure
    // these tokens belong to the account the guild just signed us in as.
    const who = await this.call('/account/whoami');
    if (!who.ok || !who.data?.user_id) throw new Error('Chat sign-in didn’t produce a working session');
    if (this.session.user_id && who.data.user_id !== this.session.user_id) {
      await this.stop();
      throw new Error('Chat signed in as a different account than expected; not using it');
    }
    this.userId = who.data.user_id;
    await this.pickRoom();
    this.loop();
    return this;
  }

  /**
   * The guild's room, in order of preference: the configured one; the one we
   * used last time; the best room we're already in; a room on the guild's
   * server we've been invited to; the most guild-like room in the server's
   * public directory (looking inside a space if that's all it lists).
   */
  async pickRoom() {
    const join = async (id) => { const r = await this.call(`/join/${encodeURIComponent(id)}`, { method: 'POST', json: {} }); return r.ok ? r.data.room_id : null; };
    const remember = (id) => { try { localStorage.setItem(this.roomKey(), id); } catch (e) { /* storage off */ } };
    if (this.roomHint) {
      const id = this.roomHint.startsWith('!') ? this.roomHint : await join(this.roomHint);
      if (id) { this.roomId = id; return; }
    }
    const first = await this.sync(null, 0);
    const joined = Object.entries(first.data?.rooms?.join || {});
    let last = null;
    try { last = localStorage.getItem(this.roomKey()); } catch (e) { /* storage off */ }
    if (last && joined.some(([id]) => id === last)) return this.useRoom(last, first.data);
    const best = joined.filter(([, r]) => this.score(this.describe(r)) > -100).sort((a, b) => this.score(this.describe(b[1])) - this.score(this.describe(a[1])))[0];
    if (best) { remember(best[0]); return this.useRoom(best[0], first.data); }

    // Not in a guild room yet: accept an invitation from the guild's own server…
    const server = this.userId.split(':').slice(1).join(':');
    const invites = Object.keys(first.data?.rooms?.invite || {}).filter((id) => id.endsWith(`:${server}`));
    for (const id of invites) { const ok = await join(id); if (ok) { remember(ok); return this.useRoom(ok); } }

    // …or join the most guild-like public room on it.
    const dir = await this.call('/publicRooms?limit=100');
    const listed = (dir.ok && dir.data?.chunk) || [];
    let candidates = listed.filter((r) => r.room_type !== 'm.space' && r.join_rule !== 'knock');
    if (!candidates.length) {
      for (const space of listed.filter((r) => r.room_type === 'm.space')) {
        const h = await this.call(`/rooms/${encodeURIComponent(space.room_id)}/hierarchy?limit=50`);
        candidates.push(...((h.ok && h.data?.rooms) || []).filter((r) => r.room_type !== 'm.space' && (r.join_rule === 'public' || r.world_readable)));
      }
    }
    candidates = candidates.map((r) => ({ id: r.room_id, alias: r.canonical_alias, d: { name: r.name || '', alias: r.canonical_alias || '', members: Number(r.num_joined_members || 0) } }))
      .sort((a, b) => this.score(b.d) - this.score(a.d));
    for (const c of candidates.slice(0, 3)) {
      const ok = await join(c.alias || c.id);
      if (ok) { remember(ok); return this.useRoom(ok); }
    }
    throw new Error(listed.length ? 'Couldn’t join any of the restaurant group’s chat rooms' : 'The restaurant group hasn’t opened a public chat room yet');
  }

  roomKey() { return `aLaStructs.matrix.room.v1:${this.hs}:${this.userId}`; }

  /** Name, alias and size of a room from a /sync entry. */
  describe(r) {
    const st = r.state?.events || [];
    return {
      name: st.find((e) => e.type === 'm.room.name')?.content?.name || '',
      alias: st.find((e) => e.type === 'm.room.canonical_alias')?.content?.alias || '',
      members: Number(r.summary?.['m.joined_member_count'] || 0),
    };
  }

  /** How much a room looks like the guild's main chat. Direct messages score below -100. */
  score({ name, alias, members }) {
    const text = `${name} ${alias}`.toLowerCase();
    const gname = (this.guild.name || '').toLowerCase(), gid = String(this.guild.id || '');
    let s = Math.min(members, 500);
    if (gname && (text.includes(gname) || text.includes(gname.replace(/\s+/g, '')))) s += 1000;
    if (gid && text.includes(gid)) s += 800;
    if (/general|lobby|guild|town|chat|main|welcome/.test(text)) s += 200;
    if (members && members <= 2 && !name && !alias) s -= 500;
    return s;
  }

  useRoom(id, syncData = null) {
    this.roomId = id;
    if (syncData) { this.ingest(syncData); this.since = syncData.next_batch; }
  }

  filter() {
    const room = this.roomId ? { rooms: [this.roomId] } : {};
    return JSON.stringify({
      presence: { not_types: ['*'] }, account_data: { not_types: ['*'] },
      room: {
        ...room,
        timeline: { limit: 40, types: ['m.room.message'] },
        state: { lazy_load_members: true, types: ['m.room.member', 'm.room.name', 'm.room.canonical_alias'] },
        ephemeral: { not_types: ['*'] }, account_data: { not_types: ['*'] },
      },
    });
  }

  sync(since, timeout = POLL_MS) {
    const q = new URLSearchParams({ filter: this.filter(), timeout: String(timeout) });
    if (since) q.set('since', since);
    return this.call(`/sync?${q}`, { timeout: timeout + TIMEOUT_MS });
  }

  async loop() {
    let backoff = 1000;
    while (!this.ctl.signal.aborted) {
      try {
        const r = await this.sync(this.since, this.since ? POLL_MS : 0);
        if (!r.ok) throw new Error(`sync ${r.status}`);
        this.ingest(r.data);
        this.since = r.data.next_batch;
        if (!this.live) { this.live = true; this.dispatchEvent(new CustomEvent('status', { detail: { live: true, room: this.roomName } })); }
        backoff = 1000;
      } catch (e) {
        if (e.stopped || this.ctl.signal.aborted) return;
        if (this.live) { this.live = false; this.dispatchEvent(new CustomEvent('status', { detail: { live: false } })); }
        await new Promise((res) => setTimeout(res, backoff));
        backoff = Math.min(30000, backoff * 2);
      }
    }
  }

  ingest(data) {
    const room = data?.rooms?.join?.[this.roomId];
    if (!room) return;
    for (const e of [...(room.state?.events || []), ...(room.timeline?.events || [])]) {
      if (e.type === 'm.room.member' && e.state_key) this.names.set(e.state_key, e.content?.displayname || e.state_key);
      if (e.type === 'm.room.name') this.roomName = e.content?.name || this.roomName;
    }
    for (const e of room.timeline?.events || []) {
      if (e.type !== 'm.room.message' || typeof e.content?.body !== 'string') continue;
      if (e.sender === this.userId && this.sentTxns.has(e.unsigned?.transaction_id)) continue; // already echoed
      const mine = e.sender === this.userId;
      this.push({ from: mine ? this.selfId : e.sender, name: mine ? null : this.nameOf(e.sender), text: e.content.body.slice(0, 500), ts: e.origin_server_ts || Date.now(), matrix: true });
    }
  }

  nameOf(uid) { return this.names.get(uid) || String(uid).replace(/^@/, '').split(':')[0]; }

  push(entry) {
    this.history.push(entry);
    if (this.history.length > 200) this.history.shift();
    this.dispatchEvent(new CustomEvent('chat', { detail: entry }));
  }

  async say(text, myName) {
    text = String(text || '').trim().slice(0, 500);
    if (!text || !this.roomId) return false;
    const txn = `als${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    this.sentTxns.add(txn);
    this.push({ from: this.selfId, name: myName, text, ts: Date.now(), matrix: true });
    try {
      const r = await this.call(`/rooms/${encodeURIComponent(this.roomId)}/send/m.room.message/${txn}`, { method: 'PUT', json: { msgtype: 'm.text', body: text } });
      if (!r.ok) throw new Error(r.data?.error || `send ${r.status}`);
      return true;
    } catch (e) {
      this.dispatchEvent(new CustomEvent('error', { detail: { message: `Message didn’t send: ${e.message}` } }));
      return false;
    }
  }

  fail(message) {
    this.ctl.abort();
    this.live = false;
    this.dispatchEvent(new CustomEvent('status', { detail: { live: false, ended: true, message } }));
  }

  /** Stop syncing and revoke the tokens (best effort). */
  async stop() {
    this.ctl.abort();
    const s = this.session;
    if (!s?.revocation_endpoint || !s.client_id) return;
    for (const [token, hint] of [[s.access_token, 'access_token'], [s.refresh_token, 'refresh_token']]) {
      if (!token) continue;
      try { await req(s.revocation_endpoint, { method: 'POST', form: { token, token_type_hint: hint, client_id: s.client_id }, timeout: 5000 }); } catch (e) { /* best effort */ }
    }
  }
}
