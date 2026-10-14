import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import { structsUiShimVite, structsUiShimEsbuild } from './scripts/structs-shim.mjs';
import { seoVite } from './scripts/seo.mjs';

/**
 * Dev server proxies a Structs guild so the game core can talk to it from
 * this origin (session cookies, no CORS):
 *
 *   GUILD_URL   (optional) proxy /api to this guild    e.g. http://localhost:8080
 *   GRASS_URL   GRASS NATS websocket                   e.g. ws://localhost:1443
 *   RPC_URL     chain RPC websocket for signing        e.g. ws://localhost:26657
 *
 * With GRASS_URL / RPC_URL set, the client is pointed at /grass and /rpc on
 * this origin (VITE_PROXY_GRASS / VITE_PROXY_RPC) and the dev server relays.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // By default the page finds each guild's services from the guild's own
  // published config and talks to them directly. GUILD_URL switches to the
  // older same-origin mode: /api is proxied to that guild instead.
  const proxy = {};
  const define = {};
  if (env.GUILD_URL) {
    proxy['/api'] = { target: env.GUILD_URL, changeOrigin: true, cookieDomainRewrite: '', secure: false };
    define['import.meta.env.VITE_GUILD_PROXY'] = '"1"';
  }
  if (env.GRASS_URL) {
    proxy['/grass'] = { target: env.GRASS_URL, ws: true, changeOrigin: true, rewrite: (p) => p.replace(/^\/grass/, '') };
    define['import.meta.env.VITE_PROXY_GRASS'] = '"1"';
  }
  if (env.RPC_URL) {
    proxy['/rpc'] = { target: env.RPC_URL, ws: true, changeOrigin: true, rewrite: (p) => p.replace(/^\/rpc/, '') };
    define['import.meta.env.VITE_PROXY_RPC'] = '"1"';
  }
  return {
    plugins: [structsUiShimVite(path.resolve('src/services/live/noop.js')), seoVite(env.VITE_SITE_URL)],
    resolve: { alias: { crypto: path.resolve('src/services/live/empty.js') } },
    define: { global: 'globalThis', ...define },
    // The dependency scanner runs esbuild directly, so it needs the shim too
    // (otherwise registry.ts's missing protobuf imports stop the scan).
    optimizeDeps: { esbuildOptions: { define: { global: 'globalThis' }, target: 'es2022', plugins: [structsUiShimEsbuild(path.resolve('src/services/live/noop.js'))] } },
    build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
    worker: { format: 'iife' },
    // Bind IPv4 explicitly: Node 17+ may resolve "localhost" to ::1 only, which
    // some browsers then refuse on 127.0.0.1.
    server: { host: '127.0.0.1', port: 5173, strictPort: false, proxy },
  };
});
