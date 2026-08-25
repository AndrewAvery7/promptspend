import { useEffect, useState } from 'react';
import {
  alertsConfigured,
  fetchAlertsConfig,
  subscribeLaunchNotify,
  type AlertsConfig,
} from '@/lib/alerts/api';
import { Turnstile } from '@/components/Turnstile';

/**
 * The mobile-app announcement, with a one-message signup.
 *
 * Three deliberate absences:
 *
 *   1. **No date.** App review timing is not ours to promise, and a front page
 *      that says "next week" for two months is exactly the stale-but-confident
 *      claim this catalog exists to argue against.
 *   2. **No store badges.** Apple's and Google's badge guidelines both require
 *      their artwork to link to a live listing. Until those exist, these are
 *      plain platform glyphs that say which platforms, not fake download
 *      buttons.
 *   3. **No form when it cannot submit.** If the alerts API is unconfigured for
 *      this deployment, the banner still announces the apps but drops the
 *      input rather than rendering a field that silently fails — the same rule
 *      the alerts panel already follows.
 */

const DISMISSED_KEY = 'ps.launchBannerDismissed';

function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.4 12.8c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.15-2.8.85-3.5.85s-1.8-.83-3-.81c-1.5.02-2.9.9-3.7 2.27-1.6 2.76-.4 6.85 1.1 9.1.75 1.1 1.6 2.33 2.8 2.29 1.1-.05 1.5-.72 2.9-.72s1.7.72 2.9.7c1.2-.02 2-1.12 2.7-2.22.85-1.27 1.2-2.5 1.2-2.56-.03-.01-2.3-.89-2.3-3.5zM14.1 5.6c.6-.75 1-1.78.9-2.8-.9.04-2 .6-2.65 1.35-.58.66-1.1 1.71-.95 2.72 1 .08 2.02-.51 2.7-1.27z"
      />
    </svg>
  );
}

/**
 * Google Play, in its own four colours.
 *
 * Fixed hex rather than a token, because these are Google's colours and not
 * ours to re-theme — and unlike the rest of the palette they do not flip with
 * the theme. They read correctly on both canvases, which is why the tile behind
 * them is neutral rather than accent-tinted.
 *
 * Note this is the Play *mark*, not the "Get it on Google Play" badge. The
 * badge may only be used to link to a live listing, which does not exist yet.
 */
function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" focusable="false">
      <path fill="#00A0FF" d="M3.6 2.3c-.3.3-.5.8-.5 1.4v16.6c0 .6.2 1.1.5 1.4l.1.1L13 12.1v-.2L3.7 2.2z" />
      <path fill="#FFCE00" d="M16 15.2l-3-3v-.2l3-3 .1.1 3.7 2.1c1 .6 1 1.6 0 2.2l-3.7 2.1z" />
      <path fill="#FF3A44" d="M16.1 15.1L13 12 3.6 21.7c.3.4.9.4 1.5.1l11-6.7" />
      <path fill="#00E676" d="M16.1 8.9L5.1 2.2c-.6-.4-1.2-.3-1.5.1L13 12z" />
    </svg>
  );
}

export function LaunchBanner({ theme }: { theme: 'light' | 'dark' }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [config, setConfig] = useState<AlertsConfig | null>(null);
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!alertsConfigured || dismissed) return;
    let cancelled = false;
    fetchAlertsConfig()
      .then((loaded) => {
        if (!cancelled) setConfig(loaded);
      })
      .catch(() => {
        // A failed config fetch is not worth an error message here. The banner
        // is an announcement first; losing the form leaves the announcement.
        if (!cancelled) setConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  /** Record that this banner has been answered, by either route. */
  const remember = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const dismiss = () => {
    setDismissed(true);
    remember();
  };

  if (dismissed) return null;

  const canSubmit = alertsConfigured && config?.emailEnabled === true;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      setError('Enter an email address first.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await subscribeLaunchNotify({ email, ...(turnstileToken ? { turnstileToken } : {}) });
      setSent(true);
      // Remembered the same way a dismissal is. Someone who has handed over an
      // address has answered this banner; asking again on their next visit
      // reads as not having listened. The confirmation stays visible for the
      // rest of this visit — that is the instruction to go and click the link.
      remember();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign you up.');
    } finally {
      setBusy(false);
    }
  };

  const turnstileNeeded = Boolean(canSubmit && config?.turnstileRequired && config?.turnstileSiteKey);

  return (
    <div className="launch-wrap">
      <section className="launch" aria-labelledby="launch-title">
        <div className="launch__glyphs" aria-hidden="true">
          <span className="launch__glyph">
            <AppleGlyph />
          </span>
          <span className="launch__glyph">
            <PlayGlyph />
          </span>
        </div>

        <div className="launch__copy">
          <p className="launch__title" id="launch-title">
            PromptSpend is coming to iPhone and Android
          </p>
          <p className="launch__sub">
            The same catalog, the same sources and dates, built for a phone. We&apos;ll email you once when
            both apps are live — and only once.
          </p>
        </div>

        {sent ? (
          <p className="launch__done" role="status">
            <b>Check your inbox.</b> Confirm the link and that is the last you hear from us until launch day.
          </p>
        ) : canSubmit ? (
          <form className="launch__form" onSubmit={submit}>
            <label className="launch__label" htmlFor="launch-email">
              Email address
            </label>
            <div className="launch__row">
              <input
                id="launch-email"
                type="email"
                className="launch__input"
                placeholder="you@company.com"
                value={email}
                autoComplete="email"
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (error) setError(null);
                }}
              />
              <button
                type="submit"
                className="launch__submit"
                disabled={busy || (turnstileNeeded && !turnstileToken)}
              >
                {busy ? 'Sending…' : 'Notify me'}
              </button>
            </div>
          </form>
        ) : null}

        {/* The dismiss sits inline at the end of the row, matching the guided
            tour's strip, rather than floating in the corner. */}
        <button
          type="button"
          className="launch__dismiss"
          aria-label="Dismiss the app announcement"
          onClick={dismiss}
        >
          ✕
        </button>

        {/* Second row, spanning the grid. The anti-abuse check and the fine
            print used to stack under the input, which made the card three
            times taller than the sentence it exists to carry. */}
        {!sent && canSubmit && (
          <div className="launch__foot">
            {turnstileNeeded && config?.turnstileSiteKey && (
              /* Collapsed once a token exists, and that is what actually keeps
                 this row one line tall. `interaction-only` stops Cloudflare
                 *drawing* a checkbox, but the container it renders into still
                 reserves its height, so the row stayed ~65px with nothing
                 visible in it. Hiding it is safe only after the token is in
                 hand: before that a challenge may genuinely need to be shown,
                 and a hidden challenge is an unsubmittable form. If the token
                 later expires, `onToken(null)` brings it straight back. */
              <div className={`launch__check${turnstileToken ? ' launch__check--passed' : ''}`}>
                <Turnstile
                  siteKey={config.turnstileSiteKey}
                  theme={theme}
                  action="web_launch_notify"
                  appearance="interaction-only"
                  onToken={setTurnstileToken}
                />
              </div>
            )}
            {error ? (
              <p className="launch__error" role="alert">
                {error}
              </p>
            ) : turnstileNeeded && !turnstileToken ? (
              /* The widget is invisible while it passes, so without this the
                 submit button would sit greyed out with nothing on screen
                 saying why. */
              <p className="launch__fine" role="status">
                Checking you&apos;re human — the button enables in a moment.
              </p>
            ) : (
              <p className="launch__fine">
                One email, then your address is deleted, and it is separate from price alerts.{' '}
                <a href="/privacy/">How we handle it</a>.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
