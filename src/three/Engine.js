/**
 * One WebGL canvas for the whole game. Scenes (the restaurant, a service
 * challenge, the town) plug into it; the engine owns the renderer, camera,
 * controls, outlines, labels, picking and the frame loop.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { Labels } from './labels.js';

export class Engine extends EventTarget {
  constructor(container, { quality = 'high' } = {}) {
    super();
    this.container = container;
    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'game-canvas';
    container.appendChild(renderer.domElement);

    this.outline = new OutlineEffect(renderer, { defaultThickness: 0.0042, defaultColor: [0.22, 0.14, 0.12], defaultAlpha: 0.9 });
    this.labels = new Labels(container);

    this.camera = new THREE.PerspectiveCamera(30, 1, 1.5, 260);
    this.camera.position.set(0, 26, 30);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    this.clock = new THREE.Clock();
    this.time = 0;
    this.active = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.setQuality(quality);

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.resize();

    this.bindPointer();
    renderer.setAnimationLoop(() => this.frame());
  }

  setQuality(q) {
    this.quality = q;
    this.useOutline = q !== 'low';
    this.renderer.shadowMap.enabled = q === 'high';
    this.renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    if (this.active?.scene) this.active.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.width = w; this.height = h;
    this.active?.onResize?.(this);
  }

  /** Stop drawing while something full screen (a mini game) covers the canvas. */
  pause() { this.renderer.setAnimationLoop(null); }
  resume() { this.clock.getDelta(); this.renderer.setAnimationLoop(() => this.frame()); }

  /** Swap the running scene. The controller provides { scene, update, enter, exit, pick }. */
  setScene(controller) {
    if (this.active && this.active !== controller) this.active.exit?.(this);
    this.active = controller;
    // CSS2D objects of the previous scene must leave the DOM.
    this.labels.renderer.domElement.innerHTML = '';
    controller.enter?.(this);
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.controls.update();
    const a = this.active;
    if (a) {
      a.update?.(dt, this.time, this);
      if (this.useOutline) this.outline.render(a.scene, this.camera);
      else this.renderer.render(a.scene, this.camera);
      this.labels.render(a.scene, this.camera);
      this.labels.tick();
    }
  }

  bindPointer() {
    const dom = this.renderer.domElement;
    let down = null;
    dom.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    dom.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 500;
      down = null;
      if (moved > 6 || !quick) return;
      this.pick(e);
    });
    dom.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (this.hoverPending) return;
      this.hoverPending = true;
      requestAnimationFrame(() => {
        this.hoverPending = false;
        const hit = this.hitTest(e);
        dom.style.cursor = hit?.pickable ? 'pointer' : '';
        this.active?.hover?.(hit);
      });
    });
  }

  hitTest(e) {
    if (!this.active?.pickables) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const objs = this.active.pickables();
    const hits = this.raycaster.intersectObjects(objs, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.pick && !o.userData.character) o = o.parent;
      if (o) return { object: o, point: h.point, pickable: true, data: o.userData.pick || o.userData.character?.data };
    }
    const ground = this.active.ground ? this.raycaster.intersectObject(this.active.ground, false)[0] : null;
    return ground ? { ground: true, point: ground.point, pickable: false } : null;
  }

  pick(e) {
    const hit = this.hitTest(e);
    this.active?.pick?.(hit, e);
  }

  /** Smoothly frame a target. */
  frameView({ target, position, minDistance = 10, maxDistance = 60, minPolar = 0.35, maxPolar = 1.15, minAzimuth = -0.9, maxAzimuth = 0.9, pan = true }) {
    const c = this.controls;
    c.target.copy(target);
    this.camera.position.copy(position);
    c.minDistance = minDistance; c.maxDistance = maxDistance;
    c.minPolarAngle = minPolar; c.maxPolarAngle = maxPolar;
    c.minAzimuthAngle = minAzimuth; c.maxAzimuthAngle = maxAzimuth;
    c.enablePan = pan;
    c.update();
  }

  /** World position → screen px. */
  toScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * this.width, y: (1 - p.y) / 2 * this.height, behind: p.z > 1 };
  }
}
