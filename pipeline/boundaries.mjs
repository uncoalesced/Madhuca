// One-off generator for the map's own boundary layers. Not run in CI or on the request path.
//
// The Carto basemap draws de-facto borders: Pakistan-occupied Kashmir, Gilgit-Baltistan
// and Aksai Chin fall outside India. MapView hides the basemap's country and state
// lines and draws these instead:
//   frontend/public/boundaries/borders.json      land borders between countries, Natural
//                                                 Earth 1:10m admin-0, India point of view
//                                                 (public domain)
//   frontend/public/boundaries/state-lines.json  borders between India's states and UTs,
//                                                 DataMeet States/Admin2 (Survey of India
//                                                 outline, Ladakh as its own UT)
//   frontend/public/boundaries/states.json       the state polygons themselves, for the risk
//                                                 layer's clip and for building regions.
//
// Run from the repo root:
//   curl -sSLo /tmp/ne_ind.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_ind.geojson
//   for e in shp dbf; do curl -sSLo /tmp/Admin2.$e https://raw.githubusercontent.com/datameet/maps/master/States/Admin2.$e; done
//   node pipeline/boundaries.mjs /tmp/ne_ind.geojson /tmp/Admin2

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [neSrc, admin2] = process.argv.slice(2);
if (!neSrc || !admin2) throw new Error('usage: node pipeline/boundaries.mjs <ne_ind.geojson> <path/to/Admin2 (no extension)>');

const WINDOW = [58, -2, 102, 40]; // South Asia, with room around India
const BORDER_TOLERANCE = 0.004; // degrees, ~400 m: display only
const STATE_TOLERANCE = 0.004;
const round = (v) => Math.round(v * 1e4) / 1e4;

// Douglas-Peucker, iterative.
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      // A closed ring starts and ends on the same point: measure from that point instead.
      const d = len
        ? Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len
        : Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, i) => keep[i]).map(([x, y]) => [round(x), round(y)]);
}

// Even-odd point in polygon over every ring of every polygon.
function inside(polys, lon, lat) {
  let hit = false;
  for (const poly of polys)
    for (const ring of poly)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
      }
  return hit;
}

const inWindow = ([x, y]) => x >= WINDOW[0] && x <= WINDOW[2] && y >= WINDOW[1] && y <= WINDOW[3];

/**
 * Land borders only: an edge used by two polygons is a border between them; an edge
 * used once is coastline (or, for the states, India's outer edge, which Natural Earth
 * draws). Both datasets are topological, so shared edges have identical vertices.
 * Each shared edge is emitted once, by its first owner, and runs of emitted edges
 * become simplified lines. `props(owners)` labels a line from the owners of its edges.
 */
function sharedEdgeLines(owners, tolerance, props) {
  const key = (a, b) => {
    const p = `${a[0].toFixed(6)},${a[1].toFixed(6)}`;
    const q = `${b[0].toFixed(6)},${b[1].toFixed(6)}`;
    return p < q ? `${p}|${q}` : `${q}|${p}`;
  };
  const edges = new Map(); // key -> owner ids
  owners.forEach(({ rings }, id) => {
    for (const ring of rings)
      for (let i = 1; i < ring.length; i++) {
        const k = key(ring[i - 1], ring[i]);
        const list = edges.get(k);
        if (list) list.push(id);
        else edges.set(k, [id]);
      }
  });
  const lines = [];
  owners.forEach(({ rings }, id) => {
    for (const ring of rings) {
      let run = [];
      let runOwners = null;
      const flush = () => {
        if (run.length >= 2) {
          const line = simplify(run, tolerance);
          if (line.length >= 2) lines.push({ type: 'Feature', properties: props(runOwners), geometry: { type: 'LineString', coordinates: line } });
        }
        run = [];
        runOwners = null;
      };
      for (let i = 1; i < ring.length; i++) {
        const who = edges.get(key(ring[i - 1], ring[i]));
        const emit = who.length >= 2 && who[0] === id && inWindow(ring[i - 1]) && inWindow(ring[i]);
        // A run also breaks where the neighbour changes, so each line has one owner pair.
        if (!emit || (runOwners && runOwners.join() !== who.join())) flush();
        if (!emit) continue;
        if (!run.length) run.push(ring[i - 1]);
        run.push(ring[i]);
        runOwners = who;
      }
      flush();
    }
  });
  return lines;
}

// ---- Country borders (Natural Earth, India POV).
const countries = JSON.parse(readFileSync(neSrc, 'utf8')).features.map((f) => ({
  iso: f.properties.ADM0_A3,
  polys: f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates,
}));
const indiaPolys = countries.find((c) => c.iso === 'IND')?.polys;
if (!indiaPolys) throw new Error('IND feature not found');
const borderFeatures = sharedEdgeLines(
  countries.map((c) => ({ rings: c.polys.flat() })),
  BORDER_TOLERANCE,
  (owners) => ({ india: owners.some((id) => countries[id].iso === 'IND') ? 1 : 0 }),
);

// ---- States: minimal ESRI shapefile reader (polygon records only) + dBase names.
function readDbfNames(buf) {
  const n = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recLen = buf.readUInt16LE(10);
  const fieldLen = buf[32 + 16];
  const names = [];
  for (let r = 0; r < n; r++) {
    const at = headerLen + r * recLen + 1;
    names.push(buf.subarray(at, at + fieldLen).toString('utf8').trim());
  }
  return names;
}

function readShpPolygons(buf) {
  const out = [];
  let at = 100;
  while (at < buf.length) {
    const contentLen = buf.readInt32BE(at + 4) * 2;
    const rec = at + 8;
    const type = buf.readInt32LE(rec);
    if (type !== 5) throw new Error(`shape type ${type} not supported`);
    const numParts = buf.readInt32LE(rec + 36);
    const numPoints = buf.readInt32LE(rec + 40);
    const parts = [];
    for (let i = 0; i < numParts; i++) parts.push(buf.readInt32LE(rec + 44 + i * 4));
    const ptsAt = rec + 44 + numParts * 4;
    const rings = [];
    for (let i = 0; i < numParts; i++) {
      const end = i + 1 < numParts ? parts[i + 1] : numPoints;
      const ring = [];
      for (let k = parts[i]; k < end; k++) ring.push([buf.readDoubleLE(ptsAt + k * 16), buf.readDoubleLE(ptsAt + k * 16 + 8)]);
      rings.push(ring);
    }
    out.push(rings);
    at = rec + contentLen;
  }
  return out;
}

// The spec says clockwise = outer, counter-clockwise = hole, but DataMeet winds some
// single-ring states the other way. So a record's first ring sets "outer", and a ring
// wound the opposite way is a hole in the latest outer.
const signedArea = (ring) => ring.reduce((s, [x1, y1], i) => {
  const [x2, y2] = ring[(i + 1) % ring.length];
  return s + (x1 * y2 - x2 * y1);
}, 0) / 2;

const names = readDbfNames(readFileSync(`${admin2}.dbf`));
const shapes = readShpPolygons(readFileSync(`${admin2}.shp`));
if (names.length !== shapes.length) throw new Error(`dbf has ${names.length} records, shp ${shapes.length}`);

// Interior state lines, from the unsimplified rings so shared edges still match.
const stateLines = sharedEdgeLines(
  shapes.map((rings) => ({ rings })),
  STATE_TOLERANCE,
  () => ({}),
);

const states = names.map((name, i) => {
  const polys = [];
  const outerSign = Math.sign(signedArea(shapes[i][0]));
  for (const raw of shapes[i]) {
    const ring = simplify(raw, STATE_TOLERANCE);
    if (ring.length < 4) continue;
    if (Math.sign(signedArea(raw)) === outerSign || !polys.length) polys.push([ring]);
    else polys[polys.length - 1].push(ring);
  }
  return { type: 'Feature', properties: { name }, geometry: { type: 'MultiPolygon', coordinates: polys } };
});

// ---- Checks: the reason this file exists. Fail loudly rather than publish a wrong map.
const stateOf = (lon, lat) => states.find((s) => inside(s.geometry.coordinates, lon, lat))?.properties.name;
const expect = [
  ['Gilgit (Gilgit-Baltistan)', 74.31, 35.92, 'Ladakh'],
  ['Muzaffarabad (PoK)', 73.47, 34.37, 'Jammu & Kashmir'],
  ['Aksai Chin', 79.3, 35.2, 'Ladakh'],
  ['Srinagar', 74.8, 34.08, 'Jammu & Kashmir'],
  ['Tawang', 91.86, 27.59, 'Arunachal Pradesh'],
  ['Hyderabad', 78.47, 17.38, 'Telangana'],
  ['Amaravati', 80.52, 16.51, 'Andhra Pradesh'],
  ['Lahore', 74.35, 31.55, undefined],
  ['Kathmandu', 85.32, 27.71, undefined],
  ['Bay of Bengal', 88, 15, undefined],
];
for (const [label, lon, lat, want] of expect) {
  const got = stateOf(lon, lat);
  if (got !== want) throw new Error(`${label}: state ${got}, expected ${want}`);
  if (inside(indiaPolys, lon, lat) !== (want !== undefined)) throw new Error(`${label}: Natural Earth India polygon disagrees`);
  console.log(`ok  ${label.padEnd(26)} -> ${want ?? 'outside India'}`);
}
if (states.length !== 36) throw new Error(`expected 36 states/UTs, got ${states.length}`);

const dir = new URL('../frontend/public/boundaries/', import.meta.url);
mkdirSync(dir, { recursive: true });
const write = (name, fc) => {
  const text = JSON.stringify(fc);
  writeFileSync(new URL(name, dir), text);
  console.log(`wrote frontend/public/boundaries/${name}: ${fc.features.length} features, ${(text.length / 1e6).toFixed(2)} MB`);
};
write('borders.json', { type: 'FeatureCollection', features: borderFeatures });
write('state-lines.json', { type: 'FeatureCollection', features: stateLines });
write('states.json', { type: 'FeatureCollection', features: states });

// ---- states.bin: which state every point is in, for the Worker (logic/src/geo.ts).
// A grid at GRID_RES stored as runs per row, from the UNsimplified rings: this is the
// India-border filter for FIRMS rows, and 0.005 deg once put a real fire 500 m from
// the Punjab border on the wrong side. Lookup is a binary search in one row.
const GRID = { west: 68, north: 38, east: 98, south: 6 };
const GRID_RES = 0.001; // ~110 m
const cols = Math.round((GRID.east - GRID.west) / GRID_RES);
const rows = Math.round((GRID.north - GRID.south) / GRID_RES);

const allEdges = [];
shapes.forEach((rings, sid) => {
  for (const ring of rings)
    for (let i = 1; i < ring.length; i++) {
      const [x0, y0] = ring[i - 1];
      const [x1, y1] = ring[i];
      if (y0 !== y1) allEdges.push({ x0, y0, x1, y1, sid, top: Math.max(y0, y1), bottom: Math.min(y0, y1) });
    }
});
allEdges.sort((a, b) => b.top - a.top);

const rowStart = new Uint32Array(rows + 1);
const runStarts = [];
const runValues = [];
let active = [];
let next = 0;
for (let r = 0; r < rows; r++) {
  const lat = GRID.north - (r + 0.5) * GRID_RES;
  while (next < allEdges.length && allEdges[next].top > lat) active.push(allEdges[next++]);
  active = active.filter((e) => e.bottom <= lat);
  // Even-odd crossings per state, paired into [from, to] column spans.
  const crossings = [];
  for (const e of active)
    if (e.y0 > lat !== e.y1 > lat) crossings.push([e.sid, e.x0 + ((lat - e.y0) * (e.x1 - e.x0)) / (e.y1 - e.y0)]);
  crossings.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const spans = [];
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    if (crossings[i][0] !== crossings[i + 1][0]) throw new Error(`odd crossing count for ${names[crossings[i][0]]} at row ${r}`);
    const c0 = Math.ceil((crossings[i][1] - GRID.west) / GRID_RES - 0.5);
    const c1 = Math.floor((crossings[i + 1][1] - GRID.west) / GRID_RES - 0.5);
    if (c1 >= c0 && c1 >= 0 && c0 < cols) spans.push([Math.max(c0, 0), Math.min(c1, cols - 1), crossings[i][0] + 1]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  // Runs: a value starts at a column and holds until the next start. 0 = outside India.
  let lastEnd = -1;
  let lastValue = 0;
  const push = (start, value) => {
    if (value === lastValue) return;
    runStarts.push(start);
    runValues.push(value);
    lastValue = value;
  };
  for (const [c0, c1, v] of spans) {
    const from = Math.max(c0, lastEnd + 1); // a sliver overlap goes to the earlier span
    if (from > c1) continue;
    if (from > lastEnd + 1) push(lastEnd + 1, 0);
    push(from, v);
    lastEnd = c1;
  }
  if (lastEnd + 1 < cols) push(lastEnd + 1, 0);
  // Each row starts from 'outside'; the lookup treats "no run at or before col" as 0.
  lastValue = 0;
  rowStart[r + 1] = runStarts.length;
}

const nameBytes = Buffer.from(names.join('\n'), 'utf8');
const header = Buffer.alloc(48);
header.write('MST1', 0, 'ascii');
header.writeUInt32LE(1, 4);
header.writeDoubleLE(GRID.west, 8);
header.writeDoubleLE(GRID.north, 16);
header.writeDoubleLE(GRID_RES, 24);
header.writeUInt32LE(cols, 32);
header.writeUInt32LE(rows, 36);
header.writeUInt32LE(runStarts.length, 40);
header.writeUInt32LE(nameBytes.length, 44);
const namePad = Buffer.alloc((4 - (nameBytes.length % 4)) % 4);
const binParts = [
  header,
  nameBytes,
  namePad,
  Buffer.from(rowStart.buffer),
  Buffer.from(Uint16Array.from(runStarts).buffer),
  Buffer.from(Uint8Array.from(runValues).buffer),
];
const bin = Buffer.concat(binParts);
writeFileSync(new URL('states.bin', dir), bin);
console.log(`wrote frontend/public/boundaries/states.bin: ${cols}x${rows} at ${GRID_RES} deg, ${runStarts.length} runs, ${(bin.length / 1e6).toFixed(2)} MB`);

// Same known answers against the grid, plus points either side of the Punjab border.
function binState(lon, lat) {
  const r = Math.floor((GRID.north - lat) / GRID_RES);
  const c = Math.floor((lon - GRID.west) / GRID_RES);
  let value = 0;
  for (let k = rowStart[r]; k < rowStart[r + 1] && runStarts[k] <= c; k++) value = runValues[k];
  return value ? names[value - 1] : undefined;
}
for (const [label, lon, lat, want] of [
  ...expect,
  ['Attari (Indian side of Wagah)', 74.585, 31.605, 'Punjab'],
  ['Wagah (Pakistani side)', 74.57, 31.6045, undefined],
  ['Ferozepur', 74.61, 30.93, 'Punjab'],
  ['Kasur (Pakistan)', 74.45, 31.12, undefined],
]) {
  const got = binState(lon, lat);
  if (got !== want) throw new Error(`states.bin ${label}: ${got}, expected ${want}`);
}
console.log('ok  states.bin agrees on every known point, incl. both sides of the Punjab border');
