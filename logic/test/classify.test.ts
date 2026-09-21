import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { classifyHotspot } from '../src/classify.ts';
import type { Hotspot, LandCoverMask } from '../src/types.ts';

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

  const start = performance.now();
  const classification = classifyHotspot(forestHotspot, delhiMask);
  const elapsed = performance.now() - start;

  assert.equal(classification.landCover, 'forest');
  assert.equal(classification.kind, 'likely-wildfire');
  // Must be well under the 10ms budget for Cloudflare Workers
  assert.ok(elapsed < 10, `Point-in-polygon took ${elapsed}ms, budget is 10ms`);
});
