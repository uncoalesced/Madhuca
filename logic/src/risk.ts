import type { RiskGrid } from './types.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Cells along one side: same rounding as ml/export_cells.ts, so 8.1 / 0.1 is 81, not 80.99999. */
function cellsAlong(span: number, cellDeg: number): number {
  return Math.ceil(Math.round((span / cellDeg) * 1e6) / 1e6);
}

/**
 * Validate a fire-risk grid as published to frontend/public/risk/<area>.json and return
 * it typed. Throws on anything malformed rather than returning a partial grid: a grid
 * read wrongly would draw risk in the wrong cells, and a missing cell must stay "no
 * data", never turn into a low value that reads as safe.
 */
export function parseRiskGrid(body: unknown): RiskGrid {
  const g = body as Partial<Record<keyof RiskGrid, unknown>> | null;
  if (!g || typeof g !== 'object') throw new Error('risk grid is not an object');

  if (typeof g.region !== 'string' || !g.region) throw new Error('risk grid has no region');
  const bbox = g.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error('risk grid bbox must be four numbers [west, south, east, north]');
  }
  const [west, south, east, north] = bbox as [number, number, number, number];
  if (!(west < east && south < north)) throw new Error('risk grid bbox is not [west, south, east, north]');

  const { cellDeg, cols, rows, risk } = g;
  if (typeof cellDeg !== 'number' || !(cellDeg > 0)) throw new Error('risk grid cellDeg must be positive');
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || (cols as number) < 1 || (rows as number) < 1) {
    throw new Error('risk grid cols and rows must be positive integers');
  }
  if (cols !== cellsAlong(east - west, cellDeg) || rows !== cellsAlong(north - south, cellDeg)) {
    throw new Error(`risk grid is ${cols} x ${rows} cells, which does not match its bbox at ${cellDeg} deg`);
  }
  if (!Array.isArray(risk) || risk.length !== (cols as number) * (rows as number)) {
    throw new Error(`risk grid has ${Array.isArray(risk) ? risk.length : 'no'} values for ${cols} x ${rows} cells`);
  }
  for (let i = 0; i < risk.length; i++) {
    const v = risk[i];
    if (!Number.isInteger(v) || v < 0 || v > 255) throw new Error(`risk grid value ${i} is not an integer 0-255`);
  }

  const { validFrom, validTo, model } = g;
  if (typeof validFrom !== 'string' || !ISO_DATE.test(validFrom) || typeof validTo !== 'string' || !ISO_DATE.test(validTo)) {
    throw new Error('risk grid validFrom / validTo must be YYYY-MM-DD dates');
  }
  if (validFrom > validTo) throw new Error('risk grid validFrom is after validTo');
  if (typeof model !== 'string' || !model) throw new Error('risk grid names no model');

  return {
    region: g.region,
    bbox: [west, south, east, north],
    cellDeg,
    cols: cols as number,
    rows: rows as number,
    risk: risk as number[],
    validFrom,
    validTo,
    model,
  };
}
