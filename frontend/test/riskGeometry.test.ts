import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { riskImageCoordinates, riskImageUrl, type RiskGridData } from '../src/utils/riskGeometry.ts';

test('image corners run clockwise from the top left of the grid box', () => {
  assert.deepEqual(riskImageCoordinates({ bbox: [76.7, 12.6, 84.8, 19.95] }), [
    [76.7, 19.95],
    [84.8, 19.95],
    [84.8, 12.6],
    [76.7, 12.6],
  ]);
  assert.equal(riskImageUrl('/risk/telangana.json'), '/risk/telangana.png');
});

/** Decode the RGBA PNG ml/render_risk.py writes (8-bit, colour type 6, filter 0 rows). */
function readPng(path: URL) {
  const buf = readFileSync(path);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const idat: Buffer[] = [];
  for (let at = 8; at < buf.length; ) {
    const len = buf.readUInt32BE(at);
    if (buf.toString('ascii', at + 4, at + 8) === 'IDAT') idat.push(buf.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const alpha = (x: number, y: number) => raw[y * (width * 4 + 1) + 1 + x * 4 + 3]!;
  return { width, height, alpha };
}

test('the published Telangana / AP risk image stops at state lines and the coast', () => {
  const grid = JSON.parse(readFileSync(new URL('../public/risk/telangana.json', import.meta.url), 'utf8')) as RiskGridData;
  const png = readPng(new URL('../public/risk/telangana.png', import.meta.url));
  const [w, s, e, n] = grid.bbox;
  const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  // Rows are even in Web Mercator, as the MapLibre image source expects.
  const at = (lon: number, lat: number) =>
    png.alpha(
      Math.floor(((lon - w) / (e - w)) * png.width),
      Math.floor(((merc(n) - merc(lat)) / (merc(n) - merc(s))) * png.height),
    );
  assert.ok(at(79.27, 17.06) > 0, 'Nalgonda, Telangana: drawn');
  assert.ok(at(79.99, 14.44) > 0, 'Nellore, AP: drawn');
  assert.equal(at(77.59, 12.97), 0, 'Bengaluru, Karnataka: transparent');
  assert.equal(at(80.27, 13.08), 0, 'Chennai, Tamil Nadu: transparent');
  assert.equal(at(83.5, 15.5), 0, 'Bay of Bengal: transparent');
  assert.equal(grid.risk.length, grid.cols * grid.rows);
});
