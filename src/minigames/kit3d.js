/**
 * The 3D stage for mini games: the restaurant's own toon look (same lights,
 * outlines, critters, props and items) seen through a tilted orthographic
 * camera, with the 2D kit canvas laid on top for UI only (tickets, timers,
 * meters, hints, floating notes).
 *
 * The trick that keeps game logic simple: the camera is set up so that the
 * games keep working in the 2D kit's VIEW units (x right, y down, the short
 * side is 420). `at(x, y, h)` gives the world point at height h (metres) that
 * appears at view (x, y), so a thing whose logic lives at (x, y) is drawn
 * there, hit-tests stay in view units and the overlay lines up exactly.
 *
 *   const s3 = stage3d(ctx.el, { scale: 140 });   // 140 view units per metre
 *   const bowl = s3.add(model('bowl'));             // see models.js
 *   s3.put(bowl, x, y);                             // base on the floor at (x, y)
 *   …each frame: s3.render(); then s3.begin2d() and draw UI with the 2D kit.
 */
import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { Character } from '../three/Character.js';
import { blobShadow, gradientMap } from '../three/toon.js';
import { stage } from './kit.js';

/** Camera elevation above the floor: about the restaurant view's angle. */
export const ELEVATION = 0.8;

export function stage3d(el, { scale = 140, elevation = ELEVATION, background = '#f6efe4', shadows = true, quality = 'high' } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = shadows && quality === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'mg-canvas mg-gl';
  el.appendChild(renderer.domElement);
  const outline = new OutlineEffect(renderer, { defaultThickness: 0.006, defaultColor: [0.22, 0.14, 0.12], defaultAlpha: 0.9 });
  const useOutline = quality !== 'low';

  // The 2D kit canvas goes on top: UI drawing and pointer input.
  const ui = stage(el);
  const { view } = ui;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  const hemi = new THREE.HemisphereLight('#fff6e5', '#b9a3d6', 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#cfe6ff', 0.45);
  scene.add(fill);

  const sinE = Math.sin(elevation), cosE = Math.cos(elevation);
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, 0.1, 400);
  const DIST = 120;
  camera.position.set(0, DIST * sinE, DIST * cosE);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);

  function fit() {
    const r = el.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    renderer.domElement.style.width = `${r.width}px`;
    renderer.domElement.style.height = `${r.height}px`;
    camera.left = 0; camera.right = view.W / scale;
    camera.top = 0; camera.bottom = -view.H / scale;
    camera.updateProjectionMatrix();
    // Sun over the middle of the play area, sized to it.
    const mid = at(view.W / 2, view.H / 2);
    const span = Math.max(view.W, view.H / sinE) / scale;
    sun.position.set(mid.x - 8, 20, mid.z + 14);
    sun.target.position.copy(mid);
    const s = sun.shadow.camera;
    s.left = -span; s.right = span; s.top = span; s.bottom = -span; s.near = 1; s.far = 80;
    s.updateProjectionMatrix();
    fill.position.set(mid.x + 14, 10, mid.z - 6);
  }
  const ro = new ResizeObserver(fit);
  ro.observe(el);

  /** World point at height h (m) that appears at view (x, y). */
  function at(x, y, h = 0) {
    return new THREE.Vector3(x / scale, h, (y / scale + h * cosE) / sinE);
  }
  /** World → view units. */
  const tmp = new THREE.Vector3();
  function toView(v) {
    tmp.copy(v).project(camera);
    return { x: (tmp.x + 1) / 2 * view.W, y: (1 - tmp.y) / 2 * view.H };
  }
  /** World point at depth z (world units) that appears at view (x, y). */
  function atDepth(x, y, z) { return new THREE.Vector3(x / scale, (z * sinE * scale - y) / (cosE * scale), z); }
  /**
   * For side-on games (things fall down the screen): an upright plane facing
   * the camera whose foot meets the floor at view row `footY`. Everything on
   * it keeps its view position, and screen height becomes real height.
   *   const P = s3.plane(footY); P.at(x, y) → world point; P.height(y) → metres above the floor; P.z
   *   P.at(x, y, back) → the same screen point, `back` metres further away (inside a bowl, behind a rim)
   */
  function plane(footY) {
    const z = at(0, footY, 0).z;
    return { z, footY, at: (x, y, back = 0) => atDepth(x, y, z - back), height: (y) => (footY - y) / (cosE * scale) };
  }
  /** The floor spot under whatever appears at view (x, y) at height h (same x/z, y = 0). */
  function under(x, y, h) { const p = at(x, y, h); p.y = 0; return p; }
  /** Move an object so its origin is at view (x, y) and height h. */
  function put(obj, x, y, h = 0) { obj.position.copy(at(x, y, h)); return obj; }

  const critters = new Set();
  let last = performance.now();
  fit();

  const api = {
    THREE, scene, camera, renderer, view, ui, g: ui.g, scale, elevation,
    at, atDepth, plane, under, toView, put, sinE, cosE,
    /** Metres for a span of view units on screen (horizontal). */
    m: (units) => units / scale,
    add(...objs) { for (const o of objs) scene.add(o); return objs[0]; },
    remove(...objs) { for (const o of objs) { o.removeFromParent(); if (o.userData?.character) { critters.delete(o.userData.character); } } },
    /** A critter in the game's toon style, animated every render. */
    critter({ species = 'cat', outfit = {}, seed = 'x', scale: s = 1, speed = 1.7, shadow = true } = {}) {
      const c = new Character({ species, outfit, seed, scale: s, speed });
      if (!shadow) c.rig.shadow.visible = false;
      critters.add(c);
      scene.add(c.object);
      return c;
    },
    dropCritter(c) { critters.delete(c); c.dispose(); },
    shadow: blobShadow,
    /**
     * A big floor under the play area, like the restaurant's: 'checker'
     * (kitchen tiles), 'wood' (dining room planks) or 'tile' (plain squares).
     */
    floor(kind = 'checker', { a, b, size = 0.5 } = {}) {
      const tex = floorTexture(kind, a, b);
      const mid = at(view.W / 2, view.H / 2);
      tex.repeat.set(60 / (size * 2), 60 / (size * 2));
      const f = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshToonMaterial({ map: tex, gradientMap: gradientMap() }));
      f.rotation.x = -Math.PI / 2; f.position.set(mid.x, 0, mid.z); f.receiveShadow = true;
      f.userData.ownGeometry = true;
      scene.add(f);
      return f;
    },
    /** A tiled back wall standing at view row y (its foot), facing the camera. */
    wall({ y = 0, height = 6, a = '#f6efe4', b = '#e6dccd', size = 0.35 } = {}) {
      const tex = floorTexture('tile', a, b);
      tex.repeat.set(60 / size, height / size);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(60, height), new THREE.MeshToonMaterial({ map: tex, gradientMap: gradientMap() }));
      const foot = at(view.W / 2, y, 0);
      w.position.set(foot.x, height / 2, foot.z);
      w.userData.ownGeometry = true;
      scene.add(w);
      return w;
    },
    /** Draw the 3D frame. Characters and props with userData.tick animate on the wall clock. */
    render() {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000), t = now / 1000;
      last = now;
      for (const c of critters) c.update(dt);
      scene.traverse((o) => o.userData?.tick?.(dt, t));
      if (useOutline) outline.render(scene, camera); else renderer.render(scene, camera);
    },
    /** Clear the overlay for this frame's UI drawing (view units). */
    begin2d() { ui.begin(null); return ui.g; },
    destroy() {
      ro.disconnect();
      for (const c of critters) c.dispose();
      critters.clear();
      scene.traverse((o) => {
        if (o.isMesh) {
          // Geometry from items/props caches is shared: leave it; materials are cached too.
          if (o.userData?.ownGeometry) o.geometry.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
      ui.destroy();
    },
  };
  if (import.meta.env?.DEV) window.__s3 = api;   // for play-test scripts
  return api;
}

/** Repeating floor/wall patterns drawn on a small canvas. */
function floorTexture(kind, a, b) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  if (kind === 'checker') {
    g.fillStyle = a || '#fff3e6'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = b || '#f6d5c3'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
  } else if (kind === 'wood') {
    g.fillStyle = a || '#e4b583'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = b || '#d39f6c';
    for (let i = 0; i < 4; i++) { g.fillRect(0, i * 32 + 30, 128, 2); g.fillRect(((i * 53) % 128), i * 32, 2, 32); }
  } else {
    g.fillStyle = b || '#e6dccd'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = a || '#f6efe4'; g.fillRect(3, 3, 58, 58); g.fillRect(67, 3, 58, 58); g.fillRect(3, 67, 58, 58); g.fillRect(67, 67, 58, 58);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
