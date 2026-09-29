import { classifyHotspot } from './classify.ts';
import { computeDispersion } from './dispersion.ts';
import { inRegion, type Geo } from './geo.ts';
import { fetchHotspots } from './hotspots.ts';
import type { Classification, Hotspot, Plume, Region } from './types.ts';
import { fetchWinds } from './wind.ts';

/** What `/api/radar` returns: every hotspot, plus its plume, classification and state by id. */
export interface RadarResult {
  hotspots: Hotspot[];
  plumes: Record<string, Plume>;
  classifications: Record<string, Classification>;
  /** State or UT each hotspot is in (DataMeet spelling), for the panel's default language. */
  states: Record<string, string>;
}

/**
 * Nearby fires share one wind value: rounded to a 0.5 degree cell (~55 km). Coarser than
 * GFS's 0.25 degree, so an all-India scan stays near a few hundred locations.
 */
export function windCellKey(hs: Hotspot): string {
  return `${Math.round(hs.lat * 2) / 2},${Math.round(hs.lon * 2) / 2}`;
}

/**
 * The whole on-demand loop for one region: FIRMS hotspots, the region filter, wind,
 * dispersion, classification.
 *
 * FIRMS is queried by the region's box, so fires abroad and in neighbouring zones are
 * dropped here by the state they fall in. A FIRMS failure throws, because an empty list
 * would read as an all-clear (docs/CODING_STANDARDS.md section 3). A failed wind batch
 * does not: those fires get calm-wind dispersion and the scan carries on.
 */
export async function runRadar(region: Region, firmsMapKey: string, geo: Geo): Promise<RadarResult> {
  const states: Record<string, string> = {};
  const hotspots = (await fetchHotspots(region, firmsMapKey)).filter((hs) => {
    const state = geo.stateAt(hs.lon, hs.lat);
    if (!inRegion(region, state)) return false;
    states[hs.id] = state!;
    return true;
  });

  const cells = new Map<string, Hotspot>();
  for (const hs of hotspots) {
    const key = windCellKey(hs);
    if (!cells.has(key)) cells.set(key, hs);
  }
  const keys = [...cells.keys()];
  const winds = await fetchWinds(keys.map((k) => [cells.get(k)!.lat, cells.get(k)!.lon] as const));
  const windByCell = new Map(keys.map((k, i) => [k, winds[i] ?? null]));

  const plumes: Record<string, Plume> = {};
  const classifications: Record<string, Classification> = {};
  for (const hs of hotspots) {
    plumes[hs.id] = computeDispersion(hs, windByCell.get(windCellKey(hs)) ?? null);
    classifications[hs.id] = classifyHotspot(hs, geo.landCoverAt(hs.lon, hs.lat), states[hs.id]);
  }

  return { hotspots, plumes, classifications, states };
}
