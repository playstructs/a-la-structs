/**
 * The town square: who's walking around and what they're saying.
 *
 * Structs itself has no place for avatars or chat, so À la Structs brings a
 * small one. Owners in the same restaurant group join the same room. Transports:
 *
 *   ws        a relay (server/hangout.mjs) shared by everyone on the guild
 *   tabs      other tabs of this browser (BroadcastChannel) — handy for testing
 *   bots      demo townsfolk who stroll and chat
 *
 * Several can run at once; messages fan out to all of them.
 */
import { rng, nameFor } from '../lexicon/names.js';
import { CHAT_LINES, CHAT_REPLIES } from './demo/world.js';

export class Hangout extends EventTarget {
  constructor({ url = null, room = 'lobby', me, bots = [] } = {}) {
    super();
    this.room = room;
    this.me = { ...me };
    this.peers = new Map();       // id → { id, name, species, x, z, h, ts, bot, restaurant }
    this.history = [];
    this.url = url;
    this.ws = null;
    this.bc = null;
    this.bots = bots;
    this.botTimer = null;
    this.r = rng('hangout-' + room);
  }

  start() {
    try {
      this.bc = new BroadcastChannel(`a-la-structs:${this.room}`);
      this.bc.onmessage = (e) => this.receive(e.data, 'tabs');
    } catch (e) { this.bc = null; }
    if (this.url) this.connectWs();
    this.announce('hello');
    this.heartbeat = setInterval(() => { this.announce('here'); this.prune(); }, 5000);
    if (this.bots.length) this.startBots();
  }

  stop() {
    this.announce('bye');
    clearInterval(this.heartbeat); clearInterval(this.botTimer);
    try { this.ws?.close(); } catch (e) { /* ignore */ }
    try { this.bc?.close(); } catch (e) { /* ignore */ }
  }

  connectWs() {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => { this.wsLive = true; this.ws.send(JSON.stringify({ t: 'join', room: this.room })); this.announce('hello'); this.emitPresence(); };
      this.ws.onmessage = (e) => { try { this.receive(JSON.parse(e.data), 'ws'); } catch (err) { /* bad frame */ } };
      this.ws.onclose = () => { this.wsLive = false; this.emitPresence(); setTimeout(() => this.connectWs(), 4000); };
      this.ws.onerror = () => {};
    } catch (e) { this.ws = null; }
  }

  post(msg) {
    msg.room = this.room;
    msg.from = this.me.id;
    try { this.bc?.postMessage(msg); } catch (e) { /* closed */ }
    try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); } catch (e) { /* closed */ }
  }

  announce(kind) {
    this.post({ t: 'presence', kind, who: { id: this.me.id, name: this.me.name, species: this.me.species, restaurant: this.me.restaurant, x: this.me.x, z: this.me.z, h: this.me.h } });
  }

  setMe(patch) { Object.assign(this.me, patch); }

  move(x, z, h) {
    this.me.x = x; this.me.z = z; this.me.h = h;
    const now = performance.now();
    if (now - (this.lastMoveSent || 0) > 150) { this.lastMoveSent = now; this.post({ t: 'move', x, z, h }); }
  }

  say(text) {
    text = String(text || '').trim().slice(0, 240);
    if (!text) return;
    const m = { t: 'chat', text, name: this.me.name, ts: Date.now() };
    this.post(m);
    this.receive({ ...m, from: this.me.id }, 'self');
    if (this.bots.length && this.r() < 0.7) setTimeout(() => this.botReply(text), 1500 + this.r() * 2500);
  }

  receive(msg, via) {
    if (!msg || (msg.room && msg.room !== this.room)) return;
    if (msg.from === this.me.id && via !== 'self') return;
    if (msg.t === 'presence') {
      if (msg.kind === 'bye') { this.peers.delete(msg.who.id); this.emitPresence(); return; }
      const prev = this.peers.get(msg.who.id);
      this.peers.set(msg.who.id, { ...(prev || {}), ...msg.who, ts: Date.now(), via });
      if (!prev) { this.emitPresence(); if (msg.kind === 'hello') this.announce('here'); }
    } else if (msg.t === 'move') {
      const p = this.peers.get(msg.from);
      if (p) { p.x = msg.x; p.z = msg.z; p.h = msg.h; p.ts = Date.now(); }
      this.dispatchEvent(new CustomEvent('move', { detail: { id: msg.from, x: msg.x, z: msg.z, h: msg.h } }));
    } else if (msg.t === 'chat') {
      const entry = { from: msg.from, name: msg.name, text: String(msg.text).slice(0, 240), ts: msg.ts || Date.now(), bot: !!msg.bot };
      this.history.push(entry);
      if (this.history.length > 200) this.history.shift();
      this.dispatchEvent(new CustomEvent('chat', { detail: entry }));
    }
  }

  prune() {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of this.peers) if (!p.bot && now - p.ts > 16000) { this.peers.delete(id); changed = true; }
    if (changed) this.emitPresence();
  }

  emitPresence() { this.dispatchEvent(new CustomEvent('presence', { detail: { peers: [...this.peers.values()], live: !!this.wsLive } })); }

  /* ── demo townsfolk ───────────────────────────────────────────────────── */

  startBots() {
    for (const b of this.bots) {
      this.peers.set(b.id, { ...b, bot: true, ts: Date.now(), x: b.x ?? (this.r() - 0.5) * 30, z: b.z ?? (this.r() - 0.5) * 30, h: 0 });
    }
    this.emitPresence();
    // A little backlog so the chat isn't empty on arrival.
    const r = this.r;
    for (let i = 0; i < 4; i++) {
      const b = this.bots[Math.floor(r() * this.bots.length)];
      this.receive({ t: 'chat', from: b.id, name: b.name, text: CHAT_LINES[(i * 5 + 3) % CHAT_LINES.length], ts: Date.now() - (5 - i) * 60000, bot: true }, 'bot');
    }
    this.botTimer = setInterval(() => {
      if (r() < 0.22) {
        const b = this.bots[Math.floor(r() * this.bots.length)];
        this.receive({ t: 'chat', from: b.id, name: b.name, text: CHAT_LINES[Math.floor(r() * CHAT_LINES.length)], ts: Date.now(), bot: true }, 'bot');
      }
    }, 9000);
  }

  botReply(text) {
    const b = this.bots[Math.floor(this.r() * this.bots.length)];
    let reply = CHAT_REPLIES[Math.floor(this.r() * CHAT_REPLIES.length)];
    if (/hi|hello|hey|howdy/i.test(text)) reply = `Hi ${this.me.name}! Welcome to the square.`;
    else if (/challenge|raid|fight/i.test(text)) reply = 'Check the Rivals board on your phone — the Gravy Train has full freezers.';
    else if (/help|how/i.test(text)) reply = 'Tap any staff member to see what they can do. Covering your Manager helps a lot.';
    this.receive({ t: 'chat', from: b.id, name: b.name, text: reply, ts: Date.now(), bot: true }, 'bot');
  }
}

export function botsFromMembers(members) {
  return members.filter((m) => !m.isMe && m.online !== false).slice(0, 6).map((m) => ({
    id: m.id, name: m.name, species: m.species, restaurant: m.restaurantName,
  }));
}

export { nameFor };
