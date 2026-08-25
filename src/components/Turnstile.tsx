import { useEffect, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile, loaded only when it is actually required.
 *
 * This is the one place the site reaches a third-party origin, and it is a
 * deliberate trade: without it, the subscribe endpoint sends a confirmation
 * email for every address posted to it, so a script could burn the sending
 * quota and the domain's reputation in an afternoon. The Content Security
 * Policy opens `challenges.cloudflare.com` and nothing else, and only when the
 * API reports that a site key is configured — a deployment with Turnstile off
 * never loads it and keeps a strictly self-only policy.
 *
 * No prompt data ever reaches it: the widget sits on the alerts form, which
 * knows an email address and a list of model ids, and nothing about anything a
 * visitor has pasted into the estimator.
 */

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      action: string;
      sitekey: string;
      theme: 'light' | 'dark' | 'auto';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loader: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Turnstile failed to load')));
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Turnstile failed to load'));
    document.head.appendChild(script);
  });
  return loader;
}

interface TurnstileProps {
  siteKey: string;
  theme: 'light' | 'dark';
  /**
   * Which form this widget guards. The worker verifies the action alongside the
   * token and rejects a mismatch, so a token minted for one form cannot be
   * replayed against another — which means this has to match the action the
   * endpoint expects, not merely be unique.
   */
  action?: 'web_email_alerts' | 'web_launch_notify';
  onToken: (token: string | null) => void;
}

export function Turnstile({ siteKey, theme, action = 'web_email_alerts', onToken }: TurnstileProps) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  // `onToken` is intentionally not a dependency of the render effect below:
  // including it would re-render the widget on every parent state change, and
  // Turnstile treats a re-render as a fresh challenge.
  //
  // The assignment lives in its own effect rather than in the render body. A
  // ref written during render is a rule React now enforces, and the effect is
  // equivalent here: the ref is only ever read from Turnstile's own callbacks,
  // which fire long after mount.
  const callback = useRef(onToken);
  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId = window.turnstile.render(container.current, {
          sitekey: siteKey,
          theme,
          action,
          callback: (token) => callback.current(token),
          'expired-callback': () => callback.current(null),
          'error-callback': () => callback.current(null),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, theme, action]);

  if (failed) {
    return (
      <p className="note note--warn" role="status">
        <span>
          The anti-abuse check could not load — often an extension or a network filter blocking
          <code> challenges.cloudflare.com</code>. Subscribing needs it, so allow that origin and reload.
        </span>
      </p>
    );
  }

  return <div className="turnstile" ref={container} />;
}
