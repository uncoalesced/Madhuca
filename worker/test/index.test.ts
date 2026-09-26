import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import worker, { type Env } from '../src/index.ts';

const PUBLIC = join(import.meta.dirname, '..', '..', 'frontend', 'public');

const HEADER =
  'country_id,latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight';
// Ludhiana farmland (inside a cropland polygon in the published punjab.json), in stubble season.
const LUDHIANA_CROPLAND = `IND,30.8,75.6,330.5,0.42,0.38,2026-10-20,0800,N,VIIRS,n,2.0NRT,295.1,9.0,D`;

const WIND = { current: { time: '2026-10-20T08:00', interval: 900, wind_speed_10m: 4, wind_direction_10m: 315 } };

/** Serves the real published masks from frontend/public, as the ASSETS binding does. */
function envWith(key: string | undefined, assetRequests: string[] = []): Env {
  return {
    FIRMS_MAP_KEY: key,
    ASSETS: {
      async fetch(input) {
        const path = new URL(typeof input === 'string' ? input : input.url).pathname;
        assetRequests.push(path);
        try {
          return new Response(readFileSync(join(PUBLIC, path)), { headers: { 'content-type': 'application/json' } });
        } catch {
          return new Response('not found', { status: 404 });
        }
      },
    },
  };
}

async function withStubbedFetch<T>(handler: (url: string) => Response, run: () => Promise<T>) {
  const original = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    seen.push(url);
    return handler(url);
  }) as typeof fetch;
  try {
    return { value: await run(), seen };
  } finally {
    globalThis.fetch = original;
  }
}

const get = (path: string, env: Env) => worker.fetch(new Request(`http://localhost${path}`), env);

test('classifies a known Punjab cropland point against the mask read from static assets', async () => {
  const assetRequests: string[] = [];
  const { value: res } = await withStubbedFetch(
    (url) => (url.startsWith('https://api.open-meteo.com/') ? Response.json(WIND) : new Response(`${HEADER}\n${LUDHIANA_CROPLAND}\n`)),
    () => get('/api/radar?region=punjab', envWith('test-key', assetRequests)),
  );

  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    hotspots: { id: string }[];
    plumes: Record<string, { bearingDeg: number }>;
    classifications: Record<string, { kind: string; landCover: string }>;
  };
  assert.equal(body.hotspots.length, 1);
  const id = body.hotspots[0]!.id;
  assert.equal(body.classifications[id]!.landCover, 'cropland');
  assert.equal(body.classifications[id]!.kind, 'likely-crop-burning');
  assert.equal(body.plumes[id]!.bearingDeg, 135);
  assert.deepEqual(assetRequests, ['/landcover/punjab.json']);
});

test('a missing FIRMS key is a 500 error that says it is not an all-clear, and calls nothing', async () => {
  const { value: res, seen } = await withStubbedFetch(
    () => new Response('unexpected'),
    () => get('/api/radar?region=delhi', envWith(undefined)),
  );
  assert.equal(res.status, 500);
  assert.match(((await res.json()) as { error: string }).error, /not an all-clear/);
  assert.equal(seen.length, 0);
});

test('a FIRMS failure is a 502, and the key does not appear in the response', async () => {
  const { value: res } = await withStubbedFetch(
    () => new Response('bad key', { status: 403, statusText: 'Forbidden' }),
    () => get('/api/radar?region=delhi', envWith('secret-key-123')),
  );
  assert.equal(res.status, 502);
  const text = await res.text();
  assert.match(text, /FIRMS responded 403/);
  assert.doesNotMatch(text, /secret-key-123/);
});

test('an unknown region is a 400 and other paths are 404', async () => {
  assert.equal((await get('/api/radar?region=kerala', envWith('k'))).status, 400);
  assert.equal((await get('/api/radar', envWith('k'))).status, 400);
  assert.equal((await get('/api/other', envWith('k'))).status, 404);
});

test('a missing mask is a 500, not a scan where every fire silently reads as other', async () => {
  const env = envWith('k');
  env.ASSETS = { fetch: async () => new Response('not found', { status: 404 }) };
  const { value: res } = await withStubbedFetch(
    () => new Response(`${HEADER}\n${LUDHIANA_CROPLAND}\n`),
    // Telangana: a region no earlier test has cached a mask for in this isolate.
    () => get('/api/radar?region=telangana', env),
  );
  assert.equal(res.status, 500);
  assert.match(((await res.json()) as { error: string }).error, /mask for telangana responded 404/);
});
