import { afterEach, describe, expect, it } from 'vitest';
import { alertsLinkToken, captureAlertsLinkToken, forgetAlertsLinkToken } from './link-token';

afterEach(() => {
  forgetAlertsLinkToken();
  window.history.replaceState(null, '', '/');
});

describe('the emailed preferences link key', () => {
  it('leaves the address bar at once and keeps the rest of the address', () => {
    window.history.replaceState(null, '', '/?m=claude-sonnet-5&alerts=PRIVATE-KEY&t=6#data');
    expect(captureAlertsLinkToken()).toBe('PRIVATE-KEY');
    expect(window.location.href).not.toContain('PRIVATE-KEY');
    expect(window.location.search).toBe('?m=claude-sonnet-5&t=6');
    expect(window.location.hash).toBe('#data');
  });

  it('is still held for the alerts panel after the address is clean, until it is forgotten', () => {
    window.history.replaceState(null, '', '/?alerts=PRIVATE-KEY');
    captureAlertsLinkToken();
    expect(alertsLinkToken()).toBe('PRIVATE-KEY');
    forgetAlertsLinkToken();
    expect(alertsLinkToken()).toBeNull();
  });

  it('is null when the page was not opened from such a link', () => {
    window.history.replaceState(null, '', '/?m=a');
    expect(captureAlertsLinkToken()).toBeNull();
    expect(window.location.search).toBe('?m=a');
  });
});
