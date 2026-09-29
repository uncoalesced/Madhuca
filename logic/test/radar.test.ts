import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Geo } from '../src/geo.ts';
import { runRadar, windCellKey } from '../src/radar.ts';

const HEADER =
  'country_id,latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight';
const row = (lat: number, lon: number, time: string) =>
  `IND,${lat},${lon},330.5,0.42,0.38,2026-10-20,${time},N,VIIRS,n,2.0NRT,295.1,9.0,D`;

// Five fires around Ludhiana, all in one 0.5 degree cell (31, 75.5), one near Patiala
// (30.5, 76.5) in its own cell, and one at Lahore that the box query also returns.
const CSV = [
  HEADER,
  row(30.81, 75.61, '0801'),
  row(30.82, 75.62, '0802'),
  row(30.83, 75.63, '0803'),
  row(30.84, 75.64, '0804'),
  row(30.85, 75.65, '0805'),
  row(30.33, 76.4, '0806'),
  row(31.55, 74.35, '0807'),
].join('\n');

/** Punjab east of 74.5E, abroad west of it; all 'other' land. Stands in for the real grids. */
const FAKE_GEO: Geo = {
  stateAt: (lon) => (lon > 74.5 ? 'Punjab' : undefined),
  landCoverAt: () => 'other',
};

/** Open-Meteo answers a comma list with one wind object per location. */
function windFor(url: string, fail?: (lat: string) => boolean): Response {
  const lats = new URL(url).searchParams.get('latitude')!.split(',');
  if (fail && lats.some(fail)) return new Response('upstream down', { status: 503 });
  const one = { current: { time: '2026-10-20T08:00', interval: 900, wind_speed_10m: 4, wind_direction_10m: 315 } };
  return Response.json(lats.length === 1 ? one : lats.map(() => one));
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

const isWind = (url: string) => url.startsWith('https://api.open-meteo.com/');

test('fires outside the zone are dropped; each kept fire carries its state', async () => {
  const { value } = await withStubbedFetch((url) => (isWind(url) ? windFor(url) : new Response(CSV)), () => runRadar('north', 'k', FAKE_GEO));
  assert.equal(value.hotspots.length, 6, 'Lahore dropped');
  assert.ok(value.hotspots.every((h) => value.states[h.id] === 'Punjab'));
  const south = await withStubbedFetch((url) => (isWind(url) ? windFor(url) : new Response(CSV)), () => runRadar('south', 'k', FAKE_GEO));
  assert.equal(south.value.hotspots.length, 0, 'Punjab fires are not in South India');
});

test('all wind cells go in one batched call, and plumes carry the wind speed', async () => {
  const { value, seen } = await withStubbedFetch((url) => (isWind(url) ? windFor(url) : new Response(CSV)), () => runRadar('north', 'k', FAKE_GEO));
  const windCalls = seen.filter(isWind);
  assert.equal(windCalls.length, 1);
  assert.equal(new URL(windCalls[0]!).searchParams.get('latitude')!.split(',').length, 2, 'two cells: Ludhiana five share one');
  assert.equal(new Set(value.hotspots.filter((h) => h.lat !== 30.33).map(windCellKey)).size, 1);
  for (const hs of value.hotspots) {
    assert.equal(value.plumes[hs.id]!.bearingDeg, 135, 'north-west wind blows smoke south-east');
    assert.equal(value.plumes[hs.id]!.windSpeedMs, 4);
  }
});

test('hundreds of wind cells stay far under the 50-subrequest limit', async () => {
  // 250 fires, each in its own 0.5 degree cell.
  const many = [HEADER, ...Array.from({ length: 250 }, (_, i) => row(8 + (i % 25), 75 + Math.floor(i / 25), '0800'))].join('\n');
  const { value, seen } = await withStubbedFetch(
    (url) => (isWind(url) ? windFor(url) : new Response(many)),
    () => runRadar('india', 'k', { stateAt: () => 'Madhya Pradesh', landCoverAt: () => 'other' }),
  );
  assert.equal(value.hotspots.length, 250);
  assert.equal(seen.filter(isWind).length, 3, '250 cells in batches of 100');
  assert.ok(seen.length <= 50);
});

test('a failed wind batch degrades those fires to calm-wind dispersion, not a failed scan', async () => {
  const { value } = await withStubbedFetch(
    (url) => (isWind(url) ? windFor(url, () => true) : new Response(CSV)),
    () => runRadar('north', 'k', FAKE_GEO),
  );
  assert.equal(value.hotspots.length, 6);
  for (const hs of value.hotspots) {
    assert.equal(value.plumes[hs.id]!.spreadDeg, 180, 'no wind reading -> radial calm-wind plume');
    assert.equal(value.plumes[hs.id]!.windSpeedMs, undefined, 'missing wind has no speed');
  }
  // Every hotspot is still classified; a land-cover miss is 'other', not a gap.
  assert.equal(Object.keys(value.classifications).length, 6);
});

test('a FIRMS failure throws instead of returning an empty, all-clear-looking result', async () => {
  await assert.rejects(
    withStubbedFetch(() => new Response('nope', { status: 500, statusText: 'Internal Server Error' }), () => runRadar('north', 'k', FAKE_GEO)),
    /FIRMS responded 500/,
  );
});

test('a real zero-row FIRMS answer is an empty result with no wind calls', async () => {
  const { value, seen } = await withStubbedFetch(() => new Response(`${HEADER}\n`), () => runRadar('north', 'k', FAKE_GEO));
  assert.deepEqual(value, { hotspots: [], plumes: {}, classifications: {}, states: {} });
  assert.equal(seen.filter(isWind).length, 0);
});
