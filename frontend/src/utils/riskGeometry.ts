/**
 * Fire-risk grid as published by ml/train_risk.py to frontend/public/risk/<region>.json.
 * Mirrors the RiskGrid shape agreed in contract issue #20; swap for the import from
 * @madhuca/logic once that type lands.
 */
export interface RiskGridData {
  bbox: readonly [number, number, number, number];
  cellDeg: number;
  cols: number;
  rows: number;
  /** Row-major from the south-west corner. 0 = no data (not safe), else 1 + round(254 * p). */
  risk: number[];
  validFrom: string;
  validTo: string;
  model: string;
}

/**
 * One square polygon per cell that has data, with `p` the model's probability.
 * Cells with value 0 are skipped because they are outside the model's area, never
 * because they are low risk.
 */
export function riskGridToFeatureCollection(grid: RiskGridData): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const [west, south] = grid.bbox;
  const d = grid.cellDeg;
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const v = grid.risk[r * grid.cols + c];
      if (!v) continue;
      const x0 = west + c * d;
      const y0 = south + r * d;
      const x1 = x0 + d;
      const y1 = y0 + d;
      features.push({
        type: 'Feature',
        properties: { p: (v - 1) / 254 },
        geometry: { type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
