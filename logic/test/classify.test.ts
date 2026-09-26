import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { classifyHotspot } from '../src/classify.ts';
import { REGION_BBOX } from '../src/hotspots.ts';
import { REGIONS, type Hotspot, type LandCoverMask } from '../src/types.ts';

const MOCK_MASK: LandCoverMask = {
  region: 'punjab',
  features: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { landCover: 'cropland' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [75.0, 30.0],
              [76.0, 30.0],
              [76.0, 31.0],
              [75.0, 31.0],
              [75.0, 30.0],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { landCover: 'forest' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [76.5, 31.5],
              [77.0, 31.5],
              [77.0, 32.0],
              [76.5, 32.0],
              [76.5, 31.5],
            ],
            // Interior hole inside forest: [76.75, 31.75] to [76.85, 31.85]
            [
              [76.75, 31.75],
              [76.85, 31.75],
              [76.85, 31.85],
              [76.75, 31.85],
              [76.75, 31.75],
            ],
          ],
        },
      },
    ],
  },
};

test('classifies a hotspot inside a cropland polygon during autumn stubble season as likely crop-burning', () => {
  const hotspot: Hotspot = {
    id: 'VIIRS:30.5:75.5:2026-10-25T10:00:00Z',
    lat: 30.5,
    lon: 75.5,
    frp: 35.0,
    confidence: 'n',
    acquiredAt: '2026-10-25T10:00:00Z',
    satellite: 'SNPP',
  };

  const result = classifyHotspot(hotspot, MOCK_MASK);
  assert.equal(result.landCover, 'cropland');
  assert.equal(result.kind, 'likely-crop-burning');
  assert.match(result.rationale, /stubble/i);
});

test('classifies a hotspot inside a forest polygon as likely wildfire', () => {
  const hotspot: Hotspot = {
    id: 'VIIRS:31.7:76.7:2026-05-15T10:00:00Z',
    lat: 31.7,
    lon: 76.7,
    frp: 50.0,
    confidence: 'h',
    acquiredAt: '2026-05-15T10:00:00Z',
    satellite: 'SNPP',
  };

  const result = classifyHotspot(hotspot, MOCK_MASK);
  assert.equal(result.landCover, 'forest');
  assert.equal(result.kind, 'likely-wildfire');
  assert.match(result.rationale, /forest/i);
});

test('treats a land-cover miss as other without throwing, and does NOT default to crop-burning', () => {
  // Coordinate outside both polygons in Telangana (scrubland origin story)
  const telanganaMask: LandCoverMask = {
    region: 'telangana',
    features: {
      type: 'FeatureCollection',
      features: [],
    },
  };

  const scrubFire: Hotspot = {
    id: 'VIIRS:17.5:78.5:2026-03-10T10:00:00Z',
    lat: 17.5,
    lon: 78.5,
    frp: 20.0,
    confidence: 'n',
    acquiredAt: '2026-03-10T10:00:00Z',
    satellite: 'SNPP',
  };

  const result = classifyHotspot(scrubFire, telanganaMask);
  assert.equal(result.landCover, 'other');
  assert.equal(result.kind, 'likely-wildfire');
  assert.match(result.rationale, /uncultivated|brush|wildfire/i);
});

test('classifies a hotspot in other during peak stubble season in Punjab with moderate FRP as likely crop-burning', () => {
  // A fire at field edge or unmapped boundary in Punjab during November stubble season
  const hotspot: Hotspot = {
    id: 'VIIRS:30.0:74.5:2026-11-05T10:00:00Z',
    lat: 30.0,
    lon: 74.5,
    frp: 25.0,
    confidence: 'n',
    acquiredAt: '2026-11-05T10:00:00Z',
    satellite: 'SNPP',
  };

  const result = classifyHotspot(hotspot, MOCK_MASK);
  assert.equal(result.landCover, 'other');
  assert.equal(result.kind, 'likely-crop-burning');
});

test('classifies extreme FRP (>150 MW) in cropland as likely wildfire', () => {
  const intenseFire: Hotspot = {
    id: 'VIIRS:30.5:75.5:2026-10-25T10:00:00Z',
    lat: 30.5,
    lon: 75.5,
    frp: 220.0, // Unusually intense for field stubble
    confidence: 'h',
    acquiredAt: '2026-10-25T10:00:00Z',
    satellite: 'SNPP',
  };

  const result = classifyHotspot(intenseFire, MOCK_MASK);
  assert.equal(result.landCover, 'cropland');
  assert.equal(result.kind, 'likely-wildfire');
});

test('handles real landcover mask file from frontend/public/landcover/delhi.json', () => {
  const rootDir = process.cwd().endsWith('logic') ? join(process.cwd(), '..') : process.cwd();
  const maskPath = join(rootDir, 'frontend', 'public', 'landcover', 'delhi.json');
  const rawJson = readFileSync(maskPath, 'utf-8');
  const delhiMask: LandCoverMask = JSON.parse(rawJson);

  // Forest hotspot inside Delhi feature 0 (approx 77.0193, 28.8813)
  const forestHotspot: Hotspot = {
    id: 'VIIRS:28.8813:77.0193:2026-06-01T10:00:00Z',
    lat: 28.88133,
    lon: 77.01933,
    frp: 30.0,
    confidence: 'h',
    acquiredAt: '2026-06-01T10:00:00Z',
    satellite: 'SNPP',
  };

  // The first call builds the mask index, paid once per isolate; its cost per region
  // is measured by worker/bench/cpu-budget.ts. Timing it here, while node --test runs
  // files in parallel, made this test flaky. What is timed is the per-hotspot lookup.
  classifyHotspot(forestHotspot, delhiMask);
  const start = performance.now();
  const classification = classifyHotspot(forestHotspot, delhiMask);
  const elapsed = performance.now() - start;

  assert.equal(classification.landCover, 'forest');
  assert.equal(classification.kind, 'likely-wildfire');
  // Must be well under the 10ms budget for Cloudflare Workers
  assert.ok(elapsed < 10, `Point-in-polygon took ${elapsed}ms, budget is 10ms`);
});

test('excludes hotspots located inside an interior polygon hole (falling back to other)', () => {
  // Inside the interior hole of the forest polygon: [76.80, 31.80]
  const holeHotspot: Hotspot = {
    id: 'VIIRS:31.80:76.80:2026-05-15T10:00:00Z',
    lat: 31.80,
    lon: 76.80,
    frp: 30.0,
    confidence: 'n',
    acquiredAt: '2026-05-15T10:00:00Z',
    satellite: 'SNPP',
  };

  const result = classifyHotspot(holeHotspot, MOCK_MASK);
  assert.equal(result.landCover, 'other');
  assert.equal(result.kind, 'likely-wildfire');
});

test('handles a hotspot exactly on a land-cover polygon boundary edge and vertex without throwing', () => {
  // Exactly on western edge: [75.0, 30.5]
  const edgeHotspot: Hotspot = {
    id: 'VIIRS:30.5:75.0:2026-10-25T10:00:00Z',
    lat: 30.5,
    lon: 75.0,
    frp: 25.0,
    confidence: 'n',
    acquiredAt: '2026-10-25T10:00:00Z',
    satellite: 'SNPP',
  };

  // Exactly on corner vertex: [75.0, 30.0]
  const vertexHotspot: Hotspot = {
    id: 'VIIRS:30.0:75.0:2026-10-25T10:00:00Z',
    lat: 30.0,
    lon: 75.0,
    frp: 25.0,
    confidence: 'n',
    acquiredAt: '2026-10-25T10:00:00Z',
    satellite: 'SNPP',
  };

  const edgeResult = classifyHotspot(edgeHotspot, MOCK_MASK);
  assert.ok(edgeResult.landCover === 'cropland' || edgeResult.landCover === 'other');
  assert.ok(edgeResult.kind === 'likely-crop-burning' || edgeResult.kind === 'likely-wildfire');
  assert.ok(edgeResult.rationale.length > 0);

  const vertexResult = classifyHotspot(vertexHotspot, MOCK_MASK);
  assert.ok(vertexResult.landCover === 'cropland' || vertexResult.landCover === 'other');
  assert.ok(vertexResult.kind === 'likely-crop-burning' || vertexResult.kind === 'likely-wildfire');
  assert.ok(vertexResult.rationale.length > 0);
});

test('handles empty or malformed mask gracefully without throwing', () => {
  const hotspot: Hotspot = {
    id: 'VIIRS:30.5:75.5:2026-10-25T10:00:00Z',
    lat: 30.5,
    lon: 75.5,
    frp: 25.0,
    confidence: 'n',
    acquiredAt: '2026-10-25T10:00:00Z',
    satellite: 'SNPP',
  };

  const emptyResult = classifyHotspot(hotspot, {} as LandCoverMask);
  assert.equal(emptyResult.landCover, 'other');
  assert.ok(emptyResult.kind);
  assert.ok(emptyResult.rationale);
});

test('classifies a cropland hotspot during spring wheat harvest season (April-May) as likely crop-burning', () => {
  const aprilHotspot: Hotspot = {
    id: 'VIIRS:30.5:75.5:2026-04-20T10:00:00Z',
    lat: 30.5,
    lon: 75.5,
    frp: 35.0,
    confidence: 'n',
    acquiredAt: '2026-04-20T10:00:00Z',
    satellite: 'SNPP',
  };

  const mayHotspot: Hotspot = {
    id: 'VIIRS:30.5:75.5:2026-05-10T10:00:00Z',
    lat: 30.5,
    lon: 75.5,
    frp: 30.0,
    confidence: 'n',
    acquiredAt: '2026-05-10T10:00:00Z',
    satellite: 'SNPP',
  };

  const aprilResult = classifyHotspot(aprilHotspot, MOCK_MASK);
  assert.equal(aprilResult.landCover, 'cropland');
  assert.equal(aprilResult.kind, 'likely-crop-burning');
  assert.match(aprilResult.rationale, /wheat-stubble/i);

  const mayResult = classifyHotspot(mayHotspot, MOCK_MASK);
  assert.equal(mayResult.landCover, 'cropland');
  assert.equal(mayResult.kind, 'likely-crop-burning');
});

test('handles MultiPolygon geometries correctly', () => {
  const multiPolyMask: LandCoverMask = {
    region: 'punjab',
    features: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { landCover: 'forest' },
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [70.0, 20.0],
                  [70.0, 21.0],
                  [71.0, 21.0],
                  [71.0, 20.0],
                  [70.0, 20.0],
                ],
              ],
              [
                [
                  [72.0, 22.0],
                  [72.0, 23.0],
                  [73.0, 23.0],
                  [73.0, 22.0],
                  [72.0, 22.0],
                ],
              ],
            ],
          },
        },
      ],
    },
  };

  const inPoly1: Hotspot = {
    id: 'VIIRS:20.5:70.5:2026-08-01T10:00:00Z',
    lat: 20.5,
    lon: 70.5,
    frp: 20,
    confidence: 'n',
    acquiredAt: '2026-08-01T10:00:00Z',
    satellite: 'SNPP',
  };

  const inPoly2: Hotspot = {
    id: 'VIIRS:22.5:72.5:2026-08-01T10:00:00Z',
    lat: 22.5,
    lon: 72.5,
    frp: 20,
    confidence: 'n',
    acquiredAt: '2026-08-01T10:00:00Z',
    satellite: 'SNPP',
  };

  const outside: Hotspot = {
    id: 'VIIRS:25.0:75.0:2026-08-01T10:00:00Z',
    lat: 25.0,
    lon: 75.0,
    frp: 20,
    confidence: 'n',
    acquiredAt: '2026-08-01T10:00:00Z',
    satellite: 'SNPP',
  };

  assert.equal(classifyHotspot(inPoly1, multiPolyMask).landCover, 'forest');
  assert.equal(classifyHotspot(inPoly2, multiPolyMask).landCover, 'forest');
  assert.equal(classifyHotspot(outside, multiPolyMask).landCover, 'other');
});

// --- Real masks: the index must agree with naive ray-casting, and be cheap ---

function hotspotAt(lon: number, lat: number, overrides: Partial<Hotspot> = {}): Hotspot {
  return {
    id: `VIIRS:${lat}:${lon}`,
    lat,
    lon,
    frp: 20,
    confidence: 'n',
    acquiredAt: '2026-10-15T10:00:00Z',
    satellite: 'SNPP',
    ...overrides,
  };
}

/** Deterministic points so a failure reproduces. */
function seededPoints(bbox: readonly number[], count: number): [number, number][] {
  const [west, south, east, north] = bbox as [number, number, number, number];
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: count }, () => [west + rand() * (east - west), south + rand() * (north - south)]);
}

/** Reference answer: ray-cast every polygon in mask order, first hit wins. */
function naiveLandCover(lon: number, lat: number, mask: LandCoverMask): string {
  const inRing = (ring: number[][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] as [number, number];
      const [xj, yj] = ring[j] as [number, number];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  for (const f of (mask.features as { features: any[] }).features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const [outer, ...holes] of polys) {
      if (inRing(outer) && !holes.some(inRing)) return f.properties.landCover;
    }
  }
  return 'other';
}

function loadMask(region: string): LandCoverMask {
  const rootDir = process.cwd().endsWith('logic') ? join(process.cwd(), '..') : process.cwd();
  return JSON.parse(readFileSync(join(rootDir, 'frontend', 'public', 'landcover', `${region}.json`), 'utf-8'));
}

for (const region of REGIONS) {
  test(`${region}: indexed lookup matches naive ray-casting on 400 points across the region bbox`, () => {
    const mask = loadMask(region);
    const seen = new Set<string>();
    for (const [lon, lat] of seededPoints(REGION_BBOX[region], 400)) {
      const got = classifyHotspot(hotspotAt(lon, lat), mask).landCover;
      assert.equal(got, naiveLandCover(lon, lat, mask), `at ${lon},${lat}`);
      seen.add(got);
    }
    // The sample must actually exercise polygons, not just misses.
    assert.ok(seen.has('cropland'), `${region}: no cropland hit in sample`);
  });
}

test('classifies a 1000-hotspot region loop inside the 10ms Workers budget once the mask is indexed', (t) => {
  // Bihar is the largest mask (~21k polygons, one with ~65k vertices).
  const mask = loadMask('bihar');
  const hotspots = seededPoints(REGION_BBOX.bihar, 1000).map(([lon, lat]) => hotspotAt(lon, lat));

  const buildStart = performance.now();
  classifyHotspot(hotspots[0]!, mask);
  t.diagnostic(`bihar index build: ${(performance.now() - buildStart).toFixed(1)}ms (once per mask object)`);

  for (const h of hotspots) classifyHotspot(h, mask); // JIT warm-up, as in a long-lived isolate
  const start = performance.now();
  for (const h of hotspots) classifyHotspot(h, mask);
  const elapsed = performance.now() - start;
  t.diagnostic(`1000 hotspots: ${elapsed.toFixed(2)}ms`);
  assert.ok(elapsed < 10, `1000-hotspot loop took ${elapsed}ms, budget is 10ms`);
});

// --- Grid boundaries: the cases that broke the first cut of the index ---

/** Cropland 0..1 with a hole; a forest island fills the hole. Cells are 0.05°. */
const ISLAND_MASK: LandCoverMask = {
  region: 'punjab',
  features: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { landCover: 'cropland' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
            // x = 0.3 floors into cell 5 but 6 * 0.05 is 0.30000000000000004, and
            // y = 0.325 is exactly the centre line of row 6.
            [[0.3, 0.3], [0.34, 0.3], [0.34, 0.325], [0.3, 0.325], [0.3, 0.3]],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { landCover: 'forest' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[0.3, 0.3], [0.34, 0.3], [0.34, 0.325], [0.3, 0.325], [0.3, 0.3]]],
        },
      },
    ],
  },
};

test('finds a polygon whose edge sits on a float-rounded cell boundary', () => {
  assert.equal(classifyHotspot(hotspotAt(0.31, 0.31), ISLAND_MASK).landCover, 'forest');
  assert.equal(classifyHotspot(hotspotAt(0.345, 0.31), ISLAND_MASK).landCover, 'cropland');
  assert.equal(classifyHotspot(hotspotAt(0.29, 0.31), ISLAND_MASK).landCover, 'cropland');
});

test('resolves points just above and below an edge lying exactly on a cell centre line', () => {
  assert.equal(classifyHotspot(hotspotAt(0.31, 0.324), ISLAND_MASK).landCover, 'forest');
  assert.equal(classifyHotspot(hotspotAt(0.31, 0.326), ISLAND_MASK).landCover, 'cropland');
  assert.equal(classifyHotspot(hotspotAt(0.31, 0.349), ISLAND_MASK).landCover, 'cropland');
});

test('resolves a sliver overlap between two polygons to the earlier feature, without corrupting the row', () => {
  const overlapMask: LandCoverMask = {
    region: 'punjab',
    features: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { landCover: 'cropland' },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.52, 0], [0.52, 1], [0, 1], [0, 0]]] } },
        { type: 'Feature', properties: { landCover: 'forest' },
          geometry: { type: 'Polygon', coordinates: [[[0.5, 0], [1, 0], [1, 1], [0.5, 1], [0.5, 0]]] } },
      ],
    },
  };
  assert.equal(classifyHotspot(hotspotAt(0.51, 0.5), overlapMask).landCover, 'cropland');
  assert.equal(classifyHotspot(hotspotAt(0.49, 0.5), overlapMask).landCover, 'cropland');
  // East of the overlap: still inside forest even though the sweep left cropland there.
  assert.equal(classifyHotspot(hotspotAt(0.53, 0.5), overlapMask).landCover, 'forest');
  assert.equal(classifyHotspot(hotspotAt(0.9, 0.5), overlapMask).landCover, 'forest');
});

test('does not mutate the caller\'s mask', () => {
  const before = JSON.stringify(ISLAND_MASK);
  classifyHotspot(hotspotAt(0.31, 0.31), ISLAND_MASK);
  assert.equal(JSON.stringify(ISLAND_MASK), before);
  assert.deepEqual(Object.keys((ISLAND_MASK.features as any).features[0].geometry.coordinates[0]), ['0', '1', '2', '3', '4']);
});

// --- Unknown inputs must not tilt an ambiguous fire toward crop-burning ---

test('an unparseable acquiredAt is an unknown season, not stubble season', () => {
  // Would match the Punjab stubble signature if the date were read as October.
  const result = classifyHotspot(hotspotAt(74.5, 30.0, { acquiredAt: 'not-a-date', frp: 25 }), MOCK_MASK);
  assert.equal(result.landCover, 'other');
  assert.equal(result.kind, 'likely-wildfire');
});

test('an unknown FRP does not match the moderate-FRP crop-burning signature on other land', () => {
  const result = classifyHotspot(hotspotAt(74.5, 30.0, { frp: Number.NaN }), MOCK_MASK);
  assert.equal(result.landCover, 'other');
  assert.equal(result.kind, 'likely-wildfire');
});

test('a Telangana scrub fire in peak stubble season with moderate FRP is still likely wildfire', () => {
  const mask = loadMask('telangana');
  // Find a real 'other' point in Telangana rather than assuming one.
  const point = seededPoints(REGION_BBOX.telangana, 2000).find(([lon, lat]) => naiveLandCover(lon, lat, mask) === 'other');
  assert.ok(point, 'no other-land point found in Telangana sample');
  const result = classifyHotspot(hotspotAt(point[0], point[1], { acquiredAt: '2026-11-05T10:00:00Z', frp: 25 }), mask);
  assert.equal(result.landCover, 'other');
  assert.equal(result.kind, 'likely-wildfire');
});
