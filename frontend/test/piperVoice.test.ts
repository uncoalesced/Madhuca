import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kannadaToTelugu, pcmToWav, PIPER_VOICES } from '../src/utils/piperVoice.ts';
import { browserVoiceFor } from '../src/components/TtsButton.ts';

test('kannadaToTelugu maps letters, vowel signs and virama by offset', () => {
  // ಹೊಗೆ (smoke) and ಪಶ್ಚಿಮ (west, with a virama conjunct).
  assert.equal(kannadaToTelugu('ಹೊಗೆ'), 'హొగె');
  assert.equal(kannadaToTelugu('ಪಶ್ಚಿಮ'), 'పశ్చిమ');
  // Anusvara and the retroflex LLA have Telugu partners; archaic LLLA reads as LA.
  assert.equal(kannadaToTelugu('ಸಂಭಾವ್ಯ ಗಾಳಿ'), 'సంభావ్య గాళి');
  assert.equal(kannadaToTelugu('ೞ'), 'ల');
  // Latin text, digits and punctuation pass through.
  assert.equal(kannadaToTelugu('3.5 km.'), '3.5 km.');
});

test('pcmToWav writes a 16-bit mono RIFF header and clamps samples', () => {
  const wav = new DataView(pcmToWav(Float32Array.from([0, 1, -1, 2]), 22050));
  const tag = (at: number) => String.fromCharCode(...[0, 1, 2, 3].map((k) => wav.getUint8(at + k)));
  assert.equal(tag(0), 'RIFF');
  assert.equal(tag(8), 'WAVE');
  assert.equal(tag(36), 'data');
  assert.equal(wav.getUint32(24, true), 22050);
  assert.equal(wav.getUint32(40, true), 8);
  assert.equal(wav.getInt16(46, true), 32767);
  assert.equal(wav.getInt16(48, true), -32768);
  assert.equal(wav.getInt16(50, true), 32767, 'out-of-range sample clamps');
});

test('every non-English alert language has an open-source voice', () => {
  for (const lang of ['hi', 'kn', 'te']) assert.ok(PIPER_VOICES[lang]?.endsWith('.onnx'), lang);
});

/** A fake speechSynthesis whose voice list arrives late, like Chrome's. */
function lateSynth(voices: Array<{ lang: string }>, afterMs: number) {
  let loaded = false;
  const listeners: Array<() => void> = [];
  setTimeout(() => {
    loaded = true;
    listeners.forEach((l) => l());
  }, afterMs);
  return {
    getVoices: () => (loaded ? voices : []),
    addEventListener: (_: string, l: () => void) => listeners.push(l),
  } as unknown as SpeechSynthesis;
}

test('browserVoiceFor waits for a late voice list instead of reporting no voice', async () => {
  const voice = await browserVoiceFor('hi', lateSynth([{ lang: 'en-US' }, { lang: 'hi-IN' }], 20), 1000);
  assert.equal(voice?.lang, 'hi-IN');
});

test('browserVoiceFor never picks another language, and gives up after the timeout', async () => {
  assert.equal(await browserVoiceFor('te', lateSynth([{ lang: 'en-US' }, { lang: 'hi-IN' }], 5), 1000), undefined);
  assert.equal(await browserVoiceFor('hi', lateSynth([{ lang: 'hi-IN' }], 500), 30), undefined);
  assert.equal(await browserVoiceFor('kn', undefined), undefined);
});
