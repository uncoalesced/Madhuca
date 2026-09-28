import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { classifyHotspot, decodeMaskIndex, encodeMaskIndex } from '../src/classify.ts';
import { REGION_BBOX } from '../src/hotspots.ts';
import { REGIONS, type Hotspot, type LandCoverMask } from '../src/types.ts';

const LANDCOVER = join(import.meta.dirname, '..', '..', 'frontend', 'public', 'landcover');

function hotspotAt(lat: number, lon: number, i: number): Hotspot {
  // Rotate months and FRP so the non-land-cover branches get exercised too.
  const month = String((i % 12) + 1).padStart(2, '0');
  return { id: `t:${i}`, lat, lon, frp: 2 + (i % 70), confidence: 'n', acquiredAt: `2026-${month}-15T08:00:00Z`, satellite: 'N' };
}

for (const region of REGIONS) {
  test(`${region}: the prebuilt index classifies 600 points exactly as the JSON mask does`, () => {
    const mask = JSON.parse(readFileSync(join(LANDCOVER, `${region}.json`), 'utf8')) as LandCoverMask;
    const prebuilt = decodeMaskIndex(region, encodeMaskIndex(mask));

    const [w, s, e, n] = REGION_BBOX[region];
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) {
      // Deterministic, well-spread points (golden-ratio sequence) over the region box.
      const lat = s + ((i * 0.6180339887) % 1) * (n - s);
      const lon = w + ((i * 0.7548776662) % 1) * (e - w);
      const hs = hotspotAt(lat, lon, i);
      const expected = classifyHotspot(hs, mask);
      assert.deepEqual(classifyHotspot(hs, prebuilt), expected, `${region} ${lat},${lon}`);
      seen.add(expected.landCover);
    }
    // Delhi's mask is small, but every other region must have hit real polygons,
    // or this would only be comparing 'other' with 'other'.
    if (region !== 'delhi') assert.ok(seen.has('cropland'), `${region}: no cropland point sampled`);
  });
}

test('a decoded index keeps the region, so the other-land-cover rule still sees it', () => {
  const empty: LandCoverMask = { region: 'telangana', features: { type: 'FeatureCollection', features: [] } };
  const prebuilt = decodeMaskIndex('telangana', encodeMaskIndex(empty));
  assert.equal(prebuilt.region, 'telangana');
  // Telangana 'other' in stubble season is not a stubble region: wildfire, as with the JSON mask.
  const hs = hotspotAt(17.5, 78.5, 9); // October, FRP 11
  assert.equal(classifyHotspot(hs, prebuilt).kind, 'likely-wildfire');
  assert.deepEqual(classifyHotspot(hs, prebuilt), classifyHotspot(hs, empty));
});

test('rejects a file that is not a complete current-version index instead of misreading it', () => {
  const good = encodeMaskIndex(JSON.parse(readFileSync(join(LANDCOVER, 'delhi.json'), 'utf8')) as LandCoverMask);
  assert.throws(() => decodeMaskIndex('delhi', good.slice(0, 40)), /truncated/);
  assert.throws(() => decodeMaskIndex('delhi', good.slice(0, good.byteLength - 4)), /expected/);
  assert.throws(() => decodeMaskIndex('delhi', new TextEncoder().encode('{"region":"delhi","features":[]}      ').buffer as ArrayBuffer), /truncated|version-2/);
  assert.throws(() => decodeMaskIndex('delhi', new ArrayBuffer(200)), /version-2/);
});

// Issue #24: version 1 stored edges as float32, which moved vertices by up to ~1m and
// flipped these three points (each within that distance of an edge) from 'other' to land.
// A plain even-odd ray cast over the mask's own float64 coordinates says 'other' for all three.
test('points within a metre of an edge get the exact ray-cast answer (issue #24)', () => {
  const mask = JSON.parse(readFileSync(join(LANDCOVER, 'telangana.json'), 'utf8')) as LandCoverMask;
  const prebuilt = decodeMaskIndex('telangana', encodeMaskIndex(mask));
  for (const [lon, lat] of [
    [79.2207, 14.0203],
    [79.2207, 16.1203],
    [79.9207, 18.9203],
  ] as const) {
    const hs = hotspotAt(lat, lon, 5);
    assert.equal(classifyHotspot(hs, mask).landCover, 'other', `${lon},${lat} from JSON`);
    assert.equal(classifyHotspot(hs, prebuilt).landCover, 'other', `${lon},${lat} from .bin`);
  }
});
