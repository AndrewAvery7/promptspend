import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ANALYTICS_CHOICE_KEY,
  ANALYTICS_REQUIRES_CONSENT,
  CONSENT_DENIED_REGIONS,
  GA_COLLECT_ORIGINS,
  GA_MEASUREMENT_ID,
  GA_SCRIPT_ORIGIN,
  PRIVATE_ADDRESS_PARAMS,
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
import { keyEventForClick, sendKeyEvent, storeForAddress } from './events';

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
    expect(GA_MEASUREMENT_ID).toBe('G-P27XJ53BH9');
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
      'https://stats.g.doubleclick.net',
      'https://googleads.g.doubleclick.net',
      'https://www.google.com',
    ]);
  });

  it('treats exactly the alert-link key as private', () => {
    expect(PRIVATE_ADDRESS_PARAMS).toEqual(['alerts']);
  });
});

describe('cleanAddress', () => {
  it('keeps the whole address: path, scenario, campaign tags and fragment', () => {
    const full = 'https://promptspend.com/?m=claude-opus-5&in=1200&out=400&utm_source=linkedin#compare';
    expect(cleanAddress(full)).toBe(full);
    expect(cleanAddress('https://promptspend.com/models/claude-opus-5/?ref=x')).toBe(
      'https://promptspend.com/models/claude-opus-5/?ref=x',
    );
  });

  it("removes an alert link's private key and keeps the rest", () => {
    const cleaned = cleanAddress('https://promptspend.com/?utm_source=email&alerts=PRIVATE-TOKEN-123#data');
    expect(cleaned).toBe('https://promptspend.com/?utm_source=email#data');
    expect(cleaned).not.toContain('PRIVATE');
    // `t` is a scenario field on this site, so it is kept.
    expect(cleanAddress('https://promptspend.com/?m=a&t=6')).toBe('https://promptspend.com/?m=a&t=6');
  });

  it('drops a user name and password', () => {
    expect(cleanAddress('https://user:secret@promptspend.com/x/')).toBe('https://promptspend.com/x/');
  });

  it('keeps a referring page whole', () => {
    expect(cleanAddress('https://news.ycombinator.com/item?id=123')).toBe(
      'https://news.ycombinator.com/item?id=123',
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
  it('takes the private keys out of both the page and the referrer before anything is queued', () => {
    const fields = pageFields({
      location: { href: 'https://promptspend.com/?m=a&alerts=TOKEN#data' },
      referrer: 'https://promptspend.com/models/x/?alerts=TOKEN#y',
      title: 'PromptSpend',
    });
    expect(fields).toEqual({
      page_location: 'https://promptspend.com/?m=a#data',
      page_referrer: 'https://promptspend.com/models/x/#y',
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

  it('loads for every visitor on promptspend.com by default, with no notice', () => {
    expect(shouldLoad(base)).toBe(true);
    // No notice without the consent switch (owner decision 2026-10-30).
    expect(shouldShowNotice(base)).toBe(false);
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
    expect(scripts[0]!.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-P27XJ53BH9');
    expect(GA_SCRIPT_URL).toBe(scripts[0]!.src);
    expect(scripts[0]!.async).toBe(true);
  });

  it('turns on the advertising features and sends one page view without the private key', () => {
    window.history.replaceState(null, '', '/models/claude-opus-5/?m=a-scenario&alerts=TOKEN#data');
    setReferrer('http://localhost:3000/?scenario=1&alerts=KEY#x');
    loadGoogleAnalytics(gtagWindow(), document);

    const queued = commands();
    const location = `${window.location.origin}/models/claude-opus-5/?m=a-scenario#data`;
    const referrer = 'http://localhost:3000/?scenario=1#x';
    const page = { page_location: location, page_referrer: referrer, page_title: document.title };

    expect(queued.map((command) => command[0])).toEqual([
      'consent',
      'consent',
      'js',
      'set',
      'config',
      'event',
    ]);
    expect(queued[0]).toEqual([
      'consent',
      'default',
      {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
        region: [...CONSENT_DENIED_REGIONS],
      },
    ]);
    expect(queued[1]).toEqual([
      'consent',
      'default',
      {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted',
      },
    ]);
    expect(queued[3]).toEqual(['set', { page_referrer: referrer }]);
    expect(queued[4]).toEqual([
      'config',
      'G-P27XJ53BH9',
      { send_page_view: false, allow_google_signals: true, allow_ad_personalization_signals: true },
    ]);
    expect(queued[5]).toEqual(['event', 'page_view', page]);

    // The private keys reach no command; the scenario does.
    const everything = JSON.stringify(queued);
    expect(everything).not.toContain('TOKEN');
    expect(everything).not.toContain('KEY');
    expect(everything).toContain('a-scenario');
  });

  it('denies every consent type in the EEA, the UK and Switzerland, and nowhere else', () => {
    expect(CONSENT_DENIED_REGIONS).toHaveLength(32);
    expect(new Set(CONSENT_DENIED_REGIONS).size).toBe(32);
    for (const code of ['DE', 'FR', 'IE', 'NO', 'IS', 'LI', 'GB', 'CH'])
      expect(CONSENT_DENIED_REGIONS).toContain(code);
    for (const code of ['US', 'CA', 'AU']) expect(CONSENT_DENIED_REGIONS).not.toContain(code);
  });

  it("passes on a visitor's own yes, even when gtag.js is already on the page", () => {
    const win = gtagWindow();
    loadGoogleAnalytics(win, document, true);
    const granted = [
      'consent',
      'update',
      {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted',
      },
    ];
    expect(commands()[2]).toEqual(granted);

    loadGoogleAnalytics(win, document, true);
    expect(commands().at(-1)).toEqual(granted);
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });

  it('queues nothing a visitor typed or pasted', () => {
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
        'region',
        'send_page_view',
      ].sort(),
    );
    document.body.innerHTML = '';
  });

  it('clears an earlier off switch when it is turned back on', () => {
    gtagWindow()['ga-disable-G-P27XJ53BH9'] = true;
    loadGoogleAnalytics(gtagWindow(), document);
    expect(gtagWindow()['ga-disable-G-P27XJ53BH9']).toBe(false);
  });
});

describe('disableGoogleAnalytics', () => {
  it("sets Google's off switch and removes the Google Analytics cookies, and only those", () => {
    document.cookie = '_ga=GA1.1.123.456; path=/';
    document.cookie = '_ga_08GFGLY4VD=GS1.1.789; path=/';
    document.cookie = 'unrelated=keep; path=/';
    disableGoogleAnalytics(gtagWindow(), document, window.location.hostname);
    expect(gtagWindow()['ga-disable-G-P27XJ53BH9']).toBe(true);
    expect(document.cookie).not.toContain('_ga');
    expect(document.cookie).toContain('unrelated=keep');
    document.cookie = 'unrelated=; Max-Age=0; path=/';
  });
});

describe('key events', () => {
  /** The queued key events, as [name, params] pairs. */
  const keyEvents = () =>
    commands()
      .filter((command) => command[0] === 'event' && command[1] !== 'page_view')
      .map((command) => [command[1], command[2]]);

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('recognizes the two store listings and nothing else', () => {
    expect(storeForAddress('https://apps.apple.com/app/id6800386428')).toBe('app_store');
    expect(storeForAddress('https://play.google.com/store/apps/details?id=com.promptspend.app')).toBe(
      'google_play',
    );
    expect(storeForAddress('https://play.google.com/books')).toBeNull();
    expect(storeForAddress('https://example.com/apps.apple.com')).toBeNull();
    expect(storeForAddress('http://apps.apple.com/app/id1')).toBeNull();
    expect(storeForAddress('not an address')).toBeNull();
  });

  it('reads a click on a store badge image as a click on its store link', () => {
    document.body.innerHTML =
      '<a href="https://apps.apple.com/app/id6800386428"><img alt="App Store" /></a><a href="/models/">Models</a>';
    expect(keyEventForClick(document.querySelector('img'))).toEqual({
      name: 'store_click',
      store: 'app_store',
    });
    expect(keyEventForClick(document.querySelector('a[href="/models/"]'))).toBeNull();
  });

  it('reads only the fixed tool labels from a Copy button', () => {
    document.body.innerHTML =
      '<button data-ga-install="mcp">Copy</button><button data-ga-install="something else">Copy</button>';
    const [mcp, other] = Array.from(document.querySelectorAll('button'));
    expect(keyEventForClick(mcp!)).toEqual({ name: 'install_copy', tool: 'mcp' });
    expect(keyEventForClick(other!)).toBeNull();
  });

  it('queues nothing before Google Analytics has loaded, or after it is turned off', () => {
    sendKeyEvent(gtagWindow(), { name: 'model_added', model_id: 'gpt-5' });
    expect(gtagWindow().dataLayer).toBeUndefined();
    loadGoogleAnalytics(gtagWindow(), document);
    disableGoogleAnalytics(gtagWindow(), document, window.location.hostname);
    sendKeyEvent(gtagWindow(), { name: 'model_added', model_id: 'gpt-5' });
    expect(keyEvents()).toEqual([]);
  });

  it('counts a store click and a copy once each once loaded', () => {
    loadGoogleAnalytics(gtagWindow(), document);
    loadGoogleAnalytics(gtagWindow(), document);
    document.body.innerHTML =
      '<a href="https://play.google.com/store/apps/details?id=com.promptspend.app">Play</a><button data-ga-install="vscode">Copy</button>';
    document.querySelector('a')!.addEventListener('click', (event) => event.preventDefault());
    document.querySelector('a')!.click();
    document.querySelector('button')!.click();
    sendKeyEvent(gtagWindow(), { name: 'model_added', model_id: 'claude-opus-5-5' });
    expect(keyEvents()).toEqual([
      ['store_click', { store: 'google_play' }],
      ['install_copy', { tool: 'vscode' }],
      ['model_added', { model_id: 'claude-opus-5-5' }],
    ]);
  });
});
