import { classifyHotspot } from './classify.ts';
import { computeDispersion } from './dispersion.ts';
import { fetchHotspots } from './hotspots.ts';
import type { Classification, Hotspot, LandCoverMask, Plume, Region, Wind } from './types.ts';
import { fetchWind } from './wind.ts';

/** What `/api/radar` returns: every hotspot, plus its plume and classification by id. */
export interface RadarResult {
  hotspots: Hotspot[];
  plumes: Record<string, Plume>;
  classifications: Record<string, Classification>;
}

/** Nearby fires share one wind call: rounded to a 0.25 degree cell (~28 km). */
export function windCellKey(hs: Hotspot): string {
  return `${Math.round(hs.lat * 4) / 4},${Math.round(hs.lon * 4) / 4}`;
}

/**
 * The whole on-demand loop for one region: FIRMS hotspots, wind, dispersion, classification.
 *
 * A FIRMS failure throws, because an empty list would read as an all-clear
 * (docs/CODING_STANDARDS.md section 3). A failed wind call does not: that cell's
 * fires get calm-wind dispersion and the scan carries on. Wind calls run in
 * parallel, one per 0.25 degree cell.
 */
export async function runRadar(region: Region, firmsMapKey: string, mask: LandCoverMask): Promise<RadarResult> {
  const hotspots = await fetchHotspots(region, firmsMapKey);

  const cells = new Map<string, Hotspot>();
  for (const hs of hotspots) {
    const key = windCellKey(hs);
    if (!cells.has(key)) cells.set(key, hs);
  }
  const winds = new Map<string, Wind | null>(
    await Promise.all(
      [...cells].map(async ([key, hs]) => [key, await fetchWind(hs.lat, hs.lon).catch(() => null)] as const),
    ),
  );

  const plumes: Record<string, Plume> = {};
  const classifications: Record<string, Classification> = {};
  for (const hs of hotspots) {
    plumes[hs.id] = computeDispersion(hs, winds.get(windCellKey(hs)) ?? null);
    classifications[hs.id] = classifyHotspot(hs, mask);
  }

  return { hotspots, plumes, classifications };
}
