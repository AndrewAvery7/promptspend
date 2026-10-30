/**
 * The website's Google Analytics notice, and the on/off control on the
 * privacy page.
 *
 * Plain DOM rather than a React component, because the same few lines have to
 * run on three kinds of page - the calculator, the Receipt page and every
 * generated page (through the site header's script) - and only one of those
 * owns a React tree that covers the whole page. Called once per page by
 * `startAnalytics()` from each entry point.
 *
 * The notice shows only when the switch in `config.ts` asks for consent
 * (it has been off since 2026-10-30): small, at the foot of the window, never
 * taking focus, naming the privacy page, with Accept / Decline. Without it,
 * the privacy page's control, linked from every footer as "Your privacy
 * choices", is how a visitor turns Google Analytics off.
 */
import { ANALYTICS_REQUIRES_CONSENT, GA_HOSTNAMES, GOOGLE_ANALYTICS_ENABLED } from './config';
import {
  clearRetiredStreamCookies,
  disableGoogleAnalytics,
  loadGoogleAnalytics,
  readChoice,
  shouldLoad,
  shouldShowNotice,
  writeChoice,
  type AnalyticsChoice,
  type GtagWindow,
  type LoadDecision,
} from './ga';
import '@/styles/analytics.css';

/** The privacy page puts an empty element with this id where the control goes. */
export const PRIVACY_CONTROL_ID = 'analytics-choice';

export interface AnalyticsEnvironment {
  window: Window;
  document: Document;
  storage: Storage | undefined;
  /** False while Google Analytics is paused (`GOOGLE_ANALYTICS_ENABLED`): load nothing, show nothing. */
  enabled: boolean;
  requiresConsent: boolean;
  /** Where the privacy page is, for the notice's link. */
  privacyHref: string;
}

function defaultEnvironment(): AnalyticsEnvironment {
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  return {
    window,
    document,
    storage,
    enabled: GOOGLE_ANALYTICS_ENABLED,
    requiresConsent: ANALYTICS_REQUIRES_CONSENT,
    privacyHref: `${import.meta.env.BASE_URL}privacy/`,
  };
}

function decision(env: AnalyticsEnvironment): LoadDecision {
  const navigator = env.window.navigator as Navigator & { globalPrivacyControl?: boolean };
  return {
    hostname: env.window.location.hostname,
    choice: readChoice(env.storage),
    requiresConsent: env.requiresConsent,
    globalPrivacyControl: navigator.globalPrivacyControl === true,
  };
}

const gtagWindow = (env: AnalyticsEnvironment) => env.window as unknown as GtagWindow;

function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Draw the notice at the foot of the page. */
export function showNotice(env: AnalyticsEnvironment): HTMLElement {
  const doc = env.document;
  const notice = element(doc, 'section', 'ga-notice');
  notice.setAttribute('aria-label', 'Analytics notice');

  const text = element(
    doc,
    'p',
    'ga-notice__text',
    'PromptSpend would like to use Google Analytics cookies to count visits. Nothing from Google loads unless you accept. Google would get the page you are on, never text you paste, and could use the visit for its advertising features. ',
  );
  const link = element(doc, 'a', 'ga-notice__link', 'Privacy policy');
  link.href = env.privacyHref;
  text.append(link);

  const actions = element(doc, 'div', 'ga-notice__actions');
  const choose = (choice: AnalyticsChoice) => () => {
    writeChoice(env.storage, choice);
    notice.remove();
    if (choice === 'accepted') loadGoogleAnalytics(gtagWindow(env), doc);
    if (choice === 'declined') disableGoogleAnalytics(gtagWindow(env), doc, env.window.location.hostname);
    renderPrivacyControl(env);
  };
  const buttons: [string, AnalyticsChoice][] = [
    ['Accept', 'accepted'],
    ['Decline', 'declined'],
  ];
  for (const [label, choice] of buttons) {
    const button = element(
      doc,
      'button',
      choice === 'declined' ? 'ga-notice__button ga-notice__button--quiet' : 'ga-notice__button',
      label,
    );
    button.type = 'button';
    button.addEventListener('click', choose(choice));
    actions.append(button);
  }

  notice.append(text, actions);
  doc.body.append(notice);
  return notice;
}

/**
 * The privacy page's control: says whether Google Analytics is on in this
 * browser and lets the visitor change that at any time. The page ships with a
 * sentence for readers without JavaScript, which this replaces.
 */
export function renderPrivacyControl(env: AnalyticsEnvironment): void {
  if (!env.enabled) return;
  const doc = env.document;
  const mount = doc.getElementById(PRIVACY_CONTROL_ID);
  if (!mount) return;
  mount.replaceChildren();
  mount.setAttribute('role', 'status');

  const d = decision(env);
  if (!GA_HOSTNAMES.includes(d.hostname)) {
    mount.append(
      element(
        doc,
        'p',
        'ga-choice__state',
        'Google Analytics runs only on promptspend.com, so it is not running on this copy of the site.',
      ),
    );
    return;
  }

  const on = shouldLoad(d);
  const state = on
    ? 'Google Analytics is on in this browser.'
    : d.globalPrivacyControl && d.choice !== 'declined' && !env.requiresConsent
      ? 'Google Analytics is off in this browser, because it sends Global Privacy Control.'
      : 'Google Analytics is off in this browser.';
  mount.append(element(doc, 'p', 'ga-choice__state', state));
  if (!on && d.globalPrivacyControl && !env.requiresConsent) return;

  const button = element(
    doc,
    'button',
    'ga-notice__button',
    on ? 'Turn off Google Analytics' : 'Turn Google Analytics on',
  );
  button.type = 'button';
  button.addEventListener('click', () => {
    if (on) {
      writeChoice(env.storage, 'declined');
      disableGoogleAnalytics(gtagWindow(env), doc, d.hostname);
    } else {
      writeChoice(env.storage, 'accepted');
      loadGoogleAnalytics(gtagWindow(env), doc);
    }
    doc.querySelector('.ga-notice')?.remove();
    renderPrivacyControl(env);
  });
  mount.append(button);
}

/**
 * While Google Analytics is paused: load nothing, show nothing, and clear the
 * `_ga` cookies an earlier visit left on the site's own address. This is the
 * same cleanup "Turn off" does, and it touches no other cookie.
 */
function retireAnalytics(env: AnalyticsEnvironment): void {
  const hostname = env.window.location.hostname;
  if (GA_HOSTNAMES.includes(hostname)) disableGoogleAnalytics(gtagWindow(env), env.document, hostname);
}

/** Run once per page: load Google Analytics if allowed, and show the notice if due. */
export function startAnalytics(env: AnalyticsEnvironment = defaultEnvironment()): void {
  if (!env.enabled) {
    retireAnalytics(env);
    return;
  }
  const hostname = env.window.location.hostname;
  if (GA_HOSTNAMES.includes(hostname)) clearRetiredStreamCookies(env.document, hostname);
  const d = decision(env);
  if (shouldLoad(d)) loadGoogleAnalytics(gtagWindow(env), env.document);
  if (shouldShowNotice(d)) showNotice(env);
  renderPrivacyControl(env);
}
