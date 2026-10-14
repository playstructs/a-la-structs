/**
 * Things that float over heads: name tags, morale hearts, need meters, speech
 * bubbles, progress rings and pop-up words. Plain DOM via CSS2DRenderer, so
 * they stay crisp and are styled in app.css.
 */
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export class Labels {
  constructor(container) {
    this.renderer = new CSS2DRenderer();
    this.renderer.domElement.className = 'labels-layer';
    container.appendChild(this.renderer.domElement);
    this.temps = [];
  }

  setSize(w, h) { this.renderer.setSize(w, h); }
  render(scene, camera) { this.renderer.render(scene, camera); }

  /** Attach a DOM element to an Object3D (stays with it). */
  attach(obj, el, offset = new THREE.Vector3()) {
    const o = new CSS2DObject(el);
    o.position.copy(offset);
    obj.add(o);
    return o;
  }

  /** A word that pops up at a world position and floats away. */
  pop(scene, pos, text, cls = '') {
    const el = document.createElement('div');
    el.className = `pop-word ${cls}`;
    el.textContent = text;
    const o = new CSS2DObject(el);
    o.position.copy(pos);
    scene.add(o);
    this.temps.push({ o, until: performance.now() + 1500 });
    return o;
  }

  /** Speech bubble over a character for a few seconds. */
  say(character, text, { cls = '', ms = 2600 } = {}) {
    if (character._bubble) { character._bubble.removeFromParent(); character._bubble.element.remove(); }
    const el = document.createElement('div');
    el.className = `speech ${cls}`;
    el.textContent = text;
    const o = this.attach(character.anchor, el, new THREE.Vector3(0, 0.35, 0));
    character._bubble = o;
    this.temps.push({ o, until: performance.now() + ms, owner: character });
    return o;
  }

  tick() {
    const now = performance.now();
    for (let i = this.temps.length - 1; i >= 0; i--) {
      const t = this.temps[i];
      if (now > t.until) {
        t.o.removeFromParent();
        t.o.element.remove();
        if (t.owner && t.owner._bubble === t.o) t.owner._bubble = null;
        this.temps.splice(i, 1);
      }
    }
  }
}

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

/** A row of little hearts (morale) or smiley pips (customer needs). */
export function pips(n, max, kind = 'heart') {
  let out = '';
  for (let i = 0; i < max; i++) out += `<i class="pip ${kind} ${i < n ? 'on' : ''}"></i>`;
  return out;
}

export { CSS2DObject };
