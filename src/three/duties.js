/**
 * What each role does all day. A duty returns a short list of steps; when the
 * list runs out the scene asks for the next one, forever. Steps:
 *   { walk: Vector3 }                      walk there (routed around walls)
 *   { gesture, dur, hold?, face?, look? }  play a gesture
 *   { fx: kind, at?: Vector3, count? }     a little burst
 *   { say: text }                           speech bubble
 *   { hold: kind|null }                     change what's in hand
 *   { wait: seconds }
 */
import { V, TABLES, PASS, AREA_RECTS, randomIn, DOOR, BAR, CURB_SPOTS } from './layout.js';

const rand = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;
const jitter = (v, r = 0.3) => V(v.x + (Math.random() - 0.5) * r, v.z + (Math.random() - 0.5) * r);

/** Spot on the dining-room side of the kitchen pass. */
const passFront = () => V(PASS.x0 + 0.6 + Math.random() * (PASS.x1 - PASS.x0 - 1.2), PASS.z + 0.75);
/** Spot on the kitchen side of the pass. */
const passBack = () => V(PASS.x0 + 0.6 + Math.random() * (PASS.x1 - PASS.x0 - 1.2), PASS.z - 0.75);

function tableSide(scene) {
  const occupied = scene.occupiedChairs ? scene.occupiedChairs() : [];
  const chair = occupied.length ? rand(occupied) : null;
  const t = chair ? chair.table : rand(TABLES);
  return { stand: V(t.x, t.z + 0.95), look: V(t.x, t.z), chair };
}

export const DUTIES = {
  idle(a) { return [{ gesture: 'talk', dur: 2 + Math.random() * 2, face: 0 }, { wait: 1.5 }]; },

  manage(a, scene) {
    const home = a.home;
    if (chance(0.35)) {
      const area = a.area;
      return [{ walk: randomIn(area, 1.6) }, { gesture: 'write', dur: 2.5, hold: 'clipboard' }, { gesture: 'point', dur: 1 }, { walk: home }, { gesture: 'talk', dur: 1.5, face: 0 }];
    }
    return [{ gesture: 'write', dur: 3, face: 0, hold: 'clipboard' }, { gesture: 'clap', dur: 0.8 }, { wait: 1 }];
  },

  bartend(a, scene) {
    const stool = V(a.home.x, BAR.stoolZ);
    return [
      { gesture: 'shake', dur: 2.2, face: 0, hold: 'shaker' },
      { gesture: 'pour', dur: 1.2, hold: 'cocktail' },
      { gesture: 'serve', dur: 0.8, face: 0, fx: 'sparkle', at: V(a.home.x, BAR.z, 1.3) },
      { hold: 'shaker' },
      chance(0.4) ? { walk: jitter(V(a.home.x + (Math.random() - 0.5) * 2, a.home.z), 0.2) } : { wait: 0.6 },
      { gesture: 'wipe', dur: 1.5, face: 0 },
      { walk: a.home }, { wait: 0.4 + Math.random() }, void stool,
    ].filter(Boolean);
  },

  barista(a) {
    return [
      { gesture: 'pour', dur: 2.0, face: 0, hold: 'cup', fx: 'steam', at: V(a.home.x, a.home.z + 1, 1.3) },
      { gesture: 'stir', dur: 1.2 },
      { gesture: 'serve', dur: 0.8, fx: 'heart', at: V(a.home.x, a.home.z + 1.5, 1.5) },
      { say: rand(['Oat or dairy?', 'Order up!', 'Extra foam!', 'Latte art time', null, null]) },
      { wait: 1 + Math.random() * 1.5 },
    ].filter((s) => !('say' in s) || s.say);
  },

  cashier(a) {
    return [
      { gesture: 'type', dur: 2.5, face: 0 },
      { gesture: 'wave', dur: 1.0, fx: 'coin', at: V(a.home.x, a.home.z + 1, 1.3) },
      { say: rand(['Next!', 'That’ll be 3 gold!', 'Have a nice day!', null, null]) },
      { wait: 1.2 + Math.random() * 2 },
    ].filter((s) => !('say' in s) || s.say);
  },

  bus(a, scene) {
    const t = tableSide(scene);
    return [
      { hold: 'tub' }, { walk: t.stand }, { gesture: 'wipe', dur: 2.2, look: t.look, hold: null }, { fx: 'sparkle', at: V(t.look.x, t.look.z, 0.9) },
      { hold: 'tub' }, { walk: a.home }, { gesture: 'carry', dur: 0.6, face: 0 }, { hold: null }, { wait: 1.5 + Math.random() * 2 },
    ];
  },

  host(a, scene) {
    if (chance(0.5)) return [{ gesture: 'wave', dur: 1.6, face: 0.6, hold: 'menus' }, { say: rand(['Welcome in!', 'Table for two?', 'Right this way!']) }, { wait: 2 }];
    const t = tableSide(scene);
    return [{ hold: 'menus' }, { walk: V(DOOR.x - 0.5, DOOR.z - 1.2) }, { gesture: 'wave', dur: 1 }, { walk: t.stand }, { gesture: 'serve', dur: 0.8, look: t.look }, { walk: a.home }, { wait: 1.5 }];
  },

  serve(a, scene) {
    const t = tableSide(scene);
    return [
      { hold: 'notepad' }, { walk: t.stand }, { gesture: 'write', dur: 1.8, look: t.look }, { say: rand(['Anything else?', 'Coming right up!', 'Great choice!', null]) },
      { walk: passFront() }, { gesture: 'point', dur: 0.6, face: Math.PI }, { hold: rand(['plate', 'steak', 'pudding']) },
      { walk: t.stand }, { gesture: 'serve', dur: 0.9, look: t.look, fx: 'heart', at: V(t.look.x, t.look.z, 1.2) }, { hold: 'notepad' },
      { walk: a.home }, { wait: 1 + Math.random() * 2 },
    ].filter((s) => !('say' in s) || s.say);
  },

  fry(a) {
    const steps = [{ gesture: 'fry', dur: 3, face: 0, hold: 'basket', fx: 'bubble', at: V(a.home.x, a.home.z + 1, 1.1) }, { gesture: 'lift', dur: 0.8 }];
    if (chance(0.35)) steps.push({ hold: 'fries' }, { walk: passBack() }, { gesture: 'serve', dur: 0.7, face: Math.PI }, { hold: 'basket' }, { walk: a.home });
    steps.push({ wait: 0.5 });
    return steps;
  },

  cook(a) {
    const steps = [{ gesture: rand(['stir', 'chop']), dur: 2.5, face: 0, hold: 'pan', fx: 'steam', at: V(a.home.x, a.home.z + 1, 1.3) }, { gesture: 'fry', dur: 1.5 }];
    if (chance(0.35)) steps.push({ hold: 'steak' }, { walk: passBack() }, { gesture: 'serve', dur: 0.7, face: Math.PI }, { say: rand(['Order up!', 'Hands!', 'Plate’s hot!']) }, { hold: 'pan' }, { walk: a.home });
    return steps;
  },

  bake(a) {
    return [
      { gesture: 'knead', dur: 3, face: 0, hold: 'rollingPin', fx: 'dust', at: V(a.home.x, a.home.z + 0.8, 1.0) },
      { gesture: 'point', dur: 0.8 }, { hold: 'croissant' }, { fx: 'sparkle', at: V(a.home.x, a.home.z + 1, 1.4) },
      ...(chance(0.4) ? [{ walk: passBack() }, { gesture: 'serve', dur: 0.7, face: Math.PI }, { walk: a.home }] : [{ gesture: 'cheer', dur: 0.8 }]),
      { hold: 'rollingPin' },
    ];
  },

  scrub(a) {
    return [
      { gesture: 'scrub', dur: 3.5, face: 0, hold: 'sponge', fx: 'bubble', at: V(a.home.x, a.home.z + 1, 1.0) },
      { hold: 'pot' }, { gesture: 'lift', dur: 1.0, fx: 'sparkle', at: V(a.home.x, a.home.z, 2.0) },
      { hold: 'sponge' }, { wait: 0.6 },
    ];
  },

  wash(a) {
    const steps = [{ gesture: 'scrub', dur: 3, face: 0, hold: 'sponge', fx: 'bubble', at: V(a.home.x, a.home.z + 1, 1.0) }];
    if (chance(0.4)) steps.push({ hold: 'cleanPlate' }, { walk: passBack() }, { gesture: 'serve', dur: 0.6, face: Math.PI }, { hold: 'sponge' }, { walk: a.home });
    else steps.push({ gesture: 'wipe', dur: 1.2 });
    return steps;
  },

  porter(a) {
    return [
      { hold: 'crate' }, { walk: V(11.0, -4.0) }, { gesture: 'lift', dur: 0.8 }, { walk: a.home }, { gesture: 'carry', dur: 0.8, face: 0 },
      ...(chance(0.4) ? [{ walk: V(5.0, -2.6) }, { walk: V(4.9, -0.1) }, { gesture: 'carry', dur: 0.6, face: 0 }, { walk: a.home }] : []),
      { hold: null }, { gesture: 'sweep', dur: 2.0, face: 0 }, { wait: 0.8 },
    ];
  },

  chef(a) {
    return [
      { gesture: 'chop', dur: 3, face: 0, hold: 'whisk', fx: 'steam', at: V(a.home.x, a.home.z + 0.8, 1.2) },
      { gesture: 'stir', dur: 2 },
      { gesture: 'write', dur: 1.5, hold: 'recipe' },
      { hold: 'whisk' }, { wait: 0.5 },
    ];
  },

  sous(a) {
    return [
      { gesture: 'stir', dur: 2.2, face: 0, hold: 'spatula' },
      { gesture: 'serve', dur: 1.0, fx: 'sparkle', at: V(a.home.x, a.home.z + 0.8, 1.2) },
      ...(chance(0.3) ? [{ hold: 'plate' }, { walk: passBack() }, { gesture: 'serve', dur: 0.6, face: Math.PI }, { walk: a.home }] : []),
      { hold: 'spatula' }, { wait: 0.6 },
    ];
  },

  swing(a, scene) {
    const r = AREA_RECTS[a.area] || AREA_RECTS.land;
    const spot = V(r.x0 + 1.5 + Math.random() * (r.x1 - r.x0 - 3), -3.4);
    return [{ walk: spot }, { gesture: rand(['stir', 'chop', 'fry']), dur: 2.5, face: 0, hold: 'spatula' }, { gesture: 'clap', dur: 0.6 }, { walk: a.home }, { gesture: 'stir', dur: 2, face: 0 }];
  },

  spin(a) {
    return [
      { gesture: 'spin', dur: 4 + Math.random() * 2, face: 0, hold: 'arrowSign' },
      { say: rand(['Best noodles in town!', 'Free cones today!', 'Come on in!', 'Two for one!', null, null]) },
      { gesture: 'cheer', dur: 0.8 },
    ].filter((s) => !('say' in s) || s.say);
  },

  influence(a, scene) {
    const area = rand(['air', 'air', 'space', 'land', 'water']);
    const p = randomIn(area, 1.4);
    return [
      { hold: 'phone' }, { walk: p }, { gesture: 'selfie', dur: 2.4, fx: 'flash', at: V(p.x, p.z, 1.9) }, { say: rand(['#cozy', 'Obsessed!!', 'Rating: 11/10', 'Link in bio', 'Content!!']) },
      { gesture: 'phone', dur: 2.2 }, { wait: 0.8 },
    ];
  },
};

export function dutyFor(roleKey) { return DUTIES[roleKey] || DUTIES.idle; }

export { CURB_SPOTS };
