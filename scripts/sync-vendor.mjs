#!/usr/bin/env node
/**
 * Copies the Structs game core this skin runs on into ./vendor, verbatim.
 *
 *   ../structs-webapp/src/js           → vendor/structs-webapp/js      (wallet, signing, GRASS, guild API, tasks/PoW)
 *   ../structs-desktop/frontend/sim*   → vendor/structs-desktop/       (the local structsd combat port + computer player)
 *
 * Nothing in vendor/ is edited by hand. The few places the webapp core reaches
 * into its own UI (MenuPage, map components, banners…) are swapped for inert
 * stand-ins at build time by the `structs-ui-shim` plugin in vite.config.js, so
 * re-running this script after a webapp update is all it takes to pick it up.
 *
 * Usage: node scripts/sync-vendor.mjs [webappDir] [desktopDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const webapp = path.resolve(process.argv[2] || path.join(root, '../structs-webapp'));
const desktop = path.resolve(process.argv[3] || path.join(root, '../structs-desktop'));

function copyDir(src, dst, filter = () => true) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name), d = path.join(dst, entry.name);
    if (!filter(s, entry)) continue;
    if (entry.isDirectory()) copyDir(s, d, filter);
    else fs.copyFileSync(s, d);
  }
}

const jsSrc = path.join(webapp, 'src/js');
if (!fs.existsSync(jsSrc)) { console.error('structs-webapp not found at', webapp); process.exit(1); }
const jsDst = path.join(root, 'vendor/structs-webapp/js');
fs.rmSync(jsDst, { recursive: true, force: true });
copyDir(jsSrc, jsDst, (s) => !s.includes(`${path.sep}tests${path.sep}`) && !s.endsWith(`${path.sep}tests`));
console.log('✓ structs-webapp core →', path.relative(root, jsDst));

const deskDst = path.join(root, 'vendor/structs-desktop');
fs.mkdirSync(deskDst, { recursive: true });
for (const f of ['simulator-chain.js', 'simulator-ai.js', 'simulator-types.js']) {
  const s = path.join(desktop, 'frontend', f);
  if (fs.existsSync(s)) { fs.copyFileSync(s, path.join(deskDst, f)); console.log('✓', f); }
  else console.warn('! missing', s);
}
fs.writeFileSync(path.join(root, 'vendor/VENDORED.json'), JSON.stringify({
  syncedAt: new Date().toISOString(), webapp, desktop,
}, null, 2));
