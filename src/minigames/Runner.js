/**
 * Runs one mini game full screen: an intro card (how to play, what the stars
 * need, the uniforms on offer), a 3-2-1, the timed shift itself, and the
 * result with stars and any uniform it unlocked.
 *
 * A game module's default export is `create(ctx)` → { update(dt), draw(), destroy() },
 * plus optional start() (the whistle blows) and end() (time's up).
 * update() may be called several times a frame in slices of ≤ 50 ms; draw() once.
 * ctx: { el, seconds, left(), elapsed(), score, add(n), set(n), sfx, over, critter, quality }
 * The runner owns the clock and the score; the game owns its stage element.
 */
import { h, icon, clear } from '../ui/dom.js';
import { portrait } from '../three/portraits.js';
import { sfx } from '../audio/sfx.js';
import { starsFor } from './registry.js';
import { SKINS, outfitAt, unlockedTier, wornTier, tierWord } from './skins.js';

export function starRow(n, max = 3, cls = '') {
  const row = h('span', { class: `mg-stars ${cls}`, 'aria-label': `${n} of ${max} stars` });
  for (let i = 0; i < max; i++) row.appendChild(h('i', { class: i < n ? 'on' : '' }, '★'));
  return row;
}

export class MiniGameRunner {
  /** @param app the App; @param game a registry entry; @param who { species, seed, name } of the critter practising */
  constructor(app, game, who) {
    this.app = app;
    this.game = game;
    this.who = who;
    this.raf = 0;
    this.instance = null;
  }

  face(tier) {
    return portrait(this.app.engine.renderer, { species: this.who.species, outfit: outfitAt(this.game.outfit, tier), seed: this.who.seed });
  }

  open() {
    this.el = h('div', { class: 'mg', role: 'dialog', 'aria-label': this.game.title });
    this.app.ui.appendChild(this.el);
    this.app.engine?.pause?.();   // the restaurant is hidden behind us: save the GPU
    this.onKey = (e) => { if (e.key === 'Escape' && this.el) { e.stopImmediatePropagation(); this.quit(); } };
    window.addEventListener('keydown', this.onKey, true);
    this.intro();
  }

  close() {
    this.stopLoop();
    this.instance?.destroy?.(); this.instance = null;
    window.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('visibilitychange', this.onVis);
    this.el?.remove(); this.el = null;
    this.app.engine?.resume?.();
    this.app.miniGameClosed?.(this.game);
  }

  quit() {
    if (this.phase === 'play') { if (this.asking) this.keepPlaying(); else this.askStop(); return; }
    if (this.phase === 'count') { sfx.close(); this.intro(); return; }
    sfx.close(); this.close();
  }

  /** Mid-shift, stopping throws the run away: check first (the shift waits meanwhile). */
  askStop() {
    this.asking = h('div', { class: 'mg-result mg-confirm' },
      h('div', { class: 'mg-card result' },
        h('h2', {}, 'Stop this shift?'),
        h('p', { class: 'mg-how' }, 'This run won’t count towards your stars.'),
        h('div', { class: 'mg-actions' },
          h('button', { class: 'btn ghost', onclick: () => { sfx.close(); this.asking = null; this.intro(); } }, 'Stop'),
          h('button', { class: 'btn', onclick: () => this.keepPlaying() }, 'Keep playing'))));
    this.playEl.appendChild(this.asking);
    this.asking.querySelector('.btn:not(.ghost)')?.focus();
    sfx.click();
  }
  keepPlaying() { this.asking?.remove(); this.asking = null; this.last = performance.now(); sfx.click(); }

  /* ── intro ────────────────────────────────────────────────────────── */

  intro() {
    this.stopLoop();
    this.instance?.destroy?.(); this.instance = null;
    this.phase = 'intro';
    const g = this.game;
    const best = this.app.miniScores?.[g.key] || 0;
    const have = starsFor(g, best);
    clear(this.el);
    this.el.appendChild(h('div', { class: 'mg-card' },
      h('button', { class: 'mg-x', 'aria-label': 'Close', onclick: () => this.quit() }, icon('close')),
      h('div', { class: 'mg-hero' },
        h('img', { src: this.face(wornTier(g.outfit)), alt: '' }),
        h('div', {},
          h('small', {}, `${g.role} practice · ${g.seconds} seconds`),
          h('h2', {}, g.title),
          best ? h('div', { class: 'mg-best' }, starRow(have), ` Best: ${best} ${g.unit}`) : h('div', { class: 'mg-best' }, 'Not played yet'))),
      h('p', { class: 'mg-how' }, g.how),
      h('div', { class: 'mg-tiers' }, ...[1, 2, 3].map((tier) => {
        const skin = SKINS[g.outfit]?.[tier - 1];
        const open = have >= tier;
        return h('div', { class: `mg-tier ${open ? 'open' : 'locked'}` },
          h('img', { src: this.face(tier), alt: '' }),
          starRow(open ? tier : 0, tier, 'small'),
          h('b', {}, skin?.name || tierWord(tier)),
          h('small', {}, `${tierWord(tier)} · ${open ? 'unlocked' : `${g.stars[tier - 1]}+ ${g.unit}`}`));
      })),
      h('div', { class: 'mg-actions' },
        h('button', { class: 'btn wide', onclick: () => this.countIn() }, icon('next'), best ? 'Play again' : 'Start the shift'))));
    this.el.querySelector('.mg-actions .btn')?.focus();
  }

  /* ── the shift ────────────────────────────────────────────────────── */

  async countIn() {
    sfx.click();
    this.phase = 'count';
    let mod;
    try { mod = await this.game.load(); } catch (e) { this.app.announce?.({ text: 'That game didn’t load. Try again?', tone: 'bad' }); return; }
    if (!this.el || this.phase !== 'count') return;
    clear(this.el);
    this.score = 0;
    this.timeLeft = this.game.seconds;
    this.frozen = false; this.asking = null;
    this.scoreEl = h('b', {}, '0');
    this.timeEl = h('b', {}, String(this.game.seconds));
    this.barEl = h('i');
    this.playEl = h('div', { class: 'mg-play' });
    this.el.appendChild(h('div', { class: 'mg-shell' },
      h('header', { class: 'mg-bar' },
        h('button', { class: 'mg-x', 'aria-label': 'Stop practising', onclick: () => this.quit() }, icon('close')),
        h('div', { class: 'mg-title' }, this.game.title),
        h('div', { class: 'mg-pill' }, icon('clock'), this.timeEl),
        h('div', { class: 'mg-pill score' }, this.scoreEl, h('small', {}, this.game.unit))),
      h('div', { class: 'mg-timebar' }, this.barEl),
      this.playEl));

    const runner = this;
    const ctx = {
      el: this.playEl,
      seconds: this.game.seconds,
      sfx,
      /** The critter practising, in the uniform their role wears. */
      critter: { species: this.who.species, seed: this.who.seed, outfit: outfitAt(this.game.outfit, wornTier(this.game.outfit)) },
      quality: this.app.prefs?.quality || 'high',
      over: false,
      left: () => runner.timeLeft,
      elapsed: () => runner.game.seconds - runner.timeLeft,
      get score() { return runner.score; },
      add(n = 1) { runner.setScore(runner.score + n); },
      set(n) { runner.setScore(n); },
      /** Stop (or restart) the shift clock, e.g. while the game shows how something's done. */
      /** True while the shift is waiting on "Stop this shift?" (ignore keys then). */
      get paused() { return !!runner.asking; },
      freeze(on = true) { runner.frozen = !!on; runner.timeEl?.parentElement.classList.toggle('frozen', runner.frozen); },
    };
    this.ctx = ctx;
    this.instance = mod.default(ctx);
    this.instance.update?.(0);
    this.instance.draw?.();

    // 3, 2, 1 — the game draws its first frame underneath.
    const big = h('div', { class: 'mg-count' });
    this.playEl.appendChild(big);
    for (const n of [3, 2, 1]) {
      big.textContent = String(n); big.classList.remove('pulse'); void big.offsetWidth; big.classList.add('pulse');
      sfx.countdown(false);
      await new Promise((r) => setTimeout(r, 650));
      if (this.phase !== 'count') return;
    }
    big.textContent = 'Go!'; big.classList.remove('pulse'); void big.offsetWidth; big.classList.add('pulse');
    sfx.countdown(true);
    setTimeout(() => big.remove(), 500);
    this.phase = 'play';
    this.instance.start?.();
    this.last = performance.now();
    this.onVis = () => { this.last = performance.now(); };
    document.addEventListener('visibilitychange', this.onVis);
    const loop = (now) => {
      if (this.phase !== 'play') return;
      // The shift runs on the wall clock (a slow device mustn't get extra
      // time); a long gap means the tab was away, which doesn't count.
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.5) dt = 0;
      if (this.asking) { this.raf = requestAnimationFrame(loop); return; }   // waiting on "Stop this shift?"
      if (!this.frozen) this.timeLeft = Math.max(0, this.timeLeft - dt);
      // Games step in small slices so physics stays steady.
      for (let left = dt; left > 1e-6; left -= 0.05) this.instance.update?.(Math.min(0.05, left));
      this.instance.draw?.();
      const secs = Math.ceil(this.timeLeft);
      if (this.timeEl.textContent !== String(secs)) {
        this.timeEl.textContent = String(secs);
        if (secs <= 5 && secs > 0) sfx.countdown(false);
      }
      this.barEl.style.width = `${(this.timeLeft / this.game.seconds) * 100}%`;
      this.barEl.parentElement.classList.toggle('low', this.timeLeft < 10);
      if (this.timeLeft <= 0) { this.finish(); return; }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  setScore(n) {
    this.score = Math.max(0, Math.round(n));
    if (this.scoreEl) {
      this.scoreEl.textContent = String(this.score);
      this.scoreEl.parentElement.classList.remove('bump'); void this.scoreEl.offsetWidth; this.scoreEl.parentElement.classList.add('bump');
    }
  }

  stopLoop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  /* ── result ───────────────────────────────────────────────────────── */

  async finish() {
    this.phase = 'done';
    this.stopLoop();
    this.ctx.over = true;
    this.instance?.end?.();
    const g = this.game, score = this.score;
    const before = unlockedTier(g.outfit);
    const prevBest = this.app.miniScores?.[g.key] || 0;
    const stars = starsFor(g, score);
    let best = Math.max(prevBest, score);
    const card = h('div', { class: 'mg-card result' });
    const overlay = h('div', { class: 'mg-result' }, card);
    this.playEl.appendChild(overlay);
    const head = h('h2', {}, stars ? ['Nice shift!', 'Great shift!', 'Perfect shift!'][stars - 1] : 'Time’s up!');
    const starsEl = starRow(0, 3, 'big');
    card.append(head, starsEl,
      h('div', { class: 'mg-score' }, h('b', {}, String(score)), ` ${g.unit}`),
      h('p', { class: 'mg-how' }, stars < 3 ? `${g.stars[stars]} ${g.unit} for ${stars + 1} star${stars ? 's' : ''}.${score > prevBest && prevBest ? ' New best!' : ''}` : (score > prevBest && prevBest ? 'New best!' : 'Top marks.')));
    // the game's own rundown of the run (e.g. each cup and how it was judged)
    const recap = this.instance?.recap?.() || [];
    if (recap.length) card.appendChild(h('ul', { class: 'mg-recap' }, ...recap.map((r) => h('li', { class: r.tone || '' }, h('span', {}, r.label), h('b', {}, r.value)))));
    // Light the stars one by one.
    [...starsEl.children].forEach((s, i) => { if (i < stars) setTimeout(() => { s.classList.add('on', 'pop'); sfx.star(i); }, 350 + i * 330); });
    if (!stars) sfx.lose();
    const saving = h('small', { class: 'mg-saving' }, 'Saving…');
    card.appendChild(saving);
    try { best = await this.app.saveMiniGame(g, score); saving.textContent = ''; } catch (e) { saving.textContent = 'Couldn’t save this run.'; }
    if (!this.el) return;
    const after = unlockedTier(g.outfit);
    if (after > before) {
      const skin = SKINS[g.outfit][after - 1];
      setTimeout(() => sfx.win(), 350 + stars * 330);
      card.appendChild(h('div', { class: 'mg-unlock' },
        h('img', { src: this.face(after), alt: '' }),
        h('div', {}, h('small', {}, `New ${tierWord(after).toLowerCase()} uniform`), h('b', {}, skin.name),
          h('button', { class: 'btn small butter', onclick: (e) => { this.app.wearSkin(g.outfit, after); e.currentTarget.replaceWith(h('span', { class: 'tagchip good' }, 'Wearing it')); } }, 'Wear it'))));
    }
    card.appendChild(h('div', { class: 'mg-actions' },
      h('button', { class: 'btn ghost', onclick: () => { sfx.close(); this.close(); } }, 'Done'),
      h('button', { class: 'btn', onclick: () => this.countIn() }, 'Play again')));
    void best;
  }
}
