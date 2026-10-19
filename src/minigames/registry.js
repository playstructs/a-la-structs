/**
 * Shift practice: one timed mini game per hireable crew role. A run scores
 * points; the best score per game is what's saved (mini_game_progress on the
 * group server, or this browser in the demo kitchen). Stars are worked out
 * from the best score here, so thresholds can be retuned without a migration.
 *
 *  key      game_name on the server (stable — don't rename)
 *  type     the chain's struct type, which picks the role (lexicon/roles.js)
 *  stars    scores for 1, 2 and 3 stars
 *  load     lazy import of the game module (games/*.js)
 */
import { ROLES } from '../lexicon/roles.js';

export const INTERFACE_NAME = 'a-la-structs';

export const GAMES = [
  {
    key: 'line-cook', type: 'Tank', title: 'Keep the Line Moving', seconds: 60, unit: 'plates', stars: [12, 24, 34],
    how: 'Plates slide down the line on the beat. Tap the ingredient each plate is missing as it reaches you. Keep the rhythm — the line speeds up!',
    load: () => import('./games/lineCook.js'),
  },
  {
    key: 'fry-cook', type: 'Mobile Artillery', title: 'Basket Toss', seconds: 75, unit: 'points', stars: [5, 14, 24],
    how: 'Tap the wet batter, then the flour, then pull back and toss the piece into the basket drifting in the oil — a clean swish scores a bonus. When it’s golden, grab the basket and shake it to drain. Golden pieces score; drops cost a point.',
    load: () => import('./games/fryCook.js'),
  },
  { key: 'host', type: 'Stealth Bomber', title: 'Full House', seconds: 90, unit: 'guests', stars: [55, 110, 160],
    how: 'Drag each party to a table with enough seats, or tap the party, then the table. Bigger parties and celebrations linger longer. You score guests as they finish eating and leave, so keep the tables turning.',
    load: () => import('./games/host.js'),
  },
  { key: 'busser', type: 'Pursuit Fighter', title: 'Bus Run', seconds: 75, unit: 'tables', stars: [6, 11, 15],
    how: 'Hold and drag (or use WASD) to walk. Scoop the dishes off dirty tables — up to three tables’ worth — and drop them at the dish pit. Bump into anyone and everything you’re carrying smashes.',
    load: () => import('./games/busser.js'),
  },
  { key: 'server', type: 'High Altitude Interceptor', title: 'Order Up!', seconds: 180, unit: 'dishes', stars: [8, 15, 24],
    how: 'Tap a table with a ✋ to take their order. It only shows for a moment, so remember it! Punch it into the terminal, then carry the plates from the pass to the table on each ticket. Wrong dishes earn nothing.',
    load: () => import('./games/server.js'),
  },
  { key: 'dishwasher', type: 'Destroyer', title: 'Rack & Roll', seconds: 75, unit: 'points', stars: [45, 55, 65],
    how: 'Drag dishes from the bin into the rack — tap one to turn it. Big and awkward dishes are worth more: cups 1, plates 2, trays 4, bowls and pans 5. Points count once the rack comes out clean, so keep the next one ready.',
    load: () => import('./games/dishwasher.js'),
  },
  { key: 'barista', type: 'Starfighter', title: 'Latte Art', seconds: 90, unit: 'points', stars: [12, 26, 42],
    how: 'Hold on the cup to pour the milk and move to draw the pattern each customer asks for, then Serve. Judged Fail, Poor, Good or Perfect for 0, 1, 2 or 4 points (a good Rosetta earns 1 more). Stuck? Tap Show me and the barista pours one for you; the clock stops while you watch. Keyboard: arrows move, hold Space to pour, Enter serves, H shows how.',
    load: () => import('./games/barista.js'),
  },
  { key: 'cashier', type: 'Frigate', title: 'Exact Change', seconds: 75, unit: 'customers', stars: [4, 8, 12],
    how: 'Drop each customer’s cash into its own drawer slot, then drag the right change onto the tray and hand it over. Card payers tap the reader and get their card and receipt back. Dropped money costs a point.',
    load: () => import('./games/cashier.js'),
  },
  { key: 'bartender', type: 'Battleship', title: 'Slide Down the Bar', seconds: 60, unit: 'drinks', stars: [10, 15, 25],
    how: 'Tap the drink a patron ordered — it comes ready-poured — then flick the glass down the bar so it stops in front of them. Too hard and it smashes off the end.',
    load: () => import('./games/bartender.js'),
  },
  { key: 'baker', type: 'SAM Launcher', title: 'Golden Brown', seconds: 60, unit: 'trays', stars: [8, 18, 28],
    how: 'Load the ovens and pull each tray the moment it turns golden. Underbaked or too-dark trays don’t count, and burnt ones cost a point. Bake what the customer wants for a bonus.',
    load: () => import('./games/baker.js'),
  },
  { key: 'pot-washer', type: 'Cruiser', title: 'Elbow Grease', seconds: 60, unit: 'pots', stars: [4, 8, 11],
    how: 'Scrub away every bit of grime. Burnt-on spots need extra elbow grease. Don’t let the pile topple!',
    load: () => import('./games/potWasher.js'),
  },
  { key: 'porter', type: 'Submersible', title: 'Back Door Delivery', seconds: 75, unit: 'crates', stars: [18, 50, 80],
    how: 'Drag each crate off the dock into the walk-in, the dry store or the produce racks. When a station asks for something, drag one over for 2 points. If the dock overflows, the oldest crate goes back on the van.',
    load: () => import('./games/porter.js'),
  },
];

for (const g of GAMES) {
  const r = ROLES[g.type];
  g.role = r.role;
  g.outfit = r.outfit;
}

export const GAME_BY_KEY = new Map(GAMES.map((g) => [g.key, g]));
export const GAME_BY_TYPE = new Map(GAMES.map((g) => [g.type, g]));
export const gameForType = (t) => GAME_BY_TYPE.get(typeof t === 'string' ? t : t?.type) || null;
export const isPlayable = (g) => !!g?.load;

/** 0–3 stars for a score. */
export function starsFor(game, score) {
  let n = 0;
  for (const need of game.stars) if (Number(score) >= need) n++;
  return n;
}
