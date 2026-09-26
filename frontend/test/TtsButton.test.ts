import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TtsButton, TTS_LANGUAGE_NAMES } from '../src/components/TtsButton.ts';

test('TtsButton renders default idle state with localized Hindi label', () => {
  const html = renderToStaticMarkup(
    React.createElement(TtsButton, {
      text: 'Heavy smoke detected near agricultural fields.',
      langCode: 'hi',
    })
  );

  assert.ok(html.includes('Listen Alert in Hindi (हिंदी)'), 'Expected Hindi listen button copy');
  assert.ok(html.includes('tts-state-idle'), 'Expected tts-state-idle class');
  assert.ok(html.includes('aria-live="polite"'), 'Expected aria-live="polite"');
});

test('TtsButton renders Punjabi, Telugu, and English labels appropriately', () => {
  const punjabHtml = renderToStaticMarkup(
    React.createElement(TtsButton, { text: 'Alert', langCode: 'pa' })
  );
  assert.ok(punjabHtml.includes('Punjabi (ਪੰਜਾਬੀ)'), 'Expected Punjabi label');

  const teluguHtml = renderToStaticMarkup(
    React.createElement(TtsButton, { text: 'Alert', langCode: 'te' })
  );
  assert.ok(teluguHtml.includes('Telugu (తెలుగు)'), 'Expected Telugu label');

  const englishHtml = renderToStaticMarkup(
    React.createElement(TtsButton, { text: 'Alert', langCode: 'en' })
  );
  assert.ok(englishHtml.includes('English'), 'Expected English label');
});

test('TTS_LANGUAGE_NAMES supports all core regional Indic languages', () => {
  assert.equal(TTS_LANGUAGE_NAMES.hi, 'Hindi (हिंदी)');
  assert.equal(TTS_LANGUAGE_NAMES.pa, 'Punjabi (ਪੰਜਾਬੀ)');
  assert.equal(TTS_LANGUAGE_NAMES.te, 'Telugu (తెలుగు)');
  assert.equal(TTS_LANGUAGE_NAMES.en, 'English');
});
