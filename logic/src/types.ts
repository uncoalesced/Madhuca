// Shared contract types. Rahul's frontend and Jammy's implementations both build
// against these — change them here, not in a local copy, so the two don't drift.

/**
 * Zones built from whole states (docs/MASTER.md §2, contract #37); 'india' is all of them.
 * Which states make each zone: ZONE_STATES in logic/src/geo.ts.
 */
export const REGIONS = ['north', 'south', 'west', 'east', 'india'] as const;
export type Region = (typeof REGIONS)[number];

/** One active-fire detection from NASA FIRMS (MODIS/VIIRS). */
export interface Hotspot {
  /** Stable id for React keys / lookups: `${satellite}:${lat}:${lon}:${acquiredAt}`. */
  id: string;
  lat: number;
  lon: number;
  /** Fire radiative power, MW. Higher = more intense burn. */
  frp: number;
  /** FIRMS confidence: 'l' | 'n' | 'h' for VIIRS, 0-100 for MODIS. Kept raw. */
  confidence: string;
  /** Acquisition time, ISO 8601 UTC. */
  acquiredAt: string;
  satellite: string;
}

/** Wind at a single coordinate, from Open-Meteo GFS. */
export interface Wind {
  /** Wind speed at 10m, m/s. */
  speedMs: number;
  /** Meteorological direction in degrees — the direction wind blows FROM. 0 = north. */
  directionDeg: number;
  /** Forecast/observation time, ISO 8601 UTC. */
  observedAt: string;
}

/**
 * Simplified Gaussian-puff dispersion result.
 *
 * NOTE (Jammy owns this shape — delegation/jammy.md task 1): this is the minimum
 * contract so Rahul can build the overlay renderer now. Extend it if the model
 * needs more (e.g. a polygon footprint), but tell Rahul before you change it.
 */
export interface Plume {
  /** Downwind bearing in degrees — the direction smoke travels TO. 0 = north. */
  bearingDeg: number;
  /** Rough downwind reach in km where concentration is still meaningful. */
  distanceKm: number;
  /** Half-angle of the plume cone in degrees — lateral spread. */
  spreadDeg: number;
  /** 10 m wind speed the plume was computed from, m/s. Absent when wind was missing. */
  windSpeedMs?: number;
}

export type LandCover = 'cropland' | 'forest' | 'other';

/** Classification output. A crop-burning fire is tagged differently, never hidden. */
export interface Classification {
  kind: 'likely-crop-burning' | 'likely-wildfire';
  landCover: LandCover;
  /** Plain-language reason, shown in the detail panel. */
  rationale: string;
}

/** Precomputed cropland/forest mask from the offline pipeline (delegation/joel.md). */
export interface LandCoverMask {
  region: Region;
  /** GeoJSON FeatureCollection; each Feature has properties.landCover: LandCover. */
  features: unknown;
}

/**
 * Precomputed fire-risk grid for one area. Built offline (ml/), published as
 * frontend/public/risk/<area>.json (contract issue #20). An experimental statistical
 * estimate: the probability of at least one VIIRS detection per cell in the next
 * 14 days, from past detections and land cover. A low value is NOT an all-clear.
 */
export interface RiskGrid {
  /**
   * The area the grid covers, e.g. 'telangana' (the Telangana / AP box). A name, not a
   * `Region`: contract #20 said `Region`, but the 29 Sept pivot to North / South / West /
   * East zones left the one published grid's area outside that union.
   */
  region: string;
  /** [west, south, east, north], same order as REGION_BBOX. */
  bbox: readonly [number, number, number, number];
  /** Cell size in degrees (0.1). */
  cellDeg: number;
  cols: number;
  rows: number;
  /** Row-major from the south-west corner, one value 0-255 per cell (0 = no data, not "safe"; else 1 + round(254 * p)). */
  risk: number[];
  /** ISO date range the model forecasts for, inclusive. */
  validFrom: string;
  validTo: string;
  /** Model name + version, shown in the UI as the source. */
  model: string;
}

/** Where an active fire is likely to spread next. Scaffold only; not a validated spread model. */
export interface SpreadEstimate {
  hotspotId: string;
  /** Degrees clockwise from north that the fire front is likely to move toward. */
  bearingDeg: number;
  /** Rough reach over the next `horizonHours`, in km. 0 with `horizonHours` 0 = not estimated. */
  distanceKm: number;
  horizonHours: number;
}

/** Tiny offline-trained crop-vs-wildfire model, evaluated as arithmetic in classifyHotspot. */
export interface ClassifierWeights {
  version: string;
  features: readonly string[];
  weights: readonly number[];
  bias: number;
  /** Where the training labels came from (e.g. "FSI Van Agni alerts 2024-2025"). Labels are never invented (issue #21). */
  labelSource: string;
}
