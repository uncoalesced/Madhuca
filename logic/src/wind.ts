import type { Wind } from './types';

const OPEN_METEO_GFS = 'https://api.open-meteo.com/v1/gfs';

/**
 * Fetch live wind for one coordinate from Open-Meteo (GFS). No API key.
 * In: lat/lon. Out: current 10m wind speed + meteorological direction.
 * Owner: Joel (delegation/joel.md — live data fetchers).
 */
export async function fetchWind(lat: number, lon: number): Promise<Wind> {
  const url =
    `${OPEN_METEO_GFS}?latitude=${lat}&longitude=${lon}` +
    `&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo responded ${response.status} ${response.statusText}`);
  }

  return parseWind(await response.json());
}

/** Locations per Open-Meteo request. Keeps the URL short and the request count low. */
export const WIND_BATCH = 100;

/**
 * Wind for many coordinates, WIND_BATCH per request (Open-Meteo takes comma lists and
 * answers with an array). A whole-India scan has hundreds of wind cells, and the
 * Workers free tier allows 50 subrequests per request, so one call per cell cannot work.
 * A failed batch gives null for its points; the caller treats that as missing wind.
 */
export async function fetchWinds(points: ReadonlyArray<readonly [lat: number, lon: number]>): Promise<(Wind | null)[]> {
  const out: (Wind | null)[] = new Array(points.length).fill(null);
  const batches: Promise<void>[] = [];
  for (let from = 0; from < points.length; from += WIND_BATCH) {
    const batch = points.slice(from, from + WIND_BATCH);
    const url =
      `${OPEN_METEO_GFS}?latitude=${batch.map((p) => p[0]).join(',')}&longitude=${batch.map((p) => p[1]).join(',')}` +
      `&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`;
    batches.push(
      fetch(url)
        .then((res) => (res.ok ? res.json() : null))
        .then((body: unknown) => {
          const list = Array.isArray(body) ? body : body ? [body] : [];
          batch.forEach((_, i) => {
            try {
              out[from + i] = parseWind(list[i]);
            } catch {
              out[from + i] = null;
            }
          });
        })
        .catch(() => undefined),
    );
  }
  await Promise.all(batches);
  return out;
}

/**
 * Pull the `current` block out of an Open-Meteo response.
 *
 * Exported so the check can run against a recorded response. The shape is
 * validated rather than cast: this is the edge of the system, and a silently
 * wrong wind direction would point every plume the wrong way on the map.
 */
export function parseWind(body: unknown): Wind {
  const current = (body as { current?: Record<string, unknown> } | null)?.current;
  const speedMs = current?.['wind_speed_10m'];
  const directionDeg = current?.['wind_direction_10m'];
  const observedAt = current?.['time'];

  if (
    typeof speedMs !== 'number' ||
    typeof directionDeg !== 'number' ||
    typeof observedAt !== 'string'
  ) {
    throw new Error('Open-Meteo response carried no usable current wind block');
  }

  return {
    speedMs,
    // Meteorological, i.e. the direction the wind blows FROM. Smoke travels the
    // other way: Plume.bearingDeg is this + 180, applied in Aaron's dispersion
    // module, not here. Do not "fix" this by rotating it at the source.
    directionDeg,
    observedAt: toIsoUtc(observedAt),
  };
}

/**
 * Open-Meteo returns `2026-09-21T11:45` with the request's timezone, which
 * defaults to GMT. Wind.observedAt is specified as ISO 8601 UTC, so mark it.
 */
function toIsoUtc(time: string): string {
  if (time.endsWith('Z')) return time;
  return `${time}${time.length === 16 ? ':00' : ''}Z`;
}
