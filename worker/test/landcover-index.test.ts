import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { encodeMaskIndex, REGIONS, type LandCoverMask } from '@madhuca/logic';

const LANDCOVER = join(import.meta.dirname, '..', '..', 'frontend', 'public', 'landcover');

// The Worker serves the committed .bin files, not the JSON. If the masks are
// republished (pipeline/, landcover.yml) without re-running the build script, the
// Worker would classify against stale land cover without any error. This catches it.
for (const region of REGIONS) {
  test(`${region}.bin is up to date with ${region}.json (else: npm run build:index --workspace worker)`, () => {
    const mask = JSON.parse(readFileSync(join(LANDCOVER, `${region}.json`), 'utf8')) as LandCoverMask;
    const committed = readFileSync(join(LANDCOVER, `${region}.bin`));
    assert.ok(Buffer.from(encodeMaskIndex(mask)).equals(committed), `${region}.bin is stale`);
  });
}
