import type { Hotspot, LandCover, SpreadEstimate, Wind } from './types.ts';

/**
 * Where an active fire is likely to spread next. SCAFFOLD ONLY (issue #21, stub for
 * 30 Sept): there is no spread model yet, so every estimate says "not estimated" as
 * distanceKm 0 with horizonHours 0. The UI must show that as unknown, never as
 * "will not spread".
 *
 * Intended inputs, once a model exists: the fire's intensity (hotspot.frp), the wind
 * pushing the front (a fire front moves downwind, so the bearing is the wind's
 * meteorological direction + 180, like Plume.bearingDeg), and the fuel it can reach
 * (landCover: forest and scrub carry a front further than cropland stubble).
 *
 * Degrades like dispersion does: missing or calm wind never throws. Without usable wind
 * the bearing is 0 (no direction known) rather than a guess.
 */
export function estimateSpread(hotspot: Hotspot, wind: Wind | null, _landCover: LandCover): SpreadEstimate {
  let bearingDeg = 0;
  if (wind && Number.isFinite(wind.directionDeg) && Number.isFinite(wind.speedMs) && wind.speedMs > 0) {
    bearingDeg = (((Math.round(wind.directionDeg) + 180) % 360) + 360) % 360;
  }
  return {
    hotspotId: hotspot.id,
    bearingDeg,
    distanceKm: 0,
    horizonHours: 0,
  };
}
