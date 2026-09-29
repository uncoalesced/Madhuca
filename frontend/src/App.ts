/// <reference types="vite/client" />
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  type Classification,
  type Geo,
  type Hotspot,
  type Plume,
  type RadarResult,
  type Region,
  classifyHotspot,
  computeDispersion,
  decodeLandCoverGrid,
  decodeStateGrid,
} from '@madhuca/logic';
import { MapView } from './components/MapView.ts';
import { RegionSelector, REGION_LABELS } from './components/RegionSelector.ts';
import { HotspotDetailPanel } from './components/HotspotDetailPanel.ts';
import { HumanCheck } from './components/HumanCheck.ts';
import { demoHotspots } from './demoHotspots.ts';

export interface PipelineResult extends RadarResult {
  error?: string;
  /** The Worker wants a human check (Turnstile) before it will scan. Also carries `error`. */
  verify?: boolean;
}

/**
 * Asks the Worker (worker/src/index.ts) to run the on-demand loop for one region.
 * The FIRMS key lives only in the Worker, so the browser never sees it. Any
 * non-OK answer comes back as an error, never as an empty all-clear.
 */
export async function fetchRadar(
  region: Region,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 25_000,
): Promise<PipelineResult> {
  const empty = { hotspots: [], plumes: {}, classifications: {}, states: {} };
  // Without a deadline a stalled upstream left "Scanning..." up forever, which reads
  // as a scan still in progress. The signal also cuts off a stalled body read below.
  const signal = AbortSignal.timeout(timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(`/api/radar?region=${region}`, { signal });
  } catch {
    return {
      ...empty,
      error: signal.aborted
        ? 'Radar scan timed out. This is not an all-clear.'
        : 'Could not reach the radar service. This is not an all-clear.',
    };
  }
  const body = (await res.json().catch(() => null)) as (RadarResult & { error?: string; verify?: boolean }) | null;
  if (res.status === 403 && body?.verify === true) {
    return { ...empty, verify: true, error: body.error ?? 'Verify you are human to load fire data. This is not an all-clear.' };
  }
  if (!res.ok || !body || !Array.isArray(body.hotspots)) {
    return { ...empty, error: body?.error ?? `Radar service responded ${res.status}. This is not an all-clear.` };
  }
  return { hotspots: body.hotspots, plumes: body.plumes, classifications: body.classifications, states: body.states ?? {} };
}

/** Dev-only `?demo`: fake hotspots through the real dispersion (calm wind), grids and classifier. */
export async function demoRadar(region: Region, geo?: Geo): Promise<PipelineResult> {
  const bytes = (path: string) => fetch(path).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${path} ${r.status}`))));
  const grids: Geo =
    geo ??
    (await Promise.all([bytes('/boundaries/states.bin'), bytes('/landcover/india.bin')]).then(([s, l]) => ({
      stateAt: decodeStateGrid(s),
      landCoverAt: decodeLandCoverGrid(l),
    })));
  const hotspots: Hotspot[] = demoHotspots(region);
  const plumes: Record<string, Plume> = {};
  const classifications: Record<string, Classification> = {};
  const states: Record<string, string> = {};
  for (const hs of hotspots) {
    const state = grids.stateAt(hs.lon, hs.lat);
    if (state) states[hs.id] = state;
    plumes[hs.id] = computeDispersion(hs, null);
    classifications[hs.id] = classifyHotspot(hs, grids.landCoverAt(hs.lon, hs.lat), state);
  }
  return { hotspots, plumes, classifications, states };
}

// `?demo` in `npm run dev` swaps FIRMS for fake hotspots (frontend/src/demoHotspots.ts).
// Dev only, so a production build can never show fake fires as real.
const IS_DEMO =
  !!import.meta.env?.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');

export type RadarStatus = 'loading' | 'ready' | 'empty' | 'error' | 'verify';

export function App() {
  const [region, setRegion] = useState<Region>('india');
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [plumes, setPlumes] = useState<Record<string, Plume>>({});
  const [classifications, setClassifications] = useState<Record<string, Classification>>({});
  const [states, setStates] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Hotspot | null>(null);
  const [status, setStatus] = useState<RadarStatus>('loading');
  const [progressMsg, setProgressMsg] = useState<string>('Initializing satellite radar...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeRegionLabel = REGION_LABELS[region]?.name ?? region;

  // Only the latest scan may update state: a slow answer for a region the user has
  // already left must not overwrite the one they are looking at.
  const latestScan = useRef(0);

  const executePipeline = useCallback(async (targetRegion: Region) => {
    const scan = ++latestScan.current;
    setStatus('loading');
    setErrorMessage(null);
    setSelected(null);

    try {
      setProgressMsg(`Scanning ${REGION_LABELS[targetRegion].name} for active fires...`);
      const result = IS_DEMO ? await demoRadar(targetRegion) : await fetchRadar(targetRegion);
      if (scan !== latestScan.current) return;

      if (result.verify) {
        setStatus('verify');
        return;
      }

      if (result.error) {
        setErrorMessage(result.error);
        setStatus('error');
        return;
      }

      setHotspots(result.hotspots);
      setPlumes(result.plumes);
      setClassifications(result.classifications);
      setStates(result.states);

      if (result.hotspots.length === 0) {
        setStatus('empty');
      } else {
        setStatus('ready');
      }
    } catch (err) {
      if (scan !== latestScan.current) return;
      const msg = err instanceof Error ? err.message : 'Radar scan encountered an error';
      setErrorMessage(msg);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    executePipeline(region);
  }, [region, executePipeline]);

  // Stable across renders, so the human check's effect does not re-render the widget.
  const regionRef = useRef(region);
  regionRef.current = region;
  const retryScan = useCallback(() => executePipeline(regionRef.current), [executePipeline]);

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
        ),
        // Phones: the full subtitle cannot share one line with the title, so a short one stands in.
        React.createElement('span', { className: 'brand-subtitle-short', 'aria-hidden': 'true' }, 'Stubble & Biomass Fire Radar')
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

      status === 'verify' && React.createElement(HumanCheck, { onVerified: retryScan }),

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
          IS_DEMO && React.createElement('span', { className: 'summary-demo' }, 'DEMO DATA, not real fires.'),
          React.createElement(
            'span',
            { className: 'summary-total' },
            `${hotspots.length} Active Fire Hotspot${hotspots.length > 1 ? 's' : ''} in ${activeRegionLabel}`
          ),
          React.createElement('span', { className: 'summary-count summary-stubble' }, `${stubbleCount} Stubble Burning`),
          React.createElement('span', { className: 'summary-count summary-wildfire' }, `${wildfireCount} Wildfire`)
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
        // ponytail: the only published grid is Telangana / AP (issue #21); list more here as ml/ publishes them.
        riskUrl: region === 'south' || region === 'india' ? '/risk/telangana.json' : undefined,
        riskArea: 'Telangana and Andhra Pradesh',
      }),
      React.createElement(HotspotDetailPanel, {
        hotspot: selected,
        classification: selectedClassification,
        plume: selectedPlume,
        state: selected ? states[selected.id] : undefined,
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
        '© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data · Boundaries: DataMeet (Survey of India outline), Natural Earth',
        React.createElement(
          'span',
          { className: 'footer-disclaimer' },
          ' · Smoke dispersion modeled using a simplified Gaussian-puff approximation (not HYSPLIT).'
        )
      ),
      React.createElement('p', { className: 'footer-credit' }, '© Engineered by uncoalesced')
    )
  );
}
