import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App, demoRadar, fetchRadar } from '../src/App.ts';
import type { Hotspot, LandCoverMask } from '@madhuca/logic';

const MOCK_MASK: LandCoverMask = {
  region: 'punjab',
  features: [
    {
      type: 'Feature',
      properties: { landCover: 'cropland' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [75.0, 30.0],
            [76.0, 30.0],
            [76.0, 31.0],
            [75.0, 31.0],
            [75.0, 30.0],
          ],
        ],
      },
    },
  ],
};

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
    'punjab',
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
  const result = await fetchRadar('punjab', fake);
  assert.equal(asked, '/api/radar?region=punjab');
  assert.equal(result.error, undefined);
  assert.equal(result.hotspots.length, 3);
  assert.equal(Object.keys(result.plumes).length, 3);
  assert.equal(Object.keys(result.classifications).length, 3);
});

test('fetchRadar with zero hotspots is a real empty result without error', async () => {
  const result = await fetchRadar('bihar', json(200, { hotspots: [], plumes: {}, classifications: {} }));
  assert.equal(result.hotspots.length, 0);
  assert.equal(result.error, undefined);
});

test('fetchRadar on a network failure or garbage body is an error', async () => {
  const down = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
  assert.match((await fetchRadar('delhi', down)).error ?? '', /not an all-clear/);
  const html = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
  assert.match((await fetchRadar('delhi', html)).error ?? '', /not an all-clear/);
});

test('demoRadar classifies fake hotspots against the given mask', async () => {
  const result = await demoRadar('punjab', MOCK_MASK);
  assert.ok(result.hotspots.length > 0);
  for (const hs of result.hotspots) {
    assert.ok(result.plumes[hs.id]);
    assert.ok(result.classifications[hs.id]);
  }
});

test('App renders brand header, region selector, and mandatory ESA attribution footer', () => {
  const html = renderToStaticMarkup(React.createElement(App));

  assert.ok(html.includes('Madhuca'), 'Expected brand name in markup');
  assert.ok(html.includes('Punjab'), 'Expected Punjab in region tabs');
  assert.ok(html.includes('Bihar'), 'Expected Bihar in region tabs');
  assert.ok(html.includes('Delhi'), 'Expected Delhi in region tabs');
  assert.ok(html.includes('Telangana'), 'Expected Telangana in region tabs');
  assert.ok(
    html.includes('© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data'),
    'Expected mandatory CC-BY 4.0 ESA WorldCover attribution'
  );
  assert.ok(
    html.includes('simplified Gaussian-puff approximation (not HYSPLIT)'),
    'Expected honest Gaussian-puff model disclaimer'
  );
});
