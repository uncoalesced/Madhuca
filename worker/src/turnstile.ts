// Human check for /api/radar: Cloudflare Turnstile once, then a signed session cookie.
//
// A Turnstile token is single-use, but the page calls /api/radar on every region
// switch. So POST /api/verify spends the token once and sets a cookie holding
// `<expiry>.<HMAC-SHA256(expiry)>`; /api/radar only checks that signature. Web Crypto
// only, no dependency, and a few microseconds of CPU against the 10ms budget.

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const SESSION_COOKIE = 'madhuca_session';
export const SESSION_SECONDS = 3600;

const encoder = new TextEncoder();

// The HMAC key is derived from the Turnstile secret, so there is one secret to set,
// not two. The label keeps the cookie signature distinct from any other use of it.
function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(`madhuca-session:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    // A forged cookie with an impossible base64 length: not a session, not a crash.
    return null;
  }
}

/** A `Set-Cookie` value for a session valid SESSION_SECONDS from `nowSec`. */
export async function issueSession(secret: string, nowSec: number): Promise<string> {
  const expiry = String(nowSec + SESSION_SECONDS);
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(expiry));
  return (
    `${SESSION_COOKIE}=${expiry}.${toBase64Url(signature)}; Max-Age=${SESSION_SECONDS}; ` +
    'Path=/api; HttpOnly; Secure; SameSite=Strict'
  );
}

/** Whether the request carries an unexpired session cookie signed with `secret`. */
export async function hasValidSession(request: Request, secret: string, nowSec: number): Promise<boolean> {
  const cookies = request.headers.get('cookie') ?? '';
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=(\\d+)\\.([A-Za-z0-9_-]+)`));
  if (!match) return false;
  const [, expiry, sig] = match;
  if (Number(expiry) <= nowSec) return false;
  const signature = fromBase64Url(sig!);
  if (!signature) return false;
  // subtle.verify compares in constant time.
  return crypto.subtle.verify('HMAC', await hmacKey(secret), signature, encoder.encode(expiry!));
}

/**
 * Spend a Turnstile token with Cloudflare. True only on an explicit success;
 * throws if siteverify itself cannot be reached, so the caller can tell
 * "you failed the check" apart from "the check is down".
 */
export async function verifyTurnstile(token: string, secret: string, ip: string | null): Promise<boolean> {
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch(SITEVERIFY, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Turnstile siteverify responded ${res.status}`);
  const body = (await res.json()) as { success?: unknown };
  return body.success === true;
}
