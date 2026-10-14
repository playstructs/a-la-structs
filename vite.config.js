import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import { structsUiShimVite } from './scripts/structs-shim.mjs';

/**
 * Dev server proxies a Structs guild so the game core can talk to it from
 * this origin (session cookies, no CORS):
 *
 *   GUILD_URL   guild webapp (serves /api)            e.g. http://localhost:8080
 *   GRASS_URL   GRASS NATS websocket                   e.g. ws://localhost:1443
 *   RPC_URL     chain RPC websocket for signing        e.g. ws://localhost:26657
 *
 * With GRASS_URL / RPC_URL set, the client is pointed at /grass and /rpc on
 * this origin (VITE_PROXY_GRASS / VITE_PROXY_RPC) and the dev server relays.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const guild = env.GUILD_URL || 'http://localhost:8080';
  const proxy = {
    '/api': { target: guild, changeOrigin: true, cookieDomainRewrite: '', secure: false },
  };
  const define = {};
  if (env.GRASS_URL) {
    proxy['/grass'] = { target: env.GRASS_URL, ws: true, changeOrigin: true, rewrite: (p) => p.replace(/^\/grass/, '') };
    define['import.meta.env.VITE_PROXY_GRASS'] = '"1"';
  }
  if (env.RPC_URL) {
    proxy['/rpc'] = { target: env.RPC_URL, ws: true, changeOrigin: true, rewrite: (p) => p.replace(/^\/rpc/, '') };
    define['import.meta.env.VITE_PROXY_RPC'] = '"1"';
  }
  return {
    plugins: [structsUiShimVite(path.resolve('src/services/live/noop.js'))],
    resolve: { alias: { crypto: path.resolve('src/services/live/empty.js') } },
    define: { global: 'globalThis', ...define },
    optimizeDeps: { esbuildOptions: { define: { global: 'globalThis' }, target: 'es2022' } },
    build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
    worker: { format: 'iife' },
    server: { port: 5173, proxy },
  };
});
