import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import worker, { type Env } from '../src/index.ts';
import { hasValidSession, issueSession, SESSION_COOKIE, SESSION_SECONDS } from '../src/turnstile.ts';

const SECRET = 'test-turnstile-secret';
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const HEADER =
  'country_id,latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight';

function env(overrides: Partial<Env> = {}): Env {
  return {
    FIRMS_MAP_KEY: 'test-key',
    // The real committed Delhi index, the only region these tests scan.
    ASSETS: {
      fetch: async () =>
        new Response(readFileSync(join(import.meta.dirname, '..', '..', 'frontend', 'public', 'landcover', 'delhi.bin'))),
    },
    RADAR_LIMITER: { limit: async () => ({ success: true }) },
    TURNSTILE_SECRET: SECRET,
    ...overrides,
  };
}

async function withStubbedFetch<T>(handler: (url: string, init?: RequestInit) => Response, run: () => Promise<T>) {
  const original = globalThis.fetch;
  const seen: { url: string; body?: unknown }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, body: init?.body });
    return handler(url, init);
  }) as typeof fetch;
  try {
    return { value: await run(), seen };
  } finally {
    globalThis.fetch = original;
  }
}

const now = () => Math.floor(Date.now() / 1000);
const cookiePair = (setCookie: string) => setCookie.split(';')[0]!;
const radar = (e: Env, cookie?: string) =>
  worker.fetch(new Request('http://localhost/api/radar?region=delhi', cookie ? { headers: { cookie } } : {}), e);
const verify = (e: Env, body: unknown) =>
  worker.fetch(
    new Request('http://localhost/api/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
      body: JSON.stringify(body),
    }),
    e,
  );

test('without a session, /api/radar is a 403 asking for verification, and calls neither FIRMS nor wind', async () => {
  const { value: res, seen } = await withStubbedFetch(() => new Response('unexpected'), () => radar(env()));
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string; verify?: boolean };
  assert.equal(body.verify, true);
  assert.match(body.error, /not an all-clear/);
  assert.equal(seen.length, 0);
});

test('a passed Turnstile check sets a session cookie that then unlocks /api/radar', async () => {
  const { value: res, seen } = await withStubbedFetch(
    (url) => (url === SITEVERIFY ? Response.json({ success: true }) : new Response('unexpected')),
    () => verify(env(), { token: 'token-from-widget' }),
  );
  assert.equal(res.status, 204);
  // The token, the secret and the client IP went to siteverify.
  const form = seen[0]!.body as FormData;
  assert.equal(seen[0]!.url, SITEVERIFY);
  assert.equal(form.get('response'), 'token-from-widget');
  assert.equal(form.get('secret'), SECRET);
  assert.equal(form.get('remoteip'), '203.0.113.7');

  const setCookie = res.headers.get('set-cookie') ?? '';
  assert.match(setCookie, new RegExp(`^${SESSION_COOKIE}=\\d+\\.[A-Za-z0-9_-]+;`));
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api', `Max-Age=${SESSION_SECONDS}`]) {
    assert.ok(setCookie.includes(attr), `cookie lacks ${attr}`);
  }

  const { value: scan } = await withStubbedFetch(
    () => new Response(`${HEADER}\n`), // a real zero-row FIRMS answer
    () => radar(env(), cookiePair(setCookie)),
  );
  assert.equal(scan.status, 200);
  assert.deepEqual(await scan.json(), { hotspots: [], plumes: {}, classifications: {} });
});

test('a failed Turnstile check is a 403 with no cookie', async () => {
  const { value: res } = await withStubbedFetch(
    () => Response.json({ success: false, 'error-codes': ['invalid-input-response'] }),
    () => verify(env(), { token: 'bad-token' }),
  );
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('set-cookie'), null);
});

test('siteverify being down is a 502, not a pass', async () => {
  const { value: res } = await withStubbedFetch(
    () => new Response('bad gateway', { status: 502 }),
    () => verify(env(), { token: 'token' }),
  );
  assert.equal(res.status, 502);
  assert.equal(res.headers.get('set-cookie'), null);
});

test('/api/verify rejects a missing token, a GET, and a rate-limited client', async () => {
  const { value: missing, seen } = await withStubbedFetch(() => new Response('unexpected'), () => verify(env(), {}));
  assert.equal(missing.status, 400);
  assert.equal(seen.length, 0);
  assert.equal((await worker.fetch(new Request('http://localhost/api/verify'), env())).status, 405);
  const limited = await verify(env({ RADAR_LIMITER: { limit: async () => ({ success: false }) } }), { token: 't' });
  assert.equal(limited.status, 429);
});

test('forged, tampered, expired and wrong-secret cookies are all rejected', async () => {
  const t = now();
  const valid = cookiePair(await issueSession(SECRET, t));
  const [name, value] = valid.split('=') as [string, string];
  const [expiry, sig] = value.split('.') as [string, string];
  const request = (cookie: string) => new Request('http://localhost/api/radar', { headers: { cookie } });

  assert.equal(await hasValidSession(request(valid), SECRET, t), true);
  assert.equal(await hasValidSession(request(`other=1; ${valid}`), SECRET, t), true, 'found among other cookies');
  // Pushing the expiry later invalidates the signature.
  assert.equal(await hasValidSession(request(`${name}=${Number(expiry) + 86400}.${sig}`), SECRET, t), false);
  assert.equal(await hasValidSession(request(`${name}=${expiry}.AAAA${sig.slice(4)}`), SECRET, t), false);
  assert.equal(await hasValidSession(request(`${name}=${expiry}.x`), SECRET, t), false, 'bad base64 is not a crash');
  assert.equal(await hasValidSession(request(valid), SECRET, t + SESSION_SECONDS), false, 'expired');
  assert.equal(await hasValidSession(request(valid), 'another-secret', t), false);
  assert.equal(await hasValidSession(request('madhuca_session=garbage'), SECRET, t), false);
  assert.equal(await hasValidSession(new Request('http://localhost/api/radar'), SECRET, t), false);
});

test('with no Turnstile secret configured, /api/radar refuses instead of skipping the check', async () => {
  const { value: res, seen } = await withStubbedFetch(
    () => new Response('unexpected'),
    () => radar(env({ TURNSTILE_SECRET: undefined })),
  );
  assert.equal(res.status, 500);
  assert.match(((await res.json()) as { error: string }).error, /not configured.*not an all-clear/);
  assert.equal(seen.length, 0);
});
