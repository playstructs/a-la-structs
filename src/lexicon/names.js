/** Deterministic, cute identities for everything that shows up on screen. */

export const SPECIES = [
  'cat', 'dog', 'bunny', 'bear', 'fox', 'panda', 'frog', 'pig',
  'duck', 'raccoon', 'mouse', 'koala', 'sheep', 'penguin', 'hamster',
];

export const SPECIES_NAMES = {
  cat: 'Cat', dog: 'Pup', bunny: 'Bunny', bear: 'Bear', fox: 'Fox', panda: 'Panda', frog: 'Frog',
  pig: 'Piglet', duck: 'Duck', raccoon: 'Raccoon', mouse: 'Mouse', koala: 'Koala', sheep: 'Sheep',
  penguin: 'Penguin', hamster: 'Hamster',
};

const FIRST = [
  'Biscuit', 'Mochi', 'Pepper', 'Noodle', 'Tofu', 'Waffles', 'Pickles', 'Dumpling', 'Saffron', 'Basil',
  'Clover', 'Maple', 'Nutmeg', 'Truffle', 'Sprout', 'Bao', 'Gnocchi', 'Paprika', 'Kiwi', 'Peaches',
  'Butterbean', 'Sesame', 'Crumpet', 'Ginger', 'Olive', 'Pudding', 'Marmalade', 'Churro', 'Taro', 'Scone',
  'Fennel', 'Tamale', 'Brioche', 'Yuzu', 'Pistachio', 'Cocoa', 'Nacho', 'Sorbet', 'Wasabi', 'Macaron',
  'Toffee', 'Fig', 'Radish', 'Pretzel', 'Clementine', 'Latke', 'Sushi', 'Pancake', 'Hazel', 'Juniper',
];

const RESTAURANT_A = ['The Cozy', 'Little', 'Golden', 'Happy', 'Sunny', 'Lucky', 'Crumbly', 'Velvet', 'Snug', 'Toasty', 'Rosy', 'Mossy', 'Twinkle', 'Cloudy', 'Merry'];
const RESTAURANT_B = ['Spoon', 'Kettle', 'Whisk', 'Ladle', 'Teacup', 'Skillet', 'Dumpling', 'Noodle', 'Biscuit', 'Burrow', 'Paw', 'Acorn', 'Pear', 'Pie', 'Bowl'];
const RESTAURANT_C = ['Diner', 'Bistro', 'Café', 'Kitchen', 'Eatery', 'Canteen', 'Bakehouse', 'Noodle Bar', 'Tavern', 'Grill'];

export function hash(str) {
  let h = 2166136261 >>> 0;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function pick(list, seed, salt = '') { return list[hash(seed + '|' + salt) % list.length]; }

export function speciesFor(id, salt = 'sp') { return pick(SPECIES, id, salt); }

export function nameFor(id) { return pick(FIRST, id, 'nm'); }

export function restaurantNameFor(planetId, ownerName) {
  if (ownerName && hash(planetId) % 3 === 0) return `${ownerName}’s ${pick(RESTAURANT_C, planetId, 'c')}`;
  return `${pick(RESTAURANT_A, planetId, 'a')} ${pick(RESTAURANT_B, planetId, 'b')} ${pick(RESTAURANT_C, planetId, 'c')}`;
}

/** Brand colours for a restaurant's awning / sign — picked from a cheerful set. */
const AWNINGS = [
  ['#ff7a8a', '#ffffff'], ['#5ab3e8', '#ffffff'], ['#ffc94d', '#ffffff'], ['#6fcf97', '#ffffff'],
  ['#b18cf2', '#ffffff'], ['#ff9f5a', '#ffffff'], ['#4fc0b0', '#fff6e0'], ['#f27ab8', '#fff3fa'],
];
export function awningFor(id) { return AWNINGS[hash(id) % AWNINGS.length]; }

/** Seeded PRNG (mulberry32). */
export function rng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hash(seed);
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
