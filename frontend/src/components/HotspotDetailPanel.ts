import React, { useEffect, useState } from 'react';
import type { Classification, Hotspot, Plume, Region } from '@madhuca/logic';
import { TtsButton } from './TtsButton.ts';
import { bearingToCompass, distanceAndBearing, getPlumeSummary } from '../utils/plumeGeometry.ts';

// District towns in and around the four regions, approximate centre coordinates.
// ponytail: fixed list, swap for a gazetteer if village-level labels (MASTER.md 5.3) land.
const TOWNS: ReadonlyArray<readonly [string, number, number]> = [
  ['Amritsar', 31.634, 74.872], ['Ludhiana', 30.901, 75.857], ['Jalandhar', 31.326, 75.576],
  ['Patiala', 30.34, 76.386], ['Bathinda', 30.211, 74.945], ['Firozpur', 30.925, 74.613],
  ['Sangrur', 30.245, 75.844], ['Moga', 30.817, 75.174], ['Gurdaspur', 32.041, 75.405],
  ['Hoshiarpur', 31.532, 75.912],
  ['Patna', 25.594, 85.137], ['Gaya', 24.796, 85.008], ['Bhagalpur', 25.244, 86.972],
  ['Muzaffarpur', 26.12, 85.39], ['Darbhanga', 26.152, 85.897], ['Purnia', 25.778, 87.475],
  ['Ara', 25.556, 84.663], ['Begusarai', 25.418, 86.133], ['Chhapra', 25.78, 84.747],
  ['Motihari', 26.648, 84.917], ['Sasaram', 24.953, 84.031],
  ['New Delhi', 28.614, 77.209], ['Narela', 28.853, 77.093], ['Najafgarh', 28.609, 76.98],
  ['Rohini', 28.736, 77.113], ['Shahdara', 28.673, 77.289], ['Gurugram', 28.459, 77.027],
  ['Noida', 28.535, 77.391], ['Ghaziabad', 28.669, 77.454], ['Faridabad', 28.408, 77.317],
  ['Hyderabad', 17.385, 78.487], ['Warangal', 17.969, 79.594], ['Karimnagar', 18.438, 79.129],
  ['Nizamabad', 18.672, 78.094], ['Khammam', 17.247, 80.151], ['Adilabad', 19.664, 78.532],
  ['Mahabubnagar', 16.737, 77.988], ['Nalgonda', 17.058, 79.267], ['Mancherial', 18.873, 79.463],
  ['Kothagudem', 17.551, 80.619], ['Bhadrachalam', 17.669, 80.893],
];

/** "12 km NE of Ludhiana": where the fire sits relative to the closest listed town. */
export function nearestTownText(lat: number, lon: number): string {
  let best = { name: '', distanceKm: Infinity, bearingDeg: 0 };
  for (const [name, tLat, tLon] of TOWNS) {
    const d = distanceAndBearing(tLat, tLon, lat, lon);
    if (d.distanceKm < best.distanceKm) best = { name, ...d };
  }
  if (best.distanceKm < 1) return `In ${best.name}`;
  return `About ${Math.round(best.distanceKm)} km ${bearingToCompass(best.bearingDeg)} of ${best.name}`;
}

export interface HotspotDetailPanelProps {
  hotspot: Hotspot | null;
  classification?: Classification;
  plume?: Plume;
  region?: Region;
  onClose: () => void;
}

export function getIntensityLabel(frp: number): { label: string; severity: 'low' | 'moderate' | 'high' | 'severe' } {
  if (frp < 20) return { label: 'Low Intensity (Small field fire)', severity: 'low' };
  if (frp <= 60) return { label: 'Moderate Intensity (Typical crop burning)', severity: 'moderate' };
  if (frp <= 150) return { label: 'High Intensity (Substantial biomass fire)', severity: 'high' };
  return { label: 'Severe / Intense Heat (Major wildfire event)', severity: 'severe' };
}

/** Generates clear, non-specialist guidance lines for farmers and local residents. */
export function generatePlainLanguageAlert(
  hotspot: Hotspot,
  classification?: Classification,
  plume?: Plume,
  langCode: string = 'hi'
): string {
  const isWildfire = classification?.kind === 'likely-wildfire';
  const compass = plume ? bearingToCompass(plume.bearingDeg) : 'downwind';
  const dist = plume && plume.distanceKm > 0.5 ? `${plume.distanceKm.toFixed(1)} km` : 'immediate vicinity';

  if (langCode === 'pa') {
    if (isWildfire) {
      return `ਜੰਗਲ ਜਾਂ ਝਾੜੀਆਂ ਦੀ ਅੱਗ ਦਾ ਚਿਤਾਵਨੀ ਸੰਕੇਤ ਮਿਲਿਆ ਹੈ। ਧੂੰਆਂ ${compass} ਵੱਲ ${dist} ਤੱਕ ਜਾ ਰਿਹਾ ਹੈ। ਬਾਹਰ ਨਿਕਲਣ ਤੋਂ ਬਚੋ ਅਤੇ ਖਿੜਕੀਆਂ ਬੰਦ ਰੱਖੋ।`;
    }
    return `ਖੇਤੀਬਾੜੀ ਪਰਾਲੀ ਸਾੜਨ ਦੀ ਪਛਾਣ ਹੋਈ ਹੈ। ਧੂੰਆਂ ${compass} ਦਿਸ਼ਾ ਵੱਲ ਲਗਭਗ ${dist} ਤੱਕ ਫੈਲ ਰਿਹਾ ਹੈ। ਹਵਾ ਦੀ ਗੁਣਵੱਤਾ ਪ੍ਰਭਾਵਿਤ ਹੋ ਸਕਦੀ ਹੈ।`;
  }

  if (langCode === 'te') {
    if (isWildfire) {
      return `తీవ్రమైన అడవి మంటలు గుర్తించబడ్డాయి. పొగ ${compass} దిశగా ${dist} వరకు వ్యాపిస్తోంది. సమీప ప్రాంత ప్రజలు అప్రమత్తంగా ఉండాలి.`;
    }
    return `పొలాల్లో వ్యర్థాలు కాలుస్తున్నట్లు గుర్తించబడింది. పొగ ${compass} దిశగా ${dist} వరకు వెళ్తోంది. తగిన జాగ్రత్తలు పాటించండి.`;
  }

  if (langCode === 'hi') {
    if (isWildfire) {
      return `जंगल या झाड़ियों में तीव्र आग की चेतावनी है। धुआं ${compass} दिशा में लगभग ${dist} तक फैल रहा है। डाउनविंड निवासी खिड़कियां बंद रखें और सुरक्षित रहें।`;
    }
    return `खेतों में पराली / फसल अवशेष दहन दर्ज हुआ है। धुआं ${compass} की ओर लगभग ${dist} तक जा रहा है। नजदीकी क्षेत्रों में वायु गुणवत्ता प्रभावित हो सकती है।`;
  }

  // English fallback
  if (isWildfire) {
    return `Active wildfire alert detected with intense heat. Smoke is drifting ${compass} for ~${dist}. Downwind communities should limit outdoor exposure and stay cautious.`;
  }
  return `Likely agricultural stubble burning detected. Smoke is traveling ${compass} for ~${dist}. Expect reduced air quality downwind over the next few hours.`;
}

/** Detail drawer for one tapped hotspot. Has to read clearly to a non-specialist. */
export function HotspotDetailPanel({
  hotspot,
  classification,
  plume,
  region,
  onClose,
}: HotspotDetailPanelProps) {
  // Hooks run before any early return so the hook count never changes between renders.
  const defaultLang = region === 'punjab' ? 'pa' : region === 'telangana' ? 'te' : 'hi';
  const [selectedLang, setSelectedLang] = useState<string>(defaultLang);
  useEffect(() => setSelectedLang(defaultLang), [hotspot?.id, defaultLang]);

  if (!hotspot) {
    return React.createElement('aside', {
      className: 'hotspot-detail-panel hotspot-panel-empty',
      'aria-hidden': 'true',
    });
  }


  const intensity = getIntensityLabel(hotspot.frp);
  const plumeSummary = getPlumeSummary(plume);
  const alertText = generatePlainLanguageAlert(hotspot, classification, plume, selectedLang);

  const isCropBurning = classification?.kind === 'likely-crop-burning';
  const isWildfire = classification?.kind === 'likely-wildfire';

  const badgeClass = isWildfire
    ? 'badge-wildfire'
    : isCropBurning
    ? 'badge-crop-burning'
    : 'badge-other';

  const badgeLabel = isWildfire
    ? 'Likely Wildfire / Forest Fire'
    : isCropBurning
    ? 'Likely Crop Stubble Burning'
    : 'Active Fire Hotspot';

  return React.createElement(
    'aside',
    {
      className: 'hotspot-detail-panel hotspot-panel-active',
      role: 'dialog',
      'aria-label': 'Fire Hotspot Details',
    },
    // Header
    React.createElement(
      'div',
      { className: 'panel-header' },
      React.createElement(
        'div',
        { className: 'panel-header-title-group' },
        React.createElement('span', { className: `classification-badge ${badgeClass}` }, badgeLabel),
        React.createElement('h3', { className: 'panel-title' }, nearestTownText(hotspot.lat, hotspot.lon))
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'panel-close-button',
          'aria-label': 'Close detail panel',
          onClick: onClose,
        },
        '✕'
      )
    ),

    // Voice Audio Section (Prominent at top)
    React.createElement(
      'div',
      { className: 'panel-voice-section' },
      React.createElement(
        'div',
        { className: 'lang-selector-group', role: 'group', 'aria-label': 'Select audio language' },
        (['hi', 'pa', 'te', 'en'] as const).map((code) => {
          const isSelected = selectedLang === code;
          return React.createElement(
            'button',
            {
              key: code,
              type: 'button',
              className: `lang-pill ${isSelected ? 'lang-pill-active' : ''}`,
              onClick: () => setSelectedLang(code),
            },
            code === 'hi' ? 'हिंदी' : code === 'pa' ? 'ਪੰਜਾਬੀ' : code === 'te' ? 'తెలుగు' : 'English'
          );
        })
      ),
      React.createElement(TtsButton, { text: alertText, langCode: selectedLang })
    ),

    // Plain-Language Advisory Card ("What this means for you")
    React.createElement(
      'div',
      { className: 'panel-card advisory-card' },
      React.createElement('div', { className: 'card-title' }, 'What this means for you'),
      React.createElement('p', { className: 'advisory-text' }, alertText),
      classification?.rationale &&
        React.createElement('div', { className: 'card-note', style: { marginTop: '0.35rem' } }, `Scientific reason: ${classification.rationale}`)
    ),

    // Details Grid
    React.createElement(
      'div',
      { className: 'panel-grid' },
      // Smoke Dispersion Plume Card
      React.createElement(
        'div',
        { className: 'panel-card' },
        React.createElement('div', { className: 'card-title' }, 'Smoke Dispersion (Wind)'),
        React.createElement('div', { className: 'card-value' }, plumeSummary.directionText),
        React.createElement('div', { className: 'card-subtext' }, plumeSummary.reachText),
        React.createElement('p', { className: 'card-note' }, plumeSummary.safetyAdvice)
      ),

      // Heat / FRP Intensity Card
      React.createElement(
        'div',
        { className: 'panel-card' },
        React.createElement('div', { className: 'card-title' }, 'Fire Intensity & Power'),
        React.createElement('div', { className: `card-value severity-${intensity.severity}` }, `${hotspot.frp.toFixed(1)} MW`),
        React.createElement('div', { className: 'card-subtext' }, intensity.label),
        React.createElement(
          'div',
          { className: 'card-note' },
          `Confidence: ${hotspot.confidence} | Coordinates: ${hotspot.lat.toFixed(4)}°N, ${hotspot.lon.toFixed(4)}°E`
        )
      )
    )
  );
}
