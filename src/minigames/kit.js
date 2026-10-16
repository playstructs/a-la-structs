/**
 * Drawing kit for the mini games: a crisp canvas that fills the play area,
 * a logical view whose shorter side is always VIEW units (so a game lays out
 * the same on a phone and a desktop, just with more room on the long side),
 * pointer input in view units, and a few cozy drawing helpers.
 */
export const VIEW = 420;

export const C = {
  paper: '#fffaf0', paper2: '#fff3df', ink: '#4a3428', muted: '#8b7464', line: '#efdcc0',
  leaf: '#5fc293', leafD: '#3a9a6d', berry: '#ff7a8a', berryD: '#de5468', butter: '#ffd166', butterD: '#e3a826',
  sea: '#5ab3e8', seaD: '#2f8bc4', lilac: '#b18cf2', wood: '#d9a574', woodD: '#b07a4a', steel: '#c9d3dc', steelD: '#8e9ba8',
  tile: '#f6efe4', tileD: '#e6dccd',
};

/**
 * A canvas in `el` sized to it. `draw(g, view)` is up to the game; this only
 * keeps the backing store sharp and maps view units → CSS pixels.
 */
export function stage(el) {
  const canvas = document.createElement('canvas');
  canvas.className = 'mg-canvas';
  el.appendChild(canvas);
  const g = canvas.getContext('2d');
  const view = { W: VIEW, H: VIEW, scale: 1, portrait: false, cssW: 0, cssH: 0 };
  const fit = () => {
    const r = el.getBoundingClientRect();
    const w = Math.max(1, r.width), hgt = Math.max(1, r.height), dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
    canvas.style.width = `${w}px`; canvas.style.height = `${hgt}px`;
    view.scale = Math.min(w, hgt) / VIEW;
    view.W = w / view.scale; view.H = hgt / view.scale;
    view.portrait = hgt > w * 1.1;
    view.cssW = w; view.cssH = hgt; view.dpr = dpr;
  };
  fit();
  const ro = new ResizeObserver(() => { fit(); view.onResize?.(); });
  ro.observe(el);
  return {
    canvas, g, view,
    /** Clear (or fill with `bg`) and set the transform so drawing is in view units. */
    begin(bg = C.tile) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (bg) { g.fillStyle = bg; g.fillRect(0, 0, canvas.width, canvas.height); } else g.clearRect(0, 0, canvas.width, canvas.height);
      const s = view.scale * view.dpr;
      g.setTransform(s, 0, 0, s, 0, 0);
    },
    /** Event → view coordinates. */
    at(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / view.scale, y: (e.clientY - r.top) / view.scale }; },
    destroy() { ro.disconnect(); canvas.remove(); },
  };
}

/**
 * Pointer handling in view units. Handlers get ({ x, y, id, e }).
 * Captures the pointer so drags keep working outside the canvas.
 */
export function pointer(st, { down, move, up } = {}) {
  const c = st.canvas;
  const wrap = (fn) => (e) => { if (!fn) return; const p = st.at(e); fn({ ...p, id: e.pointerId, e }); };
  const onDown = (e) => { e.preventDefault(); try { c.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ } wrap(down)(e); };
  const onMove = wrap(move);
  const onUp = (e) => { wrap(up)(e); };
  c.addEventListener('pointerdown', onDown);
  c.addEventListener('pointermove', onMove);
  c.addEventListener('pointerup', onUp);
  c.addEventListener('pointercancel', onUp);
  return () => { c.removeEventListener('pointerdown', onDown); c.removeEventListener('pointermove', onMove); c.removeEventListener('pointerup', onUp); c.removeEventListener('pointercancel', onUp); };
}

/* ── drawing ─────────────────────────────────────────────────────────── */

export function rr(g, x, y, w, h, r = 10) {
  g.beginPath();
  g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h);
}

export function box(g, x, y, w, h, { fill = C.paper, stroke = null, r = 12, lw = 3, shadow = 0 } = {}) {
  if (shadow) { rr(g, x, y + shadow, w, h, r); g.fillStyle = 'rgba(122,86,56,.18)'; g.fill(); }
  rr(g, x, y, w, h, r);
  g.fillStyle = fill; g.fill();
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}

export function circle(g, x, y, r, fill, stroke = null, lw = 3) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}

export function text(g, s, x, y, { size = 16, color = C.ink, weight = 600, align = 'center', base = 'middle', font = 'Fredoka, Nunito, system-ui, sans-serif', alpha = 1, stroke = null } = {}) {
  g.save();
  g.globalAlpha *= alpha;
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align; g.textBaseline = base;
  if (stroke) { g.lineWidth = size / 5; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(s, x, y); }
  g.fillStyle = color; g.fillText(s, x, y);
  g.restore();
}

/** Emoji art (food, coins, dishes). */
export function emoji(g, ch, x, y, size = 32, { alpha = 1, rot = 0 } = {}) {
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x, y); if (rot) g.rotate(rot);
  // Chrome paints colour emoji with the fill colour's alpha: keep it opaque.
  g.fillStyle = '#000';
  g.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, 0, size * 0.04);
  g.restore();
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];
export function shuffle(a, r = Math.random) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** Little floating "+1" / "Oops" notes, drawn by the game each frame. */
export class Pops {
  constructor() { this.list = []; }
  add(textStr, x, y, color = C.leafD, size = 20) {
    // Stack notes that pop up in the same spot instead of overprinting.
    const near = this.list.filter((p) => p.t < 0.6 && Math.abs(p.x - x) < 60 && Math.abs(p.y0 - y) < 30).length;
    this.list.push({ text: textStr, x, y: y - near * (size + 4), y0: y, color, size, t: 0 });
  }
  update(dt) { for (const p of this.list) p.t += dt; this.list = this.list.filter((p) => p.t < 1); }
  draw(g) {
    for (const p of this.list) text(g, p.text, p.x, p.y - p.t * 34, { size: p.size, color: p.color, alpha: 1 - p.t * p.t, stroke: '#fff' });
  }
}
