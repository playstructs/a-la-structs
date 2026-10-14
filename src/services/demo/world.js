/**
 * The demo kitchen's town: your restaurant group and the rival group across
 * the river. Everything is generated from fixed seeds so the town looks the
 * same every visit.
 */
import { rng, restaurantNameFor, speciesFor, hash } from '../../lexicon/names.js';

export const MY_GROUP = { id: '0-1', name: 'Whisker Row', tag: 'WR' };
export const RIVAL_GROUPS = [
  { id: '0-2', name: 'The Gravy Train', tag: 'GRV' },
  { id: '0-3', name: 'Night Owl Noodles', tag: 'NOW' },
];

const OWNER_NAMES = [
  'Juniper', 'Bramble', 'Tansy', 'Pippin', 'Rosalind', 'Crumb', 'Hobb', 'Marigold', 'Fizz', 'Ottoline',
  'Barnaby', 'Wren', 'Mabel', 'Quill', 'Sorrel', 'Tumble', 'Pemberton', 'Lark', 'Dewdrop', 'Figaro',
];

/* Staff templates per restaurant "style": [typeName, ambit] */
const STYLES = {
  barHeavy: [['Battleship', 'space'], ['Starfighter', 'space'], ['Frigate', 'space'], ['High Altitude Interceptor', 'air'], ['Tank', 'land'], ['Destroyer', 'water']],
  kitchenHeavy: [['Tank', 'land'], ['Tank', 'land'], ['Mobile Artillery', 'land'], ['SAM Launcher', 'land'], ['Cruiser', 'water'], ['High Altitude Interceptor', 'air']],
  balanced: [['Starfighter', 'space'], ['Pursuit Fighter', 'air'], ['High Altitude Interceptor', 'air'], ['Tank', 'land'], ['Destroyer', 'water'], ['Submersible', 'water']],
  sneaky: [['Stealth Bomber', 'air'], ['Submersible', 'water'], ['Frigate', 'space'], ['Mobile Artillery', 'land'], ['Cruiser', 'water']],
  tiny: [['Starfighter', 'space'], ['Tank', 'land'], ['Pursuit Fighter', 'air']],
};

const PLANETARY = [
  ['Ore Extractor', 'land'], ['Ore Refinery', 'water'], ['Field Generator', 'land'],
  ['Orbital Shield Generator', 'space'], ['Planetary Defense Cannon', 'land'], ['Jamming Satellite', 'space'],
  ['Ore Bunker', 'land'], ['Continental Power Plant', 'water'],
];

let structSeq = 1000;

export function buildRoster(types, group, count, seed, opts = {}) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    const pid = `1-${hash(seed + i) % 900 + 100}`;
    const name = OWNER_NAMES[Math.floor(r() * OWNER_NAMES.length)];
    const styleKeys = Object.keys(STYLES);
    const style = STYLES[styleKeys[Math.floor(r() * styleKeys.length)]];
    const planetId = `2-${hash(pid) % 900 + 100}`;
    const fleetId = `9-${pid.split('-')[1]}`;
    const player = {
      id: pid, name, species: speciesFor(pid, 'owner'), guildId: group.id, guildName: group.name, guildTag: group.tag,
      planetId, fleetId,
      gold: Math.floor(10 + r() * 80), recipes: Math.floor(r() * 9) + (opts.richer ? 4 : 0),
      undiscovered: Math.floor(4 + r() * 14), reputation: 0,
      restaurantName: restaurantNameFor(planetId, name),
      online: r() < 0.6, crewHome: r() < 0.8,
      structs: [],
    };
    const add = (typeName, ambit, slot, locationType) => {
      const t = types.named(typeName);
      if (!t) return;
      const s = {
        id: `5-${structSeq++}`, typeId: t.id, owner: pid, locationType,
        locationId: locationType === 'fleet' ? fleetId : planetId, ambit, slot,
        health: t.maxHealth, status: 1 | 2 | 4,
      };
      player.structs.push(s);
    };
    add('Command Ship', ['space', 'air', 'land', 'water'][Math.floor(r() * 4)], 0, 'fleet');
    const slots = { space: 0, air: 0, land: 0, water: 0 };
    style.forEach(([tn, a]) => { if (r() < 0.85 && slots[a] < 4) add(tn, a, slots[a]++, 'fleet'); });
    const pslots = { space: 0, air: 0, land: 0, water: 0 };
    PLANETARY.forEach(([tn, a], j) => { if (j < 2 || r() < 0.45) if (pslots[a] < 4) add(tn, a, pslots[a]++, 'planet'); });
    player.reputation = player.structs.filter((s) => types.get(s.typeId)?.type === 'Orbital Shield Generator').length;
    out.push(player);
  }
  return out;
}

/** Things members say in the group chat. */
export const CHAT_LINES = [
  'Anyone else’s soft-serve machine making that noise?',
  'Just hired a Barista. Triple-shot rush is no joke.',
  'The Gravy Train crew tried to copy my recipes again. Rude.',
  'Pro tip: put a Line Cook next to your Manager. Thick skin.',
  'Who wants to go out for a service challenge tonight?',
  'My Chef found a new recipe! It’s… mostly soup.',
  'Sign spinner is on fire today. Cash is rolling in.',
  'Remember: satisfy the Food Critic and the whole party leaves.',
  'Lucky cat waved at me. I think it likes me.',
  'Anyone have spare gold? Saving up for an Influencer.',
  'The Dish Pit is the most underrated area, fight me',
  'Brb, my Busser is chasing a pigeon',
  'Night Owl Noodles have a sneaky Host. Watch out.',
  'Covered my Manager with two Servers. Feeling safe.',
  'New restaurant opened on the corner! Welcome!',
];

export const CHAT_REPLIES = [
  'Haha same', 'Ooh nice!', 'Good luck out there!', 'That’s the spirit', 'Let’s goooo',
  'Mine too, honestly', 'Wise words', 'Count me in', 'Noted', 'Cozy vibes only',
];
