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
