import type { Hotspot, Region } from '@madhuca/logic';

/**
 * FAKE fire detections for local testing only, loaded with `?demo` in `npm run dev`.
 * Not real data. The app labels every scan that uses these as demo data, and a
 * production build never reads them (see App.ts). Points are placed on known
 * cropland and forest so both classifications show up.
 */
const NORTH: ReadonlyArray<readonly [number, number, number]> = [
  // [lat, lon, frp MW]: Punjab cropland, Haryana cropland, Uttarakhand forest
  [30.9, 75.7, 45], [30.35, 76.3, 12], [29.4, 76.4, 28], [30.1, 78.9, 160],
];
const SOUTH: ReadonlyArray<readonly [number, number, number]> = [
  // Telangana, Nallamala forest, Karnataka, Western Ghats
  [18.1, 79.4, 35], [16.2, 78.6, 120], [15.3, 76.4, 22], [11.7, 76.1, 60],
];
const WEST: ReadonlyArray<readonly [number, number, number]> = [
  // Madhya Pradesh cropland, Maharashtra, Gujarat
  [23.2, 77.4, 30], [20.1, 76.2, 18], [22.3, 72.9, 40],
];
const EAST: ReadonlyArray<readonly [number, number, number]> = [
  // Bihar cropland, Similipal forest (Odisha), Assam
  [25.8, 85.4, 30], [21.75, 86.35, 95], [26.3, 92.7, 25],
];

const POINTS: Record<Region, ReadonlyArray<readonly [number, number, number]>> = {
  north: NORTH,
  south: SOUTH,
  west: WEST,
  east: EAST,
  india: [...NORTH, ...SOUTH, ...WEST, ...EAST],
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
