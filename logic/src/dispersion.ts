import type { Hotspot, Plume, Wind } from './types';

/**
 * Meteorological wind direction is where wind blows FROM; plume bearing is where
 * smoke travels TO. Rounds before wrapping so e.g. 179.6° FROM gives 0, not 360.
 */
function downwindBearing(wind: Wind | null): number {
  if (!wind || !Number.isFinite(wind.directionDeg)) return 0;
  return (((Math.round(wind.directionDeg) + 180) % 360) + 360) % 360;
}

/**
 * Simplified Gaussian-puff plume approximation — NOT real NOAA HYSPLIT
 * (docs/MASTER.md §4). Physically reasonable, not publication-accurate.
 * In: one hotspot + wind at its coordinate. Out: downwind bearing, reach, spread.
 * Must degrade gracefully on calm or missing wind — don't throw.
 * Owner: Aaron.
 */
export function computeDispersion(hotspot: Hotspot, wind: Wind | null): Plume {
  const frp = Math.max(1, Number.isFinite(hotspot.frp) ? hotspot.frp : 1);

  const bearingDeg = downwindBearing(wind);

  // Missing wind or calm conditions (< 0.5 m/s): degrade gracefully to radial pooling
  if (!wind || !Number.isFinite(wind.speedMs) || wind.speedMs < 0.5) {
    // Local stagnation pool reach scales with fire size, capped at 5 km
    const distanceKm = Math.round(Math.min(5, Math.max(0.5, 0.25 * Math.sqrt(frp))) * 10) / 10;
    return {
      bearingDeg,
      distanceKm,
      spreadDeg: 180, // Full radial dispersion
      // Calm is a measured wind; missing wind has no speed at all (Plume.windSpeedMs).
      ...(wind && Number.isFinite(wind.speedMs) ? { windSpeedMs: wind.speedMs } : {}),
    };
  }

  // Downwind reach scales with wind speed and square-root of FRP, capped at 80 km
  const rawDistance = (0.5 + 0.35 * wind.speedMs) * Math.sqrt(frp);
  const distanceKm = Math.round(Math.min(80, Math.max(1, rawDistance)) * 10) / 10;

  // Lateral spread cone (half-angle): narrows with higher wind speed, bounded between 15° and 90°
  const rawSpread = 45 / Math.sqrt(wind.speedMs);
  const spreadDeg = Math.round(Math.min(90, Math.max(15, rawSpread)) * 10) / 10;

  return {
    bearingDeg,
    distanceKm,
    spreadDeg,
    windSpeedMs: wind.speedMs,
  };
}

