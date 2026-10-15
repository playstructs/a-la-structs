#!/usr/bin/env node
/**
 * À la Structs playtest harness — the "seat" CLI.
 *
 * A seat is one playtester at one browser. `open` starts a persistent browser
 * (Playwright/Chromium) configured from a persona card — viewport, touch,
 * zoom, reduced motion, game speed — and a tiny control server. Every other
 * command drives that browser and returns what the player now sees, so a
 * human, a script or an AI playtester can play turn by turn.
 *
 * Everything is journaled to playtest/out/<run>/<seat>/journal.jsonl with
 * screenshots, in-page telemetry (dead/rage clicks, errors, toasts, fps) and
 * a designer-only game-state snapshot per step. `report.mjs` turns runs into
 * a report.
 *
 *   node playtest/pt.mjs serve                     # build + serve the demo kitchen on :5199
 *   node playtest/pt.mjs open  <seat> --persona cozy-casual [--run r1] [--url …] [--quality low]
 *   node playtest/pt.mjs <seat> look               # what the player sees + @refs
 *   node playtest/pt.mjs <seat> click @12          # click / tap a ref (or "visible text")
 *   node playtest/pt.mjs <seat> type @3 "Maya"     # fill an input
 *   node playtest/pt.mjs <seat> key Tab [holdMs]   # key press (hold for WASD walking)
 *   node playtest/pt.mjs <seat> tap 640 400        # click/tap a point on the 3D view
 *   node playtest/pt.mjs <seat> drag 200 0         # drag the camera
 *   node playtest/pt.mjs <seat> hover @5           # hover (tooltips)
 *   node playtest/pt.mjs <seat> wait 10            # let the game run (seconds, max 90)
 *   node playtest/pt.mjs <seat> shot               # screenshot → prints path
 *   node playtest/pt.mjs <seat> reload | resize 800 600
 *   node playtest/pt.mjs <seat> think "…"          # think-aloud line
 *   node playtest/pt.mjs <seat> feel 2 "…"         # mood 1 (hate) … 5 (love)
 *   node playtest/pt.mjs <seat> flag major clarity "…"   # issue: blocker|major|minor|polish × category
 *   node playtest/pt.mjs <seat> love "…"           # a moment of delight
 *   node playtest/pt.mjs <seat> debrief '{"fun":4,…}'  # exit questionnaire (see PLAYTESTER.md)
 *   node playtest/pt.mjs <seat> close
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import http from 'node:http';
import { spawn } from 'node:child_process';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = process.env.PT_OUT || path.join(HERE, 'out');
const DEFAULT_URL = process.env.PT_URL || 'http://127.0.0.1:5199/';
const SEVERITIES = ['blocker', 'major', 'minor', 'polish'];
const CATEGORIES = ['onboarding', 'clarity', 'ui', 'feedback', 'balance', 'pacing', 'bug', 'performance', 'accessibility', 'mobile', 'fantasy', 'content', 'other'];

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };

/* ── helpers ─────────────────────────────────────────────────────────────── */

const seatFile = (run, seat) => path.join(OUT, run, seat, 'seat.json');
function findSeat(seat) {
  const run = process.env.PT_RUN;
  const candidates = run ? [seatFile(run, seat)] : fs.existsSync(OUT) ? fs.readdirSync(OUT).map((r) => seatFile(r, seat)).filter(fs.existsSync) : [];
  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!candidates.length) throw new Error(`No open seat "${seat}". Start one with: node playtest/pt.mjs open ${seat} --persona <id>`);
  return JSON.parse(fs.readFileSync(candidates[0], 'utf8'));
}
function post(port, body, timeoutMs = 150000) {
  return new Promise((ok, bad) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }, timeout: timeoutMs }, (res) => {
      let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => ok(s));
    });
    req.on('error', bad); req.on('timeout', () => req.destroy(new Error('seat timed out')));
    req.end(data);
  });
}
const up = (u) => new Promise((ok) => { http.get(u, (r) => { r.resume(); ok(r.statusCode < 500); }).on('error', () => ok(false)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── commands that run in the CLI process ───────────────────────────────── */

async function cmdServe() {
  const { serve } = await import('./lib/serve.mjs');
  const { url: u } = await serve(ROOT, { port: Number(opt('port', 5199)) });
  console.log(`Demo kitchen playtest build at ${u}`);
}

async function cmdOpen(seat) {
  const persona = opt('persona');
  if (!persona) throw new Error('--persona <id> is required (see playtest/personas/)');
  const run = opt('run', process.env.PT_RUN || new Date().toISOString().slice(0, 10));
  const target = opt('url', DEFAULT_URL);
  const quality = opt('quality', process.env.PT_QUALITY || '');
  const headed = args.includes('--headed');
  if (target === DEFAULT_URL && !(await up(target))) {
    const srv = spawn(process.execPath, [path.join(HERE, 'pt.mjs'), 'serve'], { detached: true, stdio: 'ignore', cwd: ROOT });
    srv.unref();
    for (let i = 0; i < 60 && !(await up(target)); i++) await sleep(500);
  }
  const dir = path.join(OUT, run, seat);
  fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
  try { fs.unlinkSync(path.join(dir, 'seat.json')); } catch (e) { /* none */ }
  const log = fs.openSync(path.join(dir, 'daemon.log'), 'a');
  const child = spawn(process.execPath, [path.join(HERE, 'pt.mjs'), '_daemon', seat, persona, run, target, quality, headed ? 'headed' : ''], { detached: true, stdio: ['ignore', log, log], cwd: ROOT });
  child.unref();
  for (let i = 0; i < 240 && !fs.existsSync(path.join(dir, 'seat.json')); i++) await sleep(250);
  if (!fs.existsSync(path.join(dir, 'seat.json'))) throw new Error(`Seat failed to start — see ${path.join(dir, 'daemon.log')}`);
  const { port } = JSON.parse(fs.readFileSync(path.join(dir, 'seat.json'), 'utf8'));
  console.log(`Seat "${seat}" open as ${persona} (run ${run}). Journal: ${path.relative(ROOT, dir)}\n`);
  console.log(await post(port, { cmd: 'look', args: [] }));
}

/* ── the daemon: one browser, one persona, one journal ──────────────────── */

async function daemon(seat, personaId, run, target, quality, headed) {
  const { chromium } = await import('playwright');
  const { look, snapshot } = await import('./lib/observe.js');
  const persona = JSON.parse(fs.readFileSync(path.join(HERE, 'personas', `${personaId}.json`), 'utf8'));
  const dir = path.join(OUT, run, seat);
  const journal = fs.createWriteStream(path.join(dir, 'journal.jsonl'), { flags: 'a' });
  const T0 = Date.now();
  let step = 0, lastLookText = '', idleTimer;
  const write = (e) => journal.write(JSON.stringify({ t: Date.now() - T0, wall: new Date().toISOString(), seat, persona: persona.id, step, ...e }) + '\n');

  const browser = await chromium.launch({
    headless: !headed,
    args: headed ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const dev = persona.device || {};
  const zoom = persona.accessibility?.zoom || 1;
  const ctx = await browser.newContext({
    viewport: { width: Math.round(dev.viewport.width / zoom), height: Math.round(dev.viewport.height / zoom) },
    deviceScaleFactor: Math.min(Number(process.env.PT_MAX_DPR || 99), (dev.deviceScaleFactor || 1) * zoom),
    isMobile: !!dev.isMobile, hasTouch: !!dev.hasTouch,
    reducedMotion: persona.accessibility?.reducedMotion || 'no-preference',
    locale: persona.locale || 'en-US',
  });
  const prefs = { ...(persona.prefs || {}), ...(quality ? { quality } : {}) };
  await ctx.addInitScript((p) => { try { if (!sessionStorage.getItem('pt-init')) { localStorage.clear(); localStorage.setItem('aLaStructs.prefs.v1', JSON.stringify(p)); sessionStorage.setItem('pt-init', '1'); } } catch (e) { /* ignore */ } }, prefs);
  await ctx.addInitScript({ path: path.join(HERE, 'lib/instrument.js') });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => write({ kind: 'pageerror', msg: String(e.message).slice(0, 500) }));
  await page.goto(target, { waitUntil: 'load' });
  await page.waitForSelector('.title-card, .hud-top', { timeout: 60000 });
  write({ kind: 'open', persona, target, prefs, viewport: page.viewportSize() });

  const touch = !!dev.hasTouch;
  const drain = () => page.evaluate(() => window.__pt?.drain() || []);
  const shoot = async (tag) => {
    const f = path.join(dir, 'shots', `${String(step).padStart(4, '0')}-${tag}.jpg`);
    await page.screenshot({ path: f, type: 'jpeg', quality: 65, scale: 'css', timeout: 60000 });
    return f;
  };
  const doLook = async () => { const r = await page.evaluate(look); lastLookText = r.text; lastRefs = r.refs; return r; };
  /** What a player would have noticed since the last step (toasts popped, nothing happened, etc.). */
  const noticed = (events) => {
    const lines = [];
    for (const e of events) {
      if (e.type === 'toast') lines.push(`  • speech bubble: "${e.text}"`);
      if (e.type === 'modal') lines.push(`  • a popup appeared: ${e.title}`);
      if (e.type === 'dead_click') lines.push(`  • (you clicked "${e.text || e.tag}" and nothing visibly happened)`);
      if (e.type === 'view') lines.push(`  • the screen changed to: ${e.to}`);
      if (e.type === 'fx' && e.kind === 'alarm') lines.push('  • an alarm sound rang!');
    }
    return lines.length ? `WHILE YOU WERE PLAYING:\n${lines.slice(-12).join('\n')}\n\n` : '';
  };
  let lastRefs = [];
  const locate = async (spec) => {
    if (/^@\d+$/.test(spec)) {
      const loc = page.locator(`[data-pt-ref="${spec.slice(1)}"]`);
      if (!(await loc.count())) throw new Error(`${spec} is gone — the screen changed. Run look again.`);
      return loc.first();
    }
    const loc = page.getByText(spec, { exact: false }).filter({ visible: true });
    if (!(await loc.count())) throw new Error(`Nothing visible says "${spec}".`);
    return loc.first();
  };
  /**
   * Find where a control is right now — by @ref, falling back to the same
   * label near the same spot (the HUD, dock and panels re-render every tick,
   * so the element behind a ref is often replaced) — and what is on top there.
   */
  const aim = (spec) => page.evaluate(([spec, prev]) => {
    const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const label = (e) => clean(e.getAttribute('aria-label') || e.innerText || e.value || e.placeholder || e.title).slice(0, 90);
    let el = null;
    if (/^@\d+$/.test(spec)) {
      el = document.querySelector(`[data-pt-ref="${spec.slice(1)}"]`);
      if (!el && prev) {
        const cands = [...document.querySelectorAll(prev.kind === 'nametag' ? '.labels-layer .tag' : 'button, input, textarea, [role=radio]')].filter((e) => label(e) === prev.text);
        cands.sort((a, b) => { const d = (e) => { const r = e.getBoundingClientRect(); return Math.hypot(r.x + r.width / 2 - prev.x, r.y + r.height / 2 - prev.y); }; return d(a) - d(b); });
        el = cands[0] || null;
      }
    } else {
      const want = spec.toLowerCase();
      el = [...document.querySelectorAll('button, input, textarea, [role=radio], .labels-layer .tag, a, label')].find((e) => label(e).toLowerCase().includes(want) && e.getBoundingClientRect().width > 0);
    }
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const x = Math.round(Math.min(innerWidth - 2, Math.max(1, r.left + r.width / 2))), y = Math.round(Math.min(innerHeight - 2, Math.max(1, r.top + r.height / 2)));
    const top = document.elementFromPoint(x, y);
    const blocked = top && !(top === el || el.contains(top) || top.contains(el));
    return { x, y, text: label(el), disabled: !!el.disabled, blockedBy: blocked ? `${top.tagName.toLowerCase()}${top.className ? '.' + String(top.className).split(' ')[0] : ''} "${label(top).slice(0, 40)}"` : null };
  }, [spec, lastRefs.find((r) => `@${r.ref}` === spec) || null]);

  const handlers = {
    async look() { const r = await doLook(); return r.text; },
    async shot() { return `Screenshot: ${await shoot('shot')}`; },
    async click(spec) {
      if (persona.accessibility?.keyboardOnly) return 'Persona rule: keyboard only — use `key` (Tab/Enter/Space/Escape/arrows).';
      const a = await aim(spec);
      if (!a) return `Couldn't find ${spec} on screen any more — run look again.`;
      // Click where it is, like a person would: if something covers it, that thing gets the click.
      if (touch) await page.touchscreen.tap(a.x, a.y); else await page.mouse.click(a.x, a.y);
      return { did: `${touch ? 'tapped' : 'clicked'} "${a.text || spec}"${a.disabled ? ' (it was greyed out)' : ''}`, extra: a.blockedBy ? `Heads-up: ${a.blockedBy} was on top of it, so that is what you actually hit.` : '' };
    },
    async hover(spec) { const el = await locate(spec); await el.hover({ timeout: 4000 }); await sleep(600); const tip = await el.evaluate((e) => e.title || e.closest('[title]')?.title || ''); return { did: `hovered`, extra: tip ? `Tooltip: ${tip}` : 'No tooltip.' }; },
    async type(spec, ...words) { const el = await locate(spec); await el.fill(words.join(' ')); return { did: `typed "${words.join(' ')}"` }; },
    async key(k, hold) {
      const map = { esc: 'Escape', enter: 'Enter', space: ' ', tab: 'Tab', 'shift+tab': 'Shift+Tab' };
      const key = map[String(k).toLowerCase()] || k;
      if (hold) { await page.keyboard.down(key); await sleep(Math.min(5000, Number(hold))); await page.keyboard.up(key); } else await page.keyboard.press(key);
      const focus = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'nothing (page body)'; const cs = getComputedStyle(e); const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== 'none'; return `${e.tagName.toLowerCase()} "${(e.getAttribute('aria-label') || e.innerText || e.value || e.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 60)}"${ring ? '' : ' (no visible focus ring detected)'}`; });
      return { did: `pressed ${key}${hold ? ` for ${hold}ms` : ''}`, extra: `Keyboard focus is now on: ${focus}` };
    },
    async tap(x, y) {
      if (persona.accessibility?.keyboardOnly) return 'Persona rule: keyboard only.';
      if (touch) await page.touchscreen.tap(Number(x), Number(y)); else await page.mouse.click(Number(x), Number(y));
      return { did: `tapped the scene at ${x},${y}` };
    },
    async drag(dx, dy) {
      const vp = page.viewportSize(); const cx = vp.width / 2, cy = vp.height / 2;
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + Number(dx), cy + Number(dy || 0), { steps: 12 }); await page.mouse.up();
      return { did: `dragged the view ${dx},${dy || 0}` };
    },
    async scroll(dy = 300) {
      const box = await page.locator('.sheet .body').first().boundingBox().catch(() => null);
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, Number(dy)); return { did: `scrolled ${box ? 'the side panel' : 'the view'} by ${dy}` };
    },
    async wait(sec = 5) { await sleep(Math.min(90, Number(sec)) * 1000); return { did: `waited ${Math.min(90, Number(sec))}s` }; },
    async reload() { await page.reload({ waitUntil: 'load' }); await page.waitForSelector('.title-card, .hud-top', { timeout: 60000 }); return { did: 'reloaded the page' }; },
    async resize(w, h) { await page.setViewportSize({ width: Number(w), height: Number(h) }); return { did: `resized to ${w}×${h}` }; },
    async think(...t) { write({ kind: 'think', text: t.join(' ') }); return 'noted'; },
    async feel(score, ...t) { write({ kind: 'feel', score: Number(score), text: t.join(' ') }); return 'noted'; },
    async flag(sev, cat, ...t) {
      if (!SEVERITIES.includes(sev)) return `severity must be one of ${SEVERITIES.join(', ')}`;
      if (!CATEGORIES.includes(cat)) return `category must be one of ${CATEGORIES.join(', ')}`;
      const shotPath = await shoot('flag');
      write({ kind: 'flag', severity: sev, category: cat, text: t.join(' '), shot: path.relative(dir, shotPath), snapshot: await page.evaluate(snapshot) });
      return 'flagged (screenshot attached)';
    },
    async love(...t) { const shotPath = await shoot('love'); write({ kind: 'love', text: t.join(' '), shot: path.relative(dir, shotPath) }); return 'noted (screenshot attached)'; },
    async debrief(json) { let d; try { d = JSON.parse(json); } catch (e) { return `debrief must be JSON: ${e.message}`; } write({ kind: 'debrief', ...d }); return 'debrief saved'; },
    async _eval(...code) { return JSON.stringify(await page.evaluate(code.join(' '))).slice(0, 4000); },   // designer debugging only
    async close() { setTimeout(async () => { await finish(); process.exit(0); }, 50); return 'closing'; },
  };
  const MUTATING = new Set(['click', 'type', 'key', 'tap', 'drag', 'scroll', 'wait', 'reload', 'resize', 'hover']);

  async function finish() {
    try { write({ kind: 'events', events: await drain() }); write({ kind: 'end', snapshot: await page.evaluate(snapshot) }); } catch (e) { /* page gone */ }
    journal.end(); await browser.close().catch(() => {});
  }

  let chain = Promise.resolve();
  const run1 = async ({ cmd, args: a = [] }) => {
    clearTimeout(idleTimer); idleTimer = setTimeout(async () => { write({ kind: 'idle-timeout' }); await finish(); process.exit(0); }, 30 * 60 * 1000);
    const h = handlers[cmd];
    if (!h) return `Unknown command "${cmd}". Try: ${Object.keys(handlers).join(', ')}`;
    step++;
    const before = MUTATING.has(cmd) ? await page.evaluate(snapshot).catch(() => null) : null;
    let res;
    try { res = await h(...a); } catch (e) { res = `Error: ${String(e.message).split('\n')[0]}`; }
    if (!MUTATING.has(cmd) || typeof res === 'string') {
      if (!['think', 'feel', 'debrief', 'close'].includes(cmd)) write({ kind: 'cmd', cmd, args: a, result: typeof res === 'string' ? res.slice(0, 400) : res });
      return typeof res === 'string' ? res : JSON.stringify(res);
    }
    await sleep(cmd === 'wait' ? 300 : 900);       // let the UI settle (and dead-click detection fire)
    const events = await drain();
    const after = await page.evaluate(snapshot).catch(() => null);
    const shotPath = await shoot(cmd);
    const r = await doLook();
    write({ kind: 'cmd', cmd, args: a, result: res.did, before, after, events, shot: path.relative(dir, shotPath) });
    return `${res.did}.${res.extra ? ' ' + res.extra : ''}\n\n${noticed(events)}${r.text}`;
  };

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      chain = chain.then(() => run1(JSON.parse(body || '{}'))).then((out) => { res.end(String(out)); }, (e) => { res.end(`Seat error: ${e.message}`); });
    });
  });
  server.listen(0, '127.0.0.1', () => {
    fs.writeFileSync(path.join(dir, 'seat.json'), JSON.stringify({ seat, run, persona: persona.id, port: server.address().port, pid: process.pid, started: new Date().toISOString() }));
  });
  process.on('SIGTERM', async () => { await finish(); process.exit(0); });
}

/* ── entry ───────────────────────────────────────────────────────────────── */

try {
  const [a0, a1, ...rest] = args;
  if (a0 === 'serve') await cmdServe();
  else if (a0 === '_daemon') await daemon(a1, ...rest);
  else if (a0 === 'open') await cmdOpen(a1);
  else if (!a0 || a0 === 'help' || a0 === '--help') console.log(fs.readFileSync(url.fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
  else {
    const seat = findSeat(a0);
    const out = await post(seat.port, { cmd: a1 || 'look', args: rest });
    console.log(out);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
