import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  HotspotDetailPanel,
  getIntensityLabel,
  defaultLanguage,
  generatePlainLanguageAlert,
  nearestTownText,
} from '../src/components/HotspotDetailPanel.ts';
import type { Classification, Hotspot, Plume } from '@madhuca/logic';

const MOCK_HOTSPOT: Hotspot = {
  id: 'MODIS-PB-001',
  lat: 31.2345,
  lon: 75.6789,
  frp: 38.5,
  confidence: 'high',
  acquiredAt: '2026-10-25T14:30:00Z',
  satellite: 'VIIRS_SNPP',
};

const MOCK_PLUME: Plume = {
  bearingDeg: 90,
  distanceKm: 8.5,
  spreadDeg: 20,
};

const MOCK_CROP_CLASSIFICATION: Classification = {
  kind: 'likely-crop-burning',
  landCover: 'cropland',
  rationale: 'Thermal anomaly in cropland during peak autumn stubble season.',
};

const MOCK_WILDFIRE_CLASSIFICATION: Classification = {
  kind: 'likely-wildfire',
  landCover: 'forest',
  rationale: 'Thermal anomaly detected inside forest polygon.',
};

test('getIntensityLabel correctly ranks fire radiative power (MW)', () => {
  assert.equal(getIntensityLabel(12).severity, 'low');
  assert.equal(getIntensityLabel(45).severity, 'moderate');
  assert.equal(getIntensityLabel(110).severity, 'high');
  assert.equal(getIntensityLabel(180).severity, 'severe');
});

test('generatePlainLanguageAlert produces localized guidance across languages', () => {
  const hindiAlert = generatePlainLanguageAlert(
    MOCK_HOTSPOT,
    MOCK_CROP_CLASSIFICATION,
    MOCK_PLUME,
    'hi'
  );
  assert.ok(hindiAlert.includes('पराली'), 'Hindi alert should mention stubble burning');
  assert.ok(hindiAlert.includes('8.5 km'), 'Should include plume distance');

  const kannadaAlert = generatePlainLanguageAlert(
    MOCK_HOTSPOT,
    MOCK_CROP_CLASSIFICATION,
    MOCK_PLUME,
    'kn'
  );
  assert.ok(kannadaAlert.includes('ಕೂಳೆ'), 'Kannada alert should mention stubble burning');

  const teluguAlert = generatePlainLanguageAlert(
    MOCK_HOTSPOT,
    MOCK_WILDFIRE_CLASSIFICATION,
    MOCK_PLUME,
    'te'
  );
  assert.ok(teluguAlert.includes('మంటలు'), 'Telugu alert should mention fire');

  const englishAlert = generatePlainLanguageAlert(
    MOCK_HOTSPOT,
    MOCK_WILDFIRE_CLASSIFICATION,
    MOCK_PLUME,
    'en'
  );
  assert.ok(englishAlert.includes('wildfire alert'), 'English alert should mention wildfire');
});

test('HotspotDetailPanel renders nothing visible when hotspot is null', () => {
  const html = renderToStaticMarkup(
    React.createElement(HotspotDetailPanel, {
      hotspot: null,
      onClose: () => {},
    })
  );

  assert.ok(html.includes('hotspot-panel-empty'), 'Expected empty panel class');
  assert.ok(html.includes('aria-hidden="true"'), 'Expected aria-hidden="true"');
});

test('HotspotDetailPanel renders full details and audio section when active', () => {
  const html = renderToStaticMarkup(
    React.createElement(HotspotDetailPanel, {
      hotspot: MOCK_HOTSPOT,
      classification: MOCK_CROP_CLASSIFICATION,
      plume: MOCK_PLUME,
      state: 'Karnataka',
      onClose: () => {},
    })
  );

  // Karnataka opens in Kannada: badge and nearest-town line included, town name stays in Latin script.
  assert.ok(html.includes('Jalandhar ನಿಂದ ಸುಮಾರು 14 km ಆಗ್ನೇಯ ದಿಕ್ಕಿನಲ್ಲಿ'), 'Expected Kannada nearest-town line');
  assert.ok(html.includes('ಸಂಭಾವ್ಯ ಕೂಳೆ ಸುಡುವಿಕೆ'), 'Expected Kannada classification badge');
  assert.ok(html.includes('ವೈಜ್ಞಾನಿಕ ಕಾರಣ:'), 'Expected Kannada rationale label');
  assert.ok(html.includes('ವಿಶ್ವಾಸಾರ್ಹತೆ: ಹೆಚ್ಚು'), 'Expected Kannada confidence line');
  assert.doesNotMatch(html, /Likely|About \d|Scientific reason|Confidence:/);
  assert.ok(html.includes('38.5 MW'), 'Expected FRP value');
  // Card headings follow the language too.
  assert.ok(html.includes('ನಿಮಗೆ ಇದರ ಅರ್ಥ'), 'Expected Kannada advisory header');
  assert.ok(html.includes('ಹೊಗೆಯ ಹರಡುವಿಕೆ (ಗಾಳಿ)'), 'Expected Kannada plume card title');
  assert.ok(html.includes('ಹೊಗೆ ಪೂರ್ವ ಕಡೆಗೆ (90°)'), 'Expected Kannada smoke direction');
  assert.ok(html.includes('Close detail panel'), 'Expected close button with aria-label');
  assert.ok(html.includes('ಕನ್ನಡ'), 'Expected Kannada language pill');
  assert.doesNotMatch(html, /[਀-੿]/, 'no Punjabi (Gurmukhi) left anywhere');
});

test('Indic alert text carries the compass word in its own language', () => {
  const east: Plume = { bearingDeg: 90, distanceKm: 8.5, spreadDeg: 20 };
  const hi = generatePlainLanguageAlert(MOCK_HOTSPOT, MOCK_CROP_CLASSIFICATION, east, 'hi');
  const kn = generatePlainLanguageAlert(MOCK_HOTSPOT, MOCK_CROP_CLASSIFICATION, east, 'kn');
  const te = generatePlainLanguageAlert(MOCK_HOTSPOT, MOCK_CROP_CLASSIFICATION, east, 'te');
  assert.ok(hi.includes('पूर्व'), hi);
  assert.ok(kn.includes('ಪೂರ್ವ'), kn);
  assert.ok(te.includes('తూర్పు'), te);
  for (const line of [hi, kn, te]) assert.doesNotMatch(line, /East|North|South|West|downwind|vicinity/);
  const noPlume = generatePlainLanguageAlert(MOCK_HOTSPOT, MOCK_CROP_CLASSIFICATION, undefined, 'hi');
  assert.doesNotMatch(noPlume, /[A-Za-z]{3,}/);
  assert.match(generatePlainLanguageAlert(MOCK_HOTSPOT, MOCK_CROP_CLASSIFICATION, east, 'en'), /East/);
});

test('getIntensityLabel is localized and keeps the same severity in every language', () => {
  assert.equal(getIntensityLabel(3.5, 'te').label, 'తక్కువ తీవ్రత (చిన్న పొలం మంట)');
  assert.equal(getIntensityLabel(3.5, 'hi').severity, 'low');
  assert.equal(getIntensityLabel(3.5).label, 'Low Intensity (Small field fire)');
});

test('smoke direction badge: big compass letter plus an arrow rotated to the bearing', () => {
  const render = (plume: Plume | undefined, state = 'Telangana') =>
    renderToStaticMarkup(
      React.createElement(HotspotDetailPanel, {
        hotspot: MOCK_HOTSPOT,
        classification: MOCK_WILDFIRE_CLASSIFICATION,
        plume,
        state,
        onClose: () => {},
      }),
    );
  // The wildfire in Joel's screenshot: 261 degrees, west.
  const west = render({ bearingDeg: 261, distanceKm: 3.6, spreadDeg: 30 });
  assert.match(west, /class="direction-letter">W</);
  assert.match(west, /rotate\(261deg\)/);
  assert.match(west, /class="direction-word">పడమర</, 'Telugu region shows the Telugu word under the letter');
  assert.match(west, /పొగ పడమర వైపు \(261°\)/, 'dispersion value is Telugu, not "Blowing West"');
  assert.doesNotMatch(west, /Blowing/);
  const south = render({ bearingDeg: 187, distanceKm: 2.8, spreadDeg: 30 }, 'Delhi');
  assert.match(south, /class="direction-letter">S</);
  assert.match(south, /धुआं दक्षिण की ओर \(187°\)/);
  assert.match(render(undefined), /class="direction-letter">CALM</);
  assert.doesNotMatch(render(undefined), /direction-arrow/);
});

test('HotspotDetailPanel closes and reopens: null -> empty, hotspot -> dialog, null -> empty', () => {
  const render = (hotspot: Hotspot | null) =>
    renderToStaticMarkup(
      React.createElement(HotspotDetailPanel, {
        hotspot,
        classification: MOCK_CROP_CLASSIFICATION,
        plume: MOCK_PLUME,
        state: 'Punjab',
        onClose: () => {},
      }),
    );
  const open = render(MOCK_HOTSPOT);
  assert.match(open, /role="dialog"/);
  assert.match(open, /Close detail panel/);
  const closed = render(null);
  assert.doesNotMatch(closed, /role="dialog"/);
  assert.match(closed, /hotspot-panel-empty/);
  assert.match(render(MOCK_HOTSPOT), /role="dialog"/);
});

test('the panel opens in the language of the state the fire is in', () => {
  assert.equal(defaultLanguage('Karnataka'), 'kn');
  assert.equal(defaultLanguage('Punjab'), 'hi', 'no Punjabi alert: Hindi');
  assert.equal(defaultLanguage('Telangana'), 'te');
  assert.equal(defaultLanguage('Andhra Pradesh'), 'te');
  assert.equal(defaultLanguage('Uttar Pradesh'), 'hi');
  assert.equal(defaultLanguage('Rajasthan'), 'hi');
  assert.equal(defaultLanguage('Kerala'), 'en', 'no Malayalam alert yet: English, not Hindi');
  assert.equal(defaultLanguage(undefined), 'en');
});

test('badge and nearest-town line follow the selected language', () => {
  const render = (state: string, classification: Classification) =>
    renderToStaticMarkup(
      React.createElement(HotspotDetailPanel, {
        hotspot: MOCK_HOTSPOT,
        classification,
        plume: MOCK_PLUME,
        state,
        onClose: () => {},
      }),
    );
  const hi = render('Delhi', MOCK_WILDFIRE_CLASSIFICATION);
  assert.ok(hi.includes('संभावित जंगल की आग'), 'Hindi wildfire badge');
  assert.ok(hi.includes('Jalandhar से लगभग 14 km दक्षिण-पूर्व में'), 'Hindi town line');
  const te = render('Telangana', MOCK_CROP_CLASSIFICATION);
  assert.ok(te.includes('పంట వ్యర్థాల దహనం అయ్యే అవకాశం'), 'Telugu crop badge');
  assert.ok(te.includes('Jalandhar నుండి సుమారు 14 km ఆగ్నేయం దిశలో'), 'Telugu town line');
  const en = render('Kerala', MOCK_WILDFIRE_CLASSIFICATION);
  assert.ok(en.includes('Likely Wildfire / Forest Fire'), 'English wildfire badge');
  assert.ok(en.includes('About 14 km South-East of Jalandhar'), 'English town line');
  assert.equal(nearestTownText(MOCK_HOTSPOT.lat, MOCK_HOTSPOT.lon), 'About 14 km South-East of Jalandhar');
});
