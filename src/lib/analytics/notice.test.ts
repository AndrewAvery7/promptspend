import { afterEach, describe, expect, it } from 'vitest';
import { ANALYTICS_CHOICE_KEY } from './config';
import { GA_SCRIPT_URL } from './ga';
import { PRIVACY_CONTROL_ID, startAnalytics, type AnalyticsEnvironment } from './notice';

/** A page on the given host. jsdom's own window is always localhost, so the
 *  host and the browser's privacy signal are supplied rather than real. */
function environment(
  options: { hostname?: string; requiresConsent?: boolean; gpc?: boolean; enabled?: boolean } = {},
): AnalyticsEnvironment & { window: Window & { dataLayer?: unknown[] } } {
  const fakeWindow = {
    location: { hostname: options.hostname ?? 'promptspend.com' },
    navigator: { globalPrivacyControl: options.gpc ?? false },
  } as unknown as Window;
  return {
    window: fakeWindow,
    document,
    storage: localStorage,
    // The behaviour under test is the running one; the pause has its own tests below.
    enabled: options.enabled ?? true,
    requiresConsent: options.requiresConsent ?? false,
    privacyHref: '/privacy/',
  };
}

const notice = () => document.querySelector<HTMLElement>('.ga-notice');
const gtagLoaded = () => document.head.querySelector(`script[src="${GA_SCRIPT_URL}"]`) !== null;
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === name);

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelectorAll('script').forEach((script) => script.remove());
  localStorage.clear();
});

describe('the pause: Google Analytics switched off', () => {
  it('loads nothing and shows no notice, on promptspend.com and anywhere else', () => {
    for (const hostname of ['promptspend.com', 'www.promptspend.com', 'localhost']) {
      startAnalytics(environment({ enabled: false, hostname }));
      expect(gtagLoaded()).toBe(false);
      expect(notice()).toBeNull();
    }
  });

  it('draws no privacy-page control, even where the page asks for one', () => {
    document.body.innerHTML = `<div id="${PRIVACY_CONTROL_ID}"></div>`;
    startAnalytics(environment({ enabled: false }));
    expect(document.getElementById(PRIVACY_CONTROL_ID)!.childElementCount).toBe(0);
  });

  it('tells Google Analytics to stay off on promptspend.com, so an old tab cannot report', () => {
    const env = environment({ enabled: false });
    startAnalytics(env);
    expect((env.window as unknown as Record<string, unknown>)['ga-disable-G-08GFGLY4VD']).toBe(true);
  });

  it("does not touch the visitor's saved answer to the old notice", () => {
    localStorage.setItem(ANALYTICS_CHOICE_KEY, 'dismissed');
    startAnalytics(environment({ enabled: false }));
    expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe('dismissed');
  });
});

describe('the default: Google Analytics for everyone, with a notice', () => {
  it('loads gtag.js and shows a notice that names Google Analytics cookies and links to the privacy page', () => {
    startAnalytics(environment());
    expect(gtagLoaded()).toBe(true);
    const shown = notice();
    expect(shown).not.toBeNull();
    expect(shown!.getAttribute('aria-label')).toBe('Analytics notice');
    expect(shown!.textContent).toContain('uses Google Analytics cookies');
    expect(shown!.textContent).toContain('never what you type or paste');
    expect(shown!.querySelector('a')!.getAttribute('href')).toBe('/privacy/');
    expect(button('OK')).toBeDefined();
    expect(button('Turn off')).toBeDefined();
    expect(button('Accept')).toBeUndefined();
  });

  it('OK dismisses the notice for good, and Google Analytics keeps running', () => {
    startAnalytics(environment());
    button('OK')!.click();
    expect(notice()).toBeNull();
    expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe('dismissed');

    document.head.querySelectorAll('script').forEach((script) => script.remove());
    startAnalytics(environment());
    expect(notice()).toBeNull();
    expect(gtagLoaded()).toBe(true);
  });

  it('Turn off stops it on this page and every later one', () => {
    const env = environment();
    startAnalytics(env);
    button('Turn off')!.click();
    expect(notice()).toBeNull();
    expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe('declined');
    expect((env.window as unknown as Record<string, unknown>)['ga-disable-G-08GFGLY4VD']).toBe(true);

    document.head.querySelectorAll('script').forEach((script) => script.remove());
    startAnalytics(environment());
    expect(gtagLoaded()).toBe(false);
    expect(notice()).toBeNull();
  });

  it('does nothing at all away from promptspend.com', () => {
    startAnalytics(environment({ hostname: 'localhost' }));
    expect(gtagLoaded()).toBe(false);
    expect(notice()).toBeNull();
  });

  it('does nothing for a browser that sends Global Privacy Control', () => {
    startAnalytics(environment({ gpc: true }));
    expect(gtagLoaded()).toBe(false);
    expect(notice()).toBeNull();
  });
});

describe('the switch: consent required', () => {
  it('loads nothing from Google until Accept, and asks with Accept and Decline', () => {
    startAnalytics(environment({ requiresConsent: true }));
    expect(gtagLoaded()).toBe(false);
    expect(notice()!.textContent).toContain('would like to use Google Analytics cookies');
    expect(notice()!.textContent).toContain('Nothing from Google loads unless you accept');
    expect(button('OK')).toBeUndefined();

    button('Accept')!.click();
    expect(gtagLoaded()).toBe(true);
    expect(notice()).toBeNull();
    expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe('accepted');
  });

  it('Decline loads nothing and stops asking', () => {
    startAnalytics(environment({ requiresConsent: true }));
    button('Decline')!.click();
    expect(gtagLoaded()).toBe(false);
    startAnalytics(environment({ requiresConsent: true }));
    expect(notice()).toBeNull();
    expect(gtagLoaded()).toBe(false);
  });

  it('asks again someone who had only dismissed the default notice', () => {
    localStorage.setItem(ANALYTICS_CHOICE_KEY, 'dismissed');
    startAnalytics(environment({ requiresConsent: true }));
    expect(gtagLoaded()).toBe(false);
    expect(notice()).not.toBeNull();
  });
});

describe('the control on the privacy page', () => {
  const mount = () => {
    document.body.innerHTML = `<div id="${PRIVACY_CONTROL_ID}"><p>JavaScript is off.</p></div>`;
    return document.getElementById(PRIVACY_CONTROL_ID)!;
  };

  it('says it is on and turns it off, then back on', () => {
    const control = mount();
    const env = environment();
    startAnalytics(env);
    expect(control.textContent).toContain('Google Analytics is on in this browser.');
    expect(control.getAttribute('role')).toBe('status');

    button('Turn off Google Analytics')!.click();
    expect(control.textContent).toContain('Google Analytics is off in this browser.');
    expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe('declined');
    expect(notice()).toBeNull();

    document.head.querySelectorAll('script').forEach((script) => script.remove());
    button('Turn Google Analytics on')!.click();
    expect(gtagLoaded()).toBe(true);
    expect(control.textContent).toContain('Google Analytics is on in this browser.');
    expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe('dismissed');
  });

  it('turning it on under the consent switch counts as Accept', () => {
    mount();
    startAnalytics(environment({ requiresConsent: true }));
    button('Turn Google Analytics on')!.click();
    expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe('accepted');
    expect(gtagLoaded()).toBe(true);
  });

  it('follows a choice made on the notice', () => {
    const control = mount();
    startAnalytics(environment());
    button('Turn off')!.click();
    expect(control.textContent).toContain('Google Analytics is off in this browser.');
  });

  it('explains Global Privacy Control rather than offering a button that would be ignored', () => {
    const control = mount();
    startAnalytics(environment({ gpc: true }));
    expect(control.textContent).toContain('because it sends Global Privacy Control');
    expect(control.querySelector('button')).toBeNull();
  });

  it('says so on a copy of the site that is not promptspend.com', () => {
    const control = mount();
    startAnalytics(environment({ hostname: 'andrewavery7.github.io' }));
    expect(control.textContent).toContain('runs only on promptspend.com');
    expect(control.querySelector('button')).toBeNull();
  });
});
