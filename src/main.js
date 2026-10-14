/**
 * À la Structs entry point (full build: demo kitchen + live guild).
 */
import './styles/app.css';
import { App } from './ui/App.js';

const app = new App(document.getElementById('app'), {
  flavor: 'full',
  loadLive: () => import('./services/live-entry.js'),
  hangoutUrl: import.meta.env.VITE_HANGOUT_URL || null,
});
window.aLaStructs = app;
