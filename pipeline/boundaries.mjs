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
