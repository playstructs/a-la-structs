/**
 * Head-and-shoulders portraits of critters for cards and lists, rendered with
 * the game's own renderer into an offscreen target and cached as images.
 */
import * as THREE from 'three';
import { Character } from './Character.js';
import { OUTFITS } from './outfits.js';
import { STATION_PROPS } from './props.js';

const cache = new Map();
let studio = null;

function getStudio(renderer) {
  if (studio) return studio;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e5', '#c9b6e8', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 1.8);
  key.position.set(2, 4, 5);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  const size = 192;
  const rt = new THREE.WebGLRenderTarget(size, size);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  studio = { scene, cam, rt, size, canvas, ctx: canvas.getContext('2d'), renderer };
  return studio;
}

function snap(st, obj, camPos, look) {
  const { scene, cam, rt, size, ctx, renderer } = st;
  scene.add(obj);
  cam.position.copy(camPos);
  cam.lookAt(look);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  const buf = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearAlpha(prevClear);
  scene.remove(obj);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4;
    img.data.set(buf.subarray(src, src + size * 4), y * size * 4);
  }
  ctx.putImageData(img, 0, 0);
  return st.canvas.toDataURL('image/png');
}

/** @returns {string} data URL */
export function portrait(renderer, { species, outfit = 'casual', seed = 'x', key = null }) {
  const k = key || `${species}|${typeof outfit === 'string' ? outfit : JSON.stringify(outfit)}|${seed}`;
  if (cache.has(k)) return cache.get(k);
  const st = getStudio(renderer);
  const c = new Character({ species, outfit: typeof outfit === 'string' ? (OUTFITS[outfit] || OUTFITS.casual) : outfit, seed });
  c.rig.shadow.visible = false;
  c.object.rotation.y = -0.35;
  c.rig.head.rotation.y = 0.15;
  c.rig.armR.rotation.x = -0.6;
  const url = snap(st, c.object, new THREE.Vector3(0.0, 1.05, 2.45), new THREE.Vector3(0, 0.82, 0));
  cache.set(k, url);
  return url;
}

/** Portrait of a piece of equipment. */
export function propPortrait(renderer, station) {
  const k = 'prop|' + station;
  if (cache.has(k)) return cache.get(k);
  const st = getStudio(renderer);
  const fn = STATION_PROPS[station];
  if (!fn) return '';
  const p = fn('EAT!');
  p.rotation.y = -0.45;
  const box = new THREE.Box3().setFromObject(p);
  const h = box.max.y - box.min.y;
  const url = snap(st, p, new THREE.Vector3(0, h * 0.62, h * 1.9 + 1.2), new THREE.Vector3(0, h * 0.48, 0));
  cache.set(k, url);
  return url;
}
