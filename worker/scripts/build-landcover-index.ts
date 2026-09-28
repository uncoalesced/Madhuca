// Prebuilds each region's land-cover lookup index for the Worker.
//
//   npm run build:index --workspace worker
//
// Reads frontend/public/landcover/<region>.json and writes <region>.bin next to it.
// The Worker loads the .bin instead of the JSON, because parsing the JSON and
// building the index on a cold isolate costs 60-260ms of CPU per region against a
// 10ms free-tier budget. Re-run it whenever the masks are republished;
// worker/test/landcover-index.test.ts fails while any .bin is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { encodeMaskIndex, REGIONS, type LandCoverMask } from '@madhuca/logic';

const dir = join(import.meta.dirname, '..', '..', 'frontend', 'public', 'landcover');

for (const region of REGIONS) {
  const mask = JSON.parse(readFileSync(join(dir, `${region}.json`), 'utf8')) as LandCoverMask;
  const bytes = new Uint8Array(encodeMaskIndex(mask));
  writeFileSync(join(dir, `${region}.bin`), bytes);
  console.log(`${region}: ${(bytes.byteLength / 1e6).toFixed(2)} MB`);
}
