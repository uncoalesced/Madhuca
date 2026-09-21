import { test } from 'node:test';
import assert from 'node:assert/strict';

import { synthesizeSpeech } from '../src/tts.ts';

test('synthesizes speech from a JSON response containing base64 audioContent', async () => {
  const originalFetch = globalThis.fetch;
  // Base64 encoding of 4 bytes [1, 2, 3, 4] -> "AQIDBA=="
  const mockBase64 = 'AQIDBA==';
  let capturedUrl = '';
  let capturedBody: any = null;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        audio: [{ audioContent: mockBase64 }],
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  }) as typeof fetch;

  try {
    const buffer = await synthesizeSpeech('सावधान! पास में आग लगी है', 'hi');
    assert.ok(buffer instanceof ArrayBuffer);
    const view = new Uint8Array(buffer);
    assert.deepEqual(Array.from(view), [1, 2, 3, 4]);

    assert.equal(capturedBody.input[0].source, 'सावधान! पास में आग लगी है');
    assert.equal(capturedBody.config.language.sourceLanguage, 'hi');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('synthesizes speech from a binary audio stream response', async () => {
  const originalFetch = globalThis.fetch;
  const rawBytes = new Uint8Array([10, 20, 30, 40]);

  globalThis.fetch = (async () => {
    return new Response(rawBytes, {
      status: 200,
      headers: { 'content-type': 'audio/wav' },
    });
  }) as typeof fetch;

  try {
    const buffer = await synthesizeSpeech('ਖ਼ਤਰਾ! ਅੱਗ ਲੱਗੀ ਹੈ', 'pa');
    assert.ok(buffer instanceof ArrayBuffer);
    const view = new Uint8Array(buffer);
    assert.deepEqual(Array.from(view), [10, 20, 30, 40]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects empty or whitespace-only text', async () => {
  await assert.rejects(() => synthesizeSpeech('', 'hi'), /empty/i);
  await assert.rejects(() => synthesizeSpeech('   ', 'hi'), /empty/i);
});

test('rejects unsupported language codes', async () => {
  await assert.rejects(() => synthesizeSpeech('Danger fire detected', 'fr'), /unsupported/i);
  await assert.rejects(() => synthesizeSpeech('Danger fire detected', 'de'), /unsupported/i);
});

test('surfaces non-OK HTTP status from Indic-TTS', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response('Internal Server Error', {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }) as typeof fetch;

  try {
    await assert.rejects(() => synthesizeSpeech('Alert text', 'hi'), /500/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
