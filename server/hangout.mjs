#!/usr/bin/env node
/**
 * À la Structs town square relay.
 *
 * A tiny WebSocket fan-out: everyone who joins the same room (one per
 * restaurant group) hears everyone else's presence, footsteps and chat. It
 * stores nothing and knows nothing about the chain.
 *
 *   PORT=8787 node server/hangout.mjs
 *
 * Point the client at it with VITE_HANGOUT_URL=ws://your-host:8787
 */
import { WebSocketServer } from 'ws';

const port = Number(process.env.PORT || 8787);
const wss = new WebSocketServer({ port });
const rooms = new Map();   // room → Set<ws>
const LIMIT = { msgs: 30, per: 5000 };

wss.on('connection', (ws) => {
  ws.room = null;
  ws.budget = { n: 0, since: Date.now() };
  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - ws.budget.since > LIMIT.per) ws.budget = { n: 0, since: now };
    if (++ws.budget.n > LIMIT.msgs) return;          // flood guard
    let msg;
    try { msg = JSON.parse(String(raw).slice(0, 4096)); } catch (e) { return; }
    if (msg.t === 'join' && typeof msg.room === 'string') {
      leave(ws);
      ws.room = msg.room.slice(0, 64);
      if (!rooms.has(ws.room)) rooms.set(ws.room, new Set());
      rooms.get(ws.room).add(ws);
      return;
    }
    if (!ws.room || !['presence', 'move', 'chat'].includes(msg.t)) return;
    if (msg.t === 'chat') msg.text = String(msg.text || '').slice(0, 240);
    msg.room = ws.room;
    const out = JSON.stringify(msg);
    for (const peer of rooms.get(ws.room)) if (peer !== ws && peer.readyState === 1) peer.send(out);
  });
  ws.on('close', () => leave(ws));
});

function leave(ws) {
  if (!ws.room) return;
  const set = rooms.get(ws.room);
  set?.delete(ws);
  if (set && set.size === 0) rooms.delete(ws.room);
}

console.log(`À la Structs town square listening on ws://0.0.0.0:${port}`);
