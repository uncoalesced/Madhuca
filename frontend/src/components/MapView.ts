import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  REGION_BBOX,
  type Classification,
  type Hotspot,
  type Plume,
  type Region,
} from '@madhuca/logic';
import {
  DETECTION_FOOTPRINT_KM,
  SPREAD_HORIZON_H,
  circlePolygon,
  isCalmPlume,
  plumeToGeoJSONPolygon,
  spreadWedges,
} from '../utils/plumeGeometry.ts';
import { bboxImageCoordinates, riskImageUrl, type RiskGridData } from '../utils/riskGeometry.ts';

export interface MapViewProps {
  region: Region;
  hotspots: Hotspot[];
  /** Plume per hotspot id, once Jammy's dispersion module is wired in. */
  plumes?: Record<string, Plume>;
  /** Classification per hotspot id (likely-crop-burning vs likely-wildfire). */
  classifications?: Record<string, Classification>;
  /** Currently selected hotspot id. */
  selectedId?: string | null;
  onSelect: (hotspot: Hotspot) => void;
  /** URL of the region's fire-risk grid (frontend/public/risk/), when one exists. */
  riskUrl?: string;
}

/** Determines high-contrast marker pin color based on fire classification. */
export function getMarkerColor(classification?: Classification): string {
  if (classification?.kind === 'likely-wildfire') return '#EF2D56'; // Watermelon: wildfire (Mosaic semantic)
  if (classification?.kind === 'likely-crop-burning') return '#F19143'; // Sandy Brown: stubble / biomass (Mosaic semantic)
  return '#767976'; // Muted ink: pending / other, no extra hue
}

/** Builds GeoJSON FeatureCollection from hotspots and their dispersion plumes. */
export function createPlumeFeatureCollection(
  hotspots: Hotspot[],
  plumes?: Record<string, Plume>,
  classifications?: Record<string, Classification>
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

  if (!plumes) return { type: 'FeatureCollection', features: [] };

  for (const hotspot of hotspots) {
    const plume = plumes[hotspot.id];
    if (!plume) continue;

    const polygon = plumeToGeoJSONPolygon(hotspot.lat, hotspot.lon, plume);
    const classification = classifications?.[hotspot.id];
    const color = getMarkerColor(classification);

    features.push({
      type: 'Feature',
      id: hotspot.id,
      properties: {
        hotspotId: hotspot.id,
        classification: classification?.kind ?? 'other',
        color,
      },
      geometry: polygon,
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * The fire itself, drawn under the marker: the detection footprint, plus a red haze
 * toward where it may spread (utils/plumeGeometry.ts spreadWedges) when the wind speed
 * is known. `band` 0 is the footprint; 1..3 are the haze, nearest band densest.
 */
export function createFireFeatureCollection(
  hotspots: Hotspot[],
  plumes?: Record<string, Plume>,
  classifications?: Record<string, Classification>,
  windSpeeds?: Record<string, number>
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  for (const hs of hotspots) {
    const color = getMarkerColor(classifications?.[hs.id]);
    features.push({
      type: 'Feature',
      properties: { hotspotId: hs.id, band: 0, color },
      geometry: circlePolygon(hs.lat, hs.lon, DETECTION_FOOTPRINT_KM),
    });
    const plume = plumes?.[hs.id];
    if (!plume || isCalmPlume(plume)) continue;
    spreadWedges(hs.lat, hs.lon, plume.bearingDeg, windSpeeds?.[hs.id]).forEach((geometry, i) =>
      features.push({ type: 'Feature', properties: { hotspotId: hs.id, band: i + 1, color }, geometry })
    );
  }
  return { type: 'FeatureCollection', features };
}

const SMOKE = '#5B6573';

/**
 * ESA WorldCover cropland for all of India (pipeline/landcover_india.py), one 1-bit
 * image fetched only when the toggle is first switched on.
 */
export const FARMLAND_IMAGE = { url: '/landcover/farmland.png', bbox: [68, 6, 98, 38] as const };

const DEFAULT_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export const WATER = '#B3DAF5';
const WATERWAY = '#86BFE6';

/**
 * Positron's country and state lines follow de-facto borders (PoK, Gilgit-Baltistan
 * and Aksai Chin drawn outside India). They are hidden, and replaced by India's official
 * boundary from frontend/public/boundaries/ (pipeline/boundaries.mjs, which asserts
 * Gilgit and Aksai Chin fall inside Ladakh). Grey water becomes blue.
 */
export const HIDDEN_BASEMAP_LAYERS = ['boundary_country_outline', 'boundary_country_inner', 'boundary_state'];
const POK_PROVINCE_LABELS = ['Azad Kashmir', 'Azad Jammu and Kashmir', 'Gilgit-Baltistan', 'Gilgit Baltistan'];

/** Minimal slice of maplibregl.Map this touches, so a test can pass a fake. */
export interface RestylableMap {
  getLayer(id: string): unknown;
  getFilter(id: string): unknown;
  setFilter(id: string, filter: unknown): void;
  getStyle(): { layers: Array<{ id: string; type: string }> };
  setLayoutProperty(id: string, name: string, value: unknown): void;
  setPaintProperty(id: string, name: string, value: unknown): void;
  addSource(id: string, source: object): void;
  addLayer(layer: object, beforeId?: string): void;
}

export function restyleBasemap(map: RestylableMap): void {
  for (const id of HIDDEN_BASEMAP_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
  if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', WATER);
  if (map.getLayer('waterway')) map.setPaintProperty('waterway', 'line-color', WATERWAY);
  for (const id of ['watername_ocean', 'watername_sea']) {
    if (!map.getLayer(id)) continue;
    map.setPaintProperty(id, 'text-color', '#4F86AD');
    map.setPaintProperty(id, 'text-halo-color', WATER);
  }
  // The basemap labels Pakistan's names for the provinces of PoK; they are part of
  // Jammu & Kashmir and Ladakh on this map.
  if (map.getLayer('place_state')) {
    map.setFilter('place_state', [
      'all',
      map.getFilter('place_state') ?? ['has', 'name'],
      ['!in', 'name', ...POK_PROVINCE_LABELS],
      ['!in', 'name_en', ...POK_PROVINCE_LABELS],
    ]);
  }

  // Under the first label layer, so place names stay readable over the lines.
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  map.addSource('india-states', { type: 'geojson', data: '/boundaries/state-lines.json' });
  map.addSource('country-borders', { type: 'geojson', data: '/boundaries/borders.json' });
  map.addLayer(
    {
      id: 'india-states-line',
      type: 'line',
      source: 'india-states',
      paint: {
        'line-color': '#B9A3A6',
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 7, 1, 10, 1.4],
      },
    },
    firstLabel,
  );
  map.addLayer(
    {
      id: 'country-borders-line',
      type: 'line',
      source: 'country-borders',
      paint: {
        'line-color': ['case', ['==', ['get', 'india'], 1], '#8C7477', '#B9A3A6'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 7, 1.8, 10, 2.4],
      },
    },
    firstLabel,
  );
}

/** MapLibre GL map with a marker per hotspot and dispersion plume overlays for the selected region. */
export function MapView({
  region,
  hotspots,
  plumes,
  classifications,
  selectedId,
  onSelect,
  riskUrl,
}: MapViewProps) {
  const [riskOn, setRiskOn] = useState(false);
  const [farmlandOn, setFarmlandOn] = useState(false);
  const [riskGrid, setRiskGrid] = useState<RiskGridData | null>(null);
  const [riskError, setRiskError] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Latest plume data, read by the map 'load' handler. Data often arrives before the
  // style finishes loading, and a closure over the first render would draw nothing.
  const plumeDataRef = useRef(createPlumeFeatureCollection(hotspots, plumes, classifications));
  plumeDataRef.current = createPlumeFeatureCollection(hotspots, plumes, classifications);
  // ponytail: no wind speeds until Plume.windSpeedMs lands (contract issue #37); until
  // then only the detection footprint is drawn, never a guessed spread.
  const fireDataRef = useRef(createFireFeatureCollection(hotspots, plumes, classifications));
  fireDataRef.current = createFireFeatureCollection(hotspots, plumes, classifications);

  // Initialize MapLibre GL map
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    const [west, south, east, north] = REGION_BBOX[region];
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: DEFAULT_MAP_STYLE,
      bounds: [
        [west, south],
        [east, north],
      ],
      fitBoundsOptions: { padding: 32, maxZoom: 12 },
      // North stays up, so the panel's direction arrow always matches the map.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      restyleBasemap(map);

      // Smoke: slate grey, dotted outline, so it never reads as more fire.
      map.addSource('plumes-source', { type: 'geojson', data: plumeDataRef.current });
      map.addLayer({
        id: 'plumes-fill',
        type: 'fill',
        source: 'plumes-source',
        paint: { 'fill-color': SMOKE, 'fill-opacity': 0.18 },
      });
      map.addLayer({
        id: 'plumes-line',
        type: 'line',
        source: 'plumes-source',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': SMOKE, 'line-width': 2, 'line-opacity': 0.9, 'line-dasharray': [0.1, 2] },
      });

      // Fire on top of smoke: haze bands at rising opacity toward the fire, then the footprint.
      map.addSource('fire-source', { type: 'geojson', data: fireDataRef.current });
      map.addLayer({
        id: 'fire-fill',
        type: 'fill',
        source: 'fire-source',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['match', ['get', 'band'], 0, 0.85, 1, 0.16, 2, 0.16, 3, 0.2, 0.16],
        },
      });
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update bounds when region changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const [west, south, east, north] = REGION_BBOX[region];
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 32, duration: 1200, maxZoom: 12 }
    );
  }, [region]);

  // Update plume GeoJSON source data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    (map.getSource('plumes-source') as maplibregl.GeoJSONSource | undefined)?.setData(plumeDataRef.current);
    (map.getSource('fire-source') as maplibregl.GeoJSONSource | undefined)?.setData(fireDataRef.current);
  }, [hotspots, plumes, classifications]);

  // Smoke and spread are a few km across, invisible at region zoom: frame the selected fire.
  useEffect(() => {
    const map = mapRef.current;
    const hs = hotspots.find((h) => h.id === selectedId);
    if (!map || !hs) return;
    const plume = plumes?.[hs.id];
    const ring = plume ? plumeToGeoJSONPolygon(hs.lat, hs.lon, plume).coordinates[0]! : [[hs.lon, hs.lat] as [number, number]];
    const lons = ring.map((p) => p[0]);
    const lats = ring.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      // Right padding keeps the fire clear of the detail drawer on desktop.
      { padding: { top: 60, bottom: 60, left: 60, right: window.innerWidth > 900 ? 380 : 60 }, maxZoom: 13, duration: 900 }
    );
  }, [selectedId]);

  // A different region's grid (or none) replaces whatever was loaded.
  useEffect(() => {
    setRiskGrid(null);
    setRiskError(false);
    if (!riskUrl) setRiskOn(false);
  }, [riskUrl]);

  // Fetch the grid the first time the layer is switched on for this region.
  useEffect(() => {
    if (!riskOn || !riskUrl || riskGrid || riskError) return;
    let live = true;
    fetch(riskUrl)
      .then((r) => (r.ok ? (r.json() as Promise<RiskGridData>) : Promise.reject(new Error(String(r.status)))))
      .then((g) => live && setRiskGrid(g))
      .catch(() => live && setRiskError(true));
    return () => {
      live = false;
    };
  }, [riskOn, riskUrl, riskGrid, riskError]);

  // Draw or hide the risk layer. It sits below the plumes; markers are DOM, so above both.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const visible = riskOn && riskGrid !== null;
      if (riskGrid && riskUrl) {
        // Colours are baked into the image by ml/render_risk.py, same ramp as before
        // (p tops out around 0.14, median 0.02, for a 14-day window).
        const url = riskImageUrl(riskUrl);
        const coordinates = bboxImageCoordinates(riskGrid);
        const source = map.getSource('risk-source') as maplibregl.ImageSource | undefined;
        if (source) source.updateImage({ url, coordinates });
        else {
          map.addSource('risk-source', { type: 'image', url, coordinates });
          map.addLayer(
            {
              id: 'risk-fill',
              type: 'raster',
              source: 'risk-source',
              paint: { 'raster-opacity': 0.5, 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
            },
            map.getLayer('plumes-fill') ? 'plumes-fill' : undefined
          );
        }
      }
      if (map.getLayer('risk-fill')) map.setLayoutProperty('risk-fill', 'visibility', visible ? 'visible' : 'none');
    };
    if (map.isStyleLoaded()) apply();
    else map.once('idle', apply);
  }, [riskOn, riskGrid, riskUrl]);

  // Farmland sits lowest, under risk, smoke and fire.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (farmlandOn && !map.getSource('farmland-source')) {
        map.addSource('farmland-source', {
          type: 'image',
          url: FARMLAND_IMAGE.url,
          coordinates: bboxImageCoordinates(FARMLAND_IMAGE),
        });
        const below = ['risk-fill', 'plumes-fill'].find((id) => map.getLayer(id));
        map.addLayer(
          {
            id: 'farmland-fill',
            type: 'raster',
            source: 'farmland-source',
            // Nearest keeps the 1 km cells crisp instead of smearing yellow into the fields' gaps.
            paint: { 'raster-opacity': 0.4, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 },
          },
          below
        );
      }
      if (map.getLayer('farmland-fill')) map.setLayoutProperty('farmland-fill', 'visibility', farmlandOn ? 'visible' : 'none');
    };
    if (map.isStyleLoaded()) apply();
    else map.once('idle', apply);
  }, [farmlandOn]);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Render new markers
    for (const hotspot of hotspots) {
      const classification = classifications?.[hotspot.id];
      const isSelected = hotspot.id === selectedId;
      const color = getMarkerColor(classification);

      const el = document.createElement('button');
      el.type = 'button';
      el.className = `fire-marker ${isSelected ? 'fire-marker-selected' : ''}`;
      el.setAttribute('aria-label', `Fire hotspot FRP ${hotspot.frp} MW`);
      el.style.backgroundColor = color;
      el.style.width = isSelected ? '28px' : '22px';
      el.style.height = isSelected ? '28px' : '22px';
      el.style.borderRadius = '50%';
      el.style.border = isSelected ? '3px solid #FDFFFC' : '2px solid #FDFFFC';
      el.style.boxShadow = '0 1px 3px rgba(51,51,51,0.4)';
      el.style.cursor = 'pointer';

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelect(hotspot);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([hotspot.lon, hotspot.lat])
        .addTo(map);

      markersRef.current.push(marker);
    }
  }, [hotspots, classifications, selectedId, onSelect]);

  return React.createElement(
    'div',
    {
      className: 'map-view-container',
      'aria-label': `Map of ${region} active fire radar`,
    },
    React.createElement('div', {
      ref: mapContainerRef,
      className: 'maplibre-map-root',
      style: { position: 'absolute', inset: 0 },
    }),
    React.createElement(
      'div',
      { className: 'map-legend', 'aria-label': 'Map Legend' },
      React.createElement(
        'div',
        { className: 'legend-item' },
        React.createElement('span', { className: 'legend-dot dot-stubble' }),
        React.createElement('span', { className: 'legend-label' }, 'Likely Stubble Burning')
      ),
      React.createElement(
        'div',
        { className: 'legend-item' },
        React.createElement('span', { className: 'legend-dot dot-wildfire' }),
        React.createElement('span', { className: 'legend-label' }, 'Likely Wildfire')
      ),
      React.createElement(
        'div',
        { className: 'legend-item', title: `10% of wind speed over ${SPREAD_HORIZON_H} h. A rule of thumb, not a fire-spread model.` },
        React.createElement('span', { className: 'legend-swatch swatch-spread' }),
        React.createElement('span', { className: 'legend-label' }, `Possible spread (${SPREAD_HORIZON_H} h)`)
      ),
      React.createElement(
        'div',
        { className: 'legend-item' },
        React.createElement('span', { className: 'legend-swatch swatch-smoke' }),
        React.createElement('span', { className: 'legend-label' }, 'Smoke drift')
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'risk-toggle farmland-toggle',
          'aria-pressed': farmlandOn,
          onClick: () => setFarmlandOn((on) => !on),
        },
        farmlandOn ? 'Hide farmland' : 'Show farmland'
      ),
      farmlandOn &&
        React.createElement(
          'p',
          { className: 'risk-note' },
          React.createElement('span', { className: 'legend-swatch swatch-farmland' }),
          ' Cropland, ESA WorldCover 2021 (~1 km).'
        ),
      riskUrl &&
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'risk-toggle',
            'aria-pressed': riskOn,
            onClick: () => setRiskOn((on) => !on),
          },
          riskOn ? 'Hide fire risk' : 'Show fire risk (14 days)'
        ),
      riskUrl && riskOn && riskError &&
        React.createElement('p', { className: 'risk-note' }, 'Fire-risk layer failed to load.'),
      riskUrl && riskOn && riskGrid &&
        React.createElement(
          'p',
          { className: 'risk-note', title: riskGrid.model },
          `Chance of any fire, crop burning included, ${riskGrid.validFrom} to ${riskGrid.validTo}. ` +
            'Experimental statistical estimate. Low is not an all-clear. ' +
            `Model: ${riskGrid.model.split(' (')[0]}.`
        )
    )
  );
}
