/**
 * Struct type → restaurant role.
 *
 * Keyed by the chain's struct type name (StructType.type), which is stable
 * across networks; ids are looked up at runtime.
 *
 *  kind      staff | equipment
 *  display   station (works at a slot in their area) | outside (curbside) | roam (walks everywhere)
 *  outfit    see three/outfits.js
 *  station   prop built at their slot, see three/props.js
 *  duty      animation routine, see three/duties.js
 *  serve     per weapon system: { name, dish, line } — dish is the thing that flies
 *  complain  per weapon system when this struct is a CUSTOMER at someone else's place
 *  customer  how they look and are called when they visit a rival as a customer
 */
export const ROLES = {
  'Command Ship': {
    role: 'Manager', kind: 'staff', display: 'station', outfit: 'manager', station: 'managerDesk', duty: 'manage',
    blurb: 'Runs the floor. If the Manager isn’t in, nothing new gets hired or bought.',
    serve: {
      primaryWeapon: { name: 'Personal Touch', dish: 'cake', line: 'personally looked after' },
    },
    complain: {
      primaryWeapon: { name: 'Scathing Review', line: 'wrote a scathing note about' },
    },
    drive: { name: 'Walk the Floor', blurb: 'Move the Manager to another area of the restaurant.' },
    customer: { persona: 'Food Critic', outfit: 'critic', blurb: 'Satisfy the critic and the whole party goes home.' },
  },
  'Battleship': {
    role: 'Bartender', kind: 'staff', display: 'station', outfit: 'bartender', station: 'barTaps', duty: 'bartend',
    blurb: 'Pours for the bar — and slides drinks all the way back to the kitchen.',
    serve: {
      primaryWeapon: { name: 'Slide a Drink Down the Line', dish: 'cocktail', line: 'slid a drink to' },
      secondaryWeapon: { name: 'Shake a Cocktail', dish: 'cocktail', line: 'shook a cocktail for' },
    },
    complain: {
      primaryWeapon: { name: 'Send It Back!', line: 'sent a drink back at' },
      secondaryWeapon: { name: '“Too Much Ice!”', line: 'grumbled “too much ice” at' },
    },
    customer: { persona: 'Cocktail Snob', outfit: 'snob' },
  },
  'Starfighter': {
    role: 'Barista', kind: 'staff', display: 'station', outfit: 'barista', station: 'espresso', duty: 'barista',
    blurb: 'Quick hands on the espresso machine. Can pull a triple-shot rush.',
    serve: {
      primaryWeapon: { name: 'Latte Art', dish: 'coffee', line: 'poured latte art for' },
      secondaryWeapon: { name: 'Triple-Shot Rush', dish: 'coffee', line: 'rushed three shots to' },
    },
    complain: {
      primaryWeapon: { name: '“Burnt Beans!”', line: 'complained about burnt beans to' },
      secondaryWeapon: { name: 'Rapid-Fire Nitpicks', line: 'fired off three nitpicks at' },
    },
    customer: { persona: 'Caffeine Fiend', outfit: 'jittery' },
  },
  'Frigate': {
    role: 'Cashier', kind: 'staff', display: 'station', outfit: 'cashier', station: 'register', duty: 'cashier',
    blurb: 'Rings up the counter and calls orders across the dining room.',
    serve: {
      primaryWeapon: { name: 'Ring Up an Order', dish: 'receipt', line: 'rang up an order for' },
    },
    complain: {
      primaryWeapon: { name: '“That’s Not the Price!”', line: 'argued the price with' },
    },
    customer: { persona: 'Coupon Collector', outfit: 'coupon' },
  },
  'Pursuit Fighter': {
    role: 'Busser', kind: 'staff', display: 'station', outfit: 'busser', station: 'busStation', duty: 'bus',
    blurb: 'Zips between tables. Hard to pin down.',
    serve: {
      primaryWeapon: { name: 'Clear the Table', dish: 'napkin', line: 'cleared the table for' },
    },
    complain: {
      primaryWeapon: { name: '“Sticky Table!”', line: 'pointed out a sticky table to' },
    },
    customer: { persona: 'Table Hopper', outfit: 'hopper' },
  },
  'Stealth Bomber': {
    role: 'Host', kind: 'staff', display: 'station', outfit: 'host', station: 'hostStand', duty: 'host',
    blurb: 'Can melt into the crowd. Sends comp desserts back to the kitchen counters.',
    serve: {
      primaryWeapon: { name: 'Send a Comp Dessert', dish: 'pudding', line: 'sent a comp dessert to' },
    },
    complain: {
      primaryWeapon: { name: 'Secret-Shopper Report', line: 'filed a secret-shopper report on' },
    },
    customer: { persona: 'Mystery Diner', outfit: 'mystery' },
  },
  'High Altitude Interceptor': {
    role: 'Server', kind: 'staff', display: 'station', outfit: 'server', station: 'serverStation', duty: 'serve',
    blurb: 'Takes orders across the dining room and the bar. Swerves around flying trouble.',
    serve: {
      primaryWeapon: { name: 'Take the Order', dish: 'plate', line: 'took the order for' },
    },
    complain: {
      primaryWeapon: { name: '“Where’s My Food?!”', line: 'demanded their food from' },
    },
    customer: { persona: 'Hangry Diner', outfit: 'hangry' },
  },
  'Mobile Artillery': {
    role: 'Fry Cook', kind: 'staff', display: 'station', outfit: 'fryCook', station: 'fryer', duty: 'fry',
    blurb: 'Lobs baskets of fries from behind the line. Nobody can snap back at them.',
    serve: {
      primaryWeapon: { name: 'Basket of Fries', dish: 'fries', line: 'lobbed a basket of fries to' },
    },
    complain: {
      primaryWeapon: { name: '“Soggy Fries!”', line: 'held up a soggy fry at' },
    },
    customer: { persona: 'Fry Fanatic', outfit: 'fanatic' },
  },
  'Tank': {
    role: 'Line Cook', kind: 'staff', display: 'station', outfit: 'lineCook', station: 'stove', duty: 'cook',
    blurb: 'Tough as a cast-iron pan. Shrugs off part of every complaint.',
    serve: {
      primaryWeapon: { name: 'Fire Up a Plate', dish: 'steak', line: 'fired up a plate for' },
    },
    complain: {
      primaryWeapon: { name: '“Overcooked!”', line: 'called their plate overcooked to' },
    },
    customer: { persona: 'Chef’s-Counter Foodie', outfit: 'foodie' },
  },
  'SAM Launcher': {
    role: 'Baker', kind: 'staff', display: 'station', outfit: 'baker', station: 'oven', duty: 'bake',
    blurb: 'Tosses fresh pastries out to the bar and the dining room.',
    serve: {
      primaryWeapon: { name: 'Toss a Fresh Pastry', dish: 'croissant', line: 'tossed a warm pastry to' },
    },
    complain: {
      primaryWeapon: { name: '“Stale Croissant!”', line: 'waved a stale croissant at' },
    },
    customer: { persona: 'Sweet Tooth', outfit: 'sweetTooth' },
  },
  'Cruiser': {
    role: 'Pot Washer', kind: 'staff', display: 'station', outfit: 'potWasher', station: 'potSink', duty: 'scrub',
    blurb: 'Scrubs pots for the line and the pit, and can spray-rinse out into the dining room.',
    serve: {
      primaryWeapon: { name: 'Scrub a Pot Spotless', dish: 'pot', line: 'scrubbed a pot spotless for' },
      secondaryWeapon: { name: 'Polish the Silverware', dish: 'spoon', line: 'polished the silverware for' },
    },
    complain: {
      primaryWeapon: { name: '“Grimy Pot!”', line: 'found a grimy pot and showed' },
      secondaryWeapon: { name: '“Spotty Spoon!”', line: 'held up a spotty spoon at' },
    },
    customer: { persona: 'Health Inspector', outfit: 'inspector' },
  },
  'Destroyer': {
    role: 'Dishwasher', kind: 'staff', display: 'station', outfit: 'dishwasher', station: 'dishSink', duty: 'wash',
    blurb: 'Sparkling plates for the dining room. Answers back hard when crowded.',
    serve: {
      primaryWeapon: { name: 'Sparkling Plates', dish: 'cleanPlate', line: 'set out sparkling plates for' },
    },
    complain: {
      primaryWeapon: { name: '“Water Spots!”', line: 'pointed out water spots to' },
    },
    customer: { persona: 'Germaphobe', outfit: 'germaphobe' },
  },
  'Submersible': {
    role: 'Kitchen Porter', kind: 'staff', display: 'station', outfit: 'porter', station: 'crates', duty: 'porter',
    blurb: 'Hauls crates from the back door all the way to the bar. Can duck into the walk-in.',
    serve: {
      primaryWeapon: { name: 'Restock the Shelves', dish: 'crate', line: 'restocked the shelves for' },
    },
    complain: {
      primaryWeapon: { name: '“Missing Order Slip!”', line: 'waved a missing order slip at' },
    },
    customer: { persona: 'Delivery Driver', outfit: 'driver' },
  },

  /* ── Planetary ─────────────────────────────────────────────────────────── */
  'Ore Extractor': {
    role: 'Chef', kind: 'staff', display: 'station', outfit: 'chef', station: 'prepTable', duty: 'chef',
    blurb: 'Experiments in the kitchen and discovers new recipes.',
    job: { name: 'Recipe testing', done: 'discovered a new recipe' },
  },
  'Ore Refinery': {
    role: 'Sous Chef', kind: 'staff', display: 'station', outfit: 'sousChef', station: 'plating', duty: 'sous',
    blurb: 'Perfects recipes into dishes that sell for gold.',
    job: { name: 'Perfecting a recipe', done: 'turned a recipe into gold' },
  },
  'Planetary Defense Cannon': {
    role: 'Swing Cook', kind: 'staff', display: 'station', outfit: 'swingCook', station: 'swingStation', duty: 'swing',
    blurb: 'Jumps in to serve any challenger who complains here.',
  },
  'Ore Bunker': {
    role: 'Extra Freezer', kind: 'equipment', display: 'station', station: 'freezer',
    blurb: 'Keeps recipes frozen and safe from copycats.',
  },
  'Jamming Satellite': {
    role: 'Lucky Cat', kind: 'equipment', display: 'station', station: 'luckyCat',
    blurb: 'A waving good-luck cat. Knocks incoming complaints off course.',
  },
  'Orbital Shield Generator': {
    role: 'Soft-Serve Machine', kind: 'equipment', display: 'station', station: 'softServe',
    blurb: 'Free cones build your reputation, so copying your recipes takes longer.',
  },
  'Field Generator': {
    role: 'Light-Up Pole Sign', kind: 'equipment', display: 'outside', station: 'poleSign',
    blurb: 'Glows by the curb and brings in cash. Invest gold to keep it lit.',
  },
  'Continental Power Plant': {
    role: 'Sign Spinner', kind: 'staff', display: 'outside', outfit: 'spinner', station: 'spinnerSpot', duty: 'spin',
    blurb: 'Spins an arrow sign on the sidewalk. Brings in lots of cash.',
  },
  'World Engine': {
    role: 'Influencer', kind: 'staff', display: 'roam', outfit: 'influencer', station: 'ringLight', duty: 'influence',
    blurb: 'Wanders the restaurant taking selfies and food shots. Brings in huge cash.',
  },
};

export const UNKNOWN_ROLE = {
  role: 'New Hire', kind: 'staff', display: 'station', outfit: 'casual', station: 'none', duty: 'idle',
  blurb: 'Someone new. We haven’t written their job description yet.',
  serve: { primaryWeapon: { name: 'Help Out', dish: 'plate', line: 'helped' }, secondaryWeapon: { name: 'Help Out', dish: 'plate', line: 'helped' } },
  complain: { primaryWeapon: { name: 'Complain', line: 'complained to' }, secondaryWeapon: { name: 'Complain', line: 'complained to' } },
  customer: { persona: 'Customer', outfit: 'casual' },
};

export function roleOf(typeOrName) {
  const name = typeof typeOrName === 'string' ? typeOrName : typeOrName?.type;
  return ROLES[name] || UNKNOWN_ROLE;
}

/** Hiring catalogue sections. */
export const CATALOG_SECTIONS = [
  { key: 'space', title: 'Bar & Counter', note: 'Front of house' },
  { key: 'air', title: 'Dining Room', note: 'Front of house' },
  { key: 'land', title: 'Cooking Line', note: 'Back of house' },
  { key: 'water', title: 'Dish Pit', note: 'Back of house' },
  { key: 'kitchen', title: 'Kitchen Team & Gear', note: 'Stays at the restaurant' },
  { key: 'curb', title: 'Out Front & Marketing', note: 'Brings in cash' },
];

export function catalogSection(type) {
  if (type.category === 'fleet') {
    if (type.type === 'Command Ship') return null; // gifted, never hired
    const mask = type.possibleAmbit;
    for (const a of ['space', 'air', 'land', 'water']) if (mask === { space: 16, air: 8, land: 4, water: 2 }[a]) return a;
    return 'space';
  }
  if (['Field Generator', 'Continental Power Plant', 'World Engine'].includes(type.type)) return 'curb';
  return 'kitchen';
}
