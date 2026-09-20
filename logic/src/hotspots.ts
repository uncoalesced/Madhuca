import type { Hotspot, Region } from './types';

/**
 * Fetch live active-fire hotspots for a region from NASA FIRMS.
 * In: a v1 region. Out: every hotspot detected in that region's bbox, recent first.
 * Owner: Joel (delegation/joel.md — live data fetchers).
 */
export async function fetchHotspots(region: Region): Promise<Hotspot[]> {
  // TODO: GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/{bbox}/1
  //       Parse CSV, map rows to Hotspot. MAP_KEY comes from env, never hardcoded.
  void region;
  throw new Error('not implemented');
}
