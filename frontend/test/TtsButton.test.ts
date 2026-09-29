import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TtsButton, TTS_UI } from '../src/components/TtsButton.ts';

test('TtsButton renders default idle state with localized Hindi label', () => {
  const html = renderToStaticMarkup(
    React.createElement(TtsButton, {
      text: 'Heavy smoke detected near agricultural fields.',
      langCode: 'hi',
    })
  );

  assert.ok(html.includes('अलर्ट हिंदी में सुनें'), 'Expected Hindi listen button copy');
  assert.doesNotMatch(html, /Listen|audio/, 'no English on a Hindi button');
  assert.ok(html.includes('tts-state-idle'), 'Expected tts-state-idle class');
  assert.ok(html.includes('aria-live="polite"'), 'Expected aria-live="polite"');
});


test('every alert language has its own button copy, with no English outside English', () => {
  const idle = (langCode: string) =>
    renderToStaticMarkup(React.createElement(TtsButton, { text: 'Alert', langCode }));
  assert.ok(idle('kn').includes('ಎಚ್ಚರಿಕೆಯನ್ನು ಕನ್ನಡದಲ್ಲಿ ಕೇಳಿ'));
  assert.ok(idle('te').includes('హెచ్చరికను తెలుగులో వినండి'));
  assert.ok(idle('en').includes('Listen Alert in English'));
  for (const lang of ['hi', 'kn', 'te']) {
    const ui = TTS_UI[lang]!;
    const copy = [ui.listen, ui.stop, ui.pause, ui.resume, ui.retry, ui.preparing, ui.downloading('12 / 80'), ...Object.values(ui.errors)];
    for (const line of copy) assert.doesNotMatch(line, /[A-Za-z]{3,}/, `${lang}: ${line}`);
  }
});
