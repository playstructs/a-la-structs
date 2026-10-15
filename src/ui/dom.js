/** Tiny DOM helpers and the icon set (hand-drawn SVG, no emoji). */

export function h(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

export function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }

const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]';

/**
 * Re-render `from` into `to` (or in place) without losing keyboard focus:
 * the focused control is found again by id, else by position and label.
 * Returns a function to call once the new content is in the DOM.
 */
export function holdFocus(from) {
  const a = document.activeElement;
  if (!from || !a || !from.contains(a)) return () => {};
  const all = [...from.querySelectorAll(FOCUSABLE)];
  const at = all.indexOf(a), label = a.textContent || a.getAttribute('aria-label') || '';
  let sel = null;
  try { sel = a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null; } catch (e) { /* number inputs */ }
  return (to = from) => {
    let b = a.id ? to.querySelector(`#${CSS.escape(a.id)}`) : null;
    if (!b) {
      const now = [...to.querySelectorAll(FOCUSABLE)];
      b = (now[at] && (now[at].textContent || now[at].getAttribute('aria-label') || '') === label ? now[at] : null)
        || now.find((x) => (x.textContent || x.getAttribute('aria-label') || '') === label) || now[at] || null;
    }
    if (!b) return;
    b.focus({ preventScroll: true });
    if (sel) try { b.setSelectionRange(...sel); } catch (e) { /* not a text field */ }
  };
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const S = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true" class="ico">${body}</svg>`;

export const ICONS = {
  gold: S('<circle cx="12" cy="12" r="9" fill="#f4b400"/><circle cx="12" cy="12" r="6.5" fill="#ffd23f"/><path d="M10 9.5h3.2a1.6 1.6 0 010 3.2H10.6m0-3.2v5h2.8" stroke="#c98a00" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
  recipe: S('<rect x="5" y="3" width="14" height="18" rx="2.5" fill="#fff1d6" stroke="#c9905c" stroke-width="1.4"/><rect x="7.5" y="5.5" width="9" height="2.6" rx="1.2" fill="#e85d75"/><path d="M8 11h8M8 14h8M8 17h5" stroke="#b08968" stroke-width="1.4" stroke-linecap="round"/>'),
  mystery: S('<rect x="5" y="3" width="14" height="18" rx="2.5" fill="#efe6ff" stroke="#9b7fd1" stroke-width="1.4"/><path d="M10 9.2a2.2 2.2 0 114 1.1c-.7.6-1.9 1-1.9 2.4" stroke="#7b61ff" stroke-width="1.7" fill="none" stroke-linecap="round"/><circle cx="12.1" cy="16.4" r="1.1" fill="#7b61ff"/>'),
  cash: S('<rect x="2.5" y="6" width="19" height="12" rx="2.5" fill="#7cc6a4" stroke="#3e9f73" stroke-width="1.4"/><circle cx="12" cy="12" r="3" fill="#e9fff2"/><path d="M12 10.3v3.4" stroke="#3e9f73" stroke-width="1.4" stroke-linecap="round"/>'),
  hustle: S('<path d="M13.5 2.5L5 13.2h5.6L9.7 21.5l9.3-11.6h-5.8z" fill="#ffb627" stroke="#e07a00" stroke-width="1.3" stroke-linejoin="round"/>'),
  clock: S('<circle cx="12" cy="12" r="9" fill="#fff7e8" stroke="#8b7464" stroke-width="1.6"/><path d="M12 7v5l3.2 2" stroke="#4a3428" stroke-width="1.8" fill="none" stroke-linecap="round"/>'),
  heart: S('<path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.7a4.3 4.3 0 017.5 2.8c0 5.4-7.5 10-7.5 10z" fill="#ff5c8a"/>'),
  store: S('<path d="M3.5 9.5L5 4h14l1.5 5.5" fill="#ff8fa3" stroke="#e0566a" stroke-width="1.3" stroke-linejoin="round"/><path d="M3.5 9.5c0 1.4 1.2 2.3 2.6 2.3s2.6-.9 2.6-2.3c0 1.4 1.2 2.3 2.6 2.3s2.7-.9 2.7-2.3c0 1.4 1.2 2.3 2.6 2.3s2.4-.9 2.4-2.3" fill="#fff" stroke="#e0566a" stroke-width="1.3"/><rect x="5" y="11.8" width="14" height="8.7" rx="1" fill="#fff7e8" stroke="#c9905c" stroke-width="1.3"/><rect x="10" y="14.5" width="4" height="6" fill="#c98f5a"/>'),
  hire: S('<circle cx="10" cy="8" r="3.6" fill="#ffd6a5" stroke="#c98f5a" stroke-width="1.3"/><path d="M3.5 20c.6-3.8 3.3-6 6.5-6s5.9 2.2 6.5 6z" fill="#7cc6f2" stroke="#3d8fc0" stroke-width="1.3"/><circle cx="18" cy="9" r="3.4" fill="#6cc79a" stroke="#3e9f73" stroke-width="1.2"/><path d="M18 7.3v3.4M16.3 9h3.4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>'),
  staff: S('<path d="M7 9a5 5 0 0110 0v1H7z" fill="#fff" stroke="#8b7464" stroke-width="1.3"/><rect x="6.5" y="9.5" width="11" height="2.2" rx="1" fill="#fff" stroke="#8b7464" stroke-width="1.3"/><circle cx="12" cy="15" r="3.4" fill="#ffd6a5" stroke="#c98f5a" stroke-width="1.3"/><path d="M6 21.5c1-2.6 3.3-3.8 6-3.8s5 1.2 6 3.8" fill="#ffb3c6" stroke="#e0566a" stroke-width="1.3"/>'),
  bell: S('<path d="M4 17.5h16" stroke="#8b7464" stroke-width="1.8" stroke-linecap="round"/><path d="M5.5 17a6.5 6.5 0 0113 0z" fill="#ffd166" stroke="#c98a00" stroke-width="1.4"/><circle cx="12" cy="9.2" r="1.4" fill="#c98a00"/><path d="M19.5 6.5l1.5-1.5M4.5 6.5L3 5" stroke="#ff7a8a" stroke-width="1.6" stroke-linecap="round"/>'),
  town: S('<path d="M2.5 20.5h19" stroke="#6cbd61" stroke-width="2" stroke-linecap="round"/><rect x="4" y="11" width="7" height="9" rx="1" fill="#ffe4ec" stroke="#e0566a" stroke-width="1.3"/><path d="M3.3 11.3L7.5 7l4.2 4.3" fill="#ff8fa3" stroke="#e0566a" stroke-width="1.3" stroke-linejoin="round"/><rect x="13" y="8" width="7.5" height="12" rx="1" fill="#e6f7ff" stroke="#3d8fc0" stroke-width="1.3"/><path d="M15 11h3.5M15 14h3.5" stroke="#3d8fc0" stroke-width="1.3"/>'),
  chat: S('<path d="M4 5.5h16a1.5 1.5 0 011.5 1.5v8.5A1.5 1.5 0 0120 17H10l-4.5 3.5V17H4A1.5 1.5 0 012.5 15.5V7A1.5 1.5 0 014 5.5z" fill="#fff" stroke="#5ab3e8" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="11.3" r="1.2" fill="#5ab3e8"/><circle cx="12" cy="11.3" r="1.2" fill="#5ab3e8"/><circle cx="16" cy="11.3" r="1.2" fill="#5ab3e8"/>'),
  gear: S('<path d="M12 8.2a3.8 3.8 0 100 7.6 3.8 3.8 0 000-7.6zM19.4 13.4l1.8 1.1-1.8 3.2-2-.7a7 7 0 01-1.9 1.1l-.4 2.1h-3.7l-.4-2.1a7 7 0 01-1.9-1.1l-2 .7-1.8-3.2 1.8-1.1a7 7 0 010-2.8L4.9 9.5l1.8-3.2 2 .7a7 7 0 011.9-1.1L11 3.8h3.7l.4 2.1a7 7 0 011.9 1.1l2-.7 1.8 3.2-1.8 1.1a7 7 0 010 2.8z" fill="#d9e4ec" stroke="#6c7a89" stroke-width="1.3" stroke-linejoin="round"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'),
  back: S('<path d="M14.5 5.5L8 12l6.5 6.5" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  shield: S('<path d="M12 3l7 3v5.5c0 4.6-3 7.8-7 9.5-4-1.7-7-4.9-7-9.5V6z" fill="#9fd8ff" stroke="#3d8fc0" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 12l2.2 2.2L15.5 10" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>'),
  leaf: S('<path d="M5 19C5 10 11 5 20 4c-1 9-6 15-15 15z" fill="#77c46b" stroke="#3e9f73" stroke-width="1.3"/><path d="M5 19l9-9" stroke="#3e9f73" stroke-width="1.3"/>'),
  sun: S('<circle cx="12" cy="12" r="4.5" fill="#ffd166"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="#ffb627" stroke-width="1.7" stroke-linecap="round"/>'),
  sparkle: S('<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" fill="#ffd23f" stroke="#e0a000" stroke-width="1.1" stroke-linejoin="round"/>'),
  door: S('<rect x="6" y="3" width="12" height="18" rx="1.5" fill="#c98f5a" stroke="#8a5a3c" stroke-width="1.4"/><circle cx="15" cy="12.5" r="1.1" fill="#ffd23f"/>'),
  walk: S('<circle cx="13" cy="4.5" r="2" fill="#4a3428"/><path d="M11 21l2-6 2.5 2.5V21M8.5 11l3-3.2 2.8 1.6 1.7 3M11.5 7.8L11 14" stroke="#4a3428" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  plate: S('<circle cx="12" cy="12" r="8.5" fill="#fff" stroke="#c9d3da" stroke-width="1.5"/><circle cx="12" cy="12" r="5" fill="#ffd6a5"/><path d="M10 11.5c1-1.5 3-1.5 4 0" stroke="#e07a5f" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
  grumble: S('<path d="M5 6h14a2 2 0 012 2v6a2 2 0 01-2 2h-7l-4 3.5V16H5a2 2 0 01-2-2V8a2 2 0 012-2z" fill="#ffd0d0" stroke="#e0566a" stroke-width="1.4" stroke-linejoin="round"/><path d="M7.5 10l2 1-2 1M11 11h2M15 10l1.5 2M16.5 10L15 12" stroke="#e0566a" stroke-width="1.4" stroke-linecap="round" fill="none"/>'),
  sound: S('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="#8b7464"/><path d="M15 9a4 4 0 010 6M17.5 6.5a7.5 7.5 0 010 11" stroke="#8b7464" stroke-width="1.7" fill="none" stroke-linecap="round"/>'),
  info: S('<circle cx="12" cy="12" r="9" fill="#e6f7ff" stroke="#3d8fc0" stroke-width="1.5"/><path d="M12 11v5.5" stroke="#3d8fc0" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.8" r="1.2" fill="#3d8fc0"/>'),
  phone: S('<rect x="6" y="2.5" width="12" height="19" rx="3" fill="#7fd6b0" stroke="#3e9f73" stroke-width="1.4"/><rect x="8" y="5" width="8" height="12" rx="1.2" fill="#fffaf0"/><circle cx="12" cy="19.1" r="0.9" fill="#3e9f73"/>'),
  key: S('<circle cx="8" cy="12" r="4.6" fill="#ffd166" stroke="#c98a00" stroke-width="1.5"/><circle cx="8" cy="12" r="1.7" fill="#fff7e8" stroke="#c98a00" stroke-width="1.2"/><path d="M12.4 12h8.6M17.5 12v3M20.2 12v2.2" stroke="#c98a00" stroke-width="2" stroke-linecap="round"/>'),
  office: S('<rect x="3.5" y="10" width="17" height="10.5" rx="1.5" fill="#c98f5a" stroke="#8a5a3c" stroke-width="1.3"/><path d="M2.5 10.5h19" stroke="#8a5a3c" stroke-width="1.6" stroke-linecap="round"/><rect x="6" y="13" width="5" height="4.5" rx=".8" fill="#fff7e8"/><rect x="13" y="13" width="5" height="4.5" rx=".8" fill="#fff7e8"/><path d="M7 7.5c.8-2.4 2.6-3.6 5-3.6s4.2 1.2 5 3.6" stroke="#4a3428" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="12" cy="7" r="2.2" fill="#ff8fa3" stroke="#e0566a" stroke-width="1.2"/>'),
  bank: S('<path d="M3 9.5L12 4l9 5.5z" fill="#ffd166" stroke="#c98a00" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.5 10.5v7M9.8 10.5v7M14.2 10.5v7M18.5 10.5v7" stroke="#8b7464" stroke-width="2" stroke-linecap="round"/><rect x="3" y="18" width="18" height="2.6" rx="1" fill="#e6d3bd" stroke="#8b7464" stroke-width="1.2"/><circle cx="12" cy="7.6" r="1.1" fill="#c98a00"/>'),
  ledger: S('<path d="M6 2.8h12v18.4l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" fill="#fff" stroke="#8b7464" stroke-width="1.4" stroke-linejoin="round"/><path d="M8.5 7h7M8.5 10h7M8.5 13h4" stroke="#b08968" stroke-width="1.4" stroke-linecap="round"/><circle cx="15.2" cy="15.6" r="2.2" fill="#ffd23f" stroke="#c98a00" stroke-width="1"/>'),
  send: S('<circle cx="9" cy="14" r="6.3" fill="#ffd23f" stroke="#c98a00" stroke-width="1.4"/><path d="M7.4 12.6h2.3a1.2 1.2 0 010 2.4H7.9m0-2.4v3.7h2" stroke="#c98a00" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M14 9.5l6.5-6.5M15.5 3h5v5" stroke="#3a9a6d" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  copy: S('<rect x="8" y="8" width="12" height="13" rx="2.2" fill="#fff" stroke="#8b7464" stroke-width="1.6"/><path d="M5.5 15.5h-.3A1.7 1.7 0 013.5 13.8V4.7A1.7 1.7 0 015.2 3h8.6a1.7 1.7 0 011.7 1.7V5" stroke="#8b7464" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
  pencil: S('<path d="M4 20l1.2-4.6L15.8 4.8a2 2 0 012.8 0l.6.6a2 2 0 010 2.8L8.6 18.8z" fill="#ffd166" stroke="#c98a00" stroke-width="1.4" stroke-linejoin="round"/><path d="M4 20l4.6-1.2L5.2 15.4z" fill="#4a3428"/>'),
  group: S('<path d="M5 21V3.5" stroke="#8b7464" stroke-width="1.8" stroke-linecap="round"/><path d="M5.5 4h12.5l-3 4 3 4H5.5z" fill="#ff8fa3" stroke="#e0566a" stroke-width="1.4" stroke-linejoin="round"/><circle cx="10.8" cy="8" r="1.7" fill="#fff"/>'),
  out: S('<path d="M10 4H6a1.5 1.5 0 00-1.5 1.5v13A1.5 1.5 0 006 20h4" stroke="#8b7464" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M14 8l4 4-4 4M9 12h9" stroke="#de5468" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  search: S('<circle cx="10.5" cy="10.5" r="6" fill="#e6f7ff" stroke="#3d8fc0" stroke-width="1.8"/><path d="M15 15l5 5" stroke="#3d8fc0" stroke-width="2.4" stroke-linecap="round"/>'),
  link: S('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" stroke="#3d8fc0" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" stroke="#3d8fc0" stroke-width="2" fill="none" stroke-linecap="round"/>'),
  check: S('<circle cx="12" cy="12" r="9" fill="#dff5e9" stroke="#3a9a6d" stroke-width="1.5"/><path d="M8 12.3l2.7 2.7L16.2 9.4" stroke="#3a9a6d" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  next: S('<path d="M9.5 5.5L16 12l-6.5 6.5" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  trophy: S('<path d="M7 4h10v4.5a5 5 0 01-10 0z" fill="#ffd23f" stroke="#c98a00" stroke-width="1.4"/><path d="M7 6H4.5a2.5 2.5 0 003 3.5M17 6h2.5a2.5 2.5 0 01-3 3.5" stroke="#c98a00" stroke-width="1.4" fill="none"/><path d="M12 13.5V17M8.5 20.5h7l-1-3.5h-5z" stroke="#c98a00" stroke-width="1.4" fill="#ffd23f" stroke-linejoin="round"/>'),
};

/**
 * A key fob drawn from an address: a little brass-ringed tag with a
 * mirrored 5×5 stamp, so each device's key looks different at a glance
 * (our take on the webapp's blockies).
 */
export function keyFob(address, cls = '') {
  let x = 2166136261;
  for (const c of String(address || '?')) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; }
  const next = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  const hues = [350, 20, 42, 150, 190, 210, 265, 300];
  const hue = hues[Math.floor(next() * hues.length)];
  const bg = `hsl(${hue} 85% 88%)`, fg = `hsl(${hue} 55% 42%)`;
  let cells = '';
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 3; c++) {
      if (next() < 0.5) continue;
      for (const cc of c === 2 ? [2] : [c, 4 - c]) cells += `<rect x="${7 + cc * 2}" y="${9 + r * 2}" width="2" height="2" rx=".4"/>`;
    }
  }
  const svg = `<svg viewBox="0 0 24 24" aria-hidden="true" class="ico"><path d="M5 7.5a3 3 0 013-3h8a3 3 0 013 3V19a2 2 0 01-2 2H7a2 2 0 01-2-2z" fill="${bg}" stroke="${fg}" stroke-width="1.2"/><circle cx="12" cy="6" r="1.3" fill="#fffaf0" stroke="${fg}" stroke-width="1"/><path d="M12 4.7V1.8" stroke="#c98a00" stroke-width="1.6" stroke-linecap="round"/><g fill="${fg}">${cells}</g></svg>`;
  return h('span', { class: `icon fob ${cls}`, html: svg });
}

/** Copy text, then flip the button's label to say so for a moment. */
export function copyButton(text, label = 'Copy', cls = 'chip-btn') {
  const b = h('button', { class: cls, type: 'button', title: `Copy ${text}` }, icon('copy'), h('span', {}, label));
  b.addEventListener('click', () => {
    const done = (ok) => { b.lastChild.textContent = ok ? 'Copied!' : 'Couldn’t copy'; setTimeout(() => { b.lastChild.textContent = label; }, 1400); };
    (navigator.clipboard?.writeText(String(text)) || Promise.reject()).then(() => done(true), () => done(false));
  });
  return b;
}

/** "structs1abc…wxyz" */
export function shortAddress(a) { a = String(a || ''); return a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a; }

export function fmtDate(d) {
  if (!d || Number.isNaN(+d)) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtWhen(d) {
  if (!d || Number.isNaN(+d)) return '—';
  const s = (Date.now() - d) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 14) return `${Math.round(s / 86400)} days ago`;
  return fmtDate(d);
}

export function icon(name, cls = '') { return h('span', { class: `icon ${cls}`, html: ICONS[name] || '' }); }

export function fmtTicks(ticks, tickMs) {
  const s = Math.max(0, Math.round((ticks * tickMs) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${(m / 60).toFixed(1)} h`;
}
