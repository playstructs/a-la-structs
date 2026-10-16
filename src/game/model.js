/**
 * The restaurant's view of Structs data.
 *
 * Both backends (the offline demo kitchen and a live guild) hand the UI the
 * same shapes, defined here. Struct types keep the chain's camelCase field
 * names (as served by the LCD and used by the desktop simulator) so the combat
 * helpers can be shared with structsd's transcribed rules.
 */
import { normalizeAmbit, AMBIT_FLAG, AREA_ORDER } from '../lexicon/areas.js';
import { roleOf } from '../lexicon/roles.js';
import { nameFor, speciesFor } from '../lexicon/names.js';

export const STATUS = { MATERIALIZED: 1, BUILT: 2, ONLINE: 4, STORED: 8, HIDDEN: 16, DESTROYED: 32, LOCKED: 64 };
export const COMMAND = 'Command Ship';

const snakeToCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

/** Webapp StructType (snake_case) or LCD type (camelCase) → camelCase type. */
export function normalizeType(t) {
  if (!t) return null;
  const out = {};
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === 'function') continue;
    out[k.includes('_') ? snakeToCamel(k) : k] = v;
  }
  const num = (k) => { if (out[k] != null && out[k] !== '') out[k] = Number(out[k]); };
  ['id', 'buildLimit', 'buildDifficulty', 'buildDraw', 'maxHealth', 'passiveDraw', 'possibleAmbit',
    'primaryWeaponCharge', 'primaryWeaponAmbits', 'primaryWeaponTargets', 'primaryWeaponShots', 'primaryWeaponDamage',
    'primaryWeaponRecoilDamage', 'primaryWeaponShotSuccessRateNumerator', 'primaryWeaponShotSuccessRateDenominator',
    'secondaryWeaponCharge', 'secondaryWeaponAmbits', 'secondaryWeaponTargets', 'secondaryWeaponShots', 'secondaryWeaponDamage',
    'secondaryWeaponRecoilDamage', 'secondaryWeaponShotSuccessRateNumerator', 'secondaryWeaponShotSuccessRateDenominator',
    'activateCharge', 'buildCharge', 'defendChangeCharge', 'moveCharge', 'stealthActivateCharge', 'attackReduction',
    'counterAttack', 'counterAttackSameAmbit', 'postDestructionDamage', 'generatingRate', 'planetaryShieldContribution',
    'oreMiningDifficulty', 'oreRefiningDifficulty', 'unguidedDefensiveSuccessRateNumerator', 'unguidedDefensiveSuccessRateDenominator',
    'guidedDefensiveSuccessRateNumerator', 'guidedDefensiveSuccessRateDenominator', 'primaryWeaponGuaranteedShots',
    'secondaryWeaponGuaranteedShots', 'oreMiningCharge', 'oreRefiningCharge'].forEach(num);
  const bool = (k) => { if (out[k] != null) out[k] = out[k] === true || out[k] === 't' || out[k] === 'true' || out[k] === 1; };
  ['movable', 'slotBound', 'primaryWeaponBlockable', 'primaryWeaponCounterable', 'secondaryWeaponBlockable',
    'secondaryWeaponCounterable', 'attackCounterable', 'stealthSystems', 'triggerRaidDefeatByDestruction',
    'primaryWeaponArmourPiercing', 'secondaryWeaponArmourPiercing', 'canDefend', 'isCommand'].forEach(bool);
  // Every crew (fleet) struct can cover on chain. Guild APIs send this flag in
  // varying shapes (or not at all), so do what structs-webapp does and go by
  // the category; planetary structs keep whatever the data says.
  if (String(out.category || '').toLowerCase() === 'fleet') out.canDefend = true;
  else if (out.canDefend == null) out.canDefend = false;
  return out;
}

export class TypeCatalog {
  constructor(types = []) {
    this.byId = new Map();
    this.byName = new Map();
    types.forEach((t) => this.add(t));
  }
  add(t) {
    const n = normalizeType(t);
    if (!n) return;
    this.byId.set(Number(n.id), n);
    this.byName.set(n.type, n);
  }
  get(id) { return this.byId.get(Number(id)) || null; }
  named(name) { return this.byName.get(name) || null; }
  all() { return [...this.byId.values()].sort((a, b) => a.id - b.id); }
  get size() { return this.byId.size; }
}

/** Webapp Struct / simulator struct / demo struct → normalized struct. */
export function normalizeStruct(s, types) {
  if (!s) return null;
  const typeId = Number(s.typeId ?? s.type);
  const t = types?.get(typeId);
  return {
    id: String(s.id),
    typeId,
    owner: s.owner,
    locationType: s.locationType ?? s.location_type ?? 'planet',
    locationId: s.locationId ?? s.location_id ?? null,
    ambit: normalizeAmbit(s.ambit ?? s.operating_ambit ?? s.operatingAmbit) || 'land',
    slot: Number(s.slot ?? 0),
    health: s.health == null ? (t?.maxHealth ?? 3) : Number(s.health),
    maxHealth: t?.maxHealth ?? Number(s.maxHealth ?? 3),
    status: Number(s.status ?? (STATUS.MATERIALIZED | STATUS.BUILT | STATUS.ONLINE)),
    protects: s.protects ?? s.protectedStructId ?? s.protected_struct_id ?? null,
    destroyedAt: s.destroyedAt ?? s.destroyed_block ?? null,
    fuel: Number(s.fuel ?? 0),
    build: s.build || null,   // { startTick, doneTick, progress } while onboarding
  };
}

export const is = {
  built: (s) => (s.status & STATUS.BUILT) !== 0,
  online: (s) => (s.status & STATUS.ONLINE) !== 0,
  hidden: (s) => (s.status & STATUS.HIDDEN) !== 0,
  destroyed: (s) => (s.status & STATUS.DESTROYED) !== 0,
  materialized: (s) => (s.status & STATUS.MATERIALIZED) !== 0,
};

export function isCommand(t) { return t && t.type === COMMAND; }

/** Who this struct is in the restaurant world. */
export function persona(struct, type, { ownerSpecies } = {}) {
  const role = roleOf(type);
  const species = isCommand(type) && ownerSpecies ? ownerSpecies : speciesFor(struct.id);
  return { role, species, name: nameFor(struct.id), kind: role.kind };
}

/* ── Combat reach helpers (types/struct_type.go) ─────────────────────────── */

export function weaponField(t, ws, field) {
  return t[(ws === 'secondaryWeapon' ? 'secondaryWeapon' : 'primaryWeapon') + field];
}

export function hasWeapon(t, ws) {
  const w = weaponField(t, ws, '');
  return !!w && w !== 'noActiveWeaponry';
}

export function weaponReach(t, ws, fromAmbit) {
  let mask = weaponField(t, ws, 'Ambits') || 0;
  if (mask & AMBIT_FLAG.local) mask |= AMBIT_FLAG[fromAmbit];
  return AREA_ORDER.filter((a) => (mask & AMBIT_FLAG[a]) !== 0);
}

export function canReach(t, ws, fromAmbit, toAmbit) {
  return weaponReach(t, ws, fromAmbit).includes(toAmbit);
}

/** Areas a type may stand in. */
export function possibleAreas(t) {
  return AREA_ORDER.filter((a) => ((t?.possibleAmbit || 0) & AMBIT_FLAG[a]) !== 0);
}

/** The weapons a struct can use, shaped for the UI. */
export function weaponsOf(t) {
  return ['primaryWeapon', 'secondaryWeapon'].filter((ws) => hasWeapon(t, ws)).map((ws) => ({
    ws,
    charge: weaponField(t, ws, 'Charge') || 0,
    damage: weaponField(t, ws, 'Damage') || 0,
    shots: weaponField(t, ws, 'Shots') || 1,
    control: weaponField(t, ws, 'Control'),
    mask: weaponField(t, ws, 'Ambits') || 0,
    piercing: !!weaponField(t, ws, 'ArmourPiercing'),
  }));
}

/** Format energy (watts on chain) as cash. */
export function cash(n) {
  n = Number(n || 0);
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}

/** Alpha is stored in ualpha on chain; the webapp shows whole alpha. */
export function gold(n) {
  n = Number(n || 0);
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(0)}k`;
  return n.toLocaleString('en-US');
}
