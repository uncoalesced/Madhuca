import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HIDDEN_BASEMAP_LAYERS, WATER, restyleBasemap, type RestylableMap } from '../src/components/MapView.ts';

type Ring = [number, number][];
interface StateFeature {
  properties: { name: string };
  geometry: { coordinates: Ring[][] };
}

const states = (
  JSON.parse(readFileSync(new URL('../public/boundaries/states.json', import.meta.url), 'utf8')) as {
    features: StateFeature[];
  }
).features;

function stateAt(lon: number, lat: number): string | undefined {
  for (const s of states) {
    let hit = false;
    for (const poly of s.geometry.coordinates)
      for (const ring of poly)
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i]!;
          const [xj, yj] = ring[j]!;
          if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
        }
    if (hit) return s.properties.name;
  }
  return undefined;
}

test('the published map shows India whole: PoK, Gilgit-Baltistan, Aksai Chin, Arunachal', () => {
  assert.equal(stateAt(74.31, 35.92), 'Ladakh', 'Gilgit');
  assert.equal(stateAt(79.3, 35.2), 'Ladakh', 'Aksai Chin');
  assert.equal(stateAt(73.47, 34.37), 'Jammu & Kashmir', 'Muzaffarabad');
  assert.equal(stateAt(91.86, 27.59), 'Arunachal Pradesh', 'Tawang');
  assert.equal(stateAt(74.35, 31.55), undefined, 'Lahore');
  assert.equal(states.length, 36);
});

test('restyleBasemap hides de-facto borders, turns water blue, and adds our boundary layers', () => {
  const hidden: string[] = [];
  const paint: Record<string, unknown> = {};
  const added: string[] = [];
  let stateFilter: unknown;
  const fake: RestylableMap = {
    getLayer: () => ({}),
    getFilter: () => ['==', 'class', 'state'],
    setFilter: (_id, f) => (stateFilter = f),
    getStyle: () => ({ layers: [{ id: 'water', type: 'fill' }, { id: 'place_state', type: 'symbol' }] }),
    setLayoutProperty: (id, name, value) => {
      if (name === 'visibility' && value === 'none') hidden.push(id);
    },
    setPaintProperty: (id, name, value) => (paint[`${id}.${name}`] = value),
    addSource: () => undefined,
    addLayer: (layer, before) => added.push(`${(layer as { id: string }).id}<${before}`),
  };
  restyleBasemap(fake);
  assert.deepEqual(hidden, HIDDEN_BASEMAP_LAYERS);
  assert.equal(paint['water.fill-color'], WATER);
  assert.deepEqual(added, ['india-states-line<place_state', 'country-borders-line<place_state']);
  assert.match(JSON.stringify(stateFilter), /Azad Kashmir.*Gilgit-Baltistan/);
});
