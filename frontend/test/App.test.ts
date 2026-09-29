import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App, demoRadar, fetchRadar } from '../src/App.ts';
import type { Geo, Hotspot } from '@madhuca/logic';

/** Every point cropland in Punjab: stands in for the real grids. */
const MOCK_GEO: Geo = { stateAt: () => 'Punjab', landCoverAt: () => 'cropland' };

const MOCK_HOTSPOTS: Hotspot[] = [
  {
    id: 'hs-pb-101',
    lat: 30.5,
    lon: 75.5,
    frp: 35.0,
    confidence: 'high',
    acquiredAt: '2026-10-25T14:30:00Z',
    satellite: 'VIIRS_SNPP',
  },
  {
    id: 'hs-pb-102',
    lat: 32.5,
    lon: 77.5,
    frp: 95.0,
    confidence: 'nominal',
    acquiredAt: '2026-10-25T14:30:00Z',
    satellite: 'VIIRS_SNPP',
  },
];

const json = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test('fetchRadar with no FIRMS key on the Worker is an error, never an empty all-clear', async () => {
  const result = await fetchRadar(
    'north',
    json(500, { error: 'FIRMS key not configured, so no fire data was fetched. This is not an all-clear.' }),
  );
  assert.equal(result.hotspots.length, 0);
  assert.match(result.error ?? '', /FIRMS key not configured/);
});

test('fetchRadar with 3 hotspots returns 3 hotspots, plumes and classifications', async () => {
  const three = [...MOCK_HOTSPOTS, { ...MOCK_HOTSPOTS[0]!, id: 'hs-pb-103', lat: 30.7 }];
  const plumes = Object.fromEntries(three.map((h) => [h.id, { bearingDeg: 90, distanceKm: 5, spreadDeg: 20 }]));
  const classifications = Object.fromEntries(
    three.map((h) => [h.id, { kind: 'likely-crop-burning', landCover: 'cropland', rationale: 'r' }]),
  );
  let asked = '';
  const fake = (async (url: string) => {
    asked = url;
    return new Response(JSON.stringify({ hotspots: three, plumes, classifications }));
  }) as unknown as typeof fetch;
  const result = await fetchRadar('north', fake);
  assert.equal(asked, '/api/radar?region=north');
  assert.equal(result.error, undefined);
  assert.equal(result.hotspots.length, 3);
  assert.equal(Object.keys(result.plumes).length, 3);
  assert.equal(Object.keys(result.classifications).length, 3);
});

test('fetchRadar with zero hotspots is a real empty result without error', async () => {
  const result = await fetchRadar('east', json(200, { hotspots: [], plumes: {}, classifications: {} }));
  assert.equal(result.hotspots.length, 0);
  assert.equal(result.error, undefined);
});

test('fetchRadar on a network failure or garbage body is an error', async () => {
  const down = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
  assert.match((await fetchRadar('west', down)).error ?? '', /not an all-clear/);
  const html = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
  assert.match((await fetchRadar('west', html)).error ?? '', /not an all-clear/);
});

test('demoRadar classifies fake hotspots against the given grids, with their state', async () => {
  const result = await demoRadar('north', MOCK_GEO);
  assert.ok(result.hotspots.length > 0);
  for (const hs of result.hotspots) {
    assert.ok(result.plumes[hs.id]);
    assert.equal(result.classifications[hs.id]!.landCover, 'cropland');
    assert.equal(result.states[hs.id], 'Punjab');
  }
});

test('App renders brand header, region selector, and mandatory ESA attribution footer', () => {
  const html = renderToStaticMarkup(React.createElement(App));

  assert.ok(html.includes('Madhuca'), 'Expected brand name in markup');
  const tabs = [...html.matchAll(/class="region-tab-name">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(tabs, ['North India', 'South India', 'West India', 'East India', 'All India'], 'five tabs, All India last');
  assert.ok(
    html.includes('© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data'),
    'Expected mandatory CC-BY 4.0 ESA WorldCover attribution'
  );
  assert.ok(
    html.includes('simplified Gaussian-puff approximation (not HYSPLIT)'),
    'Expected honest Gaussian-puff model disclaimer'
  );
});

test('fetchRadar on a request that never answers resolves to a timeout error, not a forever spinner', async () => {
  const hang = ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    })) as typeof fetch;
  const result = await fetchRadar('south', hang, 50);
  assert.match(result.error ?? '', /timed out.*not an all-clear/);
  assert.equal(result.hotspots.length, 0);
});
