/*
 * In-page instrumentation for À la Structs playtests. Injected with
 * page.addInitScript before the game loads. Records what a UX researcher
 * watching over the player's shoulder would note — without changing the game.
 *
 *   window.__pt.events   append-only list of { t, type, ... }
 *   window.__pt.drain()  returns and clears new events (the seat polls it)
 *
 * Captures: clicks (+ dead clicks, rage clicks), every toast / fx / chain
 * error the game emits, view & sheet changes, modals, JS errors, long tasks,
 * frame rate samples, and the toast backlog (how far behind the announcer is).
 */
(() => {
  if (window.__pt) return;
  const T0 = performance.now();
  const now = () => Math.round(performance.now() - T0);
  const pt = window.__pt = { events: [], cursor: 0, clicks: [], hooked: new WeakSet() };
  const push = (type, data = {}) => { pt.events.push({ t: now(), type, ...data }); if (pt.events.length > 20000) pt.events.splice(0, 5000); };
  pt.push = push;
  pt.drain = () => { const out = pt.events.slice(pt.cursor); pt.cursor = pt.events.length; return out; };

  const app = () => window.aLaStructs;
  const describe = (el) => {
    if (!el || el === document || el === window) return { tag: 'none' };
    const btn = el.closest?.('button, a, input, textarea, [role=radio], [role=option], .tag, label') || el;
    const text = (btn.getAttribute?.('aria-label') || btn.innerText || btn.value || btn.title || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    return { tag: btn.tagName?.toLowerCase(), cls: String(btn.className || '').slice(0, 60), text, disabled: !!btn.disabled, canvas: btn.tagName === 'CANVAS' };
  };
  // A cheap "did anything the player cares about change?" fingerprint.
  const signature = () => {
    const a = app();
    const sheet = document.querySelector('.sheet');
    return [
      a?.view, a?.sheet?.kind, a?.sheet?.arg, !!document.querySelector('.modal-back'), !!a?.targeting,
      a?.svc?.state?.log?.length ?? 0, document.querySelector('.title-card')?.innerText.length ?? 0,
      sheet ? sheet.innerText.length : 0, document.querySelector('#overlay')?.innerText.length ?? 0,
      a?.svc?.state?.challenge?.log?.length ?? 0, document.activeElement?.id || document.activeElement?.tagName,
      a?.homeScene?.selectedId ?? '', a?.challengeScene?.selectedId ?? '',
    ].join('|');
  };

  /* ── clicks: dead + rage ──────────────────────────────────────────────── */
  let downAt = null;
  addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; }, true);
  addEventListener('click', (e) => {
    const d = describe(e.target);
    const drag = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6;
    const before = signature();
    const rec = { x: Math.round(e.clientX), y: Math.round(e.clientY), ...d, drag };
    push('click', rec);
    const t = performance.now();
    pt.clicks.push({ x: e.clientX, y: e.clientY, t });
    pt.clicks = pt.clicks.filter((c) => t - c.t < 1200);
    const near = pt.clicks.filter((c) => Math.hypot(c.x - e.clientX, c.y - e.clientY) < 40);
    if (near.length >= 3) push('rage_click', { ...rec, n: near.length });
    if (!drag && !['input', 'textarea'].includes(d.tag)) {
      setTimeout(() => { if (signature() === before) push(d.canvas ? 'canvas_miss' : 'dead_click', rec); }, 1000);
    }
  }, true);
  addEventListener('keydown', (e) => push('key', { key: e.key, target: describe(e.target).tag }), true);

  /* ── errors & perf ────────────────────────────────────────────────────── */
  addEventListener('error', (e) => push('js_error', { msg: String(e.message || e.error || e).slice(0, 300), src: e.filename, line: e.lineno }));
  addEventListener('unhandledrejection', (e) => push('js_error', { msg: 'unhandled rejection: ' + String(e.reason?.message || e.reason).slice(0, 300) }));
  const ce = console.error.bind(console);
  console.error = (...args) => { push('console_error', { msg: args.map(String).join(' ').slice(0, 300) }); ce(...args); };
  try { new PerformanceObserver((l) => l.getEntries().forEach((x) => { if (x.duration > 200) push('long_task', { ms: Math.round(x.duration) }); })).observe({ entryTypes: ['longtask'] }); } catch (e) { /* unsupported */ }
  let frames = 0;
  const loop = () => { frames++; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  setInterval(() => { push('fps', { fps: +(frames / 5).toFixed(1) }); frames = 0; }, 5000);

  /* ── game hooks (the App swaps services on start, so keep watching) ───── */
  let lastView = null, lastSheet = null, lastModal = null, lastTarget = null;
  setInterval(() => {
    const a = app();
    if (!a) return;
    const svc = a.svc;
    if (svc && !pt.hooked.has(svc)) {
      pt.hooked.add(svc);
      push('service', { mode: svc.mode });
      svc.addEventListener('toast', (e) => push('toast', { text: e.detail.text, tone: e.detail.tone, backlog: a.toasts?.length ?? 0, tick: svc.state.tick }));
      svc.addEventListener('fx', (e) => push('fx', { kind: e.detail.kind, status: e.detail.status, role: e.detail.role, tick: svc.state.tick }));
    }
    if (a.view !== lastView) { push('view', { from: lastView, to: a.view }); lastView = a.view; }
    const sk = a.sheet ? `${a.sheet.kind}:${a.sheet.arg ?? ''}` : null;
    if (sk !== lastSheet) { push('sheet', { from: lastSheet, to: sk }); lastSheet = sk; }
    const m = document.querySelector('.modal-back')?.getAttribute('aria-label') || null;
    if (m !== lastModal) { if (m) push('modal', { title: m, text: document.querySelector('.modal p')?.innerText.slice(0, 300) }); lastModal = m; }
    const tg = a.targeting ? a.targeting.kind : null;
    if (tg !== lastTarget) { push('targeting', { kind: tg, hint: a.targeting?.hint }); lastTarget = tg; }
  }, 250);
})();
