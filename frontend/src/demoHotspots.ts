import type { Hotspot, Region } from '@madhuca/logic';

/**
 * FAKE fire detections for local testing only, loaded with `?demo` in `npm run dev`.
 * Not real data. The app labels every scan that uses these as demo data, and a
 * production build never reads them (see App.ts). Points are placed on known
 * cropland and forest so both classifications show up.
 */
const POINTS: Record<Region, ReadonlyArray<readonly [number, number, number]>> = {
  // [lat, lon, frp MW]
  punjab: [[30.9, 75.7, 45], [30.35, 76.3, 12], [31.55, 74.95, 160], [32.35, 75.75, 70]],
  bihar: [[25.8, 85.4, 30], [26.3, 86.1, 18], [27.3, 84.1, 95]],
  delhi: [[28.75, 77.05, 22], [28.55, 77.2, 9]],
  telangana: [[18.1, 79.4, 35], [16.2, 78.7, 120], [18.9, 79.95, 60], [15.9, 78.9, 45]],
};

export function demoHotspots(region: Region): Hotspot[] {
  // Stamped 2h ago so the classifier's season logic sees the current month.
  const acquiredAt = new Date(Date.now() - 2 * 3600_000).toISOString();
  return POINTS[region].map(([lat, lon, frp]) => ({
    id: `DEMO:${lat}:${lon}:${acquiredAt}`,
    lat,
    lon,
    frp,
    confidence: 'h',
    acquiredAt,
    satellite: 'DEMO',
  }));
}
