import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  App,
  loadLandCoverMask,
  runRadarPipeline,
} from '../src/App.ts';
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

test('loadLandCoverMask handles fetch failures gracefully without throwing', async () => {
  const result = await loadLandCoverMask('punjab');
  // In Node test environment where static server isn't running, returns null safely
  assert.equal(result, null);
});

test('runRadarPipeline executes on-demand pipeline with mock hotspots', async () => {
  const result = await runRadarPipeline('punjab', undefined, {
    customMask: MOCK_MASK,
    mockHotspots: MOCK_HOTSPOTS,
  });

  assert.equal(result.hotspots.length, 2);
  assert.ok(result.plumes['hs-pb-101'], 'Expected plume for hs-pb-101');
  assert.ok(result.classifications['hs-pb-101'], 'Expected classification for hs-pb-101');

  // Hotspot 1 is inside cropland during Oct -> likely-crop-burning
  assert.equal(result.classifications['hs-pb-101']?.kind, 'likely-crop-burning');

  // Hotspot 2 is outside cropland -> other (treated as wildfire by default)
  assert.equal(result.classifications['hs-pb-102']?.kind, 'likely-wildfire');
});

test('runRadarPipeline handles zero hotspots as empty state without error', async () => {
  const result = await runRadarPipeline('bihar', undefined, {
    customMask: MOCK_MASK,
    mockHotspots: [],
  });

  assert.equal(result.hotspots.length, 0);
  assert.equal(Object.keys(result.plumes).length, 0);
  assert.equal(Object.keys(result.classifications).length, 0);
  assert.equal(result.error, undefined);
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
