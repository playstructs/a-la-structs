/**
 * The four Structs ambits are the four areas of a restaurant.
 *
 *   space → Bar & Counter        (front of house)
 *   air   → Dining Room          (front of house)
 *   land  → Cooking Line         (back of house)
 *   water → Dish Pit             (back of house)
 *
 * Ambit bit flags (struct types' possibleAmbit, weapon reach) follow the chain:
 * water 2, land 4, air 8, space 16, local 32.
 */
export const AREAS = {
  space: {
    key: 'space', name: 'Bar & Counter', short: 'Bar', house: 'front',
    blurb: 'Drinks, coffee and the till.',
    customerSpot: 'at the bar', customerWord: 'Counter regular',
    color: '#5aa9e6', tint: '#d8ecfb', bit: 16, enumName: 'SPACE',
  },
  air: {
    key: 'air', name: 'Dining Room', short: 'Dining', house: 'front',
    blurb: 'Tables, chatter and table service.',
    customerSpot: 'at a table', customerWord: 'Diner',
    color: '#f2a65a', tint: '#fdebd8', bit: 8, enumName: 'AIR',
  },
  land: {
    key: 'land', name: 'Cooking Line', short: 'Line', house: 'back',
    blurb: 'Stoves, fryers and ovens. Where the heat is.',
    customerSpot: 'at the chef’s counter', customerWord: 'Chef’s-counter foodie',
    color: '#e85d75', tint: '#fbdde3', bit: 4, enumName: 'LAND',
  },
  water: {
    key: 'water', name: 'Dish Pit', short: 'Dish', house: 'back',
    blurb: 'Sinks, suds and spotless plates.',
    customerSpot: 'at the back door', customerWord: 'Back-door visitor',
    color: '#4fbfa8', tint: '#d6f2ec', bit: 2, enumName: 'WATER',
  },
};

export const AREA_ORDER = ['space', 'air', 'land', 'water'];
export const AMBIT_FLAG = { water: 2, land: 4, air: 8, space: 16, local: 32 };

/** Ambit bitmask → list of area keys. */
export function areasFromMask(mask) {
  return AREA_ORDER.filter((a) => (mask & AMBIT_FLAG[a]) !== 0);
}

/** "Bar & Counter, Dining Room" */
export function areaList(mask, { includeLocal = true } = {}) {
  const names = areasFromMask(mask).map((a) => AREAS[a].name);
  if (includeLocal && (mask & AMBIT_FLAG.local)) names.push('wherever they stand');
  return names.join(', ') || '—';
}

export function normalizeAmbit(a) {
  if (a == null) return null;
  if (typeof a === 'number') return ({ 1: 'water', 2: 'land', 3: 'air', 4: 'space' })[a] || null;
  const s = String(a).toLowerCase();
  return AREAS[s] ? s : null;
}
