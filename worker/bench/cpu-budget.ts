// CPU cost of the Worker's per-region work, measured in Node on a dev machine.
//
//   node worker/bench/cpu-budget.ts
//
// This is a proxy, not the Workers number: Workers bills V8 CPU on Cloudflare's
// hardware, and the dashboard's CPU-time chart after deploy is the real check.
// It does say which steps are anywhere near the 10ms free-tier budget.
//
// Per region it times, as wall time around synchronous code (process.cpuUsage ticks
// in ~15.6ms steps on Windows, too coarse for this; sync JS on one thread is CPU-bound,
// so wall time is an upper bound on CPU here):
//   json_cold  the old path: JSON.parse of the mask plus the classifier's index build
//   bin_cold   what the Worker does now: copy the prebuilt .bin into an ArrayBuffer
//              (as res.arrayBuffer() does), decode it, classify the first hotspot
//   warm       the dispersion + classification loop for 100 hotspots, index loaded
// The cold costs are paid once per region per isolate; the mask is cached after.
// Wind and FIRMS time is fetch wait, which the budget does not count.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  classifyHotspot,
  computeDispersion,
  decodeMaskIndex,
  REGION_BBOX,
  REGIONS,
  type Hotspot,
  type LandCoverMask,
} from '@madhuca/logic';

const HOTSPOTS = 100;
const RUNS = 5;

function cpuMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

const dir = join(import.meta.dirname, '..', '..', 'frontend', 'public', 'landcover');
console.log(`region     json_MB  json_cold_ms  bin_MB  bin_cold_ms  warm_${HOTSPOTS}_ms`);
for (const region of REGIONS) {
  const text = readFileSync(join(dir, `${region}.json`), 'utf8');
  const bin = readFileSync(join(dir, `${region}.bin`));
  const [w, s, e, n] = REGION_BBOX[region];
  // Deterministic spread of points over the region box.
  const hotspots: Hotspot[] = Array.from({ length: HOTSPOTS }, (_, i) => ({
    id: `bench:${i}`,
    lat: s + ((i * 37) % 100) / 100 * (n - s),
    lon: w + ((i * 61) % 100) / 100 * (e - w),
    frp: 5 + (i % 40),
    confidence: 'n',
    acquiredAt: '2026-10-20T08:00:00Z',
    satellite: 'N',
  }));
  const wind = { speedMs: 3, directionDeg: 315, observedAt: '2026-10-20T08:00:00Z' };

  const jsonCold: number[] = [];
  const binCold: number[] = [];
  const warm: number[] = [];
  for (let r = 0; r < RUNS; r++) {
    jsonCold.push(cpuMs(() => { classifyHotspot(hotspots[0]!, JSON.parse(text) as LandCoverMask); }));
    let mask!: LandCoverMask;
    binCold.push(cpuMs(() => {
      const bytes = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
      mask = decodeMaskIndex(region, bytes);
      classifyHotspot(hotspots[0]!, mask);
    }));
    warm.push(cpuMs(() => {
      for (const hs of hotspots) {
        computeDispersion(hs, wind);
        classifyHotspot(hs, mask);
      }
    }));
  }
  console.log(
    `${region.padEnd(10)} ${(text.length / 1e6).toFixed(2).padStart(7)}  ${median(jsonCold).toFixed(1).padStart(12)}  ` +
      `${(bin.byteLength / 1e6).toFixed(2).padStart(6)}  ${median(binCold).toFixed(2).padStart(11)}  ` +
      `${median(warm).toFixed(2).padStart(11)}`,
  );
}
