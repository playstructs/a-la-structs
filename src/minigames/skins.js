/**
 * Uniforms won in shift practice. Each crew role has three, one per star:
 * 1★ a new colourway, 2★ a sharper look with an accessory, 3★ the golden
 * one. A skin is a patch over the role's standard outfit (three/outfits.js).
 *
 * The owner picks one per role and every critter in that role wears it.
 * The pick is a cosmetic preference kept in this browser; what's unlocked
 * comes from the saved best scores.
 */
import { OUTFITS } from '../three/outfits.js';
import { GAMES, starsFor } from './registry.js';

const GOLD = '#f2c14e';

export const SKINS = {
  lineCook: [
    { name: 'Cast Iron', patch: { apron: '#8c3b2e', hatColor: '#8c3b2e', pants: '#3b2a26' } },
    { name: 'Blue Flame', patch: { shirt: '#dff1ff', sleeves: '#dff1ff', apron: '#2f6fb3', hat: 'bandana', hatColor: '#5ab3e8', neck: 'neckerchief', neckColor: '#2f6fb3' } },
    { name: 'Golden Spatula', patch: { apron: GOLD, hat: 'crown', hatColor: GOLD, pin: '#ff7a8a', hold: 'spatula' } },
  ],
  fryCook: [
    { name: 'Ketchup & Mustard', patch: { shirt: '#e63946', sleeves: '#e63946', pants: '#f5cf4a', apron: '#fff3d6' } },
    { name: 'Onion Ring', patch: { shirt: '#f4a259', sleeves: '#f4a259', hat: 'cap', hatColor: '#7a4b2a', apron: '#7a4b2a', glasses: 'round' } },
    { name: 'Golden Basket', patch: { shirt: '#fff3c4', sleeves: '#fff3c4', apron: GOLD, hat: 'crown', hatColor: GOLD, pin: '#e63946' } },
  ],
  host: [
    { name: 'Evening Plum', patch: { shirt: '#ffe4f2', sleeves: '#ffe4f2', vest: '#7b2c5f', neckColor: '#ff9ecf' } },
    { name: 'Velvet Rope', patch: { shirt: '#1f1d2b', sleeves: '#1f1d2b', vest: '#b3123b', neck: 'bowtie', neckColor: '#f2c14e', glasses: 'round' } },
    { name: 'Red Carpet', patch: { shirt: '#fff8e6', sleeves: '#fff8e6', vest: GOLD, neck: 'bowtie', neckColor: '#b3123b', hat: 'crown', hatColor: GOLD } },
  ],
  busser: [
    { name: 'Mint Tub', patch: { shirt: '#bdf0de', sleeves: '#bdf0de', hatColor: '#2e8b6e', apron: '#2e8b6e' } },
    { name: 'Speed Runner', patch: { shirt: '#ff9f1c', sleeves: '#ff9f1c', hat: 'capBack', hatColor: '#1d3557', glasses: 'sun', apron: '#1d3557' } },
    { name: 'Golden Tub', patch: { shirt: '#fff6d6', sleeves: '#fff6d6', apron: GOLD, hat: 'crown', hatColor: GOLD, pin: '#5fc293' } },
  ],
  server: [
    { name: 'Bistro Stripe', patch: { shirt: '#f1f6ff', sleeves: '#f1f6ff', vest: '#2b4c7e', neckColor: '#e85d75' } },
    { name: 'Midnight Service', patch: { shirt: '#2a2a35', sleeves: '#2a2a35', vest: '#11111a', neck: 'tie', neckColor: '#b18cf2', glasses: 'round' } },
    { name: 'Silver Service', patch: { shirt: '#ffffff', sleeves: '#ffffff', vest: GOLD, neckColor: '#2b2d42', hat: 'crown', hatColor: GOLD } },
  ],
  dishwasher: [
    { name: 'Sea Foam', patch: { shirt: '#c9f2e3', sleeves: '#c9f2e3', apron: '#1b998b', gloves: '#ff7a8a' } },
    { name: 'Bubble Bath', patch: { shirt: '#ffd6ec', sleeves: '#ffd6ec', apron: '#b18cf2', hat: 'beanie', hatColor: '#b18cf2', gloves: '#5ab3e8', glasses: 'heart' } },
    { name: 'Sparkle Gold', patch: { shirt: '#fffbe8', sleeves: '#fffbe8', apron: GOLD, gloves: GOLD, hat: 'crown', hatColor: GOLD } },
  ],
  barista: [
    { name: 'Oat Milk', patch: { shirt: '#fff8ec', sleeves: '#fff8ec', apron: '#c8a27a', hatColor: '#8a6a4d' } },
    { name: 'Cold Brew', patch: { shirt: '#2f2724', sleeves: '#2f2724', apron: '#d4a373', hat: 'beanie', hatColor: '#d4a373', glasses: 'round' } },
    { name: 'Golden Crema', patch: { shirt: '#fffaf0', sleeves: '#fffaf0', apron: GOLD, hat: 'crown', hatColor: GOLD, pin: '#5a3e36' } },
  ],
  cashier: [
    { name: 'Receipt Roll', patch: { shirt: '#fffdf5', sleeves: '#fffdf5', hatColor: '#5ab3e8', pants: '#5b6170' } },
    { name: 'Coin Purse', patch: { shirt: '#8fd694', sleeves: '#8fd694', hat: 'cap', hatColor: '#2b6e45', neck: 'tie', neckColor: '#2b6e45', glasses: 'round' } },
    { name: 'Golden Till', patch: { shirt: '#fff3c4', sleeves: '#fff3c4', vest: GOLD, hat: 'crown', hatColor: GOLD } },
  ],
  bartender: [
    { name: 'Copper Still', patch: { vest: '#b5651d', neckColor: '#b5651d' } },
    { name: 'Neon Night', patch: { shirt: '#2b2140', sleeves: '#2b2140', vest: '#ff4fa3', neckColor: '#5ef0ff', glasses: 'sun' } },
    { name: 'Gold Rim', patch: { vest: GOLD, neckColor: '#1f6f78', hat: 'crown', hatColor: GOLD } },
  ],
  baker: [
    { name: 'Rye & Caraway', patch: { shirt: '#f4ead5', sleeves: '#f4ead5', apron: '#a47148', pants: '#5c4033' } },
    { name: 'Macaron', patch: { shirt: '#e3f6f5', sleeves: '#e3f6f5', apron: '#ffb5c2', hat: 'beret', hatColor: '#b8e0d2', neck: 'scarf', neckColor: '#ffb5c2' } },
    { name: 'Golden Crust', patch: { shirt: '#fff6e0', sleeves: '#fff6e0', apron: GOLD, hat: 'crown', hatColor: GOLD, pin: '#a47148' } },
  ],
  potWasher: [
    { name: 'Copper Bottom', patch: { shirt: '#f0dcc8', sleeves: '#f0dcc8', apron: '#b87333', hatColor: '#b87333' } },
    { name: 'Steam Cloud', patch: { shirt: '#e8eef5', sleeves: '#e8eef5', apron: '#6c7a89', hat: 'beanie', hatColor: '#9fb3c8', gloves: '#5ab3e8', glasses: 'round' } },
    { name: 'Gilded Pot', patch: { shirt: '#fff8e1', sleeves: '#fff8e1', apron: GOLD, gloves: GOLD, hat: 'crown', hatColor: GOLD } },
  ],
  porter: [
    { name: 'Loading Dock', patch: { shirt: '#c7d3dd', sleeves: '#c7d3dd', overalls: '#5c6b73', pants: '#5c6b73', hatColor: '#ff9f1c' } },
    { name: 'Night Delivery', patch: { shirt: '#1d3557', sleeves: '#1d3557', overalls: '#e63946', pants: '#e63946', hat: 'beanie', hatColor: '#f1faee', glasses: 'sun' } },
    { name: 'Golden Crate', patch: { overalls: GOLD, pants: GOLD, hat: 'crown', hatColor: GOLD, gloves: '#ffffff' } },
  ],
};

const TIER_WORDS = ['Standard', 'Bronze', 'Silver', 'Gold'];
export const tierWord = (n) => TIER_WORDS[n] || '';

/* ── who wears what ──────────────────────────────────────────────────── */

let worn = {};        // outfit key → tier 1..3 (absent = standard)
let best = {};        // game key → best score
const listeners = new Set();

const GAME_BY_OUTFIT = new Map(GAMES.map((g) => [g.outfit, g]));

/** The App hands over the saved picks and best scores. */
export function setSkinState({ picks, scores } = {}) {
  if (picks) worn = { ...picks };
  if (scores) best = { ...scores };
  listeners.forEach((fn) => fn());
}
export function onSkinChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function skinPicks() { return { ...worn }; }

/** Highest tier unlocked for a role's outfit key. */
export function unlockedTier(outfitKey) {
  const g = GAME_BY_OUTFIT.get(outfitKey);
  return g ? starsFor(g, best[g.key] || 0) : 0;
}

/** Tier the role is wearing, never above what's unlocked. */
export function wornTier(outfitKey) {
  return Math.min(worn[outfitKey] || 0, unlockedTier(outfitKey));
}

/** The outfit for a role key at a tier (0 = standard). */
export function outfitAt(outfitKey, tier) {
  const base = OUTFITS[outfitKey] || OUTFITS.casual;
  const skin = tier > 0 ? SKINS[outfitKey]?.[tier - 1] : null;
  return skin ? { ...base, ...skin.patch } : base;
}

/** What my critters in this role wear right now. */
export function myOutfit(outfitKey) { return outfitAt(outfitKey, wornTier(outfitKey)); }
