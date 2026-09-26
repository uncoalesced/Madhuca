import React, { useState } from 'react';
import type { Classification, Hotspot, Plume, Region } from '@madhuca/logic';
import { TtsButton } from './TtsButton.ts';
import { bearingToCompass, getPlumeSummary } from '../utils/plumeGeometry.ts';

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
  if (!hotspot) {
    return React.createElement('aside', {
      className: 'hotspot-detail-panel hotspot-panel-empty',
      'aria-hidden': 'true',
    });
  }

  // Default initial TTS language based on region
  const defaultLang = region === 'punjab' ? 'pa' : region === 'telangana' ? 'te' : 'hi';
  const [selectedLang, setSelectedLang] = useState<string>(defaultLang);

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
    ? '🌲 Likely Wildfire / Forest Fire'
    : isCropBurning
    ? '🌾 Likely Crop Stubble Burning'
    : '⚠️ Active Fire Hotspot';

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
        React.createElement('h3', { className: 'panel-title' }, `Hotspot ${hotspot.id}`)
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
      React.createElement('div', { className: 'card-title' }, '💡 What this means for you'),
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
        React.createElement('div', { className: 'card-title' }, '🧭 Smoke Dispersion (Wind)'),
        React.createElement('div', { className: 'card-value' }, plumeSummary.directionText),
        React.createElement('div', { className: 'card-subtext' }, plumeSummary.reachText),
        React.createElement('p', { className: 'card-note' }, plumeSummary.safetyAdvice)
      ),

      // Heat / FRP Intensity Card
      React.createElement(
        'div',
        { className: 'panel-card' },
        React.createElement('div', { className: 'card-title' }, '🔥 Fire Intensity & Power'),
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
