import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { decodeLandCoverGrid, decodeStateGrid, inRegion, ZONE_STATES } from '../src/geo.ts';
import { REGION_BBOX } from '../src/hotspots.ts';
import { REGIONS } from '../src/types.ts';

const PUBLIC = new URL('../../frontend/public/', import.meta.url);
const bytes = (path: string) => {
  const b = readFileSync(new URL(path, PUBLIC));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const stateAt = decodeStateGrid(bytes('boundaries/states.bin'));
const landCoverAt = decodeLandCoverGrid(bytes('landcover/india.bin'));

test('the published state grid shows India whole and keeps the border sharp', () => {
  assert.equal(stateAt(74.31, 35.92), 'Ladakh', 'Gilgit');
  assert.equal(stateAt(79.3, 35.2), 'Ladakh', 'Aksai Chin');
  assert.equal(stateAt(73.47, 34.37), 'Jammu & Kashmir', 'Muzaffarabad');
  assert.equal(stateAt(91.86, 27.59), 'Arunachal Pradesh', 'Tawang');
  // Either side of the Wagah-Attari crossing, about 1.4 km apart.
  assert.equal(stateAt(74.585, 31.605), 'Punjab', 'Attari');
  assert.equal(stateAt(74.57, 31.6045), undefined, 'Wagah, Pakistan');
  assert.equal(stateAt(74.35, 31.55), undefined, 'Lahore');
  assert.equal(stateAt(85.32, 27.71), undefined, 'Kathmandu');
  assert.equal(stateAt(88, 15), undefined, 'Bay of Bengal');
  assert.equal(stateAt(0, 0), undefined, 'outside the grid');
});

test('the published land-cover grid knows farmland and forest', () => {
  assert.equal(landCoverAt(75.6, 30.7), 'cropland', 'Ludhiana-Jagraon farmland');
  assert.equal(landCoverAt(78.6, 16.2), 'forest', 'Nallamala, Srisailam');
  assert.equal(landCoverAt(74.35, 31.55), 'other', 'abroad is other, not an error');
  assert.equal(landCoverAt(-10, -10), 'other', 'outside the grid');
});

test('every state is in exactly one zone, and every zone box is well formed', () => {
  const zoned = Object.values(ZONE_STATES).flat();
  assert.equal(zoned.length, 36);
  assert.equal(new Set(zoned).size, 36);
  assert.ok(inRegion('north', 'Punjab'));
  assert.ok(!inRegion('south', 'Punjab'));
  assert.ok(inRegion('india', 'Punjab'));
  assert.ok(!inRegion('india', undefined));
  for (const region of REGIONS) {
    const [w, s, e, n] = REGION_BBOX[region];
    assert.ok(w < e && s < n, region);
  }
});

test("each zone's box contains its states' known cities", () => {
  const cities: Record<string, [number, number]> = {
    north: [75.86, 30.9], // Ludhiana
    south: [80.27, 13.08], // Chennai
    west: [72.88, 19.08], // Mumbai
    east: [88.36, 22.57], // Kolkata
  };
  for (const [region, [lon, lat]] of Object.entries(cities)) {
    const [w, s, e, n] = REGION_BBOX[region as keyof typeof REGION_BBOX];
    assert.ok(lon > w && lon < e && lat > s && lat < n, region);
    assert.ok(inRegion(region as 'north', stateAt(lon, lat)), `${region}: ${stateAt(lon, lat)}`);
  }
});

test('corrupt or foreign files are rejected rather than misread', () => {
  assert.throws(() => decodeStateGrid(new ArrayBuffer(64)), /states\.bin/);
  assert.throws(() => decodeLandCoverGrid(new ArrayBuffer(64)), /india\.bin/);
  const truncated = bytes('boundaries/states.bin').slice(0, 5000);
  assert.throws(() => decodeStateGrid(truncated));
});
