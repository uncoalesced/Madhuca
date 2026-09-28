import type { Classification, Hotspot, LandCover, LandCoverMask, Region } from './types';

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
  /** Land cover per polygon (0 cropland, 1 forest); polygon ids index into this. */
  landCovers: Uint8Array;
  minX: number;
  minY: number;
  cols: number;
  rows: number;
  /** Cell c's edges are edges[cellStart[c] .. cellStart[c + 1]]. */
  cellStart: Uint32Array;
  /** Flat [x1, y1, x2, y2, polygonId, ...] for every edge touching each cell, cell by cell. */
  edges: Float32Array;
  /**
   * Cell c's centre is inside polygons centreIds[centreStart[c] .. centreStart[c + 1]],
   * ascending. Nearly always zero or one — but the pipeline simplifies each polygon
   * independently, so neighbours can overlap by a sliver, and a lookup must not
   * assume otherwise.
   */
  centreStart: Uint32Array;
  centreIds: Uint32Array;
}

const LAND_COVERS = ['cropland', 'forest'] as const;
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
  const landCovers: number[] = [];
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
        const x = Math.fround(pt[0]!);
        const y = Math.fround(pt[1]!);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      landCovers.push(landCover === 'forest' ? 1 : 0);
      polygons.push(part.filter(isRing));
    }
  }

  if (polygons.length === 0 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
    return pack(landCovers, 0, 0, 0, 0, [], []);
  }

  const cols = Math.floor((maxX - minX) / CELL_DEG) + 1;
  const rows = Math.floor((maxY - minY) / CELL_DEG) + 1;
  const edges: (number[] | undefined)[] = new Array(cols * rows);

  for (let k = 0; k < polygons.length; k++) {
    for (const ring of polygons[k]!) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        // Rounded to float32, as the index stores them, so the sweep below and every
        // lookup see exactly the coordinates a prebuilt index (encodeMaskIndex) holds.
        const x1 = Math.fround(ring[j]![0]!);
        const y1 = Math.fround(ring[j]![1]!);
        const x2 = Math.fround(ring[i]![0]!);
        const y2 = Math.fround(ring[i]![1]!);
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

  return pack(landCovers, minX, minY, cols, rows, edges, centre);
}

/** Flattens the per-cell arrays the build works in into the typed arrays a lookup reads. */
function pack(
  landCovers: number[],
  minX: number,
  minY: number,
  cols: number,
  rows: number,
  edges: (number[] | undefined)[],
  centre: (readonly number[])[],
): MaskIndex {
  const cells = cols * rows;
  const cellStart = new Uint32Array(cells + 1);
  const centreStart = new Uint32Array(cells + 1);
  for (let c = 0; c < cells; c++) {
    cellStart[c + 1] = cellStart[c]! + (edges[c]?.length ?? 0);
    centreStart[c + 1] = centreStart[c]! + (centre[c]?.length ?? 0);
  }
  const flatEdges = new Float32Array(cellStart[cells]!);
  const centreIds = new Uint32Array(centreStart[cells]!);
  for (let c = 0; c < cells; c++) {
    const cell = edges[c];
    if (cell) flatEdges.set(cell, cellStart[c]!);
    const ids = centre[c];
    if (ids && ids.length > 0) centreIds.set(ids, centreStart[c]!);
  }
  return {
    landCovers: Uint8Array.from(landCovers),
    minX,
    minY,
    cols,
    rows,
    cellStart,
    edges: flatEdges,
    centreStart,
    centreIds,
  };
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
  const start = index.centreIds.subarray(index.centreStart[cellId]!, index.centreStart[cellId + 1]!);
  const cell = index.edges;
  const e0 = index.cellStart[cellId]!;
  const e1 = index.cellStart[cellId + 1]!;
  if (e0 === e1) return start.length === 0 ? 'other' : LAND_COVERS[index.landCovers[start[0]!]!]!;

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
  for (let e = e0; e < e1; e += EDGE_STRIDE) {
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

  if (!flips) return start.length === 0 ? 'other' : LAND_COVERS[index.landCovers[start[0]!]!]!;

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
  return best === -1 ? 'other' : LAND_COVERS[index.landCovers[best]!]!;
}

// Prebuilt index file: a Float64 header, then the MaskIndex arrays back to back.
// Loading one is a handful of typed-array views over the bytes, with no JSON.parse
// and no index build: those two cost 60-260ms of CPU per region on a cold Worker,
// against a 10ms budget (worker/bench/cpu-budget.ts).
const INDEX_MAGIC = 0x4d445831; // "MDX1"
const INDEX_VERSION = 1;
const HEADER_SLOTS = 10; // magic, version, minX, minY, cols, rows, polygons, edge floats, centre ids, 0

/**
 * Serialize a mask's lookup index. Run offline (worker/scripts/build-landcover-index.ts),
 * never on the request path: it pays the full parse and build it exists to avoid.
 */
export function encodeMaskIndex(mask: LandCoverMask): ArrayBuffer {
  const index = buildIndex(mask);
  const polygons = index.landCovers.length;
  const lcBytes = Math.ceil(polygons / 4) * 4;
  const bytes =
    HEADER_SLOTS * 8 +
    lcBytes +
    4 * (index.cellStart.length + index.edges.length + index.centreStart.length + index.centreIds.length);
  const buffer = new ArrayBuffer(bytes);
  new Float64Array(buffer, 0, HEADER_SLOTS).set([
    INDEX_MAGIC,
    INDEX_VERSION,
    index.minX,
    index.minY,
    index.cols,
    index.rows,
    polygons,
    index.edges.length,
    index.centreIds.length,
    0,
  ]);
  let offset = HEADER_SLOTS * 8;
  new Uint8Array(buffer, offset, polygons).set(index.landCovers);
  offset += lcBytes;
  for (const part of [index.cellStart, index.edges, index.centreStart, index.centreIds]) {
    new Uint8Array(buffer, offset, part.byteLength).set(new Uint8Array(part.buffer, part.byteOffset, part.byteLength));
    offset += part.byteLength;
  }
  return buffer;
}

/**
 * Load a prebuilt index as a mask for `classifyHotspot`. The returned mask carries
 * no features; its index is already cached against it, so no lookup ever builds one.
 * Throws on a file that is not a version-1 index of the expected length.
 */
export function decodeMaskIndex(region: Region, buffer: ArrayBuffer): LandCoverMask {
  if (buffer.byteLength < HEADER_SLOTS * 8) throw new Error('land-cover index is truncated');
  const header = new Float64Array(buffer, 0, HEADER_SLOTS);
  if (header[0] !== INDEX_MAGIC || header[1] !== INDEX_VERSION) {
    throw new Error('not a version-1 land-cover index');
  }
  const [, , minX, minY, cols, rows, polygons, edgeFloats, centreIds] = header as unknown as number[];
  const cells = cols! * rows!;
  const lcBytes = Math.ceil(polygons! / 4) * 4;
  const expected = HEADER_SLOTS * 8 + lcBytes + 4 * (2 * (cells + 1) + edgeFloats! + centreIds!);
  if (buffer.byteLength !== expected) {
    throw new Error(`land-cover index is ${buffer.byteLength} bytes, expected ${expected}`);
  }

  let offset = HEADER_SLOTS * 8;
  const landCovers = new Uint8Array(buffer, offset, polygons);
  offset += lcBytes;
  const cellStart = new Uint32Array(buffer, offset, cells + 1);
  offset += cellStart.byteLength;
  const edges = new Float32Array(buffer, offset, edgeFloats);
  offset += edges.byteLength;
  const centreStart = new Uint32Array(buffer, offset, cells + 1);
  offset += centreStart.byteLength;
  const ids = new Uint32Array(buffer, offset, centreIds);

  const mask: LandCoverMask = { region, features: [] };
  indexCache.set(mask, {
    landCovers,
    minX: minX!,
    minY: minY!,
    cols: cols!,
    rows: rows!,
    cellStart,
    edges,
    centreStart,
    centreIds: ids,
  });
  return mask;
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
