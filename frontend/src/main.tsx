import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { App } from './App';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';

// maplibre-gl looks for its worker next to its own module URL. `vite build` inlines
// maplibre into index-*.js and emits no worker there, so production fetched
// /assets/maplibre-gl-worker.mjs, got index.html from the SPA fallback, and never drew
// a tile. `?worker&url` makes Vite bundle the worker (and the shared chunk it imports)
// into one emitted file; point maplibre at it before any Map is created.
setWorkerUrl(maplibreWorkerUrl);

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The loading screen in index.html fills the logo in over ~1.2s (27 marks 32ms apart,
// then the wordmark, each fill 0.32s). Let it finish once, then fade it out over the app.
const SPLASH_FILL_MS = 1250;
const splash = document.getElementById('splash');
if (splash) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // performance.now() counts from navigation start, which is when the animation began.
  const wait = reduced ? 0 : Math.max(0, SPLASH_FILL_MS - performance.now());
  setTimeout(() => {
    splash.classList.add('splash-done');
    setTimeout(() => splash.remove(), reduced ? 0 : 400);
  }, wait);
}
