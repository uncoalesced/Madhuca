// Per-cell static features for the risk model, computed with the app's own code.
//
//   node ml/export_cells.ts telangana
//
// Writes ml/data/<region>-cells.json: the region box (REGION_BBOX, so the model grid
// and the app can never disagree), and for every 0.1 degree cell, row-major from the
// south-west corner, whether it lies in India (insideIndia, the same check that drops
// foreign FIRMS rows) and the share of a 5 x 5 sample of points the classifier's own
// land-cover lookup puts in forest and cropland. Offline only.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { classifyHotspot, REGION_BBOX, REGIONS, type LandCoverMask, type Region } from '@madhuca/logic';
import { insideIndia } from '../logic/src/hotspots.ts';

export const CELL_DEG = 0.1;
const SAMPLES = 5;

const region = process.argv[2] as Region;
if (!REGIONS.includes(region)) throw new Error(`usage: node ml/export_cells.ts <${REGIONS.join('|')}>`);

const root = join(import.meta.dirname, '..');
const mask = JSON.parse(readFileSync(join(root, 'frontend', 'public', 'landcover', `${region}.json`), 'utf8')) as LandCoverMask;
const [w, s, e, n] = REGION_BBOX[region];
// Rounded so 8.1 / 0.1 is 81, not 80.99999.
const cols = Math.ceil(Math.round(((e - w) / CELL_DEG) * 1e6) / 1e6);
const rows = Math.ceil(Math.round(((n - s) / CELL_DEG) * 1e6) / 1e6);

const india: number[] = [];
const forest: number[] = [];
const cropland: number[] = [];
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const x0 = w + c * CELL_DEG;
    const y0 = s + r * CELL_DEG;
    let inIndia = 0;
    let f = 0;
    let k = 0;
    for (let i = 0; i < SAMPLES; i++) {
      for (let j = 0; j < SAMPLES; j++) {
        const lon = x0 + ((i + 0.5) / SAMPLES) * CELL_DEG;
        const lat = y0 + ((j + 0.5) / SAMPLES) * CELL_DEG;
        if (!insideIndia(region, lon, lat)) continue;
        inIndia++;
        const lc = classifyHotspot(
          { id: 'cell', lat, lon, frp: 10, confidence: 'n', acquiredAt: '2026-01-01T00:00:00Z', satellite: 'N' },
          mask,
        ).landCover;
        if (lc === 'forest') f++;
        else if (lc === 'cropland') k++;
      }
    }
    const total = SAMPLES * SAMPLES;
    india.push(Math.round((inIndia / total) * 100) / 100);
    forest.push(Math.round((f / total) * 100) / 100);
    cropland.push(Math.round((k / total) * 100) / 100);
  }
}

mkdirSync(join(root, 'ml', 'data'), { recursive: true });
const out = join(root, 'ml', 'data', `${region}-cells.json`);
writeFileSync(out, JSON.stringify({ region, bbox: [w, s, e, n], cellDeg: CELL_DEG, cols, rows, india, forest, cropland }));
const land = india.filter((v) => v > 0).length;
console.log(`${region}: ${cols} x ${rows} = ${cols * rows} cells, ${land} touch India -> ${out}`);
