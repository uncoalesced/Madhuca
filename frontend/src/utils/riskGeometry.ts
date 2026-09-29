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
 * The map draws <region>.png (ml/render_risk.py): the grid interpolated smoothly and
 * clipped to the region's states and coast, instead of one square per 11 km cell.
 */
export function riskImageUrl(gridUrl: string): string {
  return gridUrl.replace(/\.json$/, '.png');
}

/** MapLibre image-source corners, clockwise from the top left. */
export function riskImageCoordinates(
  grid: Pick<RiskGridData, 'bbox'>,
): [[number, number], [number, number], [number, number], [number, number]] {
  const [west, south, east, north] = grid.bbox;
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
}
