import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { parseRiskGrid } from '../src/risk.ts';

const PUBLISHED = join(import.meta.dirname, '..', '..', 'frontend', 'public', 'risk', 'telangana.json');
// The Telangana / AP box this grid was trained on: REGION_BBOX.telangana before the
// 29 Sept regions pivot. Grids made since then use the new zones (ml-risk defaults to 'south').
const TELANGANA_AP: [number, number, number, number] = [76.7, 12.6, 84.8, 19.95];

const published = () => JSON.parse(readFileSync(PUBLISHED, 'utf8')) as Record<string, unknown>;

test('the published Telangana / AP grid validates as a RiskGrid and is under 50 KB', () => {
  const grid = parseRiskGrid(published());
  assert.equal(grid.region, 'telangana');
  assert.deepEqual(grid.bbox, TELANGANA_AP);
  assert.equal(grid.cols * grid.rows, grid.risk.length);
  assert.deepEqual([grid.cols, grid.rows], [81, 74]);
  assert.match(grid.model, /experimental statistical estimate/);
  assert.ok(statSync(PUBLISHED).size < 50 * 1024, 'issue #21 caps the grid at 50 KB');
  // Cells outside India are 0 ("no data"); every scored cell is at least 1, so a low
  // probability can never be mistaken for the no-data value.
  assert.ok(grid.risk.some((v) => v === 0));
  assert.ok(grid.risk.some((v) => v > 1));
});

test('a grid whose values do not fill its cells is rejected, not half-read', () => {
  const short = published();
  short.risk = (short.risk as number[]).slice(1);
  assert.throws(() => parseRiskGrid(short), /5993 values for 81 x 74 cells/);
});

test('a grid whose size does not match its bbox is rejected', () => {
  const wrong = published();
  wrong.cols = 80;
  wrong.risk = (wrong.risk as number[]).slice(0, 80 * 74);
  assert.throws(() => parseRiskGrid(wrong), /does not match its bbox/);
});

test('values outside 0-255, bad dates, a flipped bbox or a missing model are rejected', () => {
  const cases: [string, (g: Record<string, unknown>) => void, RegExp][] = [
    ['value 256', (g) => ((g.risk as number[])[0] = 256), /not an integer 0-255/],
    ['fractional value', (g) => ((g.risk as number[])[0] = 0.5), /not an integer 0-255/],
    ['date format', (g) => (g.validFrom = '29/09/2026'), /YYYY-MM-DD/],
    ['dates reversed', (g) => ((g.validFrom = '2026-10-13'), (g.validTo = '2026-10-12')), /after validTo/],
    ['flipped bbox', (g) => (g.bbox = [84.8, 12.6, 76.7, 19.95]), /not \[west, south, east, north\]/],
    ['no model', (g) => (g.model = ''), /names no model/],
    ['no region', (g) => delete g.region, /no region/],
  ];
  for (const [name, spoil, message] of cases) {
    const g = published();
    spoil(g);
    assert.throws(() => parseRiskGrid(g), message, name);
  }
  assert.throws(() => parseRiskGrid(null), /not an object/);
});
