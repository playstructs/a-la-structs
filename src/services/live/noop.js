/**
 * An object that quietly accepts anything: any property, any call, any `new`.
 * Stands in for the webapp's own screens (see scripts/structs-shim.mjs), so the
 * game core can tell its old UI to "render" and nothing happens.
 */
const handler = {
  get(target, prop) {
    if (prop === 'then') return undefined;                // never look like a promise
    if (prop === Symbol.toPrimitive) return () => '';
    if (prop === Symbol.iterator) return function* empty() {};
    if (prop === 'toString' || prop === 'valueOf') return () => '';
    if (prop === 'length') return 0;
    if (prop === '__isNoop') return true;
    if (prop in target.store) return target.store[prop];
    return NOOP;
  },
  set(target, prop, value) { target.store[prop] = value; return true; },
  apply() { return NOOP; },
  construct() { return makeNoop('instance'); },
  has() { return true; },
};

function make(label) {
  const fn = function noop() {};
  fn.store = {};
  fn.label = label;
  return new Proxy(fn, handler);
}

const NOOP = make('noop');

export function makeNoop(label = 'noop') { return make(label); }
export default NOOP;
