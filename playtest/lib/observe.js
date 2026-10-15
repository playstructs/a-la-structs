/*
 * What the player can see right now, as text — plus numbered handles (@1, @2…)
 * for everything they could click or type into. Runs inside the page.
 *
 * Only reads the DOM the player sees (HUD, sheets, modals, name tags, toasts).
 * It never reads hidden game state: playtesters must form their own mental
 * model, exactly like a human would. Designer telemetry lives in snapshot().
 */
export function look() {
  const vw = innerWidth, vh = innerHeight;
  document.querySelectorAll('[data-pt-ref]').forEach((e) => e.removeAttribute('data-pt-ref'));
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    if (r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) {
      // Off-screen but inside a scrollable panel: the player can scroll to it.
      return el.closest('.sheet .body, .chat .log, .guild-list') ? { r, covered: false, folded: true, cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) } : null;
    }
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return null;
    const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(cx, cy);
    const box = el.closest('.body, .log, .guild-list');
    const br = box?.getBoundingClientRect();
    const folded = br && (cy < br.top || cy > br.bottom);
    const covered = !folded && top && !(el === top || el.contains(top) || top.contains(el));
    return { r, covered, folded, cx: Math.round(cx), cy: Math.round(cy) };
  };
  const label = (el) => clean(el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || el.getAttribute('alt'));
  const refs = [];
  let n = 0;
  const ref = (el, kind) => {
    const v = visible(el);
    if (!v) return null;
    n++; el.setAttribute('data-pt-ref', String(n));
    let why = '';
    if (el.disabled) why = clean(el.closest('.actions')?.querySelector('.why')?.innerText || el.title || '');
    refs.push({ ref: n, kind, text: label(el).slice(0, 90), disabled: !!el.disabled, why, covered: v.covered, folded: v.folded, on: el.classList.contains('on') || el.getAttribute('aria-checked') === 'true', x: v.cx, y: v.cy, value: el.value });
    return n;
  };

  const out = [];
  const a = window.aLaStructs;
  out.push(`SCREEN: ${a?.view || 'loading'}${a?.sheet ? ` · panel "${a.sheet.kind}"` : ''}${document.querySelector('.modal-back') ? ' · POPUP OPEN' : ''}${a?.targeting ? ' · PICKING A TARGET' : ''}  (${vw}×${vh})`);

  const title = document.querySelector('.title-card');
  if (title) out.push('', 'TITLE CARD:', clean(title.innerText).slice(0, 600));

  const hud = document.querySelector('.hud-top');
  if (hud) {
    const pills = [...hud.querySelectorAll('.pill')].map((p) => `[${clean(p.innerText)}]${p.title ? ` (hover: ${clean(p.title)})` : ''}`);
    out.push('', 'TOP BAR: ' + pills.join('  '));
  }
  const ann = document.querySelector('.announcer .bubble');
  if (ann) out.push('', `SPEECH BUBBLE (${ann.className.replace('bubble', '').trim() || 'info'}): "${clean(ann.innerText)}"`);

  document.querySelectorAll('.ch-banner, .peek-banner, .town-hint, .targeting-hint').forEach((b) => out.push('', `BANNER: ${clean(b.innerText).slice(0, 500)}`));
  const chlog = document.querySelector('.ch-log');
  if (chlog && chlog.innerText.trim()) out.push('CHALLENGE LOG (newest first):', ...[...chlog.children].map((c) => `  - ${clean(c.innerText)}`));
  const chat = document.querySelector('.chat .log');
  if (chat) out.push('', 'CHAT (last 5):', ...[...chat.children].slice(-5).map((c) => `  ${clean(c.innerText)}`));

  // Name tags floating over characters / equipment in the 3D view.
  const tags = [...document.querySelectorAll('.labels-layer .tag')].filter((t) => t.classList.contains('show') || getComputedStyle(t).opacity > 0.3);
  if (tags.length) {
    const lines = [];
    for (const t of tags) {
      const r = ref(t, 'nametag');
      if (!r) continue;
      const pipsAll = t.querySelectorAll('.pip').length, pipsOn = t.querySelectorAll('.pip.on').length;
      const bar = t.querySelector('.bar i')?.style.width;
      const extra = [pipsAll ? `hearts ${pipsOn}/${pipsAll}` : '', bar ? `bar ${bar}` : ''].filter(Boolean).join(', ');
      const x = refs[refs.length - 1];
      lines.push(`  @${r} ${clean(t.innerText).slice(0, 60) || '(no name shown)'}${extra ? ` [${extra}]` : ''} — at ${x.x},${x.y}`);
    }
    if (lines.length) out.push('', `NAME TAGS IN THE SCENE (${lines.length}, clickable):`, ...lines);
  }
  document.querySelectorAll('.labels-layer .speech').forEach((s) => out.push(`  speech bubble in scene: "${clean(s.innerText)}"`));

  const sheet = document.querySelector('.sheet');
  if (sheet) {
    out.push('', `SIDE PANEL — ${clean(sheet.querySelector('header h2')?.innerText)}:`);
    const body = sheet.querySelector('.body');
    // Each block of the panel as text, followed by its controls as @refs.
    const CONTROLS = 'button, input, textarea, select';
    const textOf = (node) => {
      const parts = [];
      const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.parentElement.closest(CONTROLS) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
      while (tw.nextNode()) parts.push(tw.currentNode.textContent);
      // progress bars have no text: report their fill
      node.querySelectorAll?.('.progress i').forEach((i) => parts.push(` [progress ${i.style.width || '0%'}]`));
      return clean(parts.join(' '));
    };
    const blocks = body.matches(CONTROLS) ? [body] : [...body.children];
    for (const c of blocks) {
      const txt = textOf(c);
      const head = c.matches('.section-title, h3') ? '## ' : c.matches('.note') ? 'NOTE: ' : c.matches('.card') ? '• ' : '';
      if (txt) out.push(`  ${head}${txt.slice(0, 500)}`);
      const ctrls = c.matches(CONTROLS) ? [c] : [...c.querySelectorAll(CONTROLS)];
      for (const b of ctrls) {
        const r = ref(b, b.tagName.toLowerCase());
        if (!r) continue;
        const x = refs[refs.length - 1];
        out.push(`      @${r} <${b.tagName === 'INPUT' ? `input${b.type ? ':' + b.type : ''} value="${b.value}"` : 'button'}> ${x.text}${x.on ? ' [selected]' : ''}${x.disabled ? ` [DISABLED${x.why ? ': ' + x.why : ''}]` : ''}${x.covered ? ' [behind something]' : ''}${x.folded ? ' [scroll down to see]' : ''}`);
      }
    }
    const foot = sheet.querySelector('.foot');
    if (foot) for (const b of foot.querySelectorAll('button')) { const r = ref(b, 'button'); if (r) out.push(`  @${r} <button> ${label(b)}${b.disabled ? ' [DISABLED]' : ''}`); }
    const x = sheet.querySelector('header .x'); if (x) { const r = ref(x, 'button'); out.push(`  @${r} <button> Close panel`); }
  }

  const modal = document.querySelector('.modal');
  if (modal) {
    out.push('', `POPUP: ${clean(modal.querySelector('h2')?.innerText)} — ${clean(modal.querySelector('p')?.innerText)}`);
    for (const b of modal.querySelectorAll('button')) { const r = ref(b, 'button'); if (r) out.push(`  @${r} <button> ${label(b)}`); }
  }

  // Everything else clickable that is not inside the sheet/modal (dock, title card, banners, chat, guild list).
  const rest = [...document.querySelectorAll('#ui button, #ui input, #ui textarea, #ui [role=radio]')].filter((e) => !e.closest('.sheet, .modal') && !e.hasAttribute('data-pt-ref'));
  const lines = [];
  for (const e of rest) {
    const r = ref(e, e.tagName.toLowerCase());
    if (!r) continue;
    const x = refs[refs.length - 1];
    const where = e.closest('.dock') ? 'menu bar' : e.closest('.title-card') ? 'title' : e.closest('.ch-banner') ? 'challenge banner' : e.closest('.chat') ? 'chat' : '';
    lines.push(`  @${r} <${e.tagName === 'INPUT' ? `input value="${e.value}" placeholder="${e.placeholder}"` : e.getAttribute('role') === 'radio' ? 'choice' : 'button'}> ${x.text || '(no label)'}${x.on ? ' [selected]' : ''}${x.disabled ? ' [DISABLED]' : ''}${x.covered ? ' [behind something]' : ''}${where ? `  — ${where}` : ''}${e.classList.contains('alert') ? ' (wiggling for attention!)' : ''}`);
  }
  if (lines.length) out.push('', 'OTHER CONTROLS:', ...lines);
  return { text: out.join('\n'), refs };
}

/** Designer-only telemetry: the true game state. Never shown to playtesters. */
export function snapshot() {
  const a = window.aLaStructs, svc = a?.svc;
  if (!svc) return { view: a?.view || 'title' };
  const s = svc.state;
  const structs = [...s.structs.values()];
  const bit = (x, b) => (x.status & b) > 0;
  const ch = s.challenge;
  return {
    view: a.view, sheet: a.sheet?.kind || null, tick: s.tick, tickMs: s.tickMs,
    gold: s.wallet.gold, recipes: s.wallet.recipes, undiscovered: s.restaurant.undiscovered, bank: s.wallet.bank,
    hustle: svc.hustle(), spare: svc.spareCash(), takings: s.wallet.takings, payroll: s.wallet.payroll,
    staff: structs.length, building: structs.filter((x) => !bit(x, 2)).length, offline: structs.filter((x) => bit(x, 2) && !bit(x, 4)).length,
    crew: s.crew.status, difficulty: svc.difficulty,
    challenge: ch ? { role: ch.role, status: ch.status, progress: +(ch.heist?.progress || 0).toFixed(2), rival: ch.restaurantName, log: ch.log.length } : null,
    toastBacklog: a.toasts?.length || 0,
  };
}
