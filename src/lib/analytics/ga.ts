/**
 * Google Analytics 4 for the website: what it is told, and when it loads.
 *
 * Owner decision, 2026-10-29: use everything Google Analytics offers. Two rules
 * still hold, each enforced here and held by `ga.test.ts`:
 *
 * 1. **No private keys.** The whole address goes to Google, scenario, campaign
 *    tags and `#view` included, except the query-string names in
 *    `PRIVATE_ADDRESS_PARAMS`, an alert link's private key. `src/main.tsx` takes
 *    that key out of the address bar before this code runs, and the cleaning
 *    here is the second guard, which also covers the referrer.
 * 2. **No pasted text.** PromptSpend's code hands `gtag` only the page fields
 *    below and fixed settings. Pasted prompt text is never in the address and
 *    never passed on. (Google's own automatic tracking, which is on, reads
 *    clicks, scrolls, form starts and the address; it does not read what is
 *    typed into a field.)
 *
 * Google signals and ad personalization are on, and every consent type is
 * granted.
 *
 * Whether it loads at all is `shouldLoad`: only on promptspend.com, never after
 * the visitor turned it off, never when the browser sends Global Privacy
 * Control, and - when the switch in `config.ts` asks for consent - only after
 * "Accept".
 */
import {
  ANALYTICS_CHOICE_KEY,
  GA_HOSTNAMES,
  GA_MEASUREMENT_ID,
  GA_SCRIPT_ORIGIN,
  PRIVATE_ADDRESS_PARAMS,
} from './config';

/** What the visitor did with the notice. Absent means they have not chosen. */
export type AnalyticsChoice = 'dismissed' | 'accepted' | 'declined';

const CHOICES: readonly AnalyticsChoice[] = ['dismissed', 'accepted', 'declined'];

/**
 * An address with its private keys removed: the query-string names in
 * `PRIVATE_ADDRESS_PARAMS`, and any user name or password. Everything else is
 * kept, including the rest of the query string and the fragment. Anything that
 * is not an ordinary web address becomes the empty string rather than being
 * passed on unexamined.
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
  url.username = '';
  url.password = '';
  for (const name of PRIVATE_ADDRESS_PARAMS) url.searchParams.delete(name);
  return url.href;
}

/** The three page fields PromptSpend's own code hands Google. */
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
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted',
  });
  gtag('js', new Date());
  // The referrer is set for the whole page, so every later event carries the
  // redacted one. The location is not: Google's history-change page views must
  // read the address as it is then, after the alerts panel has removed its key.
  gtag('set', { page_referrer: page.page_referrer });
  gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: true,
    allow_ad_personalization_signals: true,
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
 * before sending anything. It also removes the cookies (`_ga`, `_ga_<stream>`).
 */
export function disableGoogleAnalytics(win: GtagWindow, doc: Document, hostname: string): void {
  win[DISABLE_FLAG] = true;
  expireCookies(doc, hostname, (name) => name === '_ga' || name.startsWith('_ga_'));
}

/**
 * The stream cookies of Measurement IDs the site no longer reports to. The
 * first property (G-08GFGLY4VD) ran from 2026-10-24 until its account was
 * deleted on 2026-10-29; a visitor from those days still holds its cookie.
 */
const RETIRED_STREAM_COOKIES: readonly string[] = ['_ga_08GFGLY4VD'];

/** Remove the cookies of retired Measurement IDs, and nothing else. */
export function clearRetiredStreamCookies(doc: Document, hostname: string): void {
  expireCookies(doc, hostname, (name) => RETIRED_STREAM_COOKIES.includes(name));
}

/**
 * Expire the matching cookies. They are set on the site's registrable domain,
 * so they are expired there and on the host itself.
 */
function expireCookies(doc: Document, hostname: string, matches: (name: string) => boolean): void {
  const names = doc.cookie
    .split(';')
    .map((pair) => pair.split('=')[0]!.trim())
    .filter(matches);
  const domains = new Set(['', hostname, `.${hostname}`, `.${hostname.replace(/^www\./, '')}`]);
  for (const name of names) {
    for (const domain of domains) {
      doc.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
    }
  }
}
