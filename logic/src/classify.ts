import type { Classification, Hotspot, LandCover, LandCoverMask } from './types';

/**
 * Grid index over the mask for point-in-polygon lookups.
 *
 * Still plain ray-casting (crossing parity), just made local: the published masks
 * are dominated by one or two region-spanning polygons (Bihar's largest cropland
 * polygon has ~65k vertices and ~13k holes), so casting a ray across a whole
 * polygon costs close to a millisecond per hotspot. Instead each grid cell stores
 * the edges that touch it plus which polygon contains the cell's centre, and a
 * lookup counts crossings only along a short path from that centre to the point.
 *
 * Built once per mask and cached against the mask object, so the build is paid
 * once per region load and every hotspot after that costs a few dozen edge tests.
 * That region loop, not one hotspot, is what the 10ms Workers budget covers.
 */
interface MaskIndex {
  /** Land cover per polygon; polygon ids index into this. */
  landCovers: ('cropland' | 'forest')[];
  minX: number;
  minY: number;
  cols: number;
  rows: number;
  /** Per cell: flat [x1, y1, x2, y2, polygonId, ...] for every edge touching the cell. */
  edges: (number[] | undefined)[];
  /**
   * Per cell: ids of the polygons containing the cell centre, ascending. Nearly
   * always zero or one — but the pipeline simplifies each polygon independently,
   * so neighbours can overlap by a sliver, and a lookup must not assume otherwise.
   */
  centre: (readonly number[])[];
}

const NONE: readonly number[] = [];

/** ~5.5 km. Keeps edges per cell in the tens for the 390m-resolution masks. */
const CELL_DEG = 0.05;
const EDGE_STRIDE = 5;

const indexCache = new WeakMap<object, MaskIndex>();

type Ring = readonly (readonly number[])[];

function isRing(value: unknown): value is Ring {
  return Array.isArray(value) && value.length >= 3 && Array.isArray(value[0]);
}

/** Accepts the published shape (`features` is a FeatureCollection) or a bare feature array. */
function extractFeatures(mask: LandCoverMask): unknown[] {
  const features = mask.features as { features?: unknown } | unknown[] | null | undefined;
  if (Array.isArray(features)) return features;
  if (features && Array.isArray(features.features)) return features.features;
  return [];
}

function buildIndex(mask: LandCoverMask): MaskIndex {
  const landCovers: ('cropland' | 'forest')[] = [];
  const polygons: Ring[][] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const feature of extractFeatures(mask)) {
    const f = feature as {
      properties?: { landCover?: unknown };
      geometry?: { type?: unknown; coordinates?: unknown };
    } | null;
    const landCover = f?.properties?.landCover;
    if (landCover !== 'cropland' && landCover !== 'forest') continue;
    const geom = f?.geometry;
    if (!geom || !Array.isArray(geom.coordinates)) continue;
    const parts =
      geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (const part of parts) {
      if (!Array.isArray(part) || !isRing(part[0])) continue;
      for (const pt of part[0]) {
        const x = pt[0]!;
        const y = pt[1]!;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      landCovers.push(landCover);
      polygons.push(part.filter(isRing));
    }
  }

  if (polygons.length === 0 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { landCovers, minX: 0, minY: 0, cols: 0, rows: 0, edges: [], centre: [] };
  }

  const cols = Math.floor((maxX - minX) / CELL_DEG) + 1;
  const rows = Math.floor((maxY - minY) / CELL_DEG) + 1;
  const edges: (number[] | undefined)[] = new Array(cols * rows);

  for (let k = 0; k < polygons.length; k++) {
    for (const ring of polygons[k]!) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const x1 = ring[j]![0]!;
        const y1 = ring[j]![1]!;
        const x2 = ring[i]![0]!;
        const y2 = ring[i]![1]!;
        if (x1 === x2 && y1 === y2) continue;
        const c0 = Math.floor((Math.min(x1, x2) - minX) / CELL_DEG);
        const c1 = Math.floor((Math.max(x1, x2) - minX) / CELL_DEG);
        const r0 = Math.floor((Math.min(y1, y2) - minY) / CELL_DEG);
        const r1 = Math.floor((Math.max(y1, y2) - minY) / CELL_DEG);
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            (edges[r * cols + c] ??= []).push(x1, y1, x2, y2, k);
          }
        }
      }
    }
  }

  // Which polygon contains each cell centre: sweep each row's centre line from the
  // grid's west edge (outside everything), toggling parity at every edge crossing.
  // A crossing belongs to the cell its x floors into — the same formula that
  // registered the edge. Comparing against `minX + c * CELL_DEG` instead drops
  // crossings on cell boundaries to float error (6 * 0.05 !== 0.3), and polygonized
  // raster edges sit on those boundaries often.
  const centre: (readonly number[])[] = new Array(cols * rows);
  const inside = new Set<number>();
  const west: number[] = [];
  const east: number[] = [];
  const toggle = (crossed: number[]) => {
    for (const k of crossed) {
      if (!inside.delete(k)) inside.add(k);
    }
  };
  for (let r = 0; r < rows; r++) {
    inside.clear();
    let snapshot = NONE;
    const yc = minY + (r + 0.5) * CELL_DEG;
    for (let c = 0; c < cols; c++) {
      const xc = minX + (c + 0.5) * CELL_DEG;
      const cell = edges[r * cols + c];
      if (cell) {
        west.length = 0;
        east.length = 0;
        for (let e = 0; e < cell.length; e += EDGE_STRIDE) {
          const y1 = cell[e + 1]!;
          const y2 = cell[e + 3]!;
          if (y1 > yc === y2 > yc) continue;
          const x1 = cell[e]!;
          const x = x1 + ((yc - y1) * (cell[e + 2]! - x1)) / (y2 - y1);
          if (Math.floor((x - minX) / CELL_DEG) !== c) continue;
          (x < xc ? west : east).push(cell[e + 4]!);
        }
        if (west.length > 0) {
          toggle(west);
          snapshot = inside.size === 0 ? NONE : [...inside].sort((a, b) => a - b);
        }
        centre[r * cols + c] = snapshot;
        if (east.length > 0) {
          toggle(east);
          snapshot = inside.size === 0 ? NONE : [...inside].sort((a, b) => a - b);
        }
      } else {
        centre[r * cols + c] = snapshot;
      }
    }
  }

  return { landCovers, minX, minY, cols, rows, edges, centre };
}

/**
 * Land cover at a coordinate from the precomputed mask. Only cropland and forest
 * polygons exist in the mask, so a miss is 'other' — the third value, never an error.
 */
function findLandCover(lon: number, lat: number, mask: LandCoverMask): LandCover {
  if (!mask || typeof mask !== 'object' || !Number.isFinite(lon) || !Number.isFinite(lat)) return 'other';
  let index = indexCache.get(mask);
  if (!index) {
    index = buildIndex(mask);
    indexCache.set(mask, index);
  }

  const c = Math.floor((lon - index.minX) / CELL_DEG);
  const r = Math.floor((lat - index.minY) / CELL_DEG);
  if (c < 0 || c >= index.cols || r < 0 || r >= index.rows) return 'other';

  const cellId = r * index.cols + c;
  const start = index.centre[cellId]!;
  const cell = index.edges[cellId];
  if (!cell) return start.length === 0 ? 'other' : index.landCovers[start[0]!]!;

  // Path centre -> (lon, yc) -> (lon, lat), both legs inside this cell. Each edge
  // crossing flips membership of that edge's polygon. Crossings are assigned with
  // the same half-open rules as the build sweep, so the two agree at the centre.
  const xc = index.minX + (c + 0.5) * CELL_DEG;
  const yc = index.minY + (r + 0.5) * CELL_DEG;
  const hx0 = Math.min(xc, lon);
  const hx1 = Math.max(xc, lon);
  const vy0 = Math.min(yc, lat);
  const vy1 = Math.max(yc, lat);
  let flips: Map<number, number> | undefined;
  for (let e = 0; e < cell.length; e += EDGE_STRIDE) {
    const x1 = cell[e]!;
    const y1 = cell[e + 1]!;
    const x2 = cell[e + 2]!;
    const y2 = cell[e + 3]!;
    let crossings = 0;
    if (y1 > yc !== y2 > yc) {
      const x = x1 + ((yc - y1) * (x2 - x1)) / (y2 - y1);
      if (x >= hx0 && x < hx1) crossings++;
    }
    if (x1 > lon !== x2 > lon) {
      // `y > yc` above treats the centre line as just above yc, so an edge lying
      // exactly on yc is below the leg's start: the interval is open at yc's side.
      const y = y1 + ((lon - x1) * (y2 - y1)) / (x2 - x1);
      if (y > vy0 && y <= vy1) crossings++;
    }
    if (crossings === 1) {
      const k = cell[e + 4]!;
      (flips ??= new Map()).set(k, (flips.get(k) ?? 0) ^ 1);
    }
  }

  if (!flips) return start.length === 0 ? 'other' : index.landCovers[start[0]!]!;

  // Containing polygons = centre's set XOR odd flips. On a sliver overlap, the
  // lowest id (earliest feature in the mask) wins, deterministically.
  let best = -1;
  for (const k of start) {
    if (!flips.get(k)) {
      best = k;
      break;
    }
  }
  for (const [k, odd] of flips) {
    if (odd && !start.includes(k) && (best === -1 || k < best)) best = k;
  }
  return best === -1 ? 'other' : index.landCovers[best]!;
}

/**
 * Tag a hotspot as likely crop/stubble burning vs. likely wildfire.
 * In: one hotspot + the precomputed land-cover mask for its region.
 * Out: a kind, the land cover it landed in, and a plain-language rationale.
 * Crop-burning fires are still shown — tagged differently, never dropped.
 * Pass the same mask object for every hotspot in a region: its spatial index is
 * built on first use and cached against that object.
 * Owner: Jammy (delegation/jammy.md — classification module).
 */
export function classifyHotspot(hotspot: Hotspot, landCoverMask: LandCoverMask): Classification {
  const landCover = findLandCover(hotspot.lon, hotspot.lat, landCoverMask);

  // UTC month, 1-12. An unparseable timestamp is an unknown season — it must not
  // fall into stubble season and tilt an ambiguous fire toward crop-burning.
  const time = Date.parse(hotspot.acquiredAt);
  const month = Number.isNaN(time) ? null : new Date(time).getUTCMonth() + 1;
  const isAutumnStubbleSeason = month === 10 || month === 11;
  const isSpringHarvestSeason = month === 4 || month === 5;
  // Unknown FRP stays null rather than a guessed "moderate" value, for the same reason.
  const frp = Number.isFinite(hotspot.frp) ? hotspot.frp : null;

  if (landCover === 'forest') {
    return {
      kind: 'likely-wildfire',
      landCover,
      rationale: 'Thermal anomaly detected within designated forest land cover; characteristic of forest wildfire.',
    };
  }

  if (landCover === 'cropland') {
    if (frp !== null && frp > 150) {
      return {
        kind: 'likely-wildfire',
        landCover,
        rationale:
          'Thermal anomaly located in cropland, but exceptionally high radiative power (>150 MW) suggests an intense wildfire rather than crop-residue burning.',
      };
    }

    if (isAutumnStubbleSeason) {
      return {
        kind: 'likely-crop-burning',
        landCover,
        rationale:
          'Thermal anomaly detected in agricultural cropland during peak autumn paddy-stubble burning season.',
      };
    }

    if (isSpringHarvestSeason) {
      return {
        kind: 'likely-crop-burning',
        landCover,
        rationale:
          'Thermal anomaly detected in agricultural cropland during post-harvest wheat-stubble burning season.',
      };
    }

    return {
      kind: 'likely-crop-burning',
      landCover,
      rationale:
        'Thermal anomaly detected in agricultural cropland with moderate fire radiative power consistent with field residue burning.',
    };
  }

  // landCover === 'other' (grassland, shrubland, scrub, built-up, or unmapped edge).
  // CRITICAL RULE (AGENTS.md & MASTER.md §1): 'other' must NOT default to crop-burning.
  // Grassland and scrub fires (like the Telangana origin fire) land in 'other'.
  // Only classify as crop-burning if it matches a strong stubble-burning signature:
  // agricultural region (Punjab, Bihar, Delhi) during peak Oct-Nov stubble season with characteristic moderate FRP.
  const region = landCoverMask?.region;
  const isStubbleRegion = region === 'punjab' || region === 'bihar' || region === 'delhi';
  const hasCropBurningSignature =
    isStubbleRegion && isAutumnStubbleSeason && frp !== null && frp >= 5 && frp <= 60;

  if (hasCropBurningSignature) {
    return {
      kind: 'likely-crop-burning',
      landCover,
      rationale:
        'Thermal anomaly detected adjacent to agricultural land during peak stubble burning season with characteristic fire radiative power.',
    };
  }

  return {
    kind: 'likely-wildfire',
    landCover,
    rationale:
      'Detected in uncultivated terrain (scrubland/grassland/open ground); characteristic of brush or wildfire.',
  };
}
