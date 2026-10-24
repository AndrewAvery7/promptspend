/**
 * Google Analytics 4 for the website: what it is told, and when it loads.
 *
 * Three rules, each enforced here and held by `ga.test.ts`:
 *
 * 1. **Only the page's origin and path.** PromptSpend keeps the current
 *    scenario in the address (`?…`), alert links carry a private token there,
 *    and the calculator's views live after the `#`. None of that is Google's
 *    business, so `page_location` and `page_referrer` are cut down to origin +
 *    path before anything is queued. GA's own automatic page view is switched
 *    off (`send_page_view: false`) and one clean `page_view` is sent instead.
 * 2. **Nothing a visitor types or pastes.** The only values ever handed to
 *    `gtag` are the three page fields below and fixed settings. No form value,
 *    no scenario, no prompt text: pasted text never leaves the device, which is
 *    the one promise every privacy decision here has kept.
 * 3. **No advertising features.** Google signals and ad personalisation are
 *    off, and the ad-related consent types are denied, so Google may count the
 *    visit but not link it to an advertising profile.
 *
 * Whether it loads at all is `shouldLoad`: only on promptspend.com, never after
 * the visitor turned it off, never when the browser sends Global Privacy
 * Control, and - when the switch in `config.ts` asks for consent - only after
 * "Accept".
 */
import { ANALYTICS_CHOICE_KEY, GA_HOSTNAMES, GA_MEASUREMENT_ID, GA_SCRIPT_ORIGIN } from './config';

/** What the visitor did with the notice. Absent means they have not chosen. */
export type AnalyticsChoice = 'dismissed' | 'accepted' | 'declined';

const CHOICES: readonly AnalyticsChoice[] = ['dismissed', 'accepted', 'declined'];

/**
 * An address cut down to its origin and path: no query string, no fragment, no
 * user name or password. Anything that is not an ordinary web address becomes
 * the empty string rather than being passed on unexamined.
 */
export function cleanAddress(address: string | null | undefined): string {
  if (!address) return '';
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  return `${url.origin}${url.pathname}`;
}

/** The three page fields Google receives, and nothing else. */
export interface PageFields {
  page_location: string;
  page_referrer: string;
  page_title: string;
}

export function pageFields(
  doc: Pick<Document, 'referrer' | 'title'> & { location: { href: string } },
): PageFields {
  return {
    page_location: cleanAddress(doc.location.href),
    page_referrer: cleanAddress(doc.referrer),
    page_title: doc.title,
  };
}

export interface LoadDecision {
  hostname: string;
  choice: AnalyticsChoice | null;
  requiresConsent: boolean;
  /** The browser sends Global Privacy Control (`navigator.globalPrivacyControl`). */
  globalPrivacyControl: boolean;
}

/** Whether Google Analytics may load on this page view. */
export function shouldLoad(d: LoadDecision): boolean {
  if (!GA_HOSTNAMES.includes(d.hostname)) return false;
  if (d.choice === 'declined') return false;
  // In consent mode an explicit "Accept" is the visitor's own answer, and it
  // is the only thing that loads Google. Without consent mode, a browser that
  // asks every site not to share data gets that without having to click.
  if (d.requiresConsent) return d.choice === 'accepted';
  return !d.globalPrivacyControl;
}

/** Whether the notice is shown on this page view. */
export function shouldShowNotice(d: LoadDecision): boolean {
  if (!GA_HOSTNAMES.includes(d.hostname)) return false;
  // Consent mode keeps asking until there is an answer; a notice merely
  // dismissed under the old mode is not one.
  if (d.requiresConsent) return d.choice !== 'accepted' && d.choice !== 'declined';
  // Nothing loads for a Global Privacy Control browser, so there is nothing to
  // give notice of.
  return d.choice === null && !d.globalPrivacyControl;
}

/** Storage can be missing or refuse access (private modes, blocked storage). */
export function readChoice(storage: Pick<Storage, 'getItem'> | undefined): AnalyticsChoice | null {
  try {
    const value = storage?.getItem(ANALYTICS_CHOICE_KEY);
    return CHOICES.includes(value as AnalyticsChoice) ? (value as AnalyticsChoice) : null;
  } catch {
    return null;
  }
}

export function writeChoice(storage: Pick<Storage, 'setItem'> | undefined, choice: AnalyticsChoice): void {
  try {
    storage?.setItem(ANALYTICS_CHOICE_KEY, choice);
  } catch {
    /* the choice holds for this page view only */
  }
}

/** The page globals `gtag.js` reads. */
export interface GtagWindow {
  dataLayer?: unknown[];
  [disableFlag: `ga-disable-${string}`]: boolean | undefined;
}

const DISABLE_FLAG = `ga-disable-${GA_MEASUREMENT_ID}` as const;

/** The script tag's address. */
export const GA_SCRIPT_URL = `${GA_SCRIPT_ORIGIN}/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;

/**
 * Queue the configuration and one clean page view, then add `gtag.js`.
 * Safe to call twice: the second call does nothing.
 */
export function loadGoogleAnalytics(win: GtagWindow, doc: Document): void {
  win[DISABLE_FLAG] = false;
  if (doc.querySelector(`script[src="${GA_SCRIPT_URL}"]`)) return;

  const layer = (win.dataLayer = win.dataLayer ?? []);
  // `gtag.js` reads each queued command as an `arguments` object, not an
  // array, which is why this is the one place a rest parameter will not do.
  function gtag(..._command: unknown[]): void {
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments);
  }

  const page = pageFields(doc);
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
  });
  gtag('js', new Date());
  // `set` as well as `config`, so every later event Google sends on this page
  // (engagement time, scrolls) carries the clean address too.
  gtag('set', page);
  gtag('config', GA_MEASUREMENT_ID, {
    ...page,
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  gtag('event', 'page_view', page);

  const script = doc.createElement('script');
  script.async = true;
  script.src = GA_SCRIPT_URL;
  doc.head.append(script);
}

/**
 * Stop Google Analytics on this page and remove its cookies.
 *
 * `ga-disable-<id>` is Google's documented off switch: `gtag.js` checks it
 * before sending anything. The cookies (`_ga`, `_ga_<stream>`) are set on the
 * site's registrable domain, so they are expired there and on the host itself.
 */
export function disableGoogleAnalytics(win: GtagWindow, doc: Document, hostname: string): void {
  win[DISABLE_FLAG] = true;
  const names = doc.cookie
    .split(';')
    .map((pair) => pair.split('=')[0]!.trim())
    .filter((name) => name === '_ga' || name.startsWith('_ga_'));
  const domains = new Set(['', hostname, `.${hostname}`, `.${hostname.replace(/^www\./, '')}`]);
  for (const name of names) {
    for (const domain of domains) {
      doc.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
    }
  }
}
