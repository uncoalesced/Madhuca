import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fetchRadar } from '../src/App.ts';
import { HumanCheck, submitTurnstileToken } from '../src/components/HumanCheck.ts';

const respond = (status: number, body?: unknown) =>
  (async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as unknown as typeof fetch;

test('a 403 asking for verification becomes a verify result, never an empty all-clear', async () => {
  const result = await fetchRadar(
    'north',
    respond(403, { error: 'Verify you are human to load fire data. This is not an all-clear.', verify: true }),
  );
  assert.equal(result.verify, true);
  assert.equal(result.hotspots.length, 0);
  assert.match(result.error ?? '', /not an all-clear/);
});

test('a plain 403 without the verify flag is still an ordinary error', async () => {
  const result = await fetchRadar('north', respond(403, { error: 'Forbidden' }));
  assert.equal(result.verify, undefined);
  assert.equal(result.error, 'Forbidden');
});

test('submitTurnstileToken posts the token to /api/verify and reports the outcome', async () => {
  let sent: { url: string; init?: RequestInit } | undefined;
  const ok = (async (url: string, init?: RequestInit) => {
    sent = { url, init };
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  assert.equal(await submitTurnstileToken('tok-1', ok), null);
  assert.equal(sent?.url, '/api/verify');
  assert.equal(sent?.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(sent?.init?.body)), { token: 'tok-1' });

  assert.equal(
    await submitTurnstileToken('bad', respond(403, { error: 'Human verification failed, please try again.' })),
    'Human verification failed, please try again.',
  );
  const down = (async () => {
    throw new TypeError('network');
  }) as unknown as typeof fetch;
  assert.match((await submitTurnstileToken('t', down)) ?? '', /Could not reach/);
});

test('without a site key (as in this non-Vite test run) the check says it is not configured, not an all-clear', () => {
  const html = renderToStaticMarkup(React.createElement(HumanCheck, { onVerified: () => {} }));
  assert.match(html, /Human verification is not configured/);
  assert.match(html, /not an all-clear/);
  assert.match(html, /human-check-error/);
});
