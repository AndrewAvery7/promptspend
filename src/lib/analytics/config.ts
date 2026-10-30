/**
 * Google Analytics on the website, configured in one place.
 *
 * Owner decision, 2026-10-06: the website (promptspend.com only - never the
 * VS Code extension, the API or the MCP server; the iOS and Android apps report
 * separately through Firebase, see apps/mobile/src/lib/usageStats.ts) counts visits with
 * Google Analytics 4, which sets cookies. Since 2026-10-30 there is no notice;
 * the footer's "Your privacy choices" link leads to the privacy page's on/off
 * control. Every region is treated the same (owner decision 2026-10-30), Europe,
 * the UK and Switzerland included. The Cloudflare Web Analytics
 * counter stays as well.
 *
 * This module has no imports and reads no `import.meta.env`, because three
 * different builds read it: the browser code, the Content Security Policy in
 * `vite.config.ts`, and the generated pages in `src/lib/seo/render.ts`. One
 * file, so the ID and the origins the policy admits cannot drift apart.
 */

/**
 * THE PAUSE (owner decisions, 2026-10-29).
 *
 * `true`: Google Analytics runs as described under the switch below. It was
 * paused on the morning of 2026-10-29 because the account it reported to had
 * been deleted, and switched back on the same day with a new property owned by
 * info@crestwood.holdings (andrew@averyemail.com is a second administrator).
 *
 * `false`: Google Analytics is off. Nothing from Google loads, no notice
 * shows, the privacy page says the website does not use it, the page policies
 * stop naming Google's hosts, and a visitor who still holds its cookies has
 * them cleared the next time they open the site. Switching it off again means
 * rewriting the privacy page, README, SECURITY.md and ARCHITECTURE.md to
 * "paused" in the same commit. `scripts/lib/privacy-config.test.ts` fails until
 * the privacy page matches, and `npm run check:csp` fails until the policies
 * match.
 */
export const GOOGLE_ANALYTICS_ENABLED: boolean = true;

/** The GA4 web stream's Measurement ID. */
export const GA_MEASUREMENT_ID = 'G-P27XJ53BH9';

/**
 * THE SWITCH.
 *
 * `false` (the owner's choice, 2026-10-06; notice removed 2026-10-30):
 * Google Analytics loads for every visitor, in every region, with no notice.
 * Turning it off is the privacy page's control, reached from
 * the footer's "Your privacy choices" link, or Global Privacy Control.
 * `true`: nothing from Google loads until the visitor clicks "Accept" on a
 * notice.
 *
 * Changing this one word is the whole code change; the notice's wording and
 * buttons follow it. The words that describe it do not change themselves: the
 * privacy page (`src/content/information/privacy.md`) says when Google
 * Analytics loads and how to refuse it, and `scripts/lib/privacy-config.test.ts`
 * fails until those sentences match the switch. README.md ("Privacy,
 * precisely") and SECURITY.md ("Data handling") describe the default too, so
 * reword them in the same commit.
 */
export const ANALYTICS_REQUIRES_CONSENT: boolean = false;

/**
 * The only hosts Google Analytics runs on. Anywhere else - a local build, a
 * test run, a fork published to its own address - nothing loads and no notice
 * shows, so only real visits reach the account.
 */
export const GA_HOSTNAMES: readonly string[] = ['promptspend.com', 'www.promptspend.com'];

/** Where `gtag.js` is loaded from (`script-src`). */
export const GA_SCRIPT_ORIGIN = 'https://www.googletagmanager.com';

/**
 * Where Google Analytics 4 sends its measurements (`connect-src`, and
 * `img-src` for the image fallback). Named one by one rather than with a
 * wildcard: if Google ever moves to a host not listed here, the browser blocks
 * the report, which loses a count and never leaks anything.
 */
export const GA_COLLECT_ORIGINS: readonly string[] = [
  'https://www.google-analytics.com',
  'https://region1.google-analytics.com',
  'https://region1.analytics.google.com',
  // Google signals and ad personalization (owner decision 2026-10-29, "everything
  // Google Analytics offers"): the cross-device and advertising hits.
  'https://stats.g.doubleclick.net',
  'https://googleads.g.doubleclick.net',
  'https://www.google.com',
];

/**
 * Query-string names that carry a private key and are removed from every
 * address before Google sees it: `alerts`, the price-alert preferences link
 * (`/?alerts=<token>`). `src/main.tsx` also takes it out of the address bar
 * before Google Analytics starts; this is the second guard, for the referrer.
 * (The alerts service's own `?t=` key lives on that service's pages, which load
 * no analytics and send no referrer; on this site `t` is a scenario field.)
 * Everything else in the address, scenario and campaign tags included, is sent.
 */
export const PRIVATE_ADDRESS_PARAMS: readonly string[] = ['alerts'];

/** Every Google origin any page's policy admits, for the checks that pin them. */
export const GA_ORIGINS: readonly string[] = [GA_SCRIPT_ORIGIN, ...GA_COLLECT_ORIGINS];

/**
 * The Google origins a page's Content Security Policy actually admits: none
 * while the pause is on. A policy that names hosts nothing loads from is only
 * an open door for a script that got onto the page.
 */
export const GA_POLICY_SCRIPT_ORIGINS: readonly string[] = GOOGLE_ANALYTICS_ENABLED ? [GA_SCRIPT_ORIGIN] : [];
export const GA_POLICY_COLLECT_ORIGINS: readonly string[] = GOOGLE_ANALYTICS_ENABLED
  ? GA_COLLECT_ORIGINS
  : [];

/** The browser-storage key that remembers the visitor's Google Analytics on/off choice (and any answer to the retired notice). */
export const ANALYTICS_CHOICE_KEY = 'ps.analyticsChoice';
