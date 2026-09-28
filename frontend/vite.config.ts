import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // maplibre-gl v6 loads its worker from a sibling file next to its own module URL.
  // Pre-bundling moves the module into .vite/deps without the worker, so the worker
  // 404s and no tiles ever load. Serve it from node_modules as-is instead.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  // maplibre spawns its worker with { type: 'module' }; see src/main.tsx.
  worker: { format: 'es' },
  // `npm run dev` talks to the Worker under `wrangler dev` (worker/), same path as production.
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
