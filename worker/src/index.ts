import { decodeLandCoverGrid, decodeStateGrid, REGIONS, runRadar, type Geo, type Region } from '@madhuca/logic';

import { hasValidSession, issueSession, verifyTurnstile } from './turnstile.ts';

/** The Workers Rate Limiting binding's runtime shape (no @cloudflare/workers-types dependency). */
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Bindings from wrangler.jsonc. FIRMS_MAP_KEY is a Worker secret, never in the repo or the client bundle. */
export interface Env {
  FIRMS_MAP_KEY?: string;
  /** Static assets: the prebuilt grids /boundaries/states.bin and /landcover/india.bin. */
  ASSETS: { fetch(input: Request | string): Promise<Response> };
  /** Per-IP rate limit on /api/radar (wrangler.jsonc "ratelimits"). 20/min, checked before any FIRMS work. */
  RADAR_LIMITER: RateLimiter;
  /**
   * Turnstile secret key, a Worker secret. Also signs the session cookie
   * (worker/src/turnstile.ts). Without it /api/radar refuses every request.
   */
  TURNSTILE_SECRET?: string;
}

// Two prebuilt grids answer "which state" and "which land cover" for any point in
// India (logic/src/geo.ts). Loading them is a fetch from static assets plus a few
// typed-array views: no JSON parse and no index build on the request path. Kept for
// the isolate's lifetime; a failed load is not cached, so the next request retries.
let geo: Promise<Geo> | null = null;

function loadGeo(env: Env, requestUrl: string): Promise<Geo> {
  if (!geo) {
    const bytes = async (path: string) => {
      const res = await env.ASSETS.fetch(new URL(path, requestUrl).toString());
      if (!res.ok) throw new Error(`${path} responded ${res.status}`);
      return res.arrayBuffer();
    };
    geo = Promise.all([bytes('/boundaries/states.bin'), bytes('/landcover/india.bin')]).then(([states, land]) => ({
      stateAt: decodeStateGrid(states),
      landCoverAt: decodeLandCoverGrid(land),
    }));
    geo.catch(() => (geo = null));
  }
  return geo;
}

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { 'cache-control': 'no-store' } });
}

/** 429s never say "no fires" — they say why nothing was checked, same as the missing-key 500 does. */
function rateLimited(): Response {
  return Response.json(
    { error: 'Too many requests, try again in a minute. This is not an all-clear.' },
    { status: 429, headers: { 'cache-control': 'no-store', 'retry-after': '60' } },
  );
}

function isRegion(value: string | null): value is Region {
  return (REGIONS as readonly (string | null)[]).includes(value);
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** POST /api/verify {token}: spend a Turnstile token, answer with a session cookie. */
async function verify(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return error(405, 'use POST');
  const clientIp = request.headers.get('cf-connecting-ip');
  const { success } = await env.RADAR_LIMITER.limit({ key: clientIp ?? 'anon' });
  if (!success) return rateLimited();
  if (!env.TURNSTILE_SECRET) return error(500, 'Human verification is not configured.');

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  if (typeof body?.token !== 'string' || !body.token) return error(400, 'missing Turnstile token');

  let passed: boolean;
  try {
    passed = await verifyTurnstile(body.token, env.TURNSTILE_SECRET, clientIp);
  } catch (err) {
    return error(502, err instanceof Error ? err.message : 'Turnstile siteverify unreachable');
  }
  if (!passed) return error(403, 'Human verification failed, please try again.');

  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': await issueSession(env.TURNSTILE_SECRET, nowSec()), 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/verify') return verify(request, env);
    if (url.pathname !== '/api/radar') return error(404, 'not found');
    if (request.method !== 'GET') return error(405, 'use GET');

    const region = url.searchParams.get('region');
    if (!isRegion(region)) return error(400, `region must be one of: ${REGIONS.join(', ')}`);

    // Before any FIRMS or wind work: one shared MAP_KEY, one region loop's worth of
    // Open-Meteo calls per request. A script hammering this endpoint could exhaust
    // either. cf-connecting-ip is Cloudflare's real-client-IP header; 'anon' only
    // applies where that header is genuinely absent (e.g. local `wrangler dev`).
    const clientKey = request.headers.get('cf-connecting-ip') ?? 'anon';
    const { success } = await env.RADAR_LIMITER.limit({ key: clientKey });
    if (!success) return rateLimited();

    // Human check before any FIRMS or wind work. A missing secret refuses rather than
    // letting everything through: a misconfigured deploy must not silently drop the check.
    if (!env.TURNSTILE_SECRET) {
      return error(500, 'Human verification not configured, so no fire data was fetched. This is not an all-clear.');
    }
    if (!(await hasValidSession(request, env.TURNSTILE_SECRET, nowSec()))) {
      return Response.json(
        { error: 'Verify you are human to load fire data. This is not an all-clear.', verify: true },
        { status: 403, headers: { 'cache-control': 'no-store' } },
      );
    }

    // No key means nothing was checked. That is an error, never an all-clear.
    if (!env.FIRMS_MAP_KEY) {
      return error(500, 'FIRMS key not configured, so no fire data was fetched. This is not an all-clear.');
    }

    let grids: Geo;
    try {
      grids = await loadGeo(env, request.url);
    } catch (err) {
      // Without the grids no fire can be placed in a state or classified; fail loudly.
      return error(500, err instanceof Error ? err.message : 'state and land-cover grids unavailable');
    }

    try {
      const result = await runRadar(region, env.FIRMS_MAP_KEY, grids);
      return Response.json(result, { headers: { 'cache-control': 'no-store' } });
    } catch (err) {
      // fetchHotspots never puts its URL (which carries the key) in an error message.
      return error(502, err instanceof Error ? err.message : 'FIRMS fetch failed');
    }
  },
};
