import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  REGION_BBOX,
  type Classification,
  type Hotspot,
  type Plume,
  type Region,
} from '@madhuca/logic';
import { plumeToGeoJSONPolygon } from '../utils/plumeGeometry.ts';
import { riskGridToFeatureCollection, type RiskGridData } from '../utils/riskGeometry.ts';

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

const DEFAULT_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

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
  const [riskGrid, setRiskGrid] = useState<RiskGridData | null>(null);
  const [riskError, setRiskError] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Latest plume data, read by the map 'load' handler. Data often arrives before the
  // style finishes loading, and a closure over the first render would draw nothing.
  const plumeDataRef = useRef(createPlumeFeatureCollection(hotspots, plumes, classifications));
  plumeDataRef.current = createPlumeFeatureCollection(hotspots, plumes, classifications);

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
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

    map.on('load', () => {
      // Add plume source and layers
      map.addSource('plumes-source', {
        type: 'geojson',
        data: plumeDataRef.current,
      });

      map.addLayer({
        id: 'plumes-fill',
        type: 'fill',
        source: 'plumes-source',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.35,
        },
      });

      map.addLayer({
        id: 'plumes-line',
        type: 'line',
        source: 'plumes-source',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.5,
          'line-opacity': 0.8,
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

    const source = map.getSource('plumes-source') as maplibregl.GeoJSONSource | undefined;
    source?.setData(plumeDataRef.current);
  }, [hotspots, plumes, classifications]);

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
      if (riskGrid) {
        const data = riskGridToFeatureCollection(riskGrid);
        const source = map.getSource('risk-source') as maplibregl.GeoJSONSource | undefined;
        if (source) source.setData(data);
        else {
          map.addSource('risk-source', { type: 'geojson', data });
          map.addLayer(
            {
              id: 'risk-fill',
              type: 'fill',
              source: 'risk-source',
              paint: {
                // p tops out around 0.14 (median 0.02) for a 14-day window, so the ramp is scaled to that.
                'fill-color': [
                  'interpolate', ['linear'], ['get', 'p'],
                  0, '#F1F3F0',
                  0.02, '#F19143',
                  0.1, '#EF2D56',
                ],
                'fill-opacity': 0.45,
              },
            },
            map.getLayer('plumes-fill') ? 'plumes-fill' : undefined
          );
        }
      }
      if (map.getLayer('risk-fill')) map.setLayoutProperty('risk-fill', 'visibility', visible ? 'visible' : 'none');
    };
    if (map.isStyleLoaded()) apply();
    else map.once('idle', apply);
  }, [riskOn, riskGrid]);

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
