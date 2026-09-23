import { useState } from 'react';
import { ANDROID_ROBOT_CREDIT, APP_PAGE_URL } from '@/config';
import { StoreBadges, StoreQrCodes } from '@/components/StoreBadges';

/**
 * The mobile-app announcement, now that both apps are live.
 *
 * Until September 2026 this banner said the apps were coming and offered a
 * one-message email list. That list is closed (see docs/ALERTS.md): the form is
 * gone, and what replaces it is the thing the list was waiting for — the two
 * store badges, plus a QR code per store for a visitor on a computer.
 *
 * It is dismissible, and a dismissal is remembered, because an announcement
 * that cannot be put away turns into furniture. That is also why it is not the
 * only way to the apps: the header, the footer, the hero aside and Data & Alerts
 * all link to the permanent page at /app/, which cannot be dismissed.
 *
 * The storage key is new rather than reused. Someone who closed the "coming
 * soon" version has not seen this news, and should, once.
 */

const DISMISSED_KEY = 'ps.appsLiveBannerDismissed';

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

export function LaunchBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
  };

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
            PromptSpend is now on iPhone and Android
          </p>
          <p className="launch__sub">
            The same catalog, the same sources and dates, built for a phone. Free — no account, no ads, and
            what you paste stays on your device. <a href={APP_PAGE_URL}>About the app</a>
          </p>
          <StoreBadges />
        </div>

        <StoreQrCodes credit={false} />

        {/* Inline at the end of the row, matching the guided tour's strip. */}
        <button
          type="button"
          className="launch__dismiss"
          aria-label="Dismiss the app announcement"
          onClick={dismiss}
        >
          ✕
        </button>

        {/* Only where the QR codes are shown: the credit belongs to the robot
            in the Android code, so it goes wherever that code goes. */}
        <p className="launch__fine launch__credit">{ANDROID_ROBOT_CREDIT}</p>
      </section>
    </div>
  );
}
