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
};

export function icon(name, cls = '') { return h('span', { class: `icon ${cls}`, html: ICONS[name] || '' }); }

export function fmtTicks(ticks, tickMs) {
  const s = Math.max(0, Math.round((ticks * tickMs) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${(m / 60).toFixed(1)} h`;
}
