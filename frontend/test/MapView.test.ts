import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MapView,
  getMarkerColor,
  createPlumeFeatureCollection,
  createFireFeatureCollection,
  FARMLAND_IMAGE,
} from '../src/components/MapView.ts';
import { distanceAndBearing, fireSpreadKm } from '../src/utils/plumeGeometry.ts';
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
  assert.equal(getMarkerColor({ kind: 'likely-wildfire', landCover: 'forest', rationale: '' }), '#EF2D56', 'Wildfire must map to Watermelon');
  assert.equal(getMarkerColor({ kind: 'likely-crop-burning', landCover: 'cropland', rationale: '' }), '#F19143', 'Crop-burning must map to Sandy Brown');
  assert.equal(getMarkerColor(undefined), '#767976', 'Missing classification must map to muted ink');
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
  assert.equal(f1.properties.color, '#F19143');
  assert.equal(f1.geometry.type, 'Polygon');
  assert.ok(f1.geometry.coordinates[0]?.length && f1.geometry.coordinates[0].length > 0);

  const f2 = collection.features[1];
  assert.ok(f2);
  assert.equal(f2.properties.hotspotId, 'hs-2');
  assert.equal(f2.properties.classification, 'likely-wildfire');
  assert.equal(f2.properties.color, '#EF2D56');
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

test('fire overlay: one footprint per hotspot; spread haze only with a known wind speed', () => {
  const third: Hotspot = { ...MOCK_HOTSPOTS[0]!, id: 'hs-3', lat: 30.9 };
  const hotspots = [...MOCK_HOTSPOTS, third];
  const plumes = { ...MOCK_PLUMES, 'hs-3': { bearingDeg: 180, distanceKm: 5, spreadDeg: 20 } };

  const noWind = createFireFeatureCollection(hotspots, plumes, MOCK_CLASSIFICATIONS);
  assert.equal(noWind.features.length, 3, 'without wind speeds, only the 3 footprints: no guessed spread');
  assert.ok(noWind.features.every((f) => f.properties?.band === 0));
  assert.equal(noWind.features[1]?.properties?.color, '#EF2D56', 'wildfire footprint is red');

  const windy = createFireFeatureCollection(hotspots, plumes, MOCK_CLASSIFICATIONS, { 'hs-1': 3, 'hs-2': 3, 'hs-3': 0.2 });
  assert.equal(windy.features.filter((f) => f.properties?.band === 0).length, 3);
  assert.equal(windy.features.filter((f) => f.properties?.band !== 0).length, 6, '3 haze bands for each of the 2 windy fires; calm hs-3 gets none');

  // The outer band reaches fireSpreadKm(3) = 3.24 km toward the plume bearing (hs-2 blows east).
  const outer = windy.features.find((f) => f.properties?.hotspotId === 'hs-2' && f.properties?.band === 1)!;
  const tip = outer.geometry.coordinates[0]![5]!; // the wedge's centre ray
  const km = distanceAndBearing(31.3, 75.9, tip[1]!, tip[0]!);
  assert.ok(Math.abs(km.distanceKm - 3.24) < 0.01, String(km.distanceKm));
  assert.ok(Math.abs(km.bearingDeg - 90) < 0.5, String(km.bearingDeg));
});

test('fireSpreadKm: 10% of wind speed over 3 h, zero when calm or unknown', () => {
  assert.ok(Math.abs(fireSpreadKm(3) - 3.24) < 1e-9);
  assert.equal(fireSpreadKm(0.3), 0);
  assert.equal(fireSpreadKm(undefined), 0);
  assert.equal(fireSpreadKm(NaN), 0);
});

test('legend explains fire, possible spread and smoke', () => {
  const html = renderToStaticMarkup(React.createElement(MapView, { region: 'punjab', hotspots: [], onSelect: () => {} }));
  assert.match(html, /Possible spread \(3 h\)/);
  assert.match(html, /not a fire-spread model/);
  assert.match(html, /Smoke drift/);
});

test('farmland toggle is always offered, and its image box matches the national land-cover grid', async () => {
  const html = renderToStaticMarkup(React.createElement(MapView, { region: 'delhi', hotspots: [], onSelect: () => {} }));
  assert.match(html, /Show farmland/);
  const { readFileSync } = await import('node:fs');
  const bin = readFileSync(new URL('../public/landcover/india.bin', import.meta.url));
  assert.equal(bin.toString('ascii', 0, 4), 'MLC1');
  const [west, north, res] = [bin.readDoubleLE(8), bin.readDoubleLE(16), bin.readDoubleLE(24)];
  const [cols, rows] = [bin.readUInt32LE(32), bin.readUInt32LE(36)];
  assert.deepEqual([...FARMLAND_IMAGE.bbox], [west, north - rows * res, west + cols * res, north]);
  assert.equal(bin.length, 40 + Math.ceil((cols * rows) / 4));
  const png = readFileSync(new URL('../public/landcover/farmland.png', import.meta.url));
  assert.ok(png.length < 1_000_000, `farmland.png is ${png.length} bytes; phones download it on toggle`);
});

test('risk toggle renders only when the region has a risk grid', () => {
  const base = { region: 'telangana' as const, hotspots: [], onSelect: () => {} };
  const withGrid = renderToStaticMarkup(React.createElement(MapView, { ...base, riskUrl: '/risk/telangana.json' }));
  const without = renderToStaticMarkup(React.createElement(MapView, base));
  assert.match(withGrid, /Show fire risk/);
  assert.doesNotMatch(without, /fire risk/i);
});
