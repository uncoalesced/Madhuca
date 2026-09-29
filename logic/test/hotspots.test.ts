import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fetchHotspots, parseHotspotCsv, REGION_BBOX } from '../src/hotspots.ts';

// A recorded FIRMS VIIRS_SNPP_NRT area response. Header is the real column set;
// the rows are two Punjab detections, the older one listed first on purpose so
// the ordering assertion below means something.
const RECORDED_CSV = `country_id,latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
IND,30.87234,75.12345,330.5,0.42,0.38,2026-09-20,2136,N,VIIRS,n,2.0NRT,295.1,4.7,N
IND,31.10111,75.98765,367.2,0.45,0.40,2026-09-21,0812,N20,VIIRS,h,2.0NRT,301.4,12.3,D
`;

function withStubbedFetch<T>(handler: (url: string) => Response, run: () => Promise<T>) {
  const original = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    seen.push(url);
    return handler(url);
  }) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  }).then((value) => ({ value, seen }));
}

test('parses a recorded FIRMS CSV into hotspots', () => {
  const hotspots = parseHotspotCsv(RECORDED_CSV);

  assert.equal(hotspots.length, 2);
  assert.deepEqual(hotspots[1], {
    id: 'N:30.87234:75.12345:2026-09-20T21:36:00Z',
    lat: 30.87234,
    lon: 75.12345,
    frp: 4.7,
    confidence: 'n',
    acquiredAt: '2026-09-20T21:36:00Z',
    satellite: 'N',
  });
});

test('orders hotspots newest first', () => {
  const [newest, oldest] = parseHotspotCsv(RECORDED_CSV);

  assert.equal(newest?.acquiredAt, '2026-09-21T08:12:00Z');
  assert.equal(oldest?.acquiredAt, '2026-09-20T21:36:00Z');
});

test('keeps FIRMS confidence raw rather than normalising it', () => {
  // VIIRS reports l/n/h, MODIS reports 0-100. Jammy's classifier reads this, so
  // it has to arrive exactly as FIRMS sent it.
  const confidences = parseHotspotCsv(RECORDED_CSV).map((h) => h.confidence);
  assert.deepEqual(confidences, ['h', 'n']);
});

test('zero-pads a three-digit acq_time', () => {
  const csv = RECORDED_CSV.replace(',2026-09-20,2136,', ',2026-09-20,342,');
  const late = parseHotspotCsv(csv).find((h) => h.satellite === 'N');

  assert.equal(late?.acquiredAt, '2026-09-20T03:42:00Z');
});

test('throws when FIRMS answers a bad key with HTTP 200 and plain text', () => {
  // This is the real failure mode: status 200, body "Invalid MAP_KEY.".
  assert.throws(() => parseHotspotCsv('Invalid MAP_KEY.'), /did not return CSV/);
});

test('treats an empty result set as zero hotspots, not an error', () => {
  const headerOnly = RECORDED_CSV.split('\n')[0] ?? '';
  assert.deepEqual(parseHotspotCsv(headerOnly), []);
});

test('rejects an empty map key before making a request', async () => {
  await assert.rejects(() => fetchHotspots('north', ''), /FIRMS_MAP_KEY is empty/);
});

test('queries the selected region bbox and never leaks the key in an error', async () => {
  const { value, seen } = await withStubbedFetch(
    () => new Response(RECORDED_CSV, { status: 200 }),
    () => fetchHotspots('north', 'secret-key'),
  );

  assert.equal(value.length, 2);
  assert.ok(seen[0]?.includes(REGION_BBOX.north.join(',')), seen[0]);
  assert.ok(seen[0]?.includes('VIIRS_SNPP_NRT'));

  const { seen: failed } = await withStubbedFetch(
    () => new Response('nope', { status: 503, statusText: 'Service Unavailable' }),
    async () => {
      const error = await fetchHotspots('north', 'secret-key').catch((e: unknown) => e);
      assert.ok(error instanceof Error);
      assert.match(error.message, /503/);
      assert.ok(!error.message.includes('secret-key'), 'map key leaked into the error');
      return null;
    },
  );
  assert.equal(failed.length, 1);
});

test('every region has a west,south,east,north bbox', () => {
  for (const [region, [west, south, east, north]] of Object.entries(REGION_BBOX)) {
    assert.ok(west < east, `${region} bbox west/east inverted`);
    assert.ok(south < north, `${region} bbox south/north inverted`);
  }
});
