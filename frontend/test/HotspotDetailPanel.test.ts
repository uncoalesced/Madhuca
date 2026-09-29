import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  HotspotDetailPanel,
  getIntensityLabel,
  defaultLanguage,
  generatePlainLanguageAlert,
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

  const punjabiAlert = generatePlainLanguageAlert(
    MOCK_HOTSPOT,
    MOCK_CROP_CLASSIFICATION,
    MOCK_PLUME,
    'pa'
  );
  assert.ok(punjabiAlert.includes('ਪਰਾਲੀ'), 'Punjabi alert should mention stubble burning');

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
      state: 'Punjab',
      onClose: () => {},
    })
  );

  assert.ok(html.includes('About 14 km South-East of Jalandhar'), 'Expected nearest-town line');
  assert.ok(html.includes('Likely Crop Stubble Burning'), 'Expected classification badge');
  assert.ok(html.includes('38.5 MW'), 'Expected FRP value');
  // Punjab opens in Punjabi, card headings included.
  assert.ok(html.includes('ਤੁਹਾਡੇ ਲਈ ਇਸਦਾ ਮਤਲਬ'), 'Expected Punjabi advisory header');
  assert.ok(html.includes('ਧੂੰਏਂ ਦਾ ਫੈਲਾਅ (ਹਵਾ)'), 'Expected Punjabi plume card title');
  assert.ok(html.includes('ਧੂੰਆਂ ਪੂਰਬ ਵੱਲ (90°)'), 'Expected Punjabi smoke direction');
  assert.ok(html.includes('Close detail panel'), 'Expected close button with aria-label');
  assert.ok(html.includes('ਪੰਜਾਬੀ'), 'Expected Punjabi language pill for Punjab region');
});

test('Indic alert text carries the compass word in its own language', () => {
  const east: Plume = { bearingDeg: 90, distanceKm: 8.5, spreadDeg: 20 };
  const hi = generatePlainLanguageAlert(MOCK_HOTSPOT, MOCK_CROP_CLASSIFICATION, east, 'hi');
  const pa = generatePlainLanguageAlert(MOCK_HOTSPOT, MOCK_CROP_CLASSIFICATION, east, 'pa');
  const te = generatePlainLanguageAlert(MOCK_HOTSPOT, MOCK_CROP_CLASSIFICATION, east, 'te');
  assert.ok(hi.includes('पूर्व'), hi);
  assert.ok(pa.includes('ਪੂਰਬ'), pa);
  assert.ok(te.includes('తూర్పు'), te);
  for (const line of [hi, pa, te]) assert.doesNotMatch(line, /East|North|South|West|downwind|vicinity/);
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
  assert.equal(defaultLanguage('Punjab'), 'pa');
  assert.equal(defaultLanguage('Telangana'), 'te');
  assert.equal(defaultLanguage('Andhra Pradesh'), 'te');
  assert.equal(defaultLanguage('Uttar Pradesh'), 'hi');
  assert.equal(defaultLanguage('Rajasthan'), 'hi');
  assert.equal(defaultLanguage('Kerala'), 'en', 'no Malayalam alert yet: English, not Hindi');
  assert.equal(defaultLanguage(undefined), 'en');
});
