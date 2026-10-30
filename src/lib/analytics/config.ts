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
 * The country versions of Google's site, from Google's own list
 * (https://www.google.com/supported_domains, fetched 2026-10-30), without
 * google.com. A visitor whose Google is one of these (google.de, google.co.uk...)
 * has their Google signals audience report sent to `www.google.<country>`
 * (gtag.js builds `https://www.<domain>/ads/ga-audiences`), so the policy names
 * each one. Without them, Europe's and most other countries' signals reports
 * were blocked (owner decision 2026-10-30: nothing restricted).
 */
export const GOOGLE_COUNTRY_DOMAINS: readonly string[] = /* @__PURE__ */ countryDomains();

// A function marked `@__PURE__`, so the bundler leaves the list out of the
// browser code, which never reads it: only the build's policy and the
// generated pages do.
function countryDomains(): string[] {
  return (
    'ad ae com.af com.ag al am co.ao com.ar as at com.au az ba com.bd be bf bg com.bh bi bj com.bn ' +
    'com.bo com.br bs bt co.bw by com.bz ca cd cf cg ch ci co.ck cl cm cn com.co co.cr com.cu cv ' +
    'com.cy cz de dj dk dm com.do dz com.ec ee com.eg es com.et fi com.fj fm fr ga ge gg com.gh ' +
    'com.gi gl gm gr com.gt gy com.hk hn hr ht hu co.id ie co.il im co.in iq is it je com.jm jo ' +
    'co.jp co.ke com.kh ki kg co.kr com.kw kz la com.lb li lk co.ls lt lu lv com.ly co.ma md me mg ' +
    'mk ml com.mm mn com.mt mu mv mw com.mx com.my co.mz com.na com.ng com.ni ne nl no com.np nr nu ' +
    'co.nz com.om com.pa com.pe com.pg com.ph com.pk pl pn com.pr ps pt com.py com.qa ro ru rw ' +
    'com.sa com.sb sc se com.sg sh si sk com.sl sn so sm sr st com.sv td tg co.th com.tj tl tm tn to ' +
    'com.tr tt com.tw co.tz com.ua co.ug co.uk com.uy co.uz com.vc co.ve co.vi com.vn vu ws rs co.za ' +
    'co.zm co.zw cat'
  )
    .split(' ')
    .map((tld) => `google.${tld}`);
}

/**
 * Where Google Analytics 4 sends its measurements (`connect-src`, and
 * `img-src` for the image fallback): the hosts in Google's Content Security
 * Policy guide for Google Analytics with its advertising features
 * (developers.google.com/tag-platform/security/guides/csp), as gtag.js
 * actually uses them. Named host by host wherever Google's code names one,
 * and never `*.google.com`, which would also admit Google Forms and Docs, a
 * way out for a script that got onto the page. If Google ever moves to a host
 * not listed here, the browser blocks the report, which loses a count and
 * never leaks anything.
 */
export const GA_COLLECT_ORIGINS: readonly string[] = /* @__PURE__ */ collectOrigins();

// Marked `@__PURE__` like the country list, for the same reason.
function collectOrigins(): string[] {
  return [
    // Measurement. gtag.js picks a regional subdomain (region1 today) on its own.
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
    // Google signals and ad personalization (owner decision 2026-10-29, "everything
    // Google Analytics offers"): the cross-device and advertising hits.
    'https://*.g.doubleclick.net',
    'https://www.google.com',
    // User-provided data (the hashed alert-form email) and ad-click registration.
    'https://google.com',
    'https://adservice.google.com',
    'https://pagead2.googlesyndication.com',
    ...GOOGLE_COUNTRY_DOMAINS.map((domain) => `https://www.${domain}`),
  ];
}

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
