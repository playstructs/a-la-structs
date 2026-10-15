/**
 * Serves a playtest build of the demo kitchen: the same bundle as
 * `npm run build:preview-page`, but with three.js served from node_modules so
 * it works offline and in CI. Rebuilt on every start, so tests always run the
 * current source.
 *
 *   node playtest/pt.mjs serve [--port 5199]
 *
 * (To test the Vite dev server instead, run `npm run dev` and pass
 *  --url http://localhost:5173 to `pt.mjs open`.)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

export async function buildPage(root, outFile) {
  const esbuild = await import('esbuild');
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src/artifact-main.js')],
    bundle: true, format: 'esm', write: false, minify: false, sourcemap: 'inline', target: 'es2022', platform: 'browser',
    external: ['three', 'three/addons/*'], logLevel: 'warning',
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = fs.readFileSync(path.join(root, 'src/styles/app.css'), 'utf8');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>À la Structs — playtest build</title>
<style>${css}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
</head><body><div id="app"><div class="loading"><div>Warming up the kitchen…</div></div></div>
<script type="module">${js}</script></body></html>`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  return outFile;
}

export async function serve(root, { port = 5199 } = {}) {
  const page = await buildPage(root, path.join(root, 'playtest/.build/index.html'));
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p === '/index.html') p = path.relative(root, page);
    if (!p.startsWith('/')) p = '/' + p;
    if (!(p.startsWith('/node_modules/three/') || p.startsWith('/playtest/.build/'))) { res.writeHead(404); return res.end(); }
    const f = path.join(root, path.normalize(p));
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((ok, bad) => { server.once('error', bad); server.listen(port, '127.0.0.1', ok); });
  return { server, url: `http://127.0.0.1:${port}/` };
}
