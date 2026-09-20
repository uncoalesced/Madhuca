import type { Hotspot, Plume, Wind } from './types';

/**
 * Simplified Gaussian-puff plume approximation — NOT real NOAA HYSPLIT
 * (docs/MASTER.md §4). Physically reasonable, not publication-accurate.
 * In: one hotspot + wind at its coordinate. Out: downwind bearing, reach, spread.
 * Must degrade gracefully on calm or missing wind — don't throw (delegation/jammy.md).
 * Owner: Jammy.
 */
export function computeDispersion(hotspot: Hotspot, wind: Wind | null): Plume {
  // TODO: bearing = (wind.directionDeg + 180) % 360 — meteorological "from" to travel "to".
  //       Scale distanceKm off wind.speedMs and hotspot.frp; widen spreadDeg as speed drops.
  void hotspot;
  void wind;
  throw new Error('not implemented');
}
