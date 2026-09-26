import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runRadar, windCellKey } from '../src/radar.ts';
import type { LandCoverMask } from '../src/types.ts';

const HEADER =
  'country_id,latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight';
const row = (lat: number, lon: number, time: string) =>
  `IND,${lat},${lon},330.5,0.42,0.38,2026-10-20,${time},N,VIIRS,n,2.0NRT,295.1,9.0,D`;

// Five fires around Ludhiana, all in one 0.25 degree cell (30.75, 75.75), and one
// near Patiala (30.25, 76.5), in its own cell.
const CSV = [
  HEADER,
  row(30.81, 75.71, '0801'),
  row(30.82, 75.72, '0802'),
  row(30.83, 75.73, '0803'),
  row(30.84, 75.74, '0804'),
  row(30.85, 75.75, '0805'),
  row(30.33, 76.4, '0806'),
].join('\n');

const WIND_FROM_NORTHWEST = {
  current: { time: '2026-10-20T08:00', interval: 900, wind_speed_10m: 4, wind_direction_10m: 315 },
};

const EMPTY_MASK: LandCoverMask = { region: 'punjab', features: { type: 'FeatureCollection', features: [] } };

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

const isWind = (url: string) => url.startsWith('https://api.open-meteo.com/');

test('five hotspots in one 0.25 degree cell make exactly one wind call', async () => {
  const { value, seen } = await withStubbedFetch(
    (url) => (isWind(url) ? Response.json(WIND_FROM_NORTHWEST) : new Response(CSV)),
    () => runRadar('punjab', 'test-key', EMPTY_MASK),
  );

  assert.equal(value.hotspots.length, 6);
  const windCalls = seen.filter(isWind);
  // Two cells in total: the Ludhiana five share one call, Patiala gets its own.
  assert.equal(windCalls.length, 2);
  assert.equal(new Set(value.hotspots.filter((h) => h.lat !== 30.33).map(windCellKey)).size, 1);
  // Every hotspot got the shared wind: plume heads south-east, away from the north-west wind.
  for (const hs of value.hotspots) assert.equal(value.plumes[hs.id]!.bearingDeg, 135);
});

test('a failed wind call degrades that cell to calm-wind dispersion, not a failed scan', async () => {
  const { value } = await withStubbedFetch(
    (url) => {
      if (!isWind(url)) return new Response(CSV);
      // The Patiala cell's wind call fails; Ludhiana's succeeds.
      return url.includes('latitude=30.33') ? new Response('upstream down', { status: 503 }) : Response.json(WIND_FROM_NORTHWEST);
    },
    () => runRadar('punjab', 'test-key', EMPTY_MASK),
  );

  assert.equal(value.hotspots.length, 6);
  const patiala = value.hotspots.find((h) => h.lat === 30.33)!;
  const ludhiana = value.hotspots.find((h) => h.lat === 30.81)!;
  assert.equal(value.plumes[patiala.id]!.spreadDeg, 180, 'no wind reading -> radial calm-wind plume');
  assert.equal(value.plumes[ludhiana.id]!.bearingDeg, 135);
  // Every hotspot is still classified; a land-cover miss is 'other', not a gap.
  assert.equal(Object.keys(value.classifications).length, 6);
});

test('a FIRMS failure throws instead of returning an empty, all-clear-looking result', async () => {
  await assert.rejects(
    withStubbedFetch(
      () => new Response('nope', { status: 500, statusText: 'Internal Server Error' }),
      () => runRadar('punjab', 'test-key', EMPTY_MASK),
    ),
    /FIRMS responded 500/,
  );
});

test('a real zero-row FIRMS answer is an empty result with no wind calls', async () => {
  const { value, seen } = await withStubbedFetch(
    () => new Response(`${HEADER}\n`),
    () => runRadar('punjab', 'test-key', EMPTY_MASK),
  );
  assert.deepEqual(value, { hotspots: [], plumes: {}, classifications: {} });
  assert.equal(seen.filter(isWind).length, 0);
});
