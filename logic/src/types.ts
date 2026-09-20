// Shared contract types. Rahul's frontend and Jammy's implementations both build
// against these — change them here, not in a local copy, so the two don't drift.

/** v1 launch regions (docs/MASTER.md §2). Not nationwide. */
export const REGIONS = ['punjab', 'bihar', 'delhi', 'telangana'] as const;
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
