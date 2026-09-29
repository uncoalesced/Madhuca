import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyHotspot, STUBBLE_BELT } from '../src/classify.ts';
import type { Hotspot } from '../src/types.ts';

function hotspot(overrides: Partial<Hotspot> = {}): Hotspot {
  return {
    id: 'hs',
    lat: 30.7,
    lon: 75.6,
    frp: 25,
    confidence: 'n',
    acquiredAt: '2026-10-20T08:00:00Z', // autumn stubble season
    satellite: 'N',
    ...overrides,
  };
}

test('cropland during autumn stubble season is likely crop-burning', () => {
  const r = classifyHotspot(hotspot(), 'cropland', 'Punjab');
  assert.equal(r.kind, 'likely-crop-burning');
  assert.equal(r.landCover, 'cropland');
  assert.match(r.rationale, /autumn/);
});

test('cropland during spring wheat harvest (April-May) is likely crop-burning', () => {
  const r = classifyHotspot(hotspot({ acquiredAt: '2026-04-20T08:00:00Z' }), 'cropland', 'Haryana');
  assert.equal(r.kind, 'likely-crop-burning');
  assert.match(r.rationale, /wheat/);
});

test('forest is likely wildfire, in any state', () => {
  assert.equal(classifyHotspot(hotspot(), 'forest', 'Punjab').kind, 'likely-wildfire');
  assert.equal(classifyHotspot(hotspot(), 'forest', 'Odisha').kind, 'likely-wildfire');
});

test('extreme FRP (>150 MW) in cropland is likely wildfire', () => {
  assert.equal(classifyHotspot(hotspot({ frp: 180 }), 'cropland', 'Punjab').kind, 'likely-wildfire');
});

test('other land does NOT default to crop-burning outside the stubble belt', () => {
  const r = classifyHotspot(hotspot(), 'other', 'Telangana');
  assert.equal(r.kind, 'likely-wildfire');
  assert.equal(r.landCover, 'other');
});

test('a Telangana scrub fire in peak stubble season with moderate FRP is still likely wildfire', () => {
  assert.equal(classifyHotspot(hotspot({ acquiredAt: '2026-11-05T10:00:00Z' }), 'other', 'Telangana').kind, 'likely-wildfire');
});

test('other land in a stubble-belt state in Oct-Nov with moderate FRP is likely crop-burning', () => {
  for (const state of STUBBLE_BELT) {
    assert.equal(classifyHotspot(hotspot(), 'other', state).kind, 'likely-crop-burning', state);
  }
  assert.deepEqual([...STUBBLE_BELT].sort(), ['Bihar', 'Delhi', 'Haryana', 'Punjab', 'Uttar Pradesh']);
});

test('the stubble signature needs season and moderate FRP, and a known state', () => {
  assert.equal(classifyHotspot(hotspot({ acquiredAt: '2026-07-01T08:00:00Z' }), 'other', 'Punjab').kind, 'likely-wildfire');
  assert.equal(classifyHotspot(hotspot({ frp: 90 }), 'other', 'Punjab').kind, 'likely-wildfire');
  assert.equal(classifyHotspot(hotspot(), 'other', undefined).kind, 'likely-wildfire');
});

// --- Unknown inputs must not tilt an ambiguous fire toward crop-burning ---

test('an unparseable acquiredAt is an unknown season, not stubble season', () => {
  // Would match the Punjab stubble signature if the date were read as October.
  assert.equal(classifyHotspot(hotspot({ acquiredAt: 'not-a-date' }), 'other', 'Punjab').kind, 'likely-wildfire');
});

test('an unknown FRP does not match the moderate-FRP crop-burning signature on other land', () => {
  assert.equal(classifyHotspot(hotspot({ frp: Number.NaN }), 'other', 'Punjab').kind, 'likely-wildfire');
});
