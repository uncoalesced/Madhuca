/// <reference types="vite/client" />
import React, { useState, useEffect, useCallback } from 'react';
import {
  type Classification,
  type Hotspot,
  type LandCoverMask,
  type Plume,
  type Region,
  classifyHotspot,
  computeDispersion,
  fetchHotspots,
  fetchWind,
} from '@madhuca/logic';
import { MapView } from './components/MapView.ts';
import { RegionSelector, REGION_LABELS } from './components/RegionSelector.ts';
import { HotspotDetailPanel } from './components/HotspotDetailPanel.ts';
import { demoHotspots } from './demoHotspots.ts';

export interface PipelineResult {
  hotspots: Hotspot[];
  plumes: Record<string, Plume>;
  classifications: Record<string, Classification>;
  error?: string;
}

/** Loads the pre-computed offline landcover mask for a given region. */
export async function loadLandCoverMask(region: Region): Promise<LandCoverMask | null> {
  try {
    const url = `/landcover/${region}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as LandCoverMask;
  } catch {
    return null;
  }
}

/**
 * Runs the live on-demand radar pipeline:
 * Hotspots -> Wind -> Dispersion Plumes -> LandCover Classification.
 */
export async function runRadarPipeline(
  region: Region,
  firmsMapKey?: string,
  options?: {
    customMask?: LandCoverMask;
    mockHotspots?: Hotspot[];
    onProgress?: (step: string) => void;
  }
): Promise<PipelineResult> {
  options?.onProgress?.(`Loading ${region} land-cover satellite masks...`);

  // 1. Fetch land-cover mask
  const mask =
    options?.customMask ??
    (await loadLandCoverMask(region)) ?? {
      region,
      features: [],
    };

  // 2. Fetch active hotspots
  options?.onProgress?.(`Querying active thermal hotspots for ${region}...`);
  let hotspots: Hotspot[] = [];

  if (options?.mockHotspots) {
    hotspots = options.mockHotspots;
  } else if (firmsMapKey) {
    try {
      hotspots = await fetchHotspots(region, firmsMapKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch FIRMS hotspots';
      return { hotspots: [], plumes: {}, classifications: {}, error: msg };
    }
  } else {
    // No key means nothing was checked. That is an error, never an all-clear.
    return {
      hotspots: [],
      plumes: {},
      classifications: {},
      error: 'FIRMS key not configured, so no fire data was fetched. This is not an all-clear.',
    };
  }

  if (hotspots.length === 0) {
    return {
      hotspots: [],
      plumes: {},
      classifications: {},
    };
  }

  // 3. Compute wind, Gaussian-puff dispersion, and classification for each hotspot
  options?.onProgress?.(`Computing smoke dispersion vectors and classification (${hotspots.length} fires)...`);
  const plumes: Record<string, Plume> = {};
  const classifications: Record<string, Classification> = {};

  // One wind call per 0.25 degree cell, all in parallel. Nearby fires share a cell,
  // and a failed call degrades to calm-wind dispersion instead of failing the scan.
  const cellKey = (hs: Hotspot) => `${Math.round(hs.lat * 4) / 4},${Math.round(hs.lon * 4) / 4}`;
  const cells = new Map<string, Hotspot>();
  for (const hs of hotspots) if (!cells.has(cellKey(hs))) cells.set(cellKey(hs), hs);
  const winds = new Map(
    await Promise.all(
      [...cells].map(async ([key, hs]) => [key, await fetchWind(hs.lat, hs.lon).catch(() => null)] as const)
    )
  );

  for (const hs of hotspots) {
    plumes[hs.id] = computeDispersion(hs, winds.get(cellKey(hs)) ?? null);
    classifications[hs.id] = classifyHotspot(hs, mask);
  }

  return {
    hotspots,
    plumes,
    classifications,
  };
}

// `?demo` in `npm run dev` swaps FIRMS for fake hotspots (frontend/src/demoHotspots.ts).
// Dev only, so a production build can never show fake fires as real.
const IS_DEMO =
  !!import.meta.env?.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');

export type RadarStatus = 'loading' | 'ready' | 'empty' | 'error';

export function App() {
  const [region, setRegion] = useState<Region>('punjab');
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [plumes, setPlumes] = useState<Record<string, Plume>>({});
  const [classifications, setClassifications] = useState<Record<string, Classification>>({});
  const [selected, setSelected] = useState<Hotspot | null>(null);
  const [status, setStatus] = useState<RadarStatus>('loading');
  const [progressMsg, setProgressMsg] = useState<string>('Initializing satellite radar...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeRegionLabel = REGION_LABELS[region]?.name ?? region;

  const executePipeline = useCallback(async (targetRegion: Region) => {
    setStatus('loading');
    setErrorMessage(null);
    setSelected(null);

    try {
      // Dev only: Vite inlines VITE_ variables into the bundle, so a production build
      // must never read the key here. Production goes through the Worker (docs/ROADMAP.md).
      const devKey = import.meta.env?.DEV ? import.meta.env.VITE_FIRMS_MAP_KEY : undefined;
      const result = await runRadarPipeline(targetRegion, devKey, {
        mockHotspots: IS_DEMO ? demoHotspots(targetRegion) : undefined,
        onProgress: setProgressMsg,
      });

      if (result.error) {
        setErrorMessage(result.error);
        setStatus('error');
        return;
      }

      setHotspots(result.hotspots);
      setPlumes(result.plumes);
      setClassifications(result.classifications);

      if (result.hotspots.length === 0) {
        setStatus('empty');
      } else {
        setStatus('ready');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Radar scan encountered an error';
      setErrorMessage(msg);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    executePipeline(region);
  }, [region, executePipeline]);

  const selectedClassification = selected ? classifications[selected.id] : undefined;
  const selectedPlume = selected ? plumes[selected.id] : undefined;

  // Fire counts for summary badge
  const stubbleCount = Object.values(classifications).filter((c) => c.kind === 'likely-crop-burning').length;
  const wildfireCount = Object.values(classifications).filter((c) => c.kind === 'likely-wildfire').length;

  return React.createElement(
    'div',
    { className: 'madhuca-app' },
    // Header
    React.createElement(
      'header',
      { className: 'app-header' },
      React.createElement(
        'div',
        { className: 'brand-container' },
        React.createElement('h1', { className: 'brand-title' }, 'Madhuca'),
        React.createElement(
          'span',
          { className: 'brand-subtitle' },
          'Autonomous Stubble & Biomass Fire Early-Warning Radar'
        )
      ),
      React.createElement(RegionSelector, { region, onChange: setRegion })
    ),

    // Status / Alert Notification Bar
    React.createElement(
      'div',
      { className: 'status-banner-container', 'aria-live': 'polite' },
      status === 'loading' &&
        React.createElement(
          'div',
          { className: 'status-banner banner-loading' },
          React.createElement('span', { className: 'spinner-icon', 'aria-hidden': 'true' }),
          React.createElement('span', null, progressMsg)
        ),

      status === 'empty' &&
        React.createElement(
          'div',
          { className: 'status-banner banner-empty' },
          React.createElement(
            'span',
            null,
            `Clean Skies: No active thermal fire hotspots detected in ${activeRegionLabel} right now.`
          )
        ),

      status === 'error' &&
        React.createElement(
          'div',
          { className: 'status-banner banner-error' },
          React.createElement('span', null, errorMessage ?? 'Unable to complete radar scan.'),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'retry-button',
              onClick: () => executePipeline(region),
            },
            'Retry scan'
          )
        ),

      status === 'ready' &&
        React.createElement(
          'div',
          { className: 'status-banner banner-ready' },
          React.createElement(
            'span',
            null,
            (IS_DEMO ? 'DEMO DATA, not real fires. ' : '') +
            `${hotspots.length} Active Fire Hotspot${hotspots.length > 1 ? 's' : ''} in ${activeRegionLabel} (` +
              `${stubbleCount} Stubble Burning, ${wildfireCount} Wildfire)`
          )
        )
    ),

    // Main Content: Interactive Map & Detail Overlay
    React.createElement(
      'main',
      { className: 'app-main-content' },
      React.createElement(MapView, {
        region,
        hotspots,
        plumes,
        classifications,
        selectedId: selected?.id,
        onSelect: setSelected,
      }),
      React.createElement(HotspotDetailPanel, {
        hotspot: selected,
        classification: selectedClassification,
        plume: selectedPlume,
        region,
        onClose: () => setSelected(null),
      })
    ),

    // Mandatory Attribution Footer (CC-BY 4.0 ESA WorldCover & Model Disclaimer)
    React.createElement(
      'footer',
      { className: 'app-footer' },
      React.createElement(
        'p',
        { className: 'footer-attribution' },
        '© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data'
      ),
      React.createElement(
        'p',
        { className: 'footer-disclaimer' },
        'Smoke dispersion modeled using a simplified Gaussian-puff approximation (not HYSPLIT).'
      )
    )
  );
}
