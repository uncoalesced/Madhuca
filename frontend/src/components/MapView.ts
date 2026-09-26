import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  REGION_BBOX,
  type Classification,
  type Hotspot,
  type Plume,
  type Region,
} from '@madhuca/logic';
import { plumeToGeoJSONPolygon } from '../utils/plumeGeometry.ts';

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
}

/** Determines high-contrast marker pin color based on fire classification. */
export function getMarkerColor(classification?: Classification): string {
  if (classification?.kind === 'likely-wildfire') return '#dc2626'; // Brick Red for wildfires
  if (classification?.kind === 'likely-crop-burning') return '#d97706'; // Warm Amber for stubble burning
  return '#f59e0b'; // Neutral Gold for pending / other
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
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

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
      const plumeData = createPlumeFeatureCollection(hotspots, plumes, classifications);
      map.addSource('plumes-source', {
        type: 'geojson',
        data: plumeData,
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
    if (source) {
      const plumeData = createPlumeFeatureCollection(hotspots, plumes, classifications);
      source.setData(plumeData);
    }
  }, [hotspots, plumes, classifications]);

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
      el.style.border = isSelected ? '3px solid #ffffff' : '2px solid #ffffff';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';
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
      style: { width: '100%', height: '100%', minHeight: '380px' },
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
      )
    )
  );
}
