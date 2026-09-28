import { decodeMaskIndex, REGIONS, runRadar, type LandCoverMask, type Region } from '@madhuca/logic';

/** Bindings from wrangler.jsonc. FIRMS_MAP_KEY is a Worker secret, never in the repo or the client bundle. */
export interface Env {
  FIRMS_MAP_KEY?: string;
  /** Static assets: the prebuilt land-cover indexes under /landcover/<region>.bin. */
  ASSETS: { fetch(input: Request | string): Promise<Response> };
}

// The Worker reads the prebuilt index (worker/scripts/build-landcover-index.ts), not
// the JSON mask: parsing the JSON and building the index on a cold isolate cost
// 60-260ms of CPU per region against the 10ms budget, and loading the .bin is a few
// typed-array views (worker/bench/cpu-budget.ts). Kept for the isolate's lifetime.
const masks = new Map<Region, Promise<LandCoverMask>>();

function loadMask(env: Env, region: Region, requestUrl: string): Promise<LandCoverMask> {
  let mask = masks.get(region);
  if (!mask) {
    mask = env.ASSETS.fetch(new URL(`/landcover/${region}.bin`, requestUrl).toString()).then(async (res) => {
      if (!res.ok) throw new Error(`land-cover mask for ${region} responded ${res.status}`);
      return decodeMaskIndex(region, await res.arrayBuffer());
    });
    // A failed load is not cached, so the next request retries it.
    mask.catch(() => masks.delete(region));
    masks.set(region, mask);
  }
  return mask;
}

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { 'cache-control': 'no-store' } });
}

function isRegion(value: string | null): value is Region {
  return (REGIONS as readonly (string | null)[]).includes(value);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api/radar') return error(404, 'not found');
    if (request.method !== 'GET') return error(405, 'use GET');

    const region = url.searchParams.get('region');
    if (!isRegion(region)) return error(400, `region must be one of: ${REGIONS.join(', ')}`);

    // No key means nothing was checked. That is an error, never an all-clear.
    if (!env.FIRMS_MAP_KEY) {
      return error(500, 'FIRMS key not configured, so no fire data was fetched. This is not an all-clear.');
    }

    let mask: LandCoverMask;
    try {
      mask = await loadMask(env, region, request.url);
    } catch (err) {
      // Without the mask every fire would read as 'other'; fail loudly instead.
      return error(500, err instanceof Error ? err.message : 'land-cover mask unavailable');
    }

    try {
      const result = await runRadar(region, env.FIRMS_MAP_KEY, mask);
      return Response.json(result, { headers: { 'cache-control': 'no-store' } });
    } catch (err) {
      // fetchHotspots never puts its URL (which carries the key) in an error message.
      return error(502, err instanceof Error ? err.message : 'FIRMS fetch failed');
    }
  },
};
