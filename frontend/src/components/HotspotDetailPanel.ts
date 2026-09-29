import React, { useEffect, useState } from 'react';
import type { Classification, Hotspot, Plume, Region } from '@madhuca/logic';
import { TtsButton } from './TtsButton.ts';
import {
  bearingToAbbrev,
  bearingToCompass,
  compassWord,
  distanceAndBearing,
  getPlumeSummary,
  isCalmPlume,
} from '../utils/plumeGeometry.ts';

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

type Severity = 'low' | 'moderate' | 'high' | 'severe';

const INTENSITY_LABELS: Record<string, Record<Severity, string>> = {
  en: {
    low: 'Low Intensity (Small field fire)',
    moderate: 'Moderate Intensity (Typical crop burning)',
    high: 'High Intensity (Substantial biomass fire)',
    severe: 'Severe / Intense Heat (Major wildfire event)',
  },
  hi: {
    low: 'कम तीव्रता (छोटी खेत की आग)',
    moderate: 'मध्यम तीव्रता (सामान्य पराली दहन)',
    high: 'उच्च तीव्रता (बड़ी बायोमास आग)',
    severe: 'बहुत तेज़ गर्मी (बड़ी जंगल की आग)',
  },
  pa: {
    low: 'ਘੱਟ ਤੀਬਰਤਾ (ਛੋਟੀ ਖੇਤ ਦੀ ਅੱਗ)',
    moderate: 'ਦਰਮਿਆਨੀ ਤੀਬਰਤਾ (ਆਮ ਪਰਾਲੀ ਸਾੜਨਾ)',
    high: 'ਉੱਚ ਤੀਬਰਤਾ (ਵੱਡੀ ਬਾਇਓਮਾਸ ਅੱਗ)',
    severe: 'ਬਹੁਤ ਤੇਜ਼ ਗਰਮੀ (ਵੱਡੀ ਜੰਗਲੀ ਅੱਗ)',
  },
  te: {
    low: 'తక్కువ తీవ్రత (చిన్న పొలం మంట)',
    moderate: 'మధ్యస్థ తీవ్రత (సాధారణ పంట వ్యర్థాల దహనం)',
    high: 'అధిక తీవ్రత (పెద్ద బయోమాస్ మంట)',
    severe: 'తీవ్రమైన వేడి (పెద్ద అడవి మంట)',
  },
};

/** Card headings per alert language. */
const CARD_TITLES: Record<string, { smoke: string; intensity: string; advisory: string }> = {
  en: { smoke: 'Smoke Dispersion (Wind)', intensity: 'Fire Intensity & Power', advisory: 'What this means for you' },
  hi: { smoke: 'धुएं का फैलाव (हवा)', intensity: 'आग की तीव्रता और शक्ति', advisory: 'आपके लिए इसका मतलब' },
  pa: { smoke: 'ਧੂੰਏਂ ਦਾ ਫੈਲਾਅ (ਹਵਾ)', intensity: 'ਅੱਗ ਦੀ ਤੀਬਰਤਾ ਅਤੇ ਤਾਕਤ', advisory: 'ਤੁਹਾਡੇ ਲਈ ਇਸਦਾ ਮਤਲਬ' },
  te: { smoke: 'పొగ వ్యాప్తి (గాలి)', intensity: 'మంట తీవ్రత & శక్తి', advisory: 'మీకు దీని అర్థం' },
};

export function getIntensityLabel(frp: number, lang: string = 'en'): { label: string; severity: Severity } {
  const severity: Severity = frp < 20 ? 'low' : frp <= 60 ? 'moderate' : frp <= 150 ? 'high' : 'severe';
  return { label: (INTENSITY_LABELS[lang] ?? INTENSITY_LABELS.en!)[severity], severity };
}

/**
 * Big compass letter with an arrow turned to where the smoke travels. The map is
 * locked north-up (MapView), so the arrow on screen matches the plume on the map.
 */
function DirectionBadge({ plume, lang }: { plume?: Plume; lang: string }) {
  if (!plume || isCalmPlume(plume)) {
    return React.createElement(
      'div',
      { className: 'direction-badge direction-badge-calm', 'aria-label': 'Calm wind' },
      React.createElement('span', { className: 'direction-letter' }, 'CALM')
    );
  }
  const bearing = plume.bearingDeg;
  return React.createElement(
    'div',
    { className: 'direction-badge', 'aria-label': `Smoke heading ${bearingToCompass(bearing)}` },
    React.createElement(
      'svg',
      {
        className: 'direction-arrow',
        viewBox: '0 0 48 48',
        'aria-hidden': 'true',
        style: { transform: `rotate(${Math.round(bearing)}deg)` },
      },
      // Points up (north) before rotation.
      React.createElement('path', { d: 'M24 4 L36 24 H28 V44 H20 V24 H12 Z' })
    ),
    React.createElement(
      'div',
      { className: 'direction-text' },
      React.createElement('span', { className: 'direction-letter' }, bearingToAbbrev(bearing)),
      React.createElement('span', { className: 'direction-word' }, compassWord(bearing, lang))
    )
  );
}

const LOCAL_FALLBACK: Record<string, { downwind: string; vicinity: string }> = {
  hi: { downwind: 'हवा की दिशा', vicinity: 'आसपास के क्षेत्र' },
  pa: { downwind: 'ਹਵਾ ਦੀ ਦਿਸ਼ਾ', vicinity: 'ਨੇੜਲੇ ਇਲਾਕੇ' },
  te: { downwind: 'గాలి దిశ', vicinity: 'సమీప ప్రాంతం' },
  en: { downwind: 'downwind', vicinity: 'immediate vicinity' },
};

/** Generates clear, non-specialist guidance lines for farmers and local residents. */
export function generatePlainLanguageAlert(
  hotspot: Hotspot,
  classification?: Classification,
  plume?: Plume,
  langCode: string = 'hi'
): string {
  const isWildfire = classification?.kind === 'likely-wildfire';
  // Every word inside a Hindi/Punjabi/Telugu line stays in that language, compass included.
  const local = LOCAL_FALLBACK[langCode] ?? LOCAL_FALLBACK.en!;
  const compass = plume ? compassWord(plume.bearingDeg, langCode) : local.downwind;
  const dist = plume && plume.distanceKm > 0.5 ? `${plume.distanceKm.toFixed(1)} km` : local.vicinity;

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


  const intensity = getIntensityLabel(hotspot.frp, selectedLang);
  const plumeSummary = getPlumeSummary(plume, selectedLang);
  const titles = CARD_TITLES[selectedLang] ?? CARD_TITLES.en!;
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
      React.createElement('div', { className: 'card-title' }, titles.advisory),
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
        React.createElement('div', { className: 'card-title' }, titles.smoke),
        React.createElement(DirectionBadge, { plume, lang: selectedLang }),
        React.createElement('div', { className: 'card-value' }, plumeSummary.directionText),
        React.createElement('div', { className: 'card-subtext' }, plumeSummary.reachText),
        React.createElement('p', { className: 'card-note' }, plumeSummary.safetyAdvice)
      ),

      // Heat / FRP Intensity Card
      React.createElement(
        'div',
        { className: 'panel-card' },
        React.createElement('div', { className: 'card-title' }, titles.intensity),
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
