import { test } from 'node:test';
import assert from 'node:assert/strict';

import { estimateSpread } from '../src/spread.ts';
import type { Hotspot, Wind } from '../src/types.ts';

const FIRE: Hotspot = {
  id: 'N:17.5:78.5:2026-03-01T08:00:00Z',
  lat: 17.5,
  lon: 78.5,
  frp: 40,
  confidence: 'n',
  acquiredAt: '2026-03-01T08:00:00Z',
  satellite: 'N',
};
const wind = (directionDeg: number, speedMs: number): Wind => ({ directionDeg, speedMs, observedAt: '2026-03-01T08:00:00Z' });

test('the scaffold never estimates a reach: distance 0 over 0 hours means "not estimated"', () => {
  const s = estimateSpread(FIRE, wind(315, 6), 'forest');
  assert.equal(s.hotspotId, FIRE.id);
  assert.equal(s.distanceKm, 0);
  assert.equal(s.horizonHours, 0);
});

test('the front heads downwind: wind from the north-west points it south-east', () => {
  assert.equal(estimateSpread(FIRE, wind(315, 6), 'forest').bearingDeg, 135);
  assert.equal(estimateSpread(FIRE, wind(0, 3), 'other').bearingDeg, 180);
  // Rounds before wrapping, so a near-south wind never yields 360.
  assert.equal(estimateSpread(FIRE, wind(179.6, 3), 'other').bearingDeg, 0);
});

test('missing, calm or broken wind degrades to no direction instead of throwing', () => {
  for (const w of [null, wind(90, 0), wind(Number.NaN, 4), wind(90, Number.NaN)]) {
    const s = estimateSpread(FIRE, w, 'cropland');
    assert.equal(s.bearingDeg, 0);
    assert.equal(s.distanceKm, 0);
  }
});
