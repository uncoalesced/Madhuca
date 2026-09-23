import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeDispersion } from '../src/dispersion.ts';
import type { Hotspot, Wind } from '../src/types.ts';

const SAMPLE_HOTSPOT: Hotspot = {
  id: 'VIIRS:30.9:75.85:2026-10-15T08:30:00Z',
  lat: 30.9,
  lon: 75.85,
  frp: 25.0,
  confidence: 'n',
  acquiredAt: '2026-10-15T08:30:00Z',
  satellite: 'SNPP',
};

const SAMPLE_WIND: Wind = {
  speedMs: 4.0,
  directionDeg: 45,
  observedAt: '2026-10-15T08:30:00Z',
};

test('flips meteorological wind direction (FROM) by 180° to get plume bearing (TO)', () => {
  // Wind from North (0°) travels South (180°)
  assert.equal(computeDispersion(SAMPLE_HOTSPOT, { ...SAMPLE_WIND, directionDeg: 0 }).bearingDeg, 180);
  // Wind from East (90°) travels West (270°)
  assert.equal(computeDispersion(SAMPLE_HOTSPOT, { ...SAMPLE_WIND, directionDeg: 90 }).bearingDeg, 270);
  // Wind from South (180°) travels North (0°)
  assert.equal(computeDispersion(SAMPLE_HOTSPOT, { ...SAMPLE_WIND, directionDeg: 180 }).bearingDeg, 0);
  // Wind from West (270°) travels East (90°)
  assert.equal(computeDispersion(SAMPLE_HOTSPOT, { ...SAMPLE_WIND, directionDeg: 270 }).bearingDeg, 90);
  // Wind from 350° travels to 170°
  assert.equal(computeDispersion(SAMPLE_HOTSPOT, { ...SAMPLE_WIND, directionDeg: 350 }).bearingDeg, 170);
});

test('scales downwind distance with wind speed and fire radiative power (FRP)', () => {
  const basePlume = computeDispersion(SAMPLE_HOTSPOT, SAMPLE_WIND);

  // Higher wind speed carries smoke further
  const highWindPlume = computeDispersion(SAMPLE_HOTSPOT, { ...SAMPLE_WIND, speedMs: 8.0 });
  assert.ok(highWindPlume.distanceKm > basePlume.distanceKm);

  // Higher FRP (bigger fire) produces longer reach
  const highFrpPlume = computeDispersion({ ...SAMPLE_HOTSPOT, frp: 100.0 }, SAMPLE_WIND);
  assert.ok(highFrpPlume.distanceKm > basePlume.distanceKm);
});

test('narrows spread angle as wind speed increases and widens as speed drops', () => {
  const calmPlume = computeDispersion(SAMPLE_HOTSPOT, { ...SAMPLE_WIND, speedMs: 1.0 });
  const moderatePlume = computeDispersion(SAMPLE_HOTSPOT, { ...SAMPLE_WIND, speedMs: 4.0 });
  const strongPlume = computeDispersion(SAMPLE_HOTSPOT, { ...SAMPLE_WIND, speedMs: 9.0 });

  assert.ok(calmPlume.spreadDeg > moderatePlume.spreadDeg);
  assert.ok(moderatePlume.spreadDeg > strongPlume.spreadDeg);
  assert.equal(moderatePlume.spreadDeg, 22.5);
  assert.equal(strongPlume.spreadDeg, 15);
});

test('degrades gracefully to radial pooling on calm wind without throwing', () => {
  const calm = computeDispersion(SAMPLE_HOTSPOT, { ...SAMPLE_WIND, speedMs: 0 });
  assert.equal(calm.spreadDeg, 180);
  assert.ok(calm.distanceKm <= 5);
  assert.ok(calm.distanceKm >= 0.5);
});

test('degrades gracefully when wind data is null or missing without throwing', () => {
  const nullWindPlume = computeDispersion(SAMPLE_HOTSPOT, null);
  assert.equal(nullWindPlume.spreadDeg, 180);
  assert.ok(nullWindPlume.distanceKm > 0);
  assert.equal(nullWindPlume.bearingDeg, 0);
});

test('handles non-finite directionDeg and negative speedMs without throwing or returning NaN', () => {
  // NaN directionDeg with valid wind speed
  const nanDirPlume = computeDispersion(SAMPLE_HOTSPOT, { ...SAMPLE_WIND, directionDeg: Number.NaN });
  assert.equal(Number.isNaN(nanDirPlume.bearingDeg), false);
  assert.equal(nanDirPlume.bearingDeg, 0);

  // Negative speedMs degrades to calm radial pooling
  const negSpeedPlume = computeDispersion(SAMPLE_HOTSPOT, { ...SAMPLE_WIND, speedMs: -5.0 });
  assert.equal(negSpeedPlume.spreadDeg, 180);
  assert.ok(negSpeedPlume.distanceKm <= 5);
});

test('clamps extreme FRP values and handles zero or negative FRP safely', () => {
  // Huge FRP fire (e.g. 5,000 MW) is capped at 80 km downwind reach
  const megaFirePlume = computeDispersion({ ...SAMPLE_HOTSPOT, frp: 5000.0 }, SAMPLE_WIND);
  assert.equal(megaFirePlume.distanceKm, 80);

  // Zero or negative FRP defaults to minimum positive reach
  const zeroFrpPlume = computeDispersion({ ...SAMPLE_HOTSPOT, frp: 0 }, SAMPLE_WIND);
  assert.ok(zeroFrpPlume.distanceKm >= 1.0);
  assert.equal(Number.isFinite(zeroFrpPlume.distanceKm), true);

  const negFrpPlume = computeDispersion({ ...SAMPLE_HOTSPOT, frp: -50 }, SAMPLE_WIND);
  assert.ok(negFrpPlume.distanceKm >= 1.0);
  assert.equal(Number.isFinite(negFrpPlume.distanceKm), true);
});
