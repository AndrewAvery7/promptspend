/**
 * Google Analytics on the website, configured in one place.
 *
 * Owner decision, 2026-10-06: the website (promptspend.com only - never the
 * apps, the VS Code extension, the API or the MCP server) counts visits with
 * Google Analytics 4, which sets cookies. Every visitor sees a small notice
 * that says so and links to the privacy page. The Cloudflare Web Analytics
 * counter stays as well.
 *
 * This module has no imports and reads no `import.meta.env`, because three
 * different builds read it: the browser code, the Content Security Policy in
 * `vite.config.ts`, and the generated pages in `src/lib/seo/render.ts`. One
 * file, so the ID and the origins the policy admits cannot drift apart.
 */

/**
 * THE PAUSE (owner decision, 2026-10-29).
 *
 * `false`: Google Analytics is off. Nothing from Google loads, no notice
 * shows, the privacy page says the website does not use it, the page policies
 * stop naming Google's hosts, and a visitor who still holds its cookies from
 * before has them cleared the next time they open the site. `true`: it runs as
 * described under the switch below.
 *
 * Why it is off: no Google Analytics account exists for the website to report
 * to, so visitors were being told their visits were counted when nobody could
 * read the count. Turning it back on is more than this word: create a new
 * property, replace `GA_MEASUREMENT_ID`, and rewrite the privacy page, README,
 * SECURITY.md and ARCHITECTURE.md from "paused" back to "running" BEFORE the
 * deploy. `scripts/lib/privacy-config.test.ts` fails until the privacy page
 * matches, and `npm run check:csp` fails until the policies match.
 */
export const GOOGLE_ANALYTICS_ENABLED: boolean = false;

/** The GA4 web stream's Measurement ID. */
export const GA_MEASUREMENT_ID = 'G-08GFGLY4VD';

/**
 * THE SWITCH.
 *
 * `false` (the owner's choice, 2026-10-06): Google Analytics loads for every
 * visitor, and a notice says so, with a "Turn off" button.
 * `true`: nothing from Google loads until the visitor clicks "Accept".
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
];

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

/** The browser-storage key that remembers the visitor's choice about the notice. */
export const ANALYTICS_CHOICE_KEY = 'ps.analyticsChoice';
