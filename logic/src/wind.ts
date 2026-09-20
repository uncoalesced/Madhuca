import type { Wind } from './types';

/**
 * Fetch live wind for one coordinate from Open-Meteo (GFS). No API key.
 * In: lat/lon. Out: current 10m wind speed + meteorological direction.
 * Owner: Joel (delegation/joel.md — live data fetchers).
 */
export async function fetchWind(lat: number, lon: number): Promise<Wind> {
  // TODO: GET https://api.open-meteo.com/v1/gfs?latitude=..&longitude=..
  //       &current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms
  void lat;
  void lon;
  throw new Error('not implemented');
}
