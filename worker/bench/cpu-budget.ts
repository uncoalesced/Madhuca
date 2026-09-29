// CPU cost of the Worker's per-request work, measured in Node on a dev machine.
//
//   node worker/bench/cpu-budget.ts
//
// This is a proxy, not the Workers number: Workers bills V8 CPU on Cloudflare's
// hardware, and the dashboard's CPU-time chart after deploy is the real check.
// It does say which steps are anywhere near the 10ms free-tier budget.
//
// Timed as wall time around synchronous code (process.cpuUsage ticks in ~15.6ms steps
// on Windows, too coarse for this; sync JS on one thread is CPU-bound, so wall time is
// an upper bound on CPU here):
//   cold   copy states.bin and india.bin into ArrayBuffers (as res.arrayBuffer() does)
//          and decode both: paid once per isolate
//   parse  parseHotspotCsv on a synthetic all-India FIRMS day of N rows
//   loop   per hotspot: state lookup + region filter, land-cover lookup, dispersion,
//          classification. Wind and FIRMS time is fetch wait, which the budget does not count.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  classifyHotspot,
  computeDispersion,
  decodeLandCoverGrid,
  decodeStateGrid,
  inRegion,
  parseHotspotCsv,
  REGION_BBOX,
} from '@madhuca/logic';

const RUNS = 7;
const SIZES = [500, 1500, 3000];

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const time = (run: () => void) => {
  const start = performance.now();
  run();
  return performance.now() - start;
};

const pub = join(import.meta.dirname, '..', '..', 'frontend', 'public');
const statesBin = readFileSync(join(pub, 'boundaries', 'states.bin'));
const landBin = readFileSync(join(pub, 'landcover', 'india.bin'));
const copy = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

let stateAt!: ReturnType<typeof decodeStateGrid>;
let landCoverAt!: ReturnType<typeof decodeLandCoverGrid>;
const cold = median(
  Array.from({ length: RUNS }, () =>
    time(() => {
      stateAt = decodeStateGrid(copy(statesBin));
      landCoverAt = decodeLandCoverGrid(copy(landBin));
    }),
  ),
);
console.log(`cold: decode states.bin (${(statesBin.length / 1e6).toFixed(2)} MB) + india.bin (${(landBin.length / 1e6).toFixed(2)} MB): ${cold.toFixed(2)} ms, once per isolate`);

const HEADER =
  'country_id,latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight';
const [w, s, e, n] = REGION_BBOX.india;
const wind = { speedMs: 3, directionDeg: 315, observedAt: '2026-10-20T08:00:00Z' };

console.log('hotspots  parse_ms  loop_ms  total_ms  (budget 10 ms per request)');
for (const size of SIZES) {
  // Deterministic spread over the whole-India box, most of it abroad or at sea.
  const csv = [
    HEADER,
    ...Array.from(
      { length: size },
      (_, i) =>
        `IND,${(s + (((i * 37) % 1000) / 1000) * (n - s)).toFixed(4)},${(w + (((i * 61) % 1000) / 1000) * (e - w)).toFixed(4)},330.5,0.42,0.38,2026-10-20,0800,N,VIIRS,n,2.0NRT,295.1,${5 + (i % 40)},D`,
    ),
  ].join('\n');
  let hotspots = parseHotspotCsv(csv);
  const parse = median(Array.from({ length: RUNS }, () => time(() => (hotspots = parseHotspotCsv(csv)))));
  const loop = median(
    Array.from({ length: RUNS }, () =>
      time(() => {
        for (const hs of hotspots) {
          const state = stateAt(hs.lon, hs.lat);
          if (!inRegion('india', state)) continue;
          computeDispersion(hs, wind);
          classifyHotspot(hs, landCoverAt(hs.lon, hs.lat), state);
        }
      }),
    ),
  );
  console.log(`${String(size).padStart(8)}  ${parse.toFixed(2).padStart(8)}  ${loop.toFixed(2).padStart(7)}  ${(parse + loop).toFixed(2).padStart(8)}`);
}
