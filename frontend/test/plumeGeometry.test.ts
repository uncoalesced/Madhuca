import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  destinationPoint,
  plumeToGeoJSONPolygon,
  bearingToCompass,
  getPlumeSummary,
} from '../src/utils/plumeGeometry.ts';
import type { Plume } from '@madhuca/logic';

test('destinationPoint correctly projects coordinates North and East', () => {
  const originLat = 30.5;
  const originLon = 75.5;

  // Project 10 km North (bearing 0)
  const [northLon, northLat] = destinationPoint(originLat, originLon, 10, 0);
  assert.equal(northLon, originLon, 'Longitude should remain approximately constant when travelling due North');
  assert.ok(northLat > originLat, 'Latitude should increase when travelling due North');

  // Project 10 km East (bearing 90)
  const [eastLon, eastLat] = destinationPoint(originLat, originLon, 10, 90);
  assert.ok(eastLon > originLon, 'Longitude should increase when travelling due East');
  assert.ok(Math.abs(eastLat - originLat) < 0.01, 'Latitude should remain nearly constant when travelling due East');
});

test('plumeToGeoJSONPolygon generates a valid closed directional cone polygon', () => {
  const lat = 31.0;
  const lon = 75.8;
  const plume: Plume = {
    bearingDeg: 45,    // North-East
    distanceKm: 12.5,
    spreadDeg: 25,
  };

  const polygon = plumeToGeoJSONPolygon(lat, lon, plume);
  assert.equal(polygon.type, 'Polygon');
  assert.ok(Array.isArray(polygon.coordinates));
  assert.equal(polygon.coordinates.length, 1);

  const ring = polygon.coordinates[0];
  assert.ok(ring && ring.length >= 18);

  // Assert first and last coordinates match the origin (closed polygon)
  const first = ring[0];
  const last = ring[ring.length - 1];
  assert.ok(first && last);
  assert.equal(first[0], Number(lon.toFixed(6)));
  assert.equal(first[1], Number(lat.toFixed(6)));
  assert.equal(last[0], first[0]);
  assert.equal(last[1], first[1]);

  // Assert vertices are in the North-East quadrant
  for (let i = 1; i < ring.length - 1; i++) {
    const pt = ring[i];
    assert.ok(pt);
    assert.ok(pt[0] >= lon, 'Eastward projection must have lon >= origin lon');
    assert.ok(pt[1] >= lat, 'Northward projection must have lat >= origin lat');
  }
});

test('plumeToGeoJSONPolygon generates a 360-degree circular pool for calm wind', () => {
  const lat = 28.6;
  const lon = 77.2;
  const calmPlume: Plume = {
    bearingDeg: 0,
    distanceKm: 0.2,
    spreadDeg: 180, // Calm wind radial pooling
  };

  const polygon = plumeToGeoJSONPolygon(lat, lon, calmPlume);
  assert.equal(polygon.type, 'Polygon');
  const ring = polygon.coordinates[0];
  assert.ok(ring && ring.length === 33); // 32 steps + closing vertex

  const first = ring[0];
  const last = ring[ring.length - 1];
  assert.ok(first && last);
  assert.equal(first[0], last[0]);
  assert.equal(first[1], last[1]);
});

test('bearingToCompass accurately converts degrees to 8-point compass names', () => {
  assert.equal(bearingToCompass(0), 'North');
  assert.equal(bearingToCompass(360), 'North');
  assert.equal(bearingToCompass(45), 'North-East');
  assert.equal(bearingToCompass(90), 'East');
  assert.equal(bearingToCompass(135), 'South-East');
  assert.equal(bearingToCompass(180), 'South');
  assert.equal(bearingToCompass(225), 'South-West');
  assert.equal(bearingToCompass(270), 'West');
  assert.equal(bearingToCompass(315), 'North-West');
});

test('getPlumeSummary generates clear, non-technical safety guidance', () => {
  const activePlume: Plume = {
    bearingDeg: 90,
    distanceKm: 15.0,
    spreadDeg: 20,
  };
  const activeSummary = getPlumeSummary(activePlume);
  assert.ok(activeSummary.directionText.includes('East'));
  assert.ok(activeSummary.reachText.includes('15.0 km'));
  assert.ok(activeSummary.safetyAdvice.includes('Downwind communities'));

  const calmSummary = getPlumeSummary(undefined);
  assert.ok(calmSummary.directionText.includes('Calm wind'));
  assert.ok(calmSummary.safetyAdvice.includes('windows closed'));
});

test('plumeToGeoJSONPolygon handles invalid and NaN inputs gracefully without throwing', () => {
  const invalidPlume: Plume = {
    bearingDeg: NaN,
    distanceKm: -5,
    spreadDeg: 300,
  };

  const polygon = plumeToGeoJSONPolygon(30.0, 75.0, invalidPlume);
  assert.equal(polygon.type, 'Polygon');
  assert.ok(polygon.coordinates[0] && polygon.coordinates[0].length > 0);
});
