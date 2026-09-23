import type { Classification, Hotspot, LandCover, LandCoverMask } from './types';

/**
 * Tag a hotspot as likely crop/stubble burning vs. likely wildfire.
 * In: one hotspot + the precomputed land-cover mask for its region.
 * Out: a kind, the land cover it landed in, and a plain-language rationale.
 * Crop-burning fires are still shown — tagged differently, never dropped.
 * Owner: Jammy (delegation/jammy.md — classification module).
 */
interface GeoJsonFeature {
  type: string;
  properties?: {
    landCover?: LandCover;
    [key: string]: unknown;
  };
  geometry?: {
    type: string;
    coordinates: any;
  };
}

interface GeoJsonCollection {
  type: string;
  features?: GeoJsonFeature[];
}

/**
 * Fast ray-casting point-in-ring check.
 * px = lon, py = lat. ring is array of [lon, lat].
 */
function isPointInRing(px: number, py: number, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  const len = ring.length;
  for (let i = 0, j = len - 1; i < len; j = i++) {
    const pi = ring[i];
    const pj = ring[j];
    if (!pi || !pj) continue;
    const xi = pi[0];
    const yi = pi[1];
    const xj = pj[0];
    const yj = pj[1];

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Point-in-polygon check with bounding-box pre-filtering.
 * rings[0] is exterior ring; rings[1..n] are interior rings (holes).
 */
function isPointInPolygon(px: number, py: number, rings: readonly (readonly (readonly [number, number])[])[]): boolean {
  if (!rings || rings.length === 0) return false;
  const outer = rings[0];
  if (!outer || outer.length < 3) return false;

  // Bounding box pre-filter for outer ring to satisfy Workers 10ms CPU budget
  const outerAny = outer as unknown as { _bbox?: [number, number, number, number] };
  let minX: number;
  let maxX: number;
  let minY: number;
  let maxY: number;

  if (outerAny._bbox) {
    [minX, maxX, minY, maxY] = outerAny._bbox;
  } else {
    minX = outer[0]![0];
    maxX = minX;
    minY = outer[0]![1];
    maxY = minY;
    for (let i = 1; i < outer.length; i++) {
      const pt = outer[i];
      if (!pt) continue;
      const x = pt[0];
      const y = pt[1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    outerAny._bbox = [minX, maxX, minY, maxY];
  }

  if (px < minX || px > maxX || py < minY || py > maxY) {
    return false;
  }

  // Ray-cast outer ring
  if (!isPointInRing(px, py, outer)) {
    return false;
  }

  // Check holes
  for (let h = 1; h < rings.length; h++) {
    const hole = rings[h];
    if (hole && hole.length >= 3 && isPointInRing(px, py, hole)) {
      return false;
    }
  }

  return true;
}

function extractFeatures(mask: LandCoverMask): GeoJsonFeature[] {
  if (!mask || !mask.features) return [];
  if (Array.isArray(mask.features)) {
    return mask.features as GeoJsonFeature[];
  }
  const fc = mask.features as GeoJsonCollection;
  if (Array.isArray(fc.features)) {
    return fc.features;
  }
  return [];
}

/**
 * Determine land cover for a coordinate by querying the precomputed mask.
 * Returns 'cropland' | 'forest' | 'other'. Miss is 'other', never throws.
 */
function findLandCover(lon: number, lat: number, mask: LandCoverMask): LandCover {
  const features = extractFeatures(mask);

  for (const feature of features) {
    const landCover = feature.properties?.landCover;
    if (landCover !== 'cropland' && landCover !== 'forest') continue;

    const geom = feature.geometry;
    if (!geom || !geom.coordinates) continue;

    if (geom.type === 'Polygon') {
      if (isPointInPolygon(lon, lat, geom.coordinates)) {
        return landCover;
      }
    } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      for (const poly of geom.coordinates) {
        if (isPointInPolygon(lon, lat, poly)) {
          return landCover;
        }
      }
    }
  }

  return 'other';
}

/**
 * Tag a hotspot as likely crop/stubble burning vs. likely wildfire.
 * In: one hotspot + the precomputed land-cover mask for its region.
 * Out: a kind, the land cover it landed in, and a plain-language rationale.
 * Crop-burning fires are still shown — tagged differently, never dropped.
 * Owner: Jammy (delegation/jammy.md — classification module).
 */
export function classifyHotspot(hotspot: Hotspot, landCoverMask: LandCoverMask): Classification {
  const landCover = findLandCover(hotspot.lon, hotspot.lat, landCoverMask);

  const date = new Date(hotspot.acquiredAt);
  // UTC month (1 = Jan, 10 = Oct, 11 = Nov)
  const month = Number.isNaN(date.getTime()) ? 10 : date.getUTCMonth() + 1;
  const isAutumnStubbleSeason = month === 10 || month === 11;
  const isSpringHarvestSeason = month === 4 || month === 5;
  const frp = Number.isFinite(hotspot.frp) ? hotspot.frp : 20;

  if (landCover === 'forest') {
    return {
      kind: 'likely-wildfire',
      landCover,
      rationale: 'Thermal anomaly detected within designated forest land cover; characteristic of forest wildfire.',
    };
  }

  if (landCover === 'cropland') {
    if (frp > 150) {
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
  const hasCropBurningSignature = isStubbleRegion && isAutumnStubbleSeason && frp >= 5 && frp <= 60;

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

