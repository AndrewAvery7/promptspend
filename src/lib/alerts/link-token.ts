/**
 * The private key an emailed preferences link carries (`/?alerts=<token>`).
 *
 * It is a bearer credential, so it leaves the address bar before anything else
 * on the page runs: `src/main.tsx` calls `captureAlertsLinkToken()` ahead of
 * rendering and ahead of Google Analytics, which reads the address. Held here
 * instead, it stays out of browser history, out of an estimate link someone
 * copies, and out of anything Google's tag records while the pricing catalog
 * is still loading (the alerts panel only mounts once it has).
 */
export const ALERTS_LINK_PARAM = 'alerts';

let held: string | null = null;

/** Take the key out of the address, if it is there, and hold it. Returns it. */
export function captureAlertsLinkToken(): string | null {
  const url = new URL(window.location.href);
  const token = url.searchParams.get(ALERTS_LINK_PARAM);
  if (token) {
    held = token;
    url.searchParams.delete(ALERTS_LINK_PARAM);
    window.history.replaceState(window.history.state, '', url);
  }
  return held;
}

/** The held key, or null. Reading it does not forget it; `forgetAlertsLinkToken` does. */
export function alertsLinkToken(): string | null {
  return captureAlertsLinkToken();
}

/** Drop the held key once the alerts panel has it in its own state. */
export function forgetAlertsLinkToken(): void {
  held = null;
}
