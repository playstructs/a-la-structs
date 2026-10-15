#!/usr/bin/env node
/**
 * Turns a playtest run into one self-contained HTML report.
 *
 *   node playtest/report.mjs [run] [--embed]     # default: most recent run
 *
 * Reads playtest/out/<run>/<seat>/journal.jsonl (AI/human seats) and
 * playtest/out/<run>/sim.json (bot sessions), writes playtest/out/<run>/report.html.
 * --embed inlines screenshots as data URIs so the file can be shared alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const OUT = process.env.PT_OUT || path.join(HERE, 'out');
const argv = process.argv.slice(2);
const embed = argv.includes('--embed');
const runs = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((r) => fs.statSync(path.join(OUT, r)).isDirectory()) : [];
const run = argv.find((a) => !a.startsWith('--')) || runs.sort((a, b) => fs.statSync(path.join(OUT, b)).mtimeMs - fs.statSync(path.join(OUT, a)).mtimeMs)[0];
if (!run) { console.error('No runs in playtest/out'); process.exit(1); }
const RUN = path.join(OUT, run);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SEV = { blocker: 0, major: 1, minor: 2, polish: 3 };

/* ── load seats ──────────────────────────────────────────────────────────── */

const seats = [];
for (const seat of fs.readdirSync(RUN)) {
  const f = path.join(RUN, seat, 'journal.jsonl');
  if (!fs.existsSync(f)) continue;
  const rows = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  const open = rows.find((r) => r.kind === 'open');
  if (!open) continue;
  const events = rows.flatMap((r) => r.events || []);
  const cmds = rows.filter((r) => r.kind === 'cmd');
  const has = (fn) => events.some(fn);
  const firstT = (fn) => { const r = rows.find((x) => (x.events || []).some(fn)); return r ? Math.round(r.t / 1000) : null; };
  const milestones = [
    ['Entered the restaurant', (e) => e.type === 'view' && e.to === 'home'],
    ['Opened a staff card', (e) => e.type === 'sheet' && /^staff/.test(e.to || '')],
    ['Opened Hire & Buy', (e) => e.type === 'sheet' && /^hire/.test(e.to || '')],
    ['Hired / bought', (e) => e.type === 'fx' && e.kind === 'hired'],
    ['Invested gold', (e) => e.type === 'toast' && /Invested|Deposited/.test(e.text)],
    ['Opened Rivals', (e) => e.type === 'sheet' && /^rivals/.test(e.to || '')],
    ['Played a challenge', (e) => e.type === 'view' && e.to === 'challenge'],
    ['Finished a challenge', (e) => e.type === 'fx' && e.kind === 'challengeEnd'],
    ['Visited the town', (e) => e.type === 'view' && e.to === 'town'],
    ['Opened Settings', (e) => e.type === 'sheet' && /^settings/.test(e.to || '')],
  ].map(([label, fn]) => ({ label, at: firstT(fn), done: has(fn) }));
  const fps = events.filter((e) => e.type === 'fps').map((e) => e.fps);
  seats.push({
    seat, dir: path.join(RUN, seat), persona: open.persona, viewport: open.viewport, rows, cmds, events, milestones,
    flags: rows.filter((r) => r.kind === 'flag'), loves: rows.filter((r) => r.kind === 'love'), thinks: rows.filter((r) => r.kind === 'think'),
    feels: rows.filter((r) => r.kind === 'feel'), debrief: rows.filter((r) => r.kind === 'debrief').pop() || null,
    minutes: +(rows.reduce((a, r, i) => a + (i && r.t >= rows[i - 1].t ? r.t - rows[i - 1].t : 0), 0) / 60000).toFixed(1),
    dead: events.filter((e) => e.type === 'dead_click'), rage: events.filter((e) => e.type === 'rage_click'),
    errors: [...events.filter((e) => /error/.test(e.type)), ...rows.filter((r) => r.kind === 'pageerror')],
    toasts: events.filter((e) => e.type === 'toast'),
    backlog: Math.max(0, ...events.filter((e) => e.type === 'toast').map((e) => e.backlog || 0)),
    fps: fps.length ? +(fps.reduce((a, b) => a + b, 0) / fps.length).toFixed(1) : null,
    failedClicks: cmds.filter((c) => /^Couldn't|^Error/.test(String(c.result))),
  });
}
const sim = fs.existsSync(path.join(RUN, 'sim.json')) ? JSON.parse(fs.readFileSync(path.join(RUN, 'sim.json'), 'utf8')) : null;

// Embedded screenshots are shrunk to thumbnails when `sharp` is installed (optional).
let sharp = null;
if (embed) { try { sharp = (await import('sharp')).default; } catch (e) { console.warn('sharp not installed — embedding full-size screenshots'); } }
const thumbs = new Map();
const imgQueue = [];
const img = (seat, rel, cls = 'thumb') => {
  if (!rel) return '';
  const f = path.join(seat.dir, rel);
  if (!fs.existsSync(f)) return '';
  if (embed) { const key = `@@IMG${imgQueue.length}@@`; imgQueue.push(f); return `<img class="${cls}" src="${key}" alt="screenshot" loading="lazy">`; }
  const src = path.relative(RUN, f);
  return `<a href="${src}" target="_blank"><img class="${cls}" src="${src}" alt="screenshot" loading="lazy"></a>`;
};

/* ── charts (inline SVG) ─────────────────────────────────────────────────── */

function moodLine(seat) {
  const pts = seat.feels.map((f) => [f.t / 60000, f.score]);
  if (!pts.length) return '<span class="muted">no mood logged</span>';
  const W = 260, H = 64, maxT = Math.max(1, seat.minutes);
  const x = (t) => 6 + (t / maxT) * (W - 12), y = (s) => H - 6 - ((s - 1) / 4) * (H - 12);
  const d = pts.map(([t, s], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(s).toFixed(1)}`).join(' ');
  return `<svg class="mood" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mood over time">
    <line x1="6" x2="${W - 6}" y1="${y(3)}" y2="${y(3)}" class="grid"/>
    <path d="${d}" class="line"/>${pts.map(([t, s], i) => `<circle cx="${x(t)}" cy="${y(s)}" r="3.5" class="dot"><title>${esc(seat.feels[i].score)} — ${esc(seat.feels[i].text)}</title></circle>`).join('')}
  </svg>`;
}

function econChart(sessions) {
  const policies = [...new Set(sessions.map((s) => s.policy))];
  const W = 640, H = 220, P = 34;
  const maxT = Math.max(...sessions.flatMap((s) => s.series.map((p) => p.t)));
  const metric = (p) => p.gold + (p.recipes || 0);
  const series = policies.map((pol) => {
    const list = sessions.filter((s) => s.policy === pol);
    const ts = list[0].series.map((p) => p.t);
    return { pol, pts: ts.map((t, i) => [t, list.reduce((a, s) => a + metric(s.series[i] || s.series[s.series.length - 1]), 0) / list.length]) };
  });
  const maxV = Math.max(5, ...series.flatMap((s) => s.pts.map((p) => p[1])));
  const x = (t) => P + (t / maxT) * (W - P - 10), y = (v) => H - 24 - (v / maxV) * (H - 40);
  const ticks = [0, maxV / 2, maxV].map((v) => `<text x="${P - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${Math.round(v)}</text><line x1="${P}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`).join('');
  // keep end labels from colliding
  const ends = series.map((s, i) => ({ i, y: y(s.pts[s.pts.length - 1][1]) - 6 })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;
  const endY = Object.fromEntries(ends.map((e) => [e.i, e.y]));
  const lines = series.map((s, i) => `<path d="${s.pts.map(([t, v], j) => `${j ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" class="series s${i}"><title>${s.pol}</title></path><text x="${x(s.pts[s.pts.length - 1][0]) - 4}" y="${endY[i]}" class="lbl s${i}" text-anchor="end">${s.pol}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Gold plus recipes on hand over time, by policy">${ticks}${lines}
    <text x="${P}" y="${H - 6}" class="axis">0</text><text x="${W - 10}" y="${H - 6}" class="axis" text-anchor="end">${maxT} ticks (≈${Math.round(maxT * 3 / 60)} min at 3s)</text></svg>`;
}

function matrixTable(rows) {
  const diffs = ['easy', 'difficult', 'hard'], strats = ['idle', 'naive', 'focus'];
  const cell = (role, d, st) => {
    const l = rows.filter((r) => r.role === role && r.difficulty === d && r.strategy === st);
    if (!l.length) return '<td>—</td>';
    const w = Math.round((100 * l.filter((r) => r.won).length) / l.length);
    return `<td class="heat" style="--w:${w}"><b>${w}%</b><small>${l.length} games · ${Math.round(l.reduce((a, r) => a + r.ticks, 0) / l.length)}t</small></td>`;
  };
  return ['challenger', 'defender'].map((role) => `<h4>${role === 'challenger' ? 'Visiting (raiding) a rival — player win rate' : 'Hosting (defending) — player win rate'}</h4>
    <table class="matrix"><thead><tr><th>Rivals play…</th>${strats.map((s) => `<th>${{ idle: 'Player does nothing', naive: 'Random targets', focus: 'Focus fire' }[s]}</th>`).join('')}</tr></thead>
    <tbody>${diffs.map((d) => `<tr><th>${{ easy: 'Gently', difficult: 'Seriously', hard: 'Ruthlessly' }[d]}</th>${strats.map((s) => cell(role, d, s)).join('')}</tr>`).join('')}</tbody></table>`).join('');
}

/* ── html ────────────────────────────────────────────────────────────────── */

const allFlags = seats.flatMap((s) => s.flags.map((f) => ({ ...f, seatObj: s }))).sort((a, b) => SEV[a.severity] - SEV[b.severity] || a.category.localeCompare(b.category));
const sevCount = Object.keys(SEV).map((k) => [k, allFlags.filter((f) => f.severity === k).length]);
const personaName = (s) => { const p = s.rows[0]?.persona; const o = s.rows.find((r) => r.kind === 'open')?.persona; return o ? `${o.name} — ${o.archetype}` : s.seat; };
const score = (d, k) => (d && d[k] != null ? d[k] : '—');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Playtest report — ${esc(run)}</title>
<style>
:root{--bg:#fbf7f0;--card:#fff;--ink:#2d241f;--muted:#7a6a60;--line:#eadfd2;--accent:#d9603b;--good:#2f8a5b;--bad:#c2410c;--blocker:#b42318;--major:#d9603b;--minor:#b7791f;--polish:#64748b;--s0:#d9603b;--s1:#2f6fb5;--s2:#2f8a5b;--s3:#8a5cc2;--s4:#b7791f}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#1b1714;--card:#25201c;--ink:#f3ebe3;--muted:#b3a497;--line:#3a322b;--s1:#6aa5e8;--s2:#5cc08d;--s3:#b893e8;--s4:#e2b04f}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:1.8rem;margin:.2em 0}h2{margin-top:2.2em;border-bottom:2px solid var(--line);padding-bottom:6px}h4{margin:1.2em 0 .4em}
.muted{color:var(--muted)}.grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.kpis{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px;min-width:110px}.kpi b{display:block;font-size:1.5rem}
.sev{display:inline-block;padding:1px 8px;border-radius:99px;color:#fff;font-size:.75rem;font-weight:700;text-transform:uppercase}.sev.blocker{background:var(--blocker)}.sev.major{background:var(--major)}.sev.minor{background:var(--minor)}.sev.polish{background:var(--polish)}
.cat{font-size:.75rem;border:1px solid var(--line);border-radius:99px;padding:1px 8px;color:var(--muted)}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
.scores{font-size:.8rem;table-layout:fixed}.scores td,.scores th{padding:4px 3px;text-align:center}.thumb{width:180px;border-radius:8px;border:1px solid var(--line)}
.issue{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start}
.mood .grid,.chart .grid{stroke:var(--line)}.mood .line{fill:none;stroke:var(--accent);stroke-width:2}.mood .dot{fill:var(--accent)}
.chart{width:100%;height:auto}.chart .axis{fill:var(--muted);font-size:11px}.chart .series{fill:none;stroke-width:2.2}.chart .lbl{font-size:11px;font-weight:700}
${[0, 1, 2, 3, 4].map((i) => `.chart .series.s${i}{stroke:var(--s${i})}.chart .lbl.s${i}{fill:var(--s${i})}`).join('')}
.matrix td.heat{background:color-mix(in srgb,var(--good) calc(var(--w)*1%),var(--bad) calc((100 - var(--w))*1%));color:#fff;text-align:center}.matrix td small{display:block;opacity:.85}
.ms{display:flex;flex-wrap:wrap;gap:4px}.ms span{font-size:.72rem;border-radius:99px;padding:1px 7px;border:1px solid var(--line)}.ms span.done{background:var(--good);color:#fff;border-color:var(--good)}
blockquote{margin:6px 0;padding-left:10px;border-left:3px solid var(--line);color:var(--muted)}
details summary{cursor:pointer;color:var(--muted)}
@media (max-width:600px){.issue{grid-template-columns:1fr}.scores{font-size:.8rem;table-layout:fixed}.scores td,.scores th{padding:4px 3px;text-align:center}.thumb{width:100%}}
</style></head><body><main>
<p class="muted">À la Structs · playtest run <b>${esc(run)}</b> · generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</p>
<h1>Playtest report</h1>
<div class="kpis">
  <div class="kpi"><b>${seats.length}</b>playtesters</div>
  <div class="kpi"><b>${seats.reduce((a, s) => a + s.cmds.length, 0)}</b>actions</div>
  <div class="kpi"><b>${seats.reduce((a, s) => a + s.minutes, 0).toFixed(0)}</b>minutes played</div>
  ${sevCount.map(([k, n]) => `<div class="kpi"><b>${n}</b><span class="sev ${k}">${k}</span></div>`).join('')}
  <div class="kpi"><b>${seats.reduce((a, s) => a + s.dead.length, 0)}</b>dead clicks</div>
  <div class="kpi"><b>${seats.reduce((a, s) => a + s.errors.length, 0)}</b>JS errors</div>
  ${sim ? `<div class="kpi"><b>${sim.sessions.length}</b>bot sessions</div><div class="kpi"><b>${sim.challengeMatrix.length}</b>bot challenges</div>` : ''}
</div>

<h2>Playtesters</h2>
<div class="grid2">${seats.map((s) => `<div class="card">
  <h3 style="margin:0">${esc(personaName(s))}</h3>
  <div class="muted">${s.viewport.width}×${s.viewport.height} · ${s.cmds.length} actions · ${s.minutes} min · ${s.flags.length} issues · ${s.loves.length} delights</div>
  ${s.debrief?.oneSentence ? `<blockquote>“${esc(s.debrief.oneSentence)}”</blockquote>` : ''}
  <table class="scores"><tr><th>Fun</th><th>Clarity</th><th>Fantasy</th><th>Raids</th><th>Return</th><th>NPS</th></tr>
  <tr><td>${score(s.debrief, 'fun')}</td><td>${score(s.debrief, 'clarity')}</td><td>${score(s.debrief, 'fantasy')}</td><td>${score(s.debrief, 'challengeFun')}</td><td>${score(s.debrief, 'wouldReturn')}</td><td>${score(s.debrief, 'nps')}</td></tr></table>
  ${moodLine(s)}
  <div class="ms">${s.milestones.map((m) => `<span class="${m.done ? 'done' : ''}" title="${m.at != null ? `at ${m.at}s` : 'not reached'}">${esc(m.label)}</span>`).join('')}</div>
  ${s.debrief?.quitPoint ? `<p><b>Would have quit:</b> ${esc(s.debrief.quitPoint)}</p>` : ''}
  <p class="muted">Dead clicks ${s.dead.length} · rage clicks ${s.rage.length} · failed clicks ${s.failedClicks.length} · errors ${s.errors.length} · max toast backlog ${s.backlog}${s.fps != null ? ` · ${s.fps} fps (software GL)` : ''}</p>
  ${s.debrief ? `<details><summary>Debrief</summary><p><b>Favourite:</b> ${esc(s.debrief.favoriteMoment)}</p><p><b>Worst:</b> ${esc(s.debrief.worstMoment)}</p>${(s.debrief.confusions || []).length ? `<p><b>Confusions:</b></p><ul>${s.debrief.confusions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}${(s.debrief.wishlist || []).length ? `<p><b>Wishlist:</b></p><ul>${s.debrief.wishlist.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}</details>` : ''}
  <details><summary>Think-aloud (${s.thinks.length})</summary>${s.thinks.map((t) => `<blockquote><small>${Math.round(t.t / 1000)}s</small> ${esc(t.text)}</blockquote>`).join('')}</details>
</div>`).join('')}</div>

<h2>Issues (${allFlags.length})</h2>
${allFlags.map((f) => `<div class="card issue" style="margin-bottom:10px"><div><span class="sev ${f.severity}">${f.severity}</span> <span class="cat">${esc(f.category)}</span> <span class="muted">· ${esc(f.seatObj.rows.find((r) => r.kind === 'open')?.persona?.name || f.seat)} · ${Math.round(f.t / 1000)}s${f.snapshot?.view ? ` · ${esc(f.snapshot.view)}` : ''}</span><p style="margin:.4em 0 0">${esc(f.text)}</p></div>${img(f.seatObj, f.shot)}</div>`).join('') || '<p class="muted">No issues flagged.</p>'}

<h2>Delights (${seats.reduce((a, s) => a + s.loves.length, 0)})</h2>
<div class="grid2">${seats.flatMap((s) => s.loves.map((l) => `<div class="card"><p style="margin-top:0">${esc(l.text)}</p><p class="muted">${esc(s.rows.find((r) => r.kind === 'open')?.persona?.name)}</p>${img(s, l.shot)}</div>`)).join('') || '<p class="muted">None recorded.</p>'}</div>

<h2>Instrumentation</h2>
<h4>Dead clicks (clicked, nothing visible changed)</h4>
<table><tr><th>Persona</th><th>Target</th><th>Count</th></tr>${seats.flatMap((s) => Object.entries(s.dead.reduce((o, d) => { const k = `${d.tag} “${d.text}”`; o[k] = (o[k] || 0) + 1; return o; }, {})).map(([k, n]) => `<tr><td>${esc(s.rows.find((r) => r.kind === 'open')?.persona?.name)}</td><td>${esc(k)}</td><td>${n}</td></tr>`)).join('') || '<tr><td colspan=3 class="muted">none</td></tr>'}</table>
<h4>Errors</h4>
<table>${seats.flatMap((s) => s.errors.map((e) => `<tr><td>${esc(s.seat)}</td><td><code>${esc(e.msg)}</code></td></tr>`)).join('') || '<tr><td class="muted">none</td></tr>'}</table>
<h4>Clicks the harness couldn't perform (overlaps, hidden targets)</h4>
<table>${seats.flatMap((s) => s.failedClicks.map((c) => `<tr><td>${esc(s.seat)}</td><td>${esc(c.args.join(' '))}</td><td>${esc(c.result)}</td></tr>`)).join('') || '<tr><td class="muted">none</td></tr>'}</table>

${sim ? `<h2>Bot playtests</h2>
<p class="muted">${sim.sessions.length} headless sessions of ${sim.ticks} ticks (≈${Math.round(sim.ticks * 3 / 60)} min at the default 3s tick) on the real DemoService, plus ${sim.challengeMatrix.length} isolated service challenges against SimulatorAi.</p>
<div class="card">${econChart(sim.sessions)}<p class="muted" style="margin:0">Gold + recipes on hand, mean per policy.</p></div>
<table style="margin-top:12px"><tr><th>Policy</th><th>Final gold</th><th>Bank</th><th>Staff</th><th>First gold</th><th>Recipes run dry</th><th>Challenges (won)</th><th>Toasts/min</th><th>Action errors</th></tr>
${[...new Set(sim.sessions.map((s) => s.policy))].map((p) => { const l = sim.sessions.filter((s) => s.policy === p); const a = (f) => (l.reduce((x, s) => x + f(s), 0) / l.length); const ch = l.flatMap((s) => s.challenges); const won = ch.filter((c) => (c.role === 'challenger' ? c.status === 'raidSuccessful' : c.status === 'attackerDefeated')).length; return `<tr><td><b>${p}</b></td><td>${a((s) => s.final.gold).toFixed(0)}</td><td>${a((s) => s.final.bank).toFixed(0)}</td><td>${a((s) => s.final.staff).toFixed(1)}</td><td>tick ${a((s) => s.firstGoldTick ?? sim.ticks).toFixed(0)}</td><td>${l.filter((s) => s.stallTick != null).length}/${l.length} · tick ${a((s) => s.stallTick ?? sim.ticks).toFixed(0)}</td><td>${ch.length} (${won})</td><td>${a((s) => s.toastsPerMinute).toFixed(1)}</td><td>${a((s) => s.errors.length).toFixed(0)}${l.some((s) => s.errors.length) ? `<br><small class="muted">${esc(Object.entries(l.flatMap((s) => s.errors).reduce((o, e) => ((o[e] = (o[e] || 0) + 1), o), {})).sort((x, y) => y[1] - x[1])[0][0])}</small>` : ''}</td></tr>`; }).join('')}</table>
<h3>Service challenge matrix</h3>${matrixTable(sim.challengeMatrix)}` : ''}
</main></body></html>`;

let final = html;
for (let i = 0; i < imgQueue.length; i++) {
  const buf = sharp ? await sharp(imgQueue[i]).resize({ width: 480 }).jpeg({ quality: 62 }).toBuffer() : fs.readFileSync(imgQueue[i]);
  final = final.replace(`@@IMG${i}@@`, `data:image/jpeg;base64,${buf.toString('base64')}`);
}
const outFile = path.join(RUN, 'report.html');
fs.writeFileSync(outFile, final);
console.log(`wrote ${path.relative(process.cwd(), outFile)} (${(final.length / 1024).toFixed(0)} KB) — ${seats.length} seats, ${allFlags.length} issues${sim ? ', sim included' : ''}`);
