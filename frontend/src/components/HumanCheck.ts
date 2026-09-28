/// <reference types="vite/client" />
import React, { useEffect, useRef, useState } from 'react';

// Cloudflare Turnstile, loaded from Cloudflare rather than npm: one script tag, no dependency.
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Cloudflare's published always-pass test site key. Dev only; its paired test
// secret goes in worker/.dev.vars. A production build without a real key shows an error.
const TEST_SITE_KEY = '1x00000000000000000000AA';

/** Public by design: Turnstile site keys are meant to ship in the page. The secret stays in the Worker. */
export const TURNSTILE_SITE_KEY: string | undefined =
  import.meta.env?.VITE_TURNSTILE_SITE_KEY || (import.meta.env?.DEV ? TEST_SITE_KEY : undefined);

interface Turnstile {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}

let turnstileLoad: Promise<Turnstile> | undefined;

function loadTurnstile(): Promise<Turnstile> {
  turnstileLoad ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.onload = () => {
      const ts = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (ts) resolve(ts);
      else reject(new Error('Turnstile script loaded without a turnstile object'));
    };
    script.onerror = () => reject(new Error('Turnstile script failed to load'));
    document.head.appendChild(script);
  }).catch((err) => {
    turnstileLoad = undefined; // let a retry load it again
    throw err;
  });
  return turnstileLoad;
}

/**
 * Hands a Turnstile token to the Worker, which sets the session cookie.
 * Resolves to null on success, else the message to show.
 */
export async function submitTurnstileToken(token: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl('/api/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? `Verification service responded ${res.status}.`;
  } catch {
    return 'Could not reach the verification service.';
  }
}

export interface HumanCheckProps {
  /** Called once the Worker has accepted the token; the caller retries the scan. */
  onVerified: () => void;
}

/**
 * Turnstile in managed, interaction-only mode: most visitors pass without seeing a
 * box, and the checkbox appears only when Cloudflare wants an interaction.
 */
export function HumanCheck({ onVerified }: HumanCheckProps) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(
    TURNSTILE_SITE_KEY ? null : 'Human verification is not configured, so no fire data was fetched. This is not an all-clear.',
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !container.current) return;
    let widgetId: string | undefined;
    let ts: Turnstile | undefined;
    let cancelled = false;
    loadTurnstile()
      .then((loaded) => {
        if (cancelled || !container.current) return;
        ts = loaded;
        widgetId = loaded.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: 'interaction-only',
          callback: async (token: string) => {
            const message = await submitTurnstileToken(token);
            if (cancelled) return;
            if (message) setError(message);
            else onVerified();
          },
          'error-callback': () => setError('The human check could not complete. This is not an all-clear.'),
          'expired-callback': () => setError('The human check expired. Please try again.'),
        });
      })
      .catch(() => {
        if (!cancelled) setError('The human check could not load. Check your connection. This is not an all-clear.');
      });
    return () => {
      cancelled = true;
      if (ts && widgetId) ts.remove(widgetId);
    };
  }, [attempt, onVerified]);

  return React.createElement(
    'div',
    { className: `status-banner ${error ? 'banner-error' : 'banner-loading'} human-check` },
    React.createElement('span', null, error ?? 'Checking you are human before loading fire data...'),
    React.createElement('div', { ref: container, className: 'turnstile-widget' }),
    error &&
      TURNSTILE_SITE_KEY &&
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'retry-button',
          onClick: () => {
            setError(null);
            setAttempt((n) => n + 1);
          },
        },
        'Try again',
      ),
  );
}
