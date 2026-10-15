/** Small building blocks shared by the office, group and rivals sheets. */
import { h, icon } from './dom.js';

/**
 * A number picker: − [ 12 ] + with optional quick picks. `onChange(value)` runs
 * on every change; the value is clamped to [min, max].
 */
export function stepper({ id, value, min = 0, max = Infinity, label, onChange, quick = [] }) {
  const clamp = (v) => Math.max(min, Math.min(max, Math.floor(Number(v) || 0)));
  let v = clamp(value);
  const inp = h('input', { id, type: 'number', inputmode: 'numeric', min: String(min), max: Number.isFinite(max) ? String(max) : null, value: String(v), 'aria-label': label });
  const minus = h('button', { class: 'step-btn', type: 'button', 'aria-label': 'Less' }, '−');
  const plus = h('button', { class: 'step-btn', type: 'button', 'aria-label': 'More' }, '+');
  const set = (n, fromInput = false) => {
    v = clamp(n);
    if (!fromInput) inp.value = String(v);
    minus.disabled = v <= min; plus.disabled = v >= max;
    onChange?.(v);
  };
  minus.addEventListener('click', () => set(v - 1));
  plus.addEventListener('click', () => set(v + 1));
  inp.addEventListener('input', () => { if (inp.value !== '') set(inp.value, true); });
  inp.addEventListener('blur', () => { inp.value = String(v); });
  minus.disabled = v <= min; plus.disabled = v >= max;
  const picks = quick.length ? h('div', { class: 'tabs' }, ...quick.map(([text, n]) => h('button', { class: 'chip-btn', type: 'button', disabled: n < min || n > max, onclick: () => set(n) }, text))) : null;
  return h('div', { class: 'stepper-wrap' }, h('div', { class: 'stepper' }, minus, inp, plus), picks);
}

/** ‹ Page 2 of 5 › — hidden when there is only one page. */
export function pager(page, pages, go) {
  if (!(pages > 1)) return null;
  return h('nav', { class: 'pager', 'aria-label': 'Pages' },
    h('button', { class: 'chip-btn', disabled: page <= 1, onclick: () => go(page - 1), 'aria-label': 'Previous page' }, icon('back'), 'Prev'),
    h('span', {}, `Page ${page} of ${pages}`),
    h('button', { class: 'chip-btn', disabled: page >= pages, onclick: () => go(page + 1), 'aria-label': 'Next page' }, 'Next', icon('next')));
}

/** A labelled on/off switch with a hint line. */
export function toggle({ label, hint, checked, disabled, onChange }) {
  const box = h('input', { type: 'checkbox', role: 'switch', checked: !!checked, disabled: !!disabled });
  box.addEventListener('change', () => onChange?.(box.checked));
  return h('label', { class: `switch-row ${disabled ? 'off' : ''}` }, box, h('span', { class: 'switch', 'aria-hidden': 'true' }),
    h('span', { class: 'switch-text' }, h('b', {}, label), hint ? h('small', {}, hint) : null));
}

/** A labelled number tile; `value` null shows a dash (not tracked by this guild). */
export function tile(ic, label, value, note) {
  return h('div', { class: 'fact tile' }, h('small', {}, ic ? icon(ic) : null, label), h('b', {}, value == null ? '—' : String(value)), note ? h('span', { class: 'tile-note' }, note) : null);
}

export function loading(text = 'One moment…') {
  return h('div', { class: 'loading-row', role: 'status' }, h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), text);
}

/** A big tappable row that leads to another page. */
export function navTile(ic, title, sub, onclick) {
  return h('button', { class: 'nav-tile', onclick }, icon(ic), h('span', {}, h('b', {}, title), sub ? h('small', {}, sub) : null), icon('next', 'chev'));
}
