/**
 * À la Structs vocabulary.
 *
 * Every word the player sees comes from here. The game underneath is Structs,
 * unchanged — these are only the names we give its pieces. If you are reading
 * this to find where something lives on chain, the right-hand comments say.
 */

export const BRAND = {
  name: 'À la Structs',
  short: 'ÀLS',
  tagline: 'Run a cozy critter restaurant. Out-serve the rivals across town.',
};

export const TERMS = {
  player: 'Owner',                 // Player
  players: 'Owners',
  guild: 'Restaurant Group',       // Guild
  guildShort: 'Group',
  planet: 'Restaurant',            // Planet
  fleet: 'Crew',                   // Fleet
  struct: 'Staff',                 // Struct (people)
  equipment: 'Equipment',          // planetary non-staff structs
  commandShip: 'Manager',          // Command Ship
  alpha: 'Gold',                   // Alpha Matter
  ore: 'Recipes',                  // Ore
  oreOne: 'Recipe',
  undiscoveredOre: 'Undiscovered Recipes',
  energy: 'Cash',                  // Energy (watts)
  capacity: 'Takings',             // capacity: energy coming in
  load: 'Wages & Bills',           // load: energy drawn
  charge: 'Hustle',                // charge (blocks since last action)
  block: 'Tick',                   // block
  raid: 'Service Challenge',       // raid
  raider: 'Challenger',
  defender: 'Host Restaurant',
  ambit: 'Area',
  health: 'Morale',
  customerHealth: 'Needs',
  build: 'Hire',
  buildEquipment: 'Buy',
  explore: 'Open a New Restaurant',
  infuse: 'Invest Gold',
  reactor: 'Bank',
};

/** Struct status words. Staff and equipment talk differently. */
export const STATUS_WORDS = {
  staff: {
    building: 'Onboarding',
    online: 'On shift',
    offline: 'Off shift',
    hidden: 'Blending in',
    destroyed: 'Fired',
    defending: 'Covering',
    away: 'Out on a challenge',
  },
  equipment: {
    building: 'Being delivered',
    online: 'Running',
    offline: 'Switched off',
    hidden: 'Hidden',
    destroyed: 'Broken',
    defending: 'Guarding',
    away: 'Away',
  },
};

/** Generic action names (per-role names live in roles.js). */
export const ACTIONS = {
  activate: { staff: 'Clock in', equipment: 'Switch on' },
  deactivate: { staff: 'Clock out', equipment: 'Switch off' },
  defenseSet: 'Cover for…',
  defenseClear: 'Stop covering',
  move: 'Walk the floor',
  stealthOn: 'Blend in',
  stealthOff: 'Step out',
  cancelBuild: { staff: 'Cancel onboarding', equipment: 'Cancel delivery' },
  attackAsHost: 'Serve',          // attack while defending your own restaurant
  attackAsGuest: 'Complain',      // attack while challenging someone else's
  fleetAway: 'Send the crew',     // fleet move to a rival planet
  fleetHome: 'Call the crew home',
  raidComplete: 'Copy their recipes',
};

/** Raid status → what the player reads. */
export const CHALLENGE_STATUS = {
  initiated: 'Crew has arrived',
  ongoing: 'Service in progress',
  attackerDefeated: 'Critic satisfied — the party went home',
  raidSuccessful: 'Recipes copied!',
  demilitarized: 'Kitchen closed for the night',
  attackerRetreated: 'Crew headed home',
};

/** Unit defenses. */
export const DEFENSES = {
  armour: { name: 'Thick Skin', blurb: 'Every complaint lands one point softer.' },
  defensiveManeuver: { name: 'Swift Swerve', blurb: 'Often dodges tossed complaints (unguided).' },
  indirectCombatModule: { name: 'Behind the Line', blurb: 'Works from the back. Customers can’t snap back at them.' },
  signalJamming: { name: 'Smooth Talker', blurb: 'Often talks their way out of direct complaints (guided).' },
  stealthMode: { name: 'Blend In', blurb: 'Can disappear into the crowd. Only reachable from the same area while hidden.' },
  noUnitDefenses: { name: 'No special tricks', blurb: '' },
};

/** Passive weaponry (counter attacks). */
export const COUNTERS = {
  counterAttack: { name: 'Quick Fix', blurb: 'Answers a complaint straight back.' },
  strongCounterAttack: { name: 'Smooth Talk', blurb: 'Answers complaints firmly — and it stings.' },
  advancedCounterAttack: { name: 'Squeaky-Clean Comeback', blurb: 'Hits back hard at anyone in the same area.' },
  noPassiveWeaponry: { name: 'Keeps quiet', blurb: 'Doesn’t answer back.' },
};

/** Weapon control flavour (shown in tooltips). */
export const CONTROL = {
  guided: 'Personal (guided)',
  unguided: 'Tossed (unguided)',
  noWeaponControl: '',
};

export function plural(n, one, many) { return `${n} ${n === 1 ? one : (many || one + 's')}`; }
