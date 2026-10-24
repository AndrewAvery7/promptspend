import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ANALYTICS_CHOICE_KEY,
  ANALYTICS_REQUIRES_CONSENT,
  GA_COLLECT_ORIGINS,
  GA_MEASUREMENT_ID,
  GA_SCRIPT_ORIGIN,
} from './config';
import {
  GA_SCRIPT_URL,
  cleanAddress,
  disableGoogleAnalytics,
  loadGoogleAnalytics,
  pageFields,
  readChoice,
  shouldLoad,
  shouldShowNotice,
  writeChoice,
  type GtagWindow,
  type LoadDecision,
} from './ga';

const gtagWindow = () => window as unknown as GtagWindow;

/** The queued gtag commands, as plain arrays. */
function commands(): unknown[][] {
  return (gtagWindow().dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
}

function setReferrer(value: string): void {
  Object.defineProperty(document, 'referrer', { value, configurable: true });
}

beforeEach(() => {
  delete gtagWindow().dataLayer;
  document.head.querySelectorAll('script').forEach((script) => script.remove());
  setReferrer('');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('the configuration', () => {
  it('is the Measurement ID Andrew gave, with the G- prefix GA4 uses', () => {
    expect(GA_MEASUREMENT_ID).toBe('G-08GFGLY4VD');
  });

  it('ships with the owner-chosen default: load for everyone, with a notice', () => {
    expect(ANALYTICS_REQUIRES_CONSENT).toBe(false);
  });

  it('names its Google hosts exactly, with no wildcard', () => {
    expect(GA_SCRIPT_ORIGIN).toBe('https://www.googletagmanager.com');
    expect(GA_COLLECT_ORIGINS).toEqual([
      'https://www.google-analytics.com',
      'https://region1.google-analytics.com',
      'https://region1.analytics.google.com',
    ]);
  });
});

describe('cleanAddress', () => {
  it('keeps the origin and path and drops the query string and fragment', () => {
    expect(cleanAddress('https://promptspend.com/?m=claude-opus-5&in=1200&out=400#compare')).toBe(
      'https://promptspend.com/',
    );
    expect(cleanAddress('https://promptspend.com/models/claude-opus-5/?ref=x')).toBe(
      'https://promptspend.com/models/claude-opus-5/',
    );
  });

  it('drops an alert link private token', () => {
    const cleaned = cleanAddress('https://promptspend.com/?alerts=PRIVATE-TOKEN-123');
    expect(cleaned).toBe('https://promptspend.com/');
    expect(cleaned).not.toContain('PRIVATE');
  });

  it('drops a user name and password', () => {
    expect(cleanAddress('https://user:secret@promptspend.com/x/')).toBe('https://promptspend.com/x/');
  });

  it('keeps a referring site to its origin and path', () => {
    expect(cleanAddress('https://news.ycombinator.com/item?id=123')).toBe(
      'https://news.ycombinator.com/item',
    );
  });

  it('turns anything that is not a web address into nothing', () => {
    expect(cleanAddress('')).toBe('');
    expect(cleanAddress(null)).toBe('');
    expect(cleanAddress(undefined)).toBe('');
    expect(cleanAddress('not a url')).toBe('');
    expect(cleanAddress('javascript:alert(1)')).toBe('');
    expect(cleanAddress('blob:https://promptspend.com/1234')).toBe('');
  });
});

describe('pageFields', () => {
  it('cuts both the page and the referrer down before anything is queued', () => {
    const fields = pageFields({
      location: { href: 'https://promptspend.com/?m=a&paste=1#data' },
      referrer: 'https://promptspend.com/models/x/?alerts=TOKEN#y',
      title: 'PromptSpend',
    });
    expect(fields).toEqual({
      page_location: 'https://promptspend.com/',
      page_referrer: 'https://promptspend.com/models/x/',
      page_title: 'PromptSpend',
    });
  });
});

describe('shouldLoad and shouldShowNotice', () => {
  const base: LoadDecision = {
    hostname: 'promptspend.com',
    choice: null,
    requiresConsent: false,
    globalPrivacyControl: false,
  };

  it('loads for every visitor on promptspend.com by default, and shows the notice once', () => {
    expect(shouldLoad(base)).toBe(true);
    expect(shouldShowNotice(base)).toBe(true);
    expect(shouldLoad({ ...base, choice: 'dismissed' })).toBe(true);
    expect(shouldShowNotice({ ...base, choice: 'dismissed' })).toBe(false);
    expect(shouldLoad({ ...base, hostname: 'www.promptspend.com' })).toBe(true);
  });

  it('never loads anywhere else: a local build, a test run, a fork', () => {
    for (const hostname of [
      'localhost',
      '127.0.0.1',
      'andrewavery7.github.io',
      'promptspend.com.evil.test',
    ]) {
      expect(shouldLoad({ ...base, hostname })).toBe(false);
      expect(shouldShowNotice({ ...base, hostname })).toBe(false);
      expect(shouldLoad({ ...base, hostname, requiresConsent: true, choice: 'accepted' })).toBe(false);
    }
  });

  it('stays off once the visitor turns it off', () => {
    expect(shouldLoad({ ...base, choice: 'declined' })).toBe(false);
    expect(shouldShowNotice({ ...base, choice: 'declined' })).toBe(false);
  });

  it('respects Global Privacy Control without the visitor having to click', () => {
    expect(shouldLoad({ ...base, globalPrivacyControl: true })).toBe(false);
    expect(shouldShowNotice({ ...base, globalPrivacyControl: true })).toBe(false);
  });

  it('with the switch flipped, loads only after Accept and keeps asking until answered', () => {
    const consent = { ...base, requiresConsent: true };
    expect(shouldLoad(consent)).toBe(false);
    expect(shouldShowNotice(consent)).toBe(true);
    // A notice merely dismissed in the default mode is not consent.
    expect(shouldLoad({ ...consent, choice: 'dismissed' })).toBe(false);
    expect(shouldShowNotice({ ...consent, choice: 'dismissed' })).toBe(true);
    expect(shouldLoad({ ...consent, choice: 'accepted' })).toBe(true);
    expect(shouldShowNotice({ ...consent, choice: 'accepted' })).toBe(false);
    expect(shouldLoad({ ...consent, choice: 'declined' })).toBe(false);
    expect(shouldShowNotice({ ...consent, choice: 'declined' })).toBe(false);
  });
});

describe('the stored choice', () => {
  it('round-trips through storage and ignores anything unexpected', () => {
    writeChoice(localStorage, 'declined');
    expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe('declined');
    expect(readChoice(localStorage)).toBe('declined');
    localStorage.setItem(ANALYTICS_CHOICE_KEY, 'yes please');
    expect(readChoice(localStorage)).toBeNull();
    localStorage.removeItem(ANALYTICS_CHOICE_KEY);
    expect(readChoice(localStorage)).toBeNull();
  });

  it('survives storage that is missing or refuses access', () => {
    const refusing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readChoice(undefined)).toBeNull();
    expect(readChoice(refusing)).toBeNull();
    expect(() => writeChoice(refusing, 'accepted')).not.toThrow();
    expect(() => writeChoice(undefined, 'accepted')).not.toThrow();
  });
});

describe('loadGoogleAnalytics', () => {
  it('adds gtag.js for the configured ID, once', () => {
    loadGoogleAnalytics(gtagWindow(), document);
    loadGoogleAnalytics(gtagWindow(), document);
    const scripts = [...document.head.querySelectorAll('script')];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-08GFGLY4VD');
    expect(GA_SCRIPT_URL).toBe(scripts[0]!.src);
    expect(scripts[0]!.async).toBe(true);
  });

  it('switches off the automatic page view and advertising features, and sends one clean page view', () => {
    window.history.replaceState(null, '', '/models/claude-opus-5/?m=secret-scenario&alerts=TOKEN#data');
    setReferrer('http://localhost:3000/?scenario=private#x');
    loadGoogleAnalytics(gtagWindow(), document);

    const queued = commands();
    const location = `${window.location.origin}/models/claude-opus-5/`;
    const referrer = 'http://localhost:3000/';
    const page = { page_location: location, page_referrer: referrer, page_title: document.title };

    expect(queued.map((command) => command[0])).toEqual(['consent', 'js', 'set', 'config', 'event']);
    expect(queued[0]).toEqual([
      'consent',
      'default',
      {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'granted',
      },
    ]);
    expect(queued[2]).toEqual(['set', page]);
    expect(queued[3]).toEqual([
      'config',
      'G-08GFGLY4VD',
      {
        ...page,
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      },
    ]);
    expect(queued[4]).toEqual(['event', 'page_view', page]);

    // Nothing after the path reaches the queue, in any command.
    const everything = JSON.stringify(queued);
    for (const secret of ['secret-scenario', 'TOKEN', '#data', 'scenario=private', '?']) {
      expect(everything).not.toContain(secret);
    }
  });

  it('passes nothing a visitor typed or pasted', () => {
    document.body.innerHTML =
      '<textarea id="paste">MY PRIVATE PROMPT</textarea><input id="email" value="me@example.com" />';
    loadGoogleAnalytics(gtagWindow(), document);
    const everything = JSON.stringify(commands());
    expect(everything).not.toContain('MY PRIVATE PROMPT');
    expect(everything).not.toContain('me@example.com');
    // Only the three page fields and fixed settings: no other keys at all.
    const keys = new Set(
      commands()
        .flatMap((command) => command.filter((part) => typeof part === 'object' && part !== null))
        .flatMap((part) => Object.keys(part as object)),
    );
    expect([...keys].sort()).toEqual(
      [
        'ad_personalization',
        'ad_storage',
        'ad_user_data',
        'allow_ad_personalization_signals',
        'allow_google_signals',
        'analytics_storage',
        'page_location',
        'page_referrer',
        'page_title',
        'send_page_view',
      ].sort(),
    );
    document.body.innerHTML = '';
  });

  it('clears an earlier off switch when it is turned back on', () => {
    gtagWindow()['ga-disable-G-08GFGLY4VD'] = true;
    loadGoogleAnalytics(gtagWindow(), document);
    expect(gtagWindow()['ga-disable-G-08GFGLY4VD']).toBe(false);
  });
});

describe('disableGoogleAnalytics', () => {
  it("sets Google's off switch and removes the Google Analytics cookies, and only those", () => {
    document.cookie = '_ga=GA1.1.123.456; path=/';
    document.cookie = '_ga_08GFGLY4VD=GS1.1.789; path=/';
    document.cookie = 'unrelated=keep; path=/';
    disableGoogleAnalytics(gtagWindow(), document, window.location.hostname);
    expect(gtagWindow()['ga-disable-G-08GFGLY4VD']).toBe(true);
    expect(document.cookie).not.toContain('_ga');
    expect(document.cookie).toContain('unrelated=keep');
    document.cookie = 'unrelated=; Max-Age=0; path=/';
  });
});
