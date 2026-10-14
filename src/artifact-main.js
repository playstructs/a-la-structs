/**
 * À la Structs — playable preview build (demo kitchen only). The live guild
 * connection needs the local dev server (see README).
 */
import { App } from './ui/App.js';

const app = new App(document.getElementById('app'), { flavor: 'artifact', loadLive: null });
window.aLaStructs = app;
