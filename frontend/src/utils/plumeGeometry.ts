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

/** Closed circle ring of `radiusKm` around a point. */
export function circlePolygon(lat: number, lon: number, radiusKm: number, steps = 24): GeoJSONPolygon {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) ring.push(destinationPoint(lat, lon, radiusKm, (i * 360) / steps));
  return { type: 'Polygon', coordinates: [ring] };
}

/** VIIRS I-band pixel: the ground a detection actually covers. */
export const DETECTION_FOOTPRINT_KM = 0.375;
export const SPREAD_HORIZON_H = 3;

/**
 * Possible forward fire spread in `SPREAD_HORIZON_H` hours: 10% of the 10 m wind speed
 * (Cruz & Alexander 2019 rule of thumb for forest and shrubland). A rule of thumb, not a
 * fire-spread model, and it knows nothing about fuel, slope or moisture. 0 when calm.
 */
export function fireSpreadKm(windSpeedMs: number | undefined): number {
  if (!windSpeedMs || !Number.isFinite(windSpeedMs) || windSpeedMs < 0.5) return 0;
  return 0.1 * windSpeedMs * 3.6 * SPREAD_HORIZON_H;
}

/**
 * Red "possible spread" haze toward the smoke bearing: three nested wedges, drawn at
 * rising opacity, so the colour is strongest near the fire and fades with distance.
 * Empty when calm or when the wind speed is not known.
 */
export function spreadWedges(lat: number, lon: number, bearingDeg: number, windSpeedMs: number | undefined): GeoJSONPolygon[] {
  const reach = fireSpreadKm(windSpeedMs);
  if (reach <= DETECTION_FOOTPRINT_KM) return [];
  return [1, 2 / 3, 1 / 3].map((f) => {
    const ring: [number, number][] = [[Number(lon.toFixed(6)), Number(lat.toFixed(6))]];
    for (let a = -20; a <= 20; a += 5) ring.push(destinationPoint(lat, lon, reach * f, bearingDeg + a));
    ring.push(ring[0]!);
    return { type: 'Polygon', coordinates: [ring] };
  });
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
  kn: ['ಉತ್ತರ', 'ಈಶಾನ್ಯ', 'ಪೂರ್ವ', 'ಆಗ್ನೇಯ', 'ದಕ್ಷಿಣ', 'ನೈಋತ್ಯ', 'ಪಶ್ಚಿಮ', 'ವಾಯುವ್ಯ'],
  te: ['ఉత్తరం', 'ఈశాన్యం', 'తూర్పు', 'ఆగ్నేయం', 'దక్షిణం', 'నైరుతి', 'పడమర', 'వాయువ్యం'],
};

/** 8-point compass word in the alert's language; English for anything else. */
export function compassWord(bearingDeg: number, lang: string): string {
  const words = LOCAL_COMPASS[lang];
  if (!words) return bearingToCompass(bearingDeg);
  const index = Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8;
  return words[index] ?? words[0]!;
}

/** 8-point compass abbreviation (N, NE, ... NW) for the big direction badge. */
export function bearingToAbbrev(bearingDeg: number): string {
  const index = Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][index] ?? 'N';
}

/** True when the plume is a calm-wind pool rather than a directional cone. */
export function isCalmPlume(plume?: Plume): boolean {
  return !plume || plume.spreadDeg >= 180 || plume.distanceKm < 0.5;
}

// Dispersion card copy per alert language. `c` is the compass word already in that language.
const SUMMARY_COPY: Record<
  string,
  {
    calm: { direction: string; reach: string; advice: string };
    direction: (c: string, deg: number) => string;
    reach: (km: string) => string;
    advice: (c: string) => string;
  }
> = {
  en: {
    calm: {
      direction: 'Calm wind — smoke lingering locally',
      reach: '< 1 km radius',
      advice: 'Smoke is pooling in the immediate vicinity. Keep windows closed nearby.',
    },
    direction: (c, deg) => `Blowing ${c} (${deg}°)`,
    reach: (km) => `~${km} km downwind reach`,
    advice: (c) => `Downwind communities to the ${c} will experience smoke and reduced visibility.`,
  },
  hi: {
    calm: {
      direction: 'हवा शांत — धुआं आसपास ही रुका है',
      reach: '1 km से कम दायरा',
      advice: 'धुआं आसपास ही जमा हो रहा है। पास के लोग खिड़कियां बंद रखें।',
    },
    direction: (c, deg) => `धुआं ${c} की ओर (${deg}°)`,
    reach: (km) => `हवा की दिशा में लगभग ${km} km तक`,
    advice: (c) => `${c} की ओर के इलाकों में धुआं और कम दृश्यता रहेगी।`,
  },
  kn: {
    calm: {
      direction: 'ಗಾಳಿ ಶಾಂತ — ಹೊಗೆ ಹತ್ತಿರದಲ್ಲೇ ಇದೆ',
      reach: '1 km ಗಿಂತ ಕಡಿಮೆ ವ್ಯಾಪ್ತಿ',
      advice: 'ಹೊಗೆ ಹತ್ತಿರದಲ್ಲೇ ಸೇರುತ್ತಿದೆ. ಹತ್ತಿರದವರು ಕಿಟಕಿಗಳನ್ನು ಮುಚ್ಚಿಡಿ.',
    },
    direction: (c, deg) => `ಹೊಗೆ ${c} ಕಡೆಗೆ (${deg}°)`,
    reach: (km) => `ಗಾಳಿಯ ದಿಕ್ಕಿನಲ್ಲಿ ಸುಮಾರು ${km} km ವರೆಗೆ`,
    advice: (c) => `${c} ಕಡೆಯ ಪ್ರದೇಶಗಳಲ್ಲಿ ಹೊಗೆ ಮತ್ತು ಕಡಿಮೆ ಗೋಚರತೆ ಇರುತ್ತದೆ.`,
  },
  te: {
    calm: {
      direction: 'గాలి నిశ్చలం — పొగ సమీపంలోనే ఉంది',
      reach: '1 km కంటే తక్కువ పరిధి',
      advice: 'పొగ సమీప ప్రాంతంలోనే పేరుకుంటోంది. దగ్గరలో ఉన్నవారు కిటికీలు మూసి ఉంచండి.',
    },
    direction: (c, deg) => `పొగ ${c} వైపు (${deg}°)`,
    reach: (km) => `గాలి దిశలో సుమారు ${km} km వరకు`,
    advice: (c) => `${c} వైపు ఉన్న ప్రాంతాల్లో పొగ, తక్కువ దృశ్యత ఉంటాయి.`,
  },
};

/** Plain-language summary of plume travel for non-specialists, in the alert's language. */
export function getPlumeSummary(
  plume?: Plume,
  lang: string = 'en'
): {
  directionText: string;
  reachText: string;
  safetyAdvice: string;
} {
  const copy = SUMMARY_COPY[lang] ?? SUMMARY_COPY.en!;
  if (!plume || isCalmPlume(plume)) {
    return { directionText: copy.calm.direction, reachText: copy.calm.reach, safetyAdvice: copy.calm.advice };
  }

  const compass = compassWord(plume.bearingDeg, lang);
  return {
    directionText: copy.direction(compass, Math.round(plume.bearingDeg)),
    reachText: copy.reach(plume.distanceKm.toFixed(1)),
    safetyAdvice: copy.advice(compass),
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
