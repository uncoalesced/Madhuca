import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fetchWind, parseWind } from '../src/wind.ts';

// Recorded live from Open-Meteo GFS on 2026-09-21 for Ludhiana, Punjab:
//   curl "https://api.open-meteo.com/v1/gfs?latitude=30.9&longitude=75.85\
//   &current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms"
const RECORDED = {
  latitude: 30.868858,
  longitude: 75.82031,
  utc_offset_seconds: 0,
  timezone: 'GMT',
  current_units: { time: 'iso8601', wind_speed_10m: 'm/s', wind_direction_10m: '°' },
  current: {
    time: '2026-09-21T11:45',
    interval: 900,
    wind_speed_10m: 4.68,
    wind_direction_10m: 20,
  },
};

test('parses a recorded Open-Meteo response into Wind', () => {
  assert.deepEqual(parseWind(RECORDED), {
    speedMs: 4.68,
    directionDeg: 20,
    observedAt: '2026-09-21T11:45:00Z',
  });
});

test('leaves the direction meteorological — the direction wind blows FROM', () => {
  // Rotating by 180 here would silently point every plume the wrong way. That
  // flip belongs in the dispersion module, on Plume.bearingDeg.
  assert.equal(parseWind(RECORDED).directionDeg, RECORDED.current.wind_direction_10m);
});

test('marks the timestamp as UTC', () => {
  // Open-Meteo answers in the requested timezone, which defaults to GMT, and
  // sends it unmarked. Wind.observedAt is specified as ISO 8601 UTC.
  assert.ok(parseWind(RECORDED).observedAt.endsWith('Z'));
  assert.equal(
    parseWind({ ...RECORDED, current: { ...RECORDED.current, time: '2026-09-21T11:45:00Z' } })
      .observedAt,
    '2026-09-21T11:45:00Z',
  );
});

test('keeps a dead calm as a real reading rather than an error', () => {
  // Calm is a normal answer in a Delhi winter inversion, and it is exactly when
  // people check the map. Degrading on calm is the dispersion module's job.
  const calm = parseWind({ ...RECORDED, current: { ...RECORDED.current, wind_speed_10m: 0 } });
  assert.equal(calm.speedMs, 0);
});

test('throws when the response carries no current wind block', () => {
  assert.throws(() => parseWind({ error: true, reason: 'no data' }), /no usable current/);
  assert.throws(() => parseWind(null), /no usable current/);
  assert.throws(
    () => parseWind({ current: { time: '2026-09-21T11:45', wind_speed_10m: '4.68' } }),
    /no usable current/,
  );
});

test('requests m/s and current 10m wind for the given coordinate', async () => {
  const original = globalThis.fetch;
  let requested = '';
  globalThis.fetch = (async (input: string | URL | Request) => {
    requested = String(input);
    return new Response(JSON.stringify(RECORDED), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const wind = await fetchWind(30.9, 75.85);
    assert.equal(wind.speedMs, 4.68);
  } finally {
    globalThis.fetch = original;
  }

  assert.match(requested, /latitude=30\.9/);
  assert.match(requested, /longitude=75\.85/);
  assert.match(requested, /wind_speed_unit=ms/);
  assert.match(requested, /current=wind_speed_10m,wind_direction_10m/);
});

test('surfaces a non-OK HTTP status', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response('', { status: 429, statusText: 'Too Many Requests' })) as typeof fetch;

  try {
    await assert.rejects(() => fetchWind(30.9, 75.85), /429/);
  } finally {
    globalThis.fetch = original;
  }
});
