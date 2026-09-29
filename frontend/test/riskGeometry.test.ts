import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riskGridToFeatureCollection, type RiskGridData } from '../src/utils/riskGeometry.ts';

const GRID: RiskGridData = {
  bbox: [76.7, 12.6, 76.9, 12.8],
  cellDeg: 0.1,
  cols: 2,
  rows: 2,
  // row 0 (south): [no data, p=0], row 1 (north): [p=0.5, p=1]
  risk: [0, 1, 128, 255],
  validFrom: '2026-09-29',
  validTo: '2026-10-12',
  model: 'test',
};

test('skips no-data cells only, keeps p=0 cells', () => {
  const fc = riskGridToFeatureCollection(GRID);
  assert.equal(fc.features.length, 3);
  assert.deepEqual(fc.features.map((f) => f.properties?.p), [0, 127 / 254, 1]);
});

test('cells are placed row-major from the south-west corner', () => {
  const fc = riskGridToFeatureCollection(GRID);
  const ring = (i: number) => fc.features[i].geometry.coordinates[0];
  // first kept cell is col 1, row 0
  assert.ok(Math.abs(ring(0)[0][0] - 76.8) < 1e-9 && Math.abs(ring(0)[0][1] - 12.6) < 1e-9);
  // last cell is col 1, row 1; its north-east corner is the bbox corner
  const ne = ring(2)[2];
  assert.ok(Math.abs(ne[0] - 76.9) < 1e-9 && Math.abs(ne[1] - 12.8) < 1e-9);
  assert.equal(ring(2).length, 5);
});

test('the published Telangana grid is consistent with its header', async () => {
  const { readFile } = await import('node:fs/promises');
  const g = JSON.parse(await readFile(new URL('../public/risk/telangana.json', import.meta.url), 'utf8')) as RiskGridData;
  assert.equal(g.risk.length, g.cols * g.rows);
  assert.ok(g.risk.every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
  const fc = riskGridToFeatureCollection(g);
  assert.equal(fc.features.length, g.risk.filter((v) => v > 0).length);
});
