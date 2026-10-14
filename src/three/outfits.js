/**
 * What everyone wears. Staff outfits are per role; customers get a casual
 * look plus a signature piece for their persona.
 */
export const OUTFITS = {
  manager:    { shirt: '#3f4a6b', sleeves: '#3f4a6b', pants: '#2c3047', lapel: '#f6f1e7', neck: 'tie', neckColor: '#e85d75', badge: true, hold: 'clipboard' },
  chef:       { shirt: '#fbfbf7', sleeves: '#fbfbf7', pants: '#38343c', buttons: '#2f2b33', hat: 'toque', hatColor: '#ffffff', neck: 'neckerchief', neckColor: '#e8505b', hold: 'whisk' },
  sousChef:   { shirt: '#fbfbf7', sleeves: '#fbfbf7', pants: '#38343c', buttons: '#2f2b33', trim: '#2f2b33', hat: 'toqueShort', hatColor: '#ffffff', hold: 'spatula' },
  swingCook:  { shirt: '#fbfbf7', sleeves: '#fbfbf7', pants: '#3a5a8c', apron: '#5aa9e6', apronStyle: 'waist', hat: 'bandana', hatColor: '#f2a65a', hold: 'spatula' },
  lineCook:   { shirt: '#fbfbf7', sleeves: '#fbfbf7', pants: '#2c2c35', apron: '#4a4a55', apronStyle: 'full', hat: 'skullcap', hatColor: '#2f2f3a', hold: 'pan' },
  fryCook:    { shirt: '#f5cf4a', sleeves: '#f5cf4a', pants: '#b23a48', hat: 'paper', hatColor: '#ffffff', apron: '#ffffff', apronStyle: 'waist', hold: 'basket' },
  baker:      { shirt: '#fff6ea', sleeves: '#fff6ea', pants: '#9a7b5a', apron: '#f7c6d0', apronStyle: 'full', hat: 'baker', hatColor: '#ffffff', hold: 'rollingPin' },
  server:     { shirt: '#ffffff', sleeves: '#ffffff', pants: '#25252d', vest: '#25252d', neck: 'bowtie', neckColor: '#c0392b', hold: 'notepad' },
  busser:     { shirt: '#7cc6a4', sleeves: '#7cc6a4', pants: '#4b4f5c', apron: '#3d4250', apronStyle: 'waist', hat: 'cap', hatColor: '#3d4250', hold: 'tub' },
  host:       { shirt: '#f3e6ff', sleeves: '#f3e6ff', pants: '#3e3156', vest: '#6d55a3', neck: 'scarf', neckColor: '#d4a5ff', hold: 'menus' },
  bartender:  { shirt: '#ffffff', sleeves: '#ffffff', pants: '#2b2b33', vest: '#1f6f78', neck: 'bowtie', neckColor: '#1f6f78', hold: 'shaker' },
  barista:    { shirt: '#f2efe6', sleeves: '#f2efe6', pants: '#4d4038', apron: '#2f7d5a', apronStyle: 'full', hat: 'beret', hatColor: '#5a3e36', hold: 'cup' },
  cashier:    { shirt: '#ffcf5a', sleeves: '#ffcf5a', pants: '#3a4157', hat: 'visor', hatColor: '#e85d75', badge: true, hold: null },
  dishwasher: { shirt: '#c8e7ff', sleeves: '#c8e7ff', pants: '#3b4b63', apron: '#2e86c1', apronStyle: 'full', hat: 'hairnet', hatColor: '#e9f3ff', gloves: '#ffd23f', hold: 'sponge' },
  potWasher:  { shirt: '#d6e6d6', sleeves: '#d6e6d6', pants: '#3d4a3d', apron: '#5a6b5a', apronStyle: 'full', hat: 'bandana', hatColor: '#4fbfa8', gloves: '#ffd23f', hold: 'pot' },
  porter:     { shirt: '#f2a65a', sleeves: '#f2a65a', pants: '#3b5998', overalls: '#3b5998', hat: 'capBack', hatColor: '#e85d75', gloves: '#c9a27a', hold: 'crate' },
  spinner:    { shirt: '#ff4d6d', sleeves: '#ff4d6d', pants: '#2d3047', hat: 'capBack', hatColor: '#ffd23f', glasses: 'sun', hold: 'arrowSign' },
  influencer: { shirt: '#ffb3d1', sleeves: '#ff7ab8', pants: '#c3f0ff', jacket: '#b18cf2', glasses: 'heart', hat: 'beanie', hatColor: '#b18cf2', hold: 'phone' },

  /* customers */
  casual:     { shirt: '#9ad0ec', sleeves: '#9ad0ec', pants: '#5b6170' },
  critic:     { shirt: '#3a2e39', sleeves: '#3a2e39', pants: '#2a2229', neck: 'scarf', neckColor: '#c9184a', hat: 'beret', hatColor: '#1d1a1f', glasses: 'monocle', hold: 'notebook' },
  snob:       { shirt: '#f5f0e1', sleeves: '#f5f0e1', pants: '#7a6a53', neck: 'bowtie', neckColor: '#7b2cbf', glasses: 'round', hold: 'cocktail' },
  jittery:    { shirt: '#ff9f5a', sleeves: '#ff9f5a', pants: '#3c3c4c', hat: 'beanie', hatColor: '#3c3c4c', hold: 'cup' },
  coupon:     { shirt: '#fdffb6', sleeves: '#fdffb6', pants: '#6c757d', glasses: 'round', hold: 'receipt' },
  hopper:     { shirt: '#caffbf', sleeves: '#caffbf', pants: '#4361ee', hat: 'cap', hatColor: '#4361ee', hold: null },
  mystery:    { shirt: '#4a4e69', sleeves: '#4a4e69', pants: '#22223b', hat: 'fedora', hatColor: '#22223b', glasses: 'sun', hold: 'notebook' },
  hangry:     { shirt: '#ffadad', sleeves: '#ffadad', pants: '#5c4d7d', hold: 'fork' },
  fanatic:    { shirt: '#ffd166', sleeves: '#ffd166', pants: '#ef476f', hat: 'cap', hatColor: '#ef476f', hold: 'fries' },
  foodie:     { shirt: '#bde0fe', sleeves: '#bde0fe', pants: '#3d405b', glasses: 'round', neck: 'scarf', neckColor: '#e07a5f', hold: 'phone' },
  sweetTooth: { shirt: '#ffc8dd', sleeves: '#ffc8dd', pants: '#a2d2ff', hat: 'beanie', hatColor: '#ff8fab', hold: 'cone' },
  inspector:  { shirt: '#ffffff', sleeves: '#ffffff', pants: '#2b2d42', hat: 'hairnet', hatColor: '#e9f3ff', neck: 'tie', neckColor: '#2b2d42', hold: 'clipboard' },
  germaphobe: { shirt: '#d8f3dc', sleeves: '#d8f3dc', pants: '#40916c', gloves: '#b7e4c7', mask: true, hold: null },
  driver:     { shirt: '#e63946', sleeves: '#e63946', pants: '#1d3557', hat: 'cap', hatColor: '#1d3557', hold: 'crate' },
};

/** Random casual palettes for ambient diners and passers-by. */
export const CASUAL_SHIRTS = ['#9ad0ec', '#ffadad', '#ffd6a5', '#caffbf', '#bdb2ff', '#ffc6ff', '#a0c4ff', '#fdffb6', '#f1c0e8', '#90dbf4', '#b9fbc0', '#fbf8cc'];
export const CASUAL_PANTS = ['#5b6170', '#3d405b', '#6c757d', '#4361ee', '#7a6a53', '#2b2d42', '#81b29a'];
export const CASUAL_HATS = [null, null, null, 'cap', 'beanie', 'beret', 'fedora', 'bandana'];

export function casualOutfit(r) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const shirt = pick(CASUAL_SHIRTS);
  return { shirt, sleeves: shirt, pants: pick(CASUAL_PANTS), hat: pick(CASUAL_HATS), hatColor: pick(CASUAL_PANTS), hold: null };
}
