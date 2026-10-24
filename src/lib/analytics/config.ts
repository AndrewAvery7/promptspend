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

/** The browser-storage key that remembers the visitor's choice about the notice. */
export const ANALYTICS_CHOICE_KEY = 'ps.analyticsChoice';
