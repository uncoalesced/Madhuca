import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MapView,
  getMarkerColor,
  createPlumeFeatureCollection,
} from '../src/components/MapView.ts';
import { REGION_BBOX, type Classification, type Hotspot, type Plume } from '@madhuca/logic';

const MOCK_HOTSPOTS: Hotspot[] = [
  {
    id: 'hs-1',
    lat: 31.1,
    lon: 75.5,
    frp: 45.2,
    confidence: 'nominal',
    acquiredAt: '2026-10-25T14:30:00Z',
    satellite: 'VIIRS_SNPP',
  },
  {
    id: 'hs-2',
    lat: 31.3,
    lon: 75.9,
    frp: 88.0,
    confidence: 'high',
    acquiredAt: '2026-10-25T14:30:00Z',
    satellite: 'VIIRS_SNPP',
  },
];

const MOCK_PLUMES: Record<string, Plume> = {
  'hs-1': { bearingDeg: 45, distanceKm: 8.0, spreadDeg: 25 },
  'hs-2': { bearingDeg: 90, distanceKm: 14.2, spreadDeg: 15 },
};

const MOCK_CLASSIFICATIONS: Record<string, Classification> = {
  'hs-1': { kind: 'likely-crop-burning', landCover: 'cropland', rationale: 'Autumn stubble burning.' },
  'hs-2': { kind: 'likely-wildfire', landCover: 'forest', rationale: 'Forest wildfire.' },
};

test('getMarkerColor correctly assigns distinct high-contrast colors by classification', () => {
  assert.equal(getMarkerColor({ kind: 'likely-wildfire', landCover: 'forest', rationale: '' }), '#dc2626', 'Wildfire must map to urgent brick red');
  assert.equal(getMarkerColor({ kind: 'likely-crop-burning', landCover: 'cropland', rationale: '' }), '#d97706', 'Crop-burning must map to warm stubble amber');
  assert.equal(getMarkerColor(undefined), '#f59e0b', 'Missing classification must map to gold neutral');
});

test('createPlumeFeatureCollection produces valid GeoJSON for N hotspots with plumes', () => {
  const collection = createPlumeFeatureCollection(
    MOCK_HOTSPOTS,
    MOCK_PLUMES,
    MOCK_CLASSIFICATIONS
  );

  assert.equal(collection.type, 'FeatureCollection');
  assert.equal(collection.features.length, 2);

  const f1 = collection.features[0];
  assert.ok(f1);
  assert.equal(f1.properties.hotspotId, 'hs-1');
  assert.equal(f1.properties.classification, 'likely-crop-burning');
  assert.equal(f1.properties.color, '#d97706');
  assert.equal(f1.geometry.type, 'Polygon');
  assert.ok(f1.geometry.coordinates[0]?.length && f1.geometry.coordinates[0].length > 0);

  const f2 = collection.features[1];
  assert.ok(f2);
  assert.equal(f2.properties.hotspotId, 'hs-2');
  assert.equal(f2.properties.classification, 'likely-wildfire');
  assert.equal(f2.properties.color, '#dc2626');
});

test('createPlumeFeatureCollection returns empty collection when plumes is undefined', () => {
  const empty = createPlumeFeatureCollection(MOCK_HOTSPOTS, undefined);
  assert.equal(empty.type, 'FeatureCollection');
  assert.equal(empty.features.length, 0);
});

test('MapView renders container and accessible legend markup', () => {
  const html = renderToStaticMarkup(
    React.createElement(MapView, {
      region: 'punjab',
      hotspots: MOCK_HOTSPOTS,
      plumes: MOCK_PLUMES,
      classifications: MOCK_CLASSIFICATIONS,
      onSelect: () => {},
    })
  );

  assert.ok(html.includes('map-view-container'), 'Expected map view container');
  assert.ok(html.includes('Map of punjab active fire radar'), 'Expected accessible region map label');
  assert.ok(html.includes('Likely Stubble Burning'), 'Expected stubble burning legend label');
  assert.ok(html.includes('Likely Wildfire'), 'Expected wildfire legend label');
});

test('REGION_BBOX covers valid bounds for all 4 launch regions', () => {
  const regions = ['punjab', 'bihar', 'delhi', 'telangana'] as const;
  for (const r of regions) {
    const [west, south, east, north] = REGION_BBOX[r];
    assert.ok(west < east, `${r} west (${west}) must be < east (${east})`);
    assert.ok(south < north, `${r} south (${south}) must be < north (${north})`);
  }
});

test('3 hotspots with plumes produce 3 plume overlays, one per hotspot id', () => {
  const third: Hotspot = { ...MOCK_HOTSPOTS[0]!, id: 'hs-3', lat: 30.9 };
  const fc = createPlumeFeatureCollection(
    [...MOCK_HOTSPOTS, third],
    { ...MOCK_PLUMES, 'hs-3': { bearingDeg: 180, distanceKm: 5, spreadDeg: 20 } },
    MOCK_CLASSIFICATIONS,
  );
  assert.deepEqual(fc.features.map((f) => f.id), ['hs-1', 'hs-2', 'hs-3']);
});

test('risk toggle renders only when the region has a risk grid', () => {
  const base = { region: 'telangana' as const, hotspots: [], onSelect: () => {} };
  const withGrid = renderToStaticMarkup(React.createElement(MapView, { ...base, riskUrl: '/risk/telangana.json' }));
  const without = renderToStaticMarkup(React.createElement(MapView, base));
  assert.match(withGrid, /Show fire risk/);
  assert.doesNotMatch(without, /fire risk/i);
});
