import type { Plume } from '@madhuca/logic';

const EARTH_RADIUS_KM = 6371.0088;

/** Convert degrees to radians. */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Convert radians to degrees. */
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Calculates a destination coordinate given starting lat/lon, distance in km,
 * and bearing in degrees (0 = North, 90 = East).
 * Returns [longitude, latitude] as standard in GeoJSON.
 */
export function destinationPoint(
  lat: number,
  lon: number,
  distanceKm: number,
  bearingDeg: number
): [number, number] {
  const d = Math.max(0, distanceKm) / EARTH_RADIUS_KM;
  const brng = toRad(bearingDeg);
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);

  const sinLat2 = Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng);
  const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));

  const y = Math.sin(brng) * Math.sin(d) * Math.cos(lat1);
  const x = Math.cos(d) - Math.sin(lat1) * Math.sin(lat2);
  const lon2 = lon1 + Math.atan2(y, x);

  // Normalize longitude to [-180, 180]
  const normLon = ((toDeg(lon2) + 540) % 360) - 180;
  const normLat = toDeg(lat2);

  return [Number(normLon.toFixed(6)), Number(normLat.toFixed(6))];
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];
}

/**
 * Converts a Hotspot coordinate and Jammy's Plume contract into a GeoJSON Polygon
 * representing the downwind smoke dispersion cone or calm stagnation pool.
 */
export function plumeToGeoJSONPolygon(
  lat: number,
  lon: number,
  plume: Plume
): GeoJSONPolygon {
  const safeBearing = Number.isFinite(plume.bearingDeg) ? ((plume.bearingDeg % 360) + 360) % 360 : 0;
  const safeDistance = Number.isFinite(plume.distanceKm) && plume.distanceKm > 0 ? plume.distanceKm : 0.5;
  const safeSpread = Number.isFinite(plume.spreadDeg) ? Math.max(5, Math.min(180, plume.spreadDeg)) : 180;

  // Calm wind condition: radial 360 degree circle pool
  if (safeSpread >= 180 || safeDistance <= 0.5) {
    const ring: [number, number][] = [];
    const steps = 32;
    const radius = Math.max(safeDistance, 0.5);

    for (let i = 0; i <= steps; i++) {
      const angle = (i * 360) / steps;
      ring.push(destinationPoint(lat, lon, radius, angle));
    }
    return {
      type: 'Polygon',
      coordinates: [ring],
    };
  }

  // Directional smoke dispersion cone
  const ring: [number, number][] = [];
  const origin: [number, number] = [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
  ring.push(origin);

  const startAngle = safeBearing - safeSpread;
  const endAngle = safeBearing + safeSpread;
  const numSteps = 16;
  const angleStep = (endAngle - startAngle) / numSteps;

  for (let i = 0; i <= numSteps; i++) {
    const angle = startAngle + i * angleStep;
    ring.push(destinationPoint(lat, lon, safeDistance, angle));
  }

  ring.push(origin); // Close polygon

  return {
    type: 'Polygon',
    coordinates: [ring],
  };
}

/** Converts a bearing in degrees (0..360) to human 8-point compass direction. */
export function bearingToCompass(bearingDeg: number): string {
  const normalized = ((bearingDeg % 360) + 360) % 360;
  const directions = [
    'North',
    'North-East',
    'East',
    'South-East',
    'South',
    'South-West',
    'West',
    'North-West',
  ];
  const index = Math.round(normalized / 45) % 8;
  const match = directions[index];
  return match ?? 'North';
}

const LOCAL_COMPASS: Record<string, readonly string[]> = {
  hi: ['उत्तर', 'उत्तर-पूर्व', 'पूर्व', 'दक्षिण-पूर्व', 'दक्षिण', 'दक्षिण-पश्चिम', 'पश्चिम', 'उत्तर-पश्चिम'],
  pa: ['ਉੱਤਰ', 'ਉੱਤਰ-ਪੂਰਬ', 'ਪੂਰਬ', 'ਦੱਖਣ-ਪੂਰਬ', 'ਦੱਖਣ', 'ਦੱਖਣ-ਪੱਛਮ', 'ਪੱਛਮ', 'ਉੱਤਰ-ਪੱਛਮ'],
  te: ['ఉత్తరం', 'ఈశాన్యం', 'తూర్పు', 'ఆగ్నేయం', 'దక్షిణం', 'నైరుతి', 'పడమర', 'వాయువ్యం'],
};

/** 8-point compass word in the alert's language; English for anything else. */
export function compassWord(bearingDeg: number, lang: string): string {
  const words = LOCAL_COMPASS[lang];
  if (!words) return bearingToCompass(bearingDeg);
  const index = Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8;
  return words[index] ?? words[0]!;
}

/** Generates a plain-language summary of plume travel for non-specialists. */
export function getPlumeSummary(plume?: Plume): {
  directionText: string;
  reachText: string;
  safetyAdvice: string;
} {
  if (!plume || plume.spreadDeg >= 180 || plume.distanceKm < 0.5) {
    return {
      directionText: 'Calm wind — smoke lingering locally',
      reachText: '< 1 km radius',
      safetyAdvice: 'Smoke is pooling in the immediate vicinity. Keep windows closed nearby.',
    };
  }

  const compass = bearingToCompass(plume.bearingDeg);
  const distance = plume.distanceKm.toFixed(1);

  return {
    directionText: `Blowing ${compass} (${Math.round(plume.bearingDeg)}°)`,
    reachText: `~${distance} km downwind reach`,
    safetyAdvice: `Downwind communities to the ${compass} will experience smoke and reduced visibility.`,
  };
}

/** Great-circle distance (km) and initial bearing (degrees, 0 = north) from point A to point B. */
export function distanceAndBearing(
  latA: number,
  lonA: number,
  latB: number,
  lonB: number
): { distanceKm: number; bearingDeg: number } {
  const p1 = toRad(latA);
  const p2 = toRad(latB);
  const dLat = p2 - p1;
  const dLon = toRad(lonB - lonA);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  const distanceKm = 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return { distanceKm, bearingDeg: (toDeg(Math.atan2(y, x)) + 360) % 360 };
}
