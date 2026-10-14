#!/usr/bin/env node
/**
 * Builds a single self-contained HTML page of the demo kitchen (three.js from
 * the jsDelivr CDN via an import map). Used for the hosted preview.
 *
 *   node scripts/build-artifact.mjs [out.html]
 * Needs esbuild (npx esbuild, or ESBUILD=/path/to/esbuild/lib/main.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const esbuildPath = process.env.ESBUILD || 'esbuild';
const esbuild = await import(esbuildPath);
const THREE_VER = '0.169.0';
const out = path.resolve(process.argv[2] || path.join(root, 'dist-artifact/a-la-structs.html'));

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/artifact-main.js')],
  bundle: true, format: 'esm', write: false, minify: !process.env.NOMINIFY, target: 'es2022', platform: 'browser',
  external: ['three', 'three/addons/*'],
  legalComments: 'none',
  logLevel: 'warning',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(root, 'src/styles/app.css'), 'utf8');
const html = `<title>À la Structs</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@500;700;800&display=swap" rel="stylesheet">
<style>
${css}
</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/"}}</script>
<div id="app"><div class="loading"><div>Warming up the kitchen…</div></div></div>
<script type="module">
${js}
</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} KB)`);
