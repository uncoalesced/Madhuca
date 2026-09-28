import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

// Production basemap regression (issue #12): `vite build` must emit the maplibre worker
// and the bundle must point at it, or /assets/maplibre-gl-worker.mjs falls through to
// index.html and no tile ever draws. Needs `npm run build` first; skipped otherwise.
const assets = new URL('../dist/assets/', import.meta.url);

test('built bundle references an emitted maplibre worker file', { skip: !existsSync(assets) && 'run npm run build first' }, () => {
  const files = readdirSync(assets);
  const worker = files.find((f) => /^maplibre-gl-worker-.*\.js$/.test(f));
  assert.ok(worker, `no maplibre worker in dist/assets: ${files.join(', ')}`);
  const entry = files.filter((f) => /^index-.*\.js$/.test(f)).map((f) => readFileSync(new URL(f, assets), 'utf8'));
  assert.ok(entry.some((js) => js.includes(worker)), 'index bundle does not reference the emitted worker');
  assert.doesNotMatch(readFileSync(new URL(worker, assets), 'utf8'), /from\s*["']\.\/maplibre-gl-shared/, 'worker still imports an unemitted sibling');
});
