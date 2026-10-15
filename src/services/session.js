/**
 * Forget this browser's guild sign-in: the structs-webapp core's saved session
 * (`gameState`), its signing queue and its API cache. À la Structs' own
 * preferences and the demo kitchen stay.
 */
export function forgetSession() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('aLaStructs.') || k.startsWith('pawsAndPlates.')) continue;
      localStorage.removeItem(k);
    }
  } catch (e) { /* storage unavailable */ }
}
