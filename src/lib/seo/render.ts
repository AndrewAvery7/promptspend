/**
 * The generated pages, as HTML strings.
 *
 * Three deliberate constraints, each of which is the reason for the next:
 *
 * 1. **Complete without JavaScript.** These pages state numbers, and every one
 *    of them must be in the HTML: a crawler, a reader on a hostile network and
 *    anything that does not run scripts all get the whole page. Since
 *    2026-10-06 (owner decision) a page may add *PromptSpend's own* scripts on
 *    top, served from this site (`script-src 'self'`), to make a chart
 *    interactive or a table filterable — enhancement, never content. No inline
 *    script and no third-party script beyond the approved two: the JSON-LD
 *    data block is admitted by its hash, Cloudflare adds the Web Analytics
 *    beacon (owner-approved 2026-10-05) as it serves the page, and the site
 *    header's script adds Google Analytics while it runs (owner decision 2026-10-06; paused since 2026-10-29).
 * 2. **Therefore a very tight Content Security Policy** — `default-src 'none'`,
 *    with the JSON-LD admitted by its exact SHA-256 rather than by
 *    `'unsafe-inline'`. The hash is computed over the string that is actually
 *    emitted (see `hashInline`), so the two cannot drift apart.
 * 3. **Therefore almost no external anything**: no fonts but this site's own (the
 *    header's typefaces, `font-src 'self'`), no third-party
 *    images beyond the listing badges in the footer. Those are same-origin
 *    copies, except LaunchNest's: its verifier refuses a copy, so - approved
 *    2026-10-05 - its image loads from launchnest.io, with no referrer, and
 *    `img-src` admits that one origin. The Cloudflare beacon's script is
 *    another (`script-src`); it posts only to this site. Google Analytics is
 *    the last, and only while it runs (it is paused since 2026-10-29, so the policy names no Google host): its script host, and the collection hosts it reports to in
 *    `connect-src` and `img-src`, all named in `src/lib/analytics/config.ts`.
 *
 * Every string that reaches the output goes through `escapeHtml`. Catalog data
 * is not user input, but it is *upstream* input — it arrives from LiteLLM and
 * OpenRouter — and a display name is exactly the field an injection would ride
 * in on.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Header } from '../../components/Header';
import { DEFAULT_SCENARIO, encodeScenario } from '../url/scenario';
import { GA_POLICY_COLLECT_ORIGINS, GA_POLICY_SCRIPT_ORIGINS } from '../analytics/config';
import { formatContext, formatMoney, formatPercent } from '../engine/format';
import type { PriceHistory } from '../pricing/history';
import type { Model, Pricing } from '../pricing/types';
import {
  changesFaq,
  comparisonFaq,
  freeTierFaq,
  modelFaq,
  providerFaq,
  tokenCounterFaq,
  type Faq,
} from './faq';
import { tokenizerAttributes, type TokenCounterInput } from './token-counter-page';
import { FRAMING_CAVEAT } from '../tokenize';
import type { ChangeRow, ChangesPageInput } from './changes-page';
import { priceChartSvg } from './price-chart';
import {
  correctionCount,
  hasChartableMove,
  modelHistory,
  recentRepricings,
  type RateChange,
} from './price-history-view';
import { promoFor, promoTitle, type RateField } from '../pricing/promo';
import {
  APP_PAGE_PATH,
  APP_STORE_ID,
  APP_STORE_URL,
  GOOGLE_PLAY_URL,
  MCP_PACKAGE_URL,
  NAV_LABELS,
  OPEN_VSX_URL,
  PRIVACY_PATH,
  SUPPORT_PATH,
  VSCODE_MARKETPLACE_URL,
} from '../links';
import {
  blendedRate,
  type ComparisonPage,
  type IndexPage,
  type ModelPage,
  type PageSet,
  type ProviderPage,
  type RetiredComparisonPage,
} from './pages';
import type { FreeTierRecord } from '../free-tiers/types';
import {
  FREE_TIERS_PATH,
  TOPIC_SECTIONS,
  VERDICT_LABEL,
  type CheckedFact,
  type FreeTierPage,
  type FreeTierPageSet,
} from './free-tier-pages';

export interface RenderContext {
  /** Absolute origin the build is served from, no trailing slash. */
  siteUrl: string;
  /** Path the site is mounted at: `/` on a custom domain, `/promptspend/` on
   *  a GitHub Pages project URL. */
  basePath: string;
  /** Site-relative href of the shared stylesheet. */
  cssPath: string;
  /**
   * SHA-256 of a string, base64, without the `sha256-` prefix.
   *
   * Injected rather than imported so this module stays free of `node:crypto`
   * and can be exercised in the browser-shaped test environment the rest of
   * `src/lib` uses.
   */
  hashInline: (content: string) => string;
  /** When the catalog behind these numbers was generated. */
  generatedAt: string;
  /**
   * Origin of the public pricing API, no trailing slash.
   *
   * These pages are the most-crawled surface here, and `llms.txt` tells anything
   * reading them to prefer the API over scraping — while their own footer, until
   * now, offered no way to reach it. Two generated artifacts disagreeing about
   * how a machine should read the catalog is the kind of thing nobody notices
   * because each one looks fine alone.
   */
  apiUrl: string;
  /**
   * The figures the calculator's footer prints under its links: how many models
   * the catalog tracks and when prices last moved and sources were last read.
   * Optional so a test context need not invent them; the build always supplies
   * them, and the row is left out where they are absent.
   */
  freshness?: {
    models: number;
    pricesChangedOn: string | null;
    sourcesCheckedOn: string | null;
    /** The last sync degraded: the header's dot goes red and says "last clean check". */
    degraded: boolean;
  };
  /**
   * The site's own header script and stylesheets, as site paths. They make the
   * header the page already contains interactive (search, appearance, theme).
   * Optional: without them the header is still there, as plain HTML, which is
   * also what a visitor without scripts gets.
   */
  /**
   * The freshness tape, as HTML, drawn from the same `Ticker` the calculator
   * runs and placed above the header on every page. Supplied by the build, which
   * holds the catalog; left out of a test context.
   */
  ticker?: string;
  /**
   * The published price history, for the "Price history" section of a model page
   * and the recent-changes list on the models index. Optional so a test context
   * need not build one; without it those sections are left out rather than
   * claiming "no changes" about data nobody loaded.
   */
  history?: PriceHistory;
  /** The token counter's own script, as a site path; the page has no counting without it. */
  tokenCounterScript?: string;
  chrome?: {
    /** The live header: a deferred module. */
    script: string;
    /**
     * The header's typefaces, asked for before the stylesheet has been read. A
     * font the page learns about from its CSS is fetched only once text that
     * needs it is laid out, so the header was drawn in a stand-in face and then
     * redrawn, with the buttons on its right moving as the widths changed.
     */
    fonts: readonly string[];
    /** Applies the saved theme before first paint: a tiny blocking script. */
    themeInit: string;
    styles: readonly string[];
  };
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/**
 * JSON safe to sit inside a `<script>` element.
 *
 * `</script>` anywhere in the data — including inside a string — ends the
 * element early and turns the rest of the block into markup. Escaping `<`
 * removes the possibility entirely and stays valid JSON.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** The pill beside a non-current row. `deprecated` is the catalog's word for a
 *  model its vendor has shut down; "retired" is what a reader needs to hear. */
function statusPill(model: Model): string {
  return model.status === 'deprecated' ? 'retired' : model.status;
}

function href(ctx: RenderContext, path: string): string {
  return `${ctx.basePath}${path.replace(/^\//, '')}`;
}

function absolute(ctx: RenderContext, path: string): string {
  return `${ctx.siteUrl}${path}`;
}

/** `$5` per 1M becomes `$0.005` per 1K — the unit half the world quotes in. */
function perThousand(dollarsPerMillion: number): string {
  const value = dollarsPerMillion / 1000;
  if (value === 0) return '$0';
  return `$${Number(value.toPrecision(3))}`;
}

function rate(dollarsPerMillion: number): string {
  return `$${Number(dollarsPerMillion.toFixed(4))}`;
}

/**
 * The marker beside a promotional figure — the same markup `PromoRate.tsx`
 * renders in the app, as a string. A native `title` for pointers and the same
 * sentence as hidden text for screen readers; the glyph is decoration. Empty
 * when the cell is at the standard rate, which is the usual case.
 *
 * `effective` must be what `effectivePricing` returned for `model.pricing` on
 * the page's `asOf` — every page carries that, so no date is parsed here.
 */
function promoIcon(model: Model, effective: Pricing, field: RateField): string {
  const promo = promoFor(model.pricing, effective, field);
  if (!promo) return '';
  const title = escapeHtml(promoTitle(promo));
  return (
    `<span class="rate-promo" title="${title}">` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
    `<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none"/></svg>` +
    `<span class="visually-hidden"> (${title})</span></span>`
  );
}

/** A rate cell's content: the figure in force, marked when promotional. */
function rateCell(model: Model, effective: Pricing, field: RateField): string {
  const value = effective[field];
  if (value === undefined) return '<span class="muted">not published</span>';
  return `${escapeHtml(rate(value))}${promoIcon(model, effective, field)}`;
}

interface Crumb {
  label: string;
  path: string | null;
}

function breadcrumbHtml(ctx: RenderContext, crumbs: Crumb[]): string {
  const parts = crumbs.map((crumb) =>
    crumb.path === null
      ? `<span aria-current="page">${escapeHtml(crumb.label)}</span>`
      : `<a href="${escapeHtml(href(ctx, crumb.path))}">${escapeHtml(crumb.label)}</a>`,
  );
  return `<nav class="crumbs" aria-label="Breadcrumb">${parts.join('<span>/</span>')}</nav>`;
}

function breadcrumbLd(ctx: RenderContext, crumbs: Crumb[], selfPath: string): unknown {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: absolute(ctx, crumb.path ?? selfPath),
    })),
  };
}

export interface LayoutInput {
  path: string;
  /** Where the canonical link points, when it is not `path` itself. Only a
   *  `noindex` signpost should ever set this; see `renderRetiredComparisonPage`. */
  canonicalPath?: string;
  /** A `<meta name="robots">` value, e.g. `noindex, follow`. Omitted means
   *  indexable, which is every page except the signposts. */
  robots?: string;
  title: string;
  description: string;
  /** Extra `<head>` markup for one page, e.g. the app page's Smart App Banner tag. */
  extraHead?: string;
  /** Nodes for the JSON-LD `@graph`. */
  graph: unknown[];
  body: string;
  /**
   * PromptSpend's own scripts for this page, as site paths (`/assets/x.js`),
   * loaded as deferred modules from this origin. Enhancement only: the page
   * must read completely without them, which the no-JavaScript browser tests
   * check. Never a remote URL; `layout` refuses one rather than widen the policy.
   */
  scripts?: readonly string[];
  /**
   * The apps band at the top of the footer: both store badges and both QR codes.
   * On by default, so every page offers the apps. Off only on the app page
   * itself, which already shows the same badges and codes as its content.
   */
  appBand?: boolean;
}

export function layout(ctx: RenderContext, input: LayoutInput): string {
  const canonical = absolute(ctx, input.canonicalPath ?? input.path);
  const ld = jsonForScript({ '@context': 'https://schema.org', '@graph': input.graph });
  const scripts = input.scripts ?? [];
  // The header's typefaces are asked for first, ahead of every stylesheet, so
  // their fetch starts with the page; then the header's own stylesheet and the
  // blocking theme script that sets data-theme before first paint.
  const fontLinks = (ctx.chrome?.fonts ?? [])
    .map(
      (font) =>
        `    <link rel="preload" href="${escapeHtml(href(ctx, font))}" as="font" type="font/woff2" crossorigin />
`,
    )
    .join('');
  const chromeLinks = ctx.chrome
    ? [
        ...ctx.chrome.styles.map(
          (sheet) => `    <link rel="stylesheet" href="${escapeHtml(href(ctx, sheet))}" />
`,
        ),
        `    <script src="${escapeHtml(href(ctx, ctx.chrome.themeInit))}"></script>
`,
      ].join('')
    : '';
  for (const src of scripts) {
    if (!src.startsWith('/') || src.startsWith('//')) {
      throw new Error(`layout: script "${src}" must be a path on this site, not a URL`);
    }
  }
  // `'self'` admits PromptSpend's own script files. The data block is named by
  // its own hash: `'unsafe-inline'` would be one word shorter and would also
  // permit every future inline script, which nothing here needs. Google
  // Analytics (owner decision 2026-10-06) is loaded by the site header's own
  // script and reports to the hosts listed in `src/lib/analytics/config.ts`.
  // The Google origins are in the policy only while Google Analytics is
  // running (`GOOGLE_ANALYTICS_ENABLED`); while it is paused there are none.
  const sources = (...parts: (string | readonly string[])[]): string => parts.flat().join(' ');
  const csp = [
    "default-src 'none'",
    "style-src 'self'",
    "font-src 'self'",
    `img-src ${sources("'self' data: https://launchnest.io", GA_POLICY_SCRIPT_ORIGINS, GA_POLICY_COLLECT_ORIGINS)}`,
    `script-src ${sources(`'self' 'sha256-${ctx.hashInline(ld)}' https://static.cloudflareinsights.com`, GA_POLICY_SCRIPT_ORIGINS)}`,
    `connect-src ${sources("'self'", GA_POLICY_SCRIPT_ORIGINS, GA_POLICY_COLLECT_ORIGINS)}`,
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.title)}</title>
    <meta name="description" content="${escapeHtml(input.description)}" />
    <meta name="color-scheme" content="light dark" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <link rel="alternate" type="application/atom+xml" title="PromptSpend price changes" href="${escapeHtml(absolute(ctx, '/feed.xml'))}" />
${input.robots ? `    <meta name="robots" content="${escapeHtml(input.robots)}" />\n` : ''}    <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
${input.extraHead ?? ''}    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="PromptSpend" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:title" content="${escapeHtml(input.title)}" />
    <meta property="og:description" content="${escapeHtml(input.description)}" />
    <meta property="og:image" content="${escapeHtml(absolute(ctx, '/social-card.png?v=b75d1de1'))}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${escapeHtml(absolute(ctx, '/social-card.png?v=b75d1de1'))}" />
${fontLinks}    <link rel="stylesheet" href="${escapeHtml(href(ctx, ctx.cssPath))}" />
${chromeLinks}    <link rel="icon" href="${escapeHtml(href(ctx, '/favicon.ico'))}" sizes="any" />
    <link rel="icon" href="${escapeHtml(href(ctx, '/favicon.svg'))}" type="image/svg+xml" />
    <script type="application/ld+json">${ld}</script>
${[...(ctx.chrome ? [ctx.chrome.script] : []), ...scripts]
  .map(
    (src) => `    <script type="module" src="${escapeHtml(href(ctx, src))}"></script>
`,
  )
  .join('')}  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
${
  ctx.ticker
    ? `    ${ctx.ticker}
`
    : ''
}${siteHeader(ctx, input.path)}
    <div class="wrap">
${input.body}
      <p class="credit">
        Standard-tier, global-endpoint list prices in USD. This build read the catalog generated ${escapeHtml(ctx.generatedAt.slice(0, 10))}.
      </p>
    </div>
${siteFooter(ctx, input)}
  </body>
</html>
`;
}

/**
 * The header every generated page opens with: the calculator's own `Header`,
 * drawn to static HTML here at build time, so the markup is the same element for
 * element and cannot be hand-copied wrong. It is complete without scripts;
 * `src/chrome/site-header.tsx` replaces it with the live component, which is what
 * makes search, the appearance picker and the theme switch work. Its views are
 * links into the calculator, which honors `/#compare` and the others.
 *
 * The wrapper is `display: contents` (see `css.ts`) so the header still sticks
 * to the top of the window: a sticky box only sticks inside its parent.
 */
function siteHeader(ctx: RenderContext, currentPath: string): string {
  const current = currentPath.startsWith(FREE_TIERS_PATH)
    ? 'freeTiers'
    : currentPath.startsWith('/receipt/')
      ? 'receipt'
      : undefined;
  const f = ctx.freshness;
  const markup = renderToStaticMarkup(
    createElement(Header, {
      base: ctx.basePath,
      view: null,
      current,
      onView: () => undefined,
      pricesChangedOn: f?.pricesChangedOn ?? null,
      sourcesCheckedOn: f?.sourcesCheckedOn ?? null,
      degraded: f?.degraded ?? false,
      freshnessLoading: f === undefined,
      tourActive: false,
      tourPulse: false,
      onTour: () => undefined,
      onCommandPalette: () => undefined,
      theme: 'light',
      accent: 'cobalt',
      canvas: 'cool',
      onTheme: () => undefined,
      onAccent: () => undefined,
      onCanvas: () => undefined,
    }),
  );
  const data = [
    ['data-base', ctx.basePath],
    ['data-current', current ?? ''],
    ['data-prices-changed', f?.pricesChangedOn ?? ''],
    ['data-sources-checked', f?.sourcesCheckedOn ?? ''],
    ['data-degraded', f?.degraded ? '1' : '0'],
    ['data-unknown', f ? '0' : '1'],
  ]
    .map(([name, value]) => `${name}="${escapeHtml(value!)}"`)
    .join(' ');
  return `    <div id="site-header" ${data}>${markup}</div>`;
}

/**
 * The apps band, the first block of every footer: what `SiteFooter.tsx` draws
 * with `StoreBadges` and `StoreQrCodes`, as HTML. The QR codes hide themselves
 * on a phone, where a code on the screen in your hand cannot be scanned.
 */
function appBand(ctx: RenderContext): string {
  const store = (url: string) => `href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"`;
  const asset = (path: string) => escapeHtml(href(ctx, path));
  return `        <section class="footer__apps" aria-labelledby="footer-apps-title">
          <div class="footer__apps-text">
            <p class="footer__apps-title" id="footer-apps-title">PromptSpend on iPhone and Android</p>
            <p class="footer__apps-sub">The same catalog, sources and dates, built for a phone. Free, no account, no ads.</p>
          </div>
          <div class="store-badges">
            <a ${store(APP_STORE_URL)}><img src="${asset('/store/app-store-badge.svg')}" alt="Download on the App Store" width="120" height="40" /></a>
            <a ${store(GOOGLE_PLAY_URL)}><img src="${asset('/store/google-play-badge.png')}" alt="Get it on Google Play" width="134" height="40" /></a>
          </div>
          <div class="store-qr">
            <a class="store-qr__code" ${store(APP_STORE_URL)}><img src="${asset('/store/qr-ios.svg')}" alt="QR code: PromptSpend on the App Store" width="92" height="92" /><span>iPhone</span></a>
            <a class="store-qr__code" ${store(GOOGLE_PLAY_URL)}><img src="${asset('/store/qr-android.svg')}" alt="QR code: PromptSpend on Google Play" width="92" height="92" /><span>Android</span></a>
          </div>
          <p class="footer__apps-credit">${escapeHtml(ANDROID_ROBOT_CREDIT)}</p>
        </section>
`;
}

/** The calculator footer's counts row, as HTML; empty where the figures are not known. */
function footerStats(ctx: RenderContext): string {
  const f = ctx.freshness;
  if (!f) return '';
  const changed = f.pricesChangedOn ?? 'no change recorded since tracking began';
  const checked = f.sourcesCheckedOn ? ` &middot; sources checked ${escapeHtml(f.sourcesCheckedOn)}` : '';
  return `
          <span class="footer__stats">${f.models} models &middot; prices last changed ${escapeHtml(changed)}${checked}</span>`;
}

/**
 * The footer every generated page closes with, identical in content to the
 * calculator's (`SiteFooter.tsx`): the apps band, the links in four headed
 * columns, the "Listed on" badges and a last line with the license and the
 * counts. It carries no note of its own - the
 * "where these prices come from" sentence sits at the foot of each page's
 * content - because a page with a different footer is a page that reads as a
 * different site. `SiteChrome.test.tsx` fails if the two drift.
 */
function siteFooter(ctx: RenderContext, input: LayoutInput): string {
  const external = 'target="_blank" rel="noreferrer noopener"';
  return `    <footer class="footer">
      <div class="footer__inner">
${input.appBand === false ? '' : appBand(ctx)}        <div class="footer__cols">
          <div class="footer__brand">
            <p class="footer__brand-name">PromptSpend</p>
            <p>LLM API prices that show their work. Open source, no accounts, no ads.</p>
            <a class="footer__gh" href="https://github.com/AndrewAvery7/promptspend">Star it on GitHub</a>
          </div>
          <nav class="footer__col" aria-labelledby="footer-col-prices">
            <h2 id="footer-col-prices">Prices</h2>
            <ul>
              <li><a href="${escapeHtml(href(ctx, '/models/'))}">All model prices</a></li>
              <li><a href="${escapeHtml(href(ctx, '/providers/'))}">By provider</a></li>
              <li><a href="${escapeHtml(href(ctx, FREE_TIERS_PATH))}">${escapeHtml(NAV_LABELS.freeTiers)}</a></li>
              <li><a href="${escapeHtml(href(ctx, CHANGES_PATH))}">Price changes</a></li>
            </ul>
          </nav>
          <nav class="footer__col" aria-labelledby="footer-col-tools">
            <h2 id="footer-col-tools">Tools</h2>
            <ul>
              <li><a href="${escapeHtml(href(ctx, '/compare/'))}">Comparisons</a></li>
              <li><a href="${escapeHtml(href(ctx, TOKEN_COUNTER_PATH))}">Token counter</a></li>
              <li><a href="${escapeHtml(ctx.apiUrl)}">Pricing API</a></li>
              <li><a href="${escapeHtml(href(ctx, DATA_PAGE_PATH))}">Open data</a></li>
            </ul>
          </nav>
          <nav class="footer__col" aria-labelledby="footer-col-elsewhere">
            <h2 id="footer-col-elsewhere">Use it elsewhere</h2>
            <ul>
              <li><a href="${escapeHtml(href(ctx, APP_PAGE_PATH))}">iPhone &amp; Android apps</a></li>
              <li><a href="${escapeHtml(MCP_PACKAGE_URL)}" ${external}>MCP server</a></li>
              <li><a href="${escapeHtml(VSCODE_MARKETPLACE_URL)}" ${external}>VS Code extension</a></li>
              <li><a href="${escapeHtml(OPEN_VSX_URL)}" ${external}>Open VSX</a></li>
            </ul>
          </nav>
          <nav class="footer__col" aria-labelledby="footer-col-about">
            <h2 id="footer-col-about">About</h2>
            <ul>
              <li><a href="${escapeHtml(href(ctx, WRITING_INDEX_PATH))}">Writing</a></li>
              <li><a href="${escapeHtml(href(ctx, SUPPORT_PATH))}">Support</a></li>
              <li><a href="${escapeHtml(href(ctx, PRIVACY_PATH))}">Privacy</a></li>
              <li><a href="mailto:info@promptspend.com">info@promptspend.com</a></li>
            </ul>
          </nav>
        </div>
        <div class="footer__badge">
          <span class="footer__listed">Listed on</span>
          <a href="https://sellwithboost.com" target="_blank" rel="noopener noreferrer">
            <picture>
              <source srcset="${escapeHtml(href(ctx, '/sellwithboost-dark.svg'))}" media="(prefers-color-scheme: dark)" />
              <img src="${escapeHtml(href(ctx, '/sellwithboost-light.svg'))}" alt="Listed on Sell With boost" width="104" height="40" />
            </picture>
          </a>
          <a href="https://peerpush.com/p/promptspend" target="_blank" rel="noopener noreferrer">
            <img src="${escapeHtml(href(ctx, '/peerpush-badge.png'))}" alt="PromptSpend on PeerPush" width="142" height="40" />
          </a>
          <a href="https://peerlist.io/andrewavery7/project/promptspend" target="_blank" rel="noopener noreferrer">
            <picture>
              <source srcset="${escapeHtml(href(ctx, '/peerlist-badge-dark.svg'))}" media="(prefers-color-scheme: dark)" />
              <img src="${escapeHtml(href(ctx, '/peerlist-badge-light.svg'))}" alt="PromptSpend on Peerlist" width="136" height="40" />
            </picture>
          </a>
          <a href="https://launchnest.io/p/promptspend" target="_blank" rel="noopener noreferrer">
            <picture>
              <source srcset="https://launchnest.io/badge/promptspend.svg?variant=featured" media="(prefers-color-scheme: dark)" />
              <img src="https://launchnest.io/badge/promptspend.svg?variant=featured&amp;theme=light" alt="PromptSpend on LaunchNest" width="157" height="40" referrerpolicy="no-referrer" />
            </picture>
          </a>
          <a href="https://www.uneed.best/tool/promptspend" target="_blank" rel="noopener noreferrer">
            <picture>
              <source srcset="${escapeHtml(href(ctx, '/uneed-badge-dark.png'))}" media="(prefers-color-scheme: dark)" />
              <img src="${escapeHtml(href(ctx, '/uneed-badge-light.png'))}" alt="PromptSpend on Uneed" width="153" height="40" />
            </picture>
          </a>
          <a href="https://fazier.com" target="_blank" rel="noopener noreferrer">
            <picture>
              <source srcset="${escapeHtml(href(ctx, '/fazier-badge-dark.svg'))}" media="(prefers-color-scheme: dark)" />
              <img src="${escapeHtml(href(ctx, '/fazier-badge-light.svg'))}" alt="PromptSpend on Fazier" width="94" height="40" />
            </picture>
          </a>
          <a href="https://www.producthunt.com/products/promptspend/launches/promptspend" target="_blank" rel="noopener noreferrer">
            <picture>
              <source srcset="${escapeHtml(href(ctx, '/producthunt-badge-dark.svg'))}" media="(prefers-color-scheme: dark)" />
              <img src="${escapeHtml(href(ctx, '/producthunt-badge-light.svg'))}" alt="PromptSpend on Product Hunt" width="151" height="40" />
            </picture>
          </a>
          <a href="https://mcpservers.org/servers/andrewavery7/promptspend" target="_blank" rel="noopener noreferrer">
            <img class="footer__badge-strip" src="${escapeHtml(href(ctx, '/mcpservers-badge.svg'))}" alt="PromptSpend listed on mcpservers.org" width="228" height="28" />
          </a>
        </div>
        <div class="footer__legal">
          <span>PromptSpend &middot; open source under the MIT license &middot; no accounts, no ads</span>${footerStats(ctx)}
        </div>
      </div>
    </footer>`;
}

// ------------------------------------------------------------- shared blocks

function calculatorHref(ctx: RenderContext, modelIds: string[]): string {
  const query = encodeScenario({ ...DEFAULT_SCENARIO, modelIds });
  return `${href(ctx, '/')}?${query}`;
}

function calculatorLink(ctx: RenderContext, modelIds: string[], label: string): string {
  return `<p><a class="cta" href="${escapeHtml(calculatorHref(ctx, modelIds))}">${escapeHtml(label)}</a></p>`;
}

/**
 * The action offered next to the headline, before any explanation. A visitor
 * who searched for a model's price gets the way to apply that price to their
 * own workload without scrolling past the rate table and the worked examples.
 * It adds a second route to the same calculator link the page already ends
 * with; nothing is removed to make room for it.
 */
function leadActions(ctx: RenderContext, modelIds: string[], label: string, extra = ''): string {
  return `<p class="actions"><a class="cta" href="${escapeHtml(calculatorHref(ctx, modelIds))}">${escapeHtml(label)}</a>${extra}</p>`;
}

/**
 * The rate card. `pricing` is the model's rates in force on the page's date;
 * the four rates a promotion can move are marked when it has moved them.
 */
function rateRows(model: Model, pricing: Pricing): string {
  const rows: string[] = [
    row('Input', pricing.input, 'Every token you send: prompt, history, documents.', 'input'),
    row(
      'Output',
      pricing.output,
      'Every token the model generates, including hidden reasoning tokens.',
      'output',
    ),
  ];
  if (pricing.cachedInput !== undefined) {
    rows.push(
      row(
        'Cached input',
        pricing.cachedInput,
        'Input served from the provider’s prompt cache.',
        'cachedInput',
      ),
    );
  }
  if (pricing.cacheWrite !== undefined) {
    rows.push(
      pricing.cacheWrite1h === undefined
        ? row(
            'Cache write',
            pricing.cacheWrite,
            'Charged once, to put a prefix into the cache.',
            'cacheWrite',
          )
        : row(
            'Cache write (5 minutes)',
            pricing.cacheWrite,
            'Charged once, to put a prefix into the cache for the default five minutes. Estimates use this rate.',
            'cacheWrite',
          ),
    );
  }
  if (pricing.cacheWrite1h !== undefined) {
    rows.push(
      row(
        'Cache write (1 hour)',
        pricing.cacheWrite1h,
        'The same write with a one-hour lifetime, for prompts reused less often than every five minutes.',
      ),
    );
  }
  if (pricing.cacheStoragePerMillionTokenHour !== undefined) {
    rows.push(
      row(
        'Cache storage / hour',
        pricing.cacheStoragePerMillionTokenHour,
        'Separate residency charge per 1M cached tokens; not included without a retention duration.',
      ),
    );
  }
  if (pricing.longContext !== undefined) {
    const tier = pricing.longContext;
    rows.push(
      row(
        'Input above ' + formatContext(tier.thresholdTokens),
        tier.input,
        'Requests past the threshold are billed <em>entirely</em> at this rate, not just the excess.',
      ),
      row('Output above ' + formatContext(tier.thresholdTokens), tier.output, ''),
    );
  }
  return rows.join('\n');

  function row(label: string, value: number, note: string, field?: RateField): string {
    // One marker per row, on the per-1M figure: the per-1K cell is the same
    // number in a different unit, and two markers would read as two facts.
    const marker = field ? promoIcon(model, pricing, field) : '';
    return `            <tr>
              <th scope="row">${escapeHtml(label)}</th>
              <td class="num">${escapeHtml(rate(value))}${marker}</td>
              <td class="num">${escapeHtml(perThousand(value))}</td>
              <td class="muted">${note}</td>
            </tr>`;
  }
}

// ------------------------------------------------------------------- Q&A

/** The visible questions and answers. The same strings go into the markup. */
function faqSection(faqs: Faq[]): string {
  if (faqs.length === 0) return '';
  return `
        <h2 id="faq">Common questions</h2>
        <div class="faq">
${faqs
  .map(
    (faq) => `          <h3>${escapeHtml(faq.question)}</h3>
          <p>${escapeHtml(faq.answer)}</p>`,
  )
  .join('\n')}
        </div>
`;
}

/** The FAQPage node for the JSON-LD graph: empty when there is nothing to say. */
function faqLd(faqs: Faq[]): unknown[] {
  if (faqs.length === 0) return [];
  return [
    {
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    },
  ];
}

// ------------------------------------------------------- price history

const FIELD_LABEL: Record<string, string> = {
  input: 'Input',
  output: 'Output',
  cachedInput: 'Cached input',
  cacheWrite: 'Cache write',
  cacheWrite1h: 'Cache write (1 hour)',
  cacheStoragePerMillionTokenHour: 'Cache storage / hour',
  batchDiscount: 'Batch discount',
  'longContext.thresholdTokens': 'Long-context threshold',
  'longContext.input': 'Long-context input',
  'longContext.output': 'Long-context output',
  'intro.input': 'Intro input',
  'intro.output': 'Intro output',
  'intro.until': 'Intro rate ends',
};

function historyValue(raw: string, unit: string): string {
  if (raw === '') return 'not recorded';
  if (unit === 'multiplier') return `×${raw}`;
  if (unit === 'tokens') return `${Number(raw).toLocaleString('en-US')} tokens`;
  if (unit === 'date') return raw;
  return rate(Number(raw));
}

function historyRow(change: RateChange): string {
  const what =
    change.kind === 'price'
      ? 'The vendor changed the rate'
      : 'PromptSpend corrected a misreading; the vendor&rsquo;s rate did not move';
  return `            <tr>
              <td class="when">${escapeHtml(change.date)}</td>
              <th scope="row">${escapeHtml(FIELD_LABEL[change.field] ?? change.field)}</th>
              <td class="num">${escapeHtml(historyValue(change.from, change.unit))}</td>
              <td class="num">${escapeHtml(historyValue(change.to, change.unit))}</td>
              <td class="muted">${what}</td>
            </tr>`;
}

/**
 * The model page's price history: a staircase chart when an input or output
 * rate has ever moved, the table of every change, and a plain sentence when
 * nothing has. Complete without scripts. Left out entirely when the context
 * carries no history, so a page is never made to say "unchanged" on no data.
 */
function priceHistorySection(page: ModelPage, ctx: RenderContext): string {
  if (!ctx.history) return '';
  const view = modelHistory(ctx.history, page.model.id);
  if (view.listedOn === null) return '';
  const name = page.model.displayName;
  const csv = `${ctx.siteUrl}/data/price-history.csv`;

  const began = `Tracking began on ${escapeHtml(ctx.history.firstDate)}, so anything the vendor did before then is not on record here.`;
  const lead =
    view.changes.length === 0
      ? `<p>PromptSpend has recorded ${escapeHtml(name)} since <strong>${escapeHtml(view.listedOn)}</strong>, and none of its rates has changed in that time. ${began}</p>`
      : `<p>PromptSpend has recorded ${escapeHtml(name)} since <strong>${escapeHtml(view.listedOn)}</strong>. ${began}</p>`;

  const chart = hasChartableMove(view)
    ? `        <figure class="card chart-card">
          ${priceChartSvg({
            modelName: name,
            from: view.listedOn,
            to: ctx.history.lastDate,
            series: view.series,
          })}
          <figcaption class="unit">USD per 1M tokens. Each line holds its value until the next published change.</figcaption>
        </figure>`
    : '';

  const table =
    view.changes.length === 0
      ? ''
      : `        <div class="card tablewrap" tabindex="0">
          <table>
            <caption class="unit cap">Every recorded change, oldest first. USD per 1M tokens unless stated.</caption>
            <thead><tr><th>Date</th><th>Rate</th><th class="num">Was</th><th class="num">Now</th><th>What happened</th></tr></thead>
            <tbody>
${view.changes.map(historyRow).join('\n')}
            </tbody>
          </table>
        </div>`;

  const delisted =
    view.delistedOn === null
      ? ''
      : `<p class="note">${escapeHtml(name)} left the catalog on ${escapeHtml(view.delistedOn)}.</p>`;

  return `
        <h2 id="price-history">Price history</h2>
        ${lead}
${chart}
${table}
        ${delisted}
        <p class="muted small">Every row, with the commit that published it, is in the <a href="${escapeHtml(csv)}">price-history dataset</a>; price news is also available as an <a href="${escapeHtml(href(ctx, '/feed.xml'))}">Atom feed</a>.</p>
`;
}

/** The latest vendor repricings across the catalog, linked to the models they concern. */
function recentChangesSection(set: PageSet, ctx: RenderContext): string {
  if (!ctx.history) return '';
  const byId = new Map(set.models.map((entry) => [entry.id, entry]));
  const moves = recentRepricings(ctx.history, 60)
    .filter((move) => byId.has(move.modelId))
    .slice(0, 10);
  const corrections = correctionCount(ctx.history);

  const rows = moves
    .map((move) => {
      const entry = byId.get(move.modelId)!;
      const change = (move.to - move.from) / move.from;
      const direction = change < 0 ? 'cut' : 'rise';
      return `            <tr>
              <td class="when">${escapeHtml(move.date)}</td>
              <td><a href="${escapeHtml(href(ctx, entry.path))}">${escapeHtml(entry.model.displayName)}</a></td>
              <th scope="row">${escapeHtml(FIELD_LABEL[move.field] ?? move.field)}</th>
              <td class="num">${escapeHtml(rate(move.from))}</td>
              <td class="num">${escapeHtml(rate(move.to))}</td>
              <td class="num ${change < 0 ? 'save' : 'cost'}">${escapeHtml(`${change < 0 ? '−' : '+'}${formatPercent(Math.abs(change))}`)} <span class="unit">${direction}</span></td>
            </tr>`;
    })
    .join('\n');

  const table =
    moves.length === 0
      ? `<p class="muted">No vendor has changed a published rate since tracking began on ${escapeHtml(ctx.history.firstDate)}.</p>`
      : `<div class="card tablewrap" tabindex="0">
          <table>
            <caption class="unit cap">Vendor rate changes, newest first. USD per 1M tokens.</caption>
            <thead><tr><th>Date</th><th>Model</th><th>Rate</th><th class="num">Was</th><th class="num">Now</th><th class="num">Change</th></tr></thead>
            <tbody>
${rows}
            </tbody>
          </table>
        </div>`;

  const fixes =
    corrections > 0
      ? ` ${corrections} further ${corrections === 1 ? 'entry was' : 'entries were'} PromptSpend correcting its own reading of a page, which <a href="${escapeHtml(href(ctx, CHANGES_PATH))}">the price changes page</a> and the <a href="${escapeHtml(href(ctx, '/feed.xml'))}">feed</a> label separately.`
      : '';
  return `
        <h2 id="recent-changes">Recent price changes</h2>
        <p class="muted">Only moves the vendor made are listed.${fixes} Tracking began on ${escapeHtml(ctx.history.firstDate)}.</p>
        ${table}
`;
}

// -------------------------------------------------------------- model page

export function renderModelPage(page: ModelPage, ctx: RenderContext): string {
  const { model, effective } = page;
  const faqs = modelFaq(page, { sourceLabel: sourceLabel(model), history: ctx.history });
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: 'Models', path: '/models/' },
    { label: model.displayName, path: null },
  ];

  const examples = page.examples
    .map(
      (example) => `        <div class="card">
          <h3>${escapeHtml(example.profile.label)}</h3>
          <p class="unit">${escapeHtml(example.profile.summary)}</p>
          <p class="big">${escapeHtml(formatMoney(example.perMonth))}<span class="unit"> / month</span></p>
          <p class="unit">${escapeHtml(formatMoney(example.perConversation))} per conversation &middot; ${escapeHtml(formatMoney(example.perYear))} a year</p>
          <p class="muted small">${escapeHtml(example.profile.detail)}</p>
          ${example.warnings.map((warning) => `<p class="note">${escapeHtml(warning)}</p>`).join('')}
        </div>`,
    )
    .join('\n');

  const alternatives =
    page.alternatives.length === 0
      ? `<p class="muted">Nothing in the catalog is cheaper — on a blended rate, this is the least expensive model tracked.</p>`
      : `<div class="tablewrap" tabindex="0"><table>
          <thead><tr><th>Model</th><th class="num">Input</th><th class="num">Output</th><th class="num">Blended saving</th><th></th></tr></thead>
          <tbody>
${page.alternatives
  .map(
    (alt) => `            <tr>
              <td><a href="${escapeHtml(href(ctx, `/models/${alt.slug}/`))}">${escapeHtml(alt.model.displayName)}</a></td>
              <td class="num">${rateCell(alt.model, alt.effective, 'input')}</td>
              <td class="num">${rateCell(alt.model, alt.effective, 'output')}</td>
              <td class="num save">${escapeHtml(formatPercent(alt.saving))}</td>
              <td>${
                alt.comparisonPath
                  ? `<a href="${escapeHtml(href(ctx, alt.comparisonPath))}">side by side</a>`
                  : ''
              }</td>
            </tr>`,
  )
  .join('\n')}
          </tbody></table></div>`;

  const alternativesHeading = page.alternativesAreComparable
    ? 'Cheaper, and scored at least as capable'
    : 'Cheaper models in the catalog';
  const alternativesLede = page.alternativesAreComparable
    ? `Every model below costs less on a blended rate and carries a capability score at least as high as ${escapeHtml(model.displayName)}&rsquo;s. The score is a rough estimate, not a benchmark — treat it as a shortlist, not a verdict.`
    : `Nothing cheaper is scored as highly as ${escapeHtml(model.displayName)}, so these are simply the cheaper options, best-scored first. Trading down here is a real trade.`;

  const specRows: [string, string][] = [
    ['Context window', `${formatContext(model.contextWindow)} tokens`],
    ...(model.maxOutput
      ? ([['Maximum output', `${formatContext(model.maxOutput)} tokens`]] as [string, string][])
      : []),
    [
      'Provider',
      `<a href="${escapeHtml(href(ctx, page.providerPath))}">${escapeHtml(page.providerName)}</a>`,
    ],
    [
      'Status',
      model.status === 'current' ? 'Current' : model.status === 'legacy' ? 'Legacy' : 'Retired by its vendor',
    ],
    ...(model.releaseDate ? ([['Released', escapeHtml(model.releaseDate)]] as [string, string][]) : []),
    ['Reasoning model', model.capabilities.reasoning ? 'Yes' : 'No'],
    ['Vision', model.capabilities.vision ? 'Yes' : 'No'],
    [
      'Token counting',
      model.tokenizer.kind === 'tiktoken'
        ? `Exact, via <code>${escapeHtml(model.tokenizer.encoding)}</code>`
        : `Estimated at ~${escapeHtml(String(model.tokenizer.charsPerToken))} characters per token${model.tokenizer.note ? ` (${escapeHtml(model.tokenizer.note)})` : ''}`,
    ],
    ...(model.pricing.batchDiscount !== undefined
      ? ([
          [
            'Batch API',
            `${formatPercent(1 - model.pricing.batchDiscount)} off both rates for non-interactive work`,
          ],
        ] as [string, string][])
      : []),
    ...(page.aliases.length > 0
      ? ([
          [
            'Also reachable as',
            page.aliases.map((alias) => `<code>${escapeHtml(alias.id)}</code>`).join(', '),
          ],
        ] as [string, string][])
      : []),
  ];

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="lede">
          <a href="${escapeHtml(href(ctx, page.providerPath))}">${escapeHtml(page.providerName)}</a> &middot;
          <code>${escapeHtml(model.id)}</code> &middot;
          ${escapeHtml(formatContext(model.contextWindow))} context
          ${page.rank ? ` &middot; ${ordinal(page.rank.position)} cheapest of ${page.rank.total} current models` : ''}
        </p>

        ${page.promotional ? `<p class="note">These are promotional rates, in force until ${escapeHtml(model.pricing.intro?.until ?? '')}. The standard rates are ${escapeHtml(rate(model.pricing.input))} in / ${escapeHtml(rate(model.pricing.output))} out per 1M tokens.</p>` : ''}
        ${model.provenance.needsReview ? `<p class="note">This row is flagged for review: ${escapeHtml(model.provenance.reviewNote ?? 'sources disagree')}. Check the vendor&rsquo;s own page before relying on it.</p>` : ''}

        ${leadActions(
          ctx,
          [model.id],
          `Estimate ${model.displayName} for your workload`,
          ` <a href="#source">Source and check date</a>`,
        )}
        <p class="muted small">Rates last checked against ${escapeHtml(sourceLabel(model))} on <strong>${escapeHtml(model.provenance.lastVerified)}</strong>.</p>

        <h2>What ${escapeHtml(model.displayName)} costs</h2>
        <div class="card tablewrap" tabindex="0">
          <table>
            <caption class="unit cap">USD, standard tier, global endpoint</caption>
            <thead><tr><th>Rate</th><th class="num">Per 1M tokens</th><th class="num">Per 1K tokens</th><th>What it covers</th></tr></thead>
            <tbody>
${rateRows(model, effective)}
            </tbody>
          </table>
        </div>

        <h2>What that means in practice</h2>
        <p class="muted">The same three workloads are costed on every model page, so these numbers are directly comparable across the catalog. No prompt caching and no batch discount is assumed — the figures are what you pay before you optimize anything.</p>
        <div class="grid">
${examples}
        </div>
        ${calculatorLink(ctx, [model.id], `Change the assumptions in the calculator`)}

        <h2>${escapeHtml(alternativesHeading)}</h2>
        <p class="muted">${alternativesLede}</p>
        ${alternatives}

        ${
          page.comparisons.length > 0
            ? `<h2>Head to head</h2>
        <ul class="links">
${page.comparisons.map((link) => `          <li><a href="${escapeHtml(href(ctx, link.path))}">${escapeHtml(link.label)}</a></li>`).join('\n')}
        </ul>`
            : ''
        }

        <h2>Specification</h2>
        <div class="card tablewrap" tabindex="0">
          <table><tbody>
${specRows.map(([label, value]) => `            <tr><th scope="row">${escapeHtml(label)}</th><td>${value}</td></tr>`).join('\n')}
          </tbody></table>
        </div>

        ${priceHistorySection(page, ctx)}
        <h2 id="source">Where these numbers come from</h2>
        <div class="card">
          <p>
            Last checked against its source on <strong>${escapeHtml(model.provenance.lastVerified)}</strong>${
              page.lastChanged
                ? `, and the published rates last actually moved on <strong>${escapeHtml(page.lastChanged)}</strong>`
                : ''
            }. Source of record: <strong>${escapeHtml(sourceLabel(model))}</strong>.
          </p>
          ${
            model.provenance.verifiedUrl
              ? `<p><a href="${escapeHtml(model.provenance.verifiedUrl)}" rel="nofollow noopener">The vendor page a human checked</a></p>`
              : page.provider?.pricingUrl
                ? `<p><a href="${escapeHtml(page.provider.pricingUrl)}" rel="nofollow noopener">${escapeHtml(page.providerName)}&rsquo;s own pricing page</a></p>`
                : ''
          }
          <p class="muted">
            Regional and data-residency premiums, priority tiers, server-side tool fees and negotiated
            discounts are not included. Prices change without notice; this page is rebuilt every time the
            catalog does.
          </p>
        </div>
${faqSection(faqs)}      </main>`;

  return layout(ctx, {
    path: page.path,
    title: page.title,
    description: page.description,
    graph: [
      breadcrumbLd(ctx, crumbs, page.path),
      ...faqLd(faqs),
      {
        '@type': 'Product',
        name: model.displayName,
        description: page.description,
        category: 'Large language model API',
        url: absolute(ctx, page.path),
        brand: { '@type': 'Brand', name: page.providerName },
        offers: [
          offer('Input tokens', effective.input, ctx, page),
          offer('Output tokens', effective.output, ctx, page),
        ],
      },
    ],
    body,
  });
}

/**
 * The rate as an `Offer`, which is what lets the price appear in a product
 * snippet. Google supports this on pages that do not sell the thing — its own
 * guidance splits "product snippets" (editorial pages "where people can't
 * directly purchase the product") from "merchant listings" (pages "where
 * customers can purchase products from you"). These are the first kind.
 *
 * Note what is deliberately absent: `availability`. It read
 * `https://schema.org/InStock`, which is a claim to hold stock and sell it —
 * false in every particular. Nobody buys tokens here; the rate belongs to the
 * vendor and the page links to their page to prove it. It was also the loudest
 * signal telling Google to grade these as merchant listings, which is how a
 * catalog that sells nothing came to be asked for a shipping policy.
 */
function offer(name: string, dollarsPerMillion: number, ctx: RenderContext, page: ModelPage): unknown {
  return {
    '@type': 'Offer',
    name,
    url: absolute(ctx, page.path),
    price: dollarsPerMillion,
    priceCurrency: 'USD',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: dollarsPerMillion,
      priceCurrency: 'USD',
      referenceQuantity: { '@type': 'QuantitativeValue', value: 1_000_000, unitText: 'tokens' },
    },
  };
}

function sourceLabel(model: Model): string {
  switch (model.provenance.source) {
    case 'vendor':
      return 'the vendor’s own published pricing';
    case 'litellm':
      return 'LiteLLM’s community-maintained price map';
    default:
      return 'OpenRouter’s published rates';
  }
}

function ordinal(value: number): string {
  const rest = value % 100;
  if (rest >= 11 && rest <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

// ----------------------------------------------------------- provider page

/** The one-line pointer from a provider's pricing page to its free-tier page. */
export interface FreeTierLink {
  verdict: FreeTierRecord['verdict'];
  path: string;
}

export function renderProviderPage(page: ProviderPage, ctx: RenderContext, freeTier?: FreeTierLink): string {
  const faqs = providerFaq(
    page,
    freeTier ? { verdict: freeTier.verdict, label: VERDICT_LABEL[freeTier.verdict] } : undefined,
  );
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: 'Providers', path: '/providers/' },
    { label: page.provider.name, path: null },
  ];

  const rows = page.models
    .map(
      (entry) => `            <tr>
              <td><a href="${escapeHtml(href(ctx, entry.path))}">${escapeHtml(entry.model.displayName)}</a>${
                entry.model.status === 'current'
                  ? ''
                  : ` <span class="pill">${escapeHtml(statusPill(entry.model))}</span>`
              }</td>
              <td class="num">${rateCell(entry.model, entry.effective, 'input')}</td>
              <td class="num">${rateCell(entry.model, entry.effective, 'output')}</td>
              <td class="num">${escapeHtml(formatContext(entry.model.contextWindow))}</td>
              <td>${entry.model.capabilities.reasoning ? '<span class="pill">reasoning</span> ' : ''}${entry.model.capabilities.vision ? '<span class="pill">vision</span>' : ''}</td>
            </tr>`,
    )
    .join('\n');

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="lede">
          ${page.models.length} model${page.models.length === 1 ? '' : 's'} tracked &middot;
          headquartered in ${escapeHtml(page.provider.country)}
          ${page.provider.pricingUrl ? ` &middot; <a href="${escapeHtml(page.provider.pricingUrl)}" rel="nofollow noopener">official pricing</a>` : ''}
        </p>${
          freeTier
            ? `
        <p class="lede">Free tier: ${verdictBadge(freeTier.verdict)} <a href="${escapeHtml(href(ctx, freeTier.path))}">What ${escapeHtml(page.provider.name)} gives you free, in its own words</a></p>`
            : ''
        }
        <div class="card tablewrap" tabindex="0">
          <table>
            <caption class="unit cap">USD per 1M tokens, cheapest first by blended rate</caption>
            <thead><tr><th>Model</th><th class="num">Input</th><th class="num">Output</th><th class="num">Context</th><th></th></tr></thead>
            <tbody>
${rows}
            </tbody>
          </table>
        </div>
        ${calculatorLink(
          ctx,
          page.models.slice(0, 4).map((entry) => entry.model.id),
          `Compare ${page.provider.name}’s models on your own workload`,
        )}
${faqSection(faqs)}      </main>`;

  return layout(ctx, {
    path: page.path,
    title: page.title,
    description: page.description,
    graph: [
      breadcrumbLd(ctx, crumbs, page.path),
      ...faqLd(faqs),
      {
        '@type': 'CollectionPage',
        name: page.heading,
        url: absolute(ctx, page.path),
        description: page.description,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: page.models.length,
          itemListElement: page.models.map((entry, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: entry.model.displayName,
            url: absolute(ctx, entry.path),
          })),
        },
      },
    ],
    body,
  });
}

// --------------------------------------------------------- comparison page

/**
 * The size of a gap, in whichever unit reads better.
 *
 * "1.0×" for a 5% difference is technically true and tells the reader nothing;
 * "+400%" for a fivefold difference is arithmetic nobody wants to do. The
 * switch is at 1.5×, which is roughly where people stop thinking in percentages.
 */
function gap(multiple: number): string {
  if (!Number.isFinite(multiple)) return '';
  if (multiple >= 1.5) return `${Number(multiple.toFixed(multiple < 10 ? 1 : 0))}×`;
  return `+${Math.round((multiple - 1) * 100)}%`;
}

export function renderComparisonPage(page: ComparisonPage, ctx: RenderContext): string {
  const faqs = comparisonFaq(page);
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: 'Comparisons', path: '/compare/' },
    { label: `${page.left.displayName} vs ${page.right.displayName}`, path: null },
  ];

  const spec = (label: string, left: string, right: string): string =>
    `            <tr><th scope="row">${escapeHtml(label)}</th><td class="num">${left}</td><td class="num">${right}</td></tr>`;

  const workloadRows = page.rows
    .map(
      (row) => `            <tr>
              <th scope="row">${escapeHtml(row.profile.label)}<br /><span class="unit">${escapeHtml(row.profile.summary)}</span></th>
              <td class="num${row.cheaper === 'left' ? ' save' : ''}">${escapeHtml(formatMoney(row.left))}</td>
              <td class="num${row.cheaper === 'right' ? ' save' : ''}">${escapeHtml(formatMoney(row.right))}</td>
              <td class="num">${row.cheaper === 'tie' ? 'the same' : `${escapeHtml(formatMoney(row.difference))} <span class="unit">(${escapeHtml(gap(row.multiple))})</span>`}</td>
            </tr>`,
    )
    .join('\n');

  // A pair is kept once published, so one side can be a model its vendor has
  // since shut down. The numbers are still its last published rates; the
  // reader needs to know they can no longer be bought.
  const retiredNotes = [page.left, page.right]
    .filter((model) => model.status === 'deprecated')
    .map(
      (model) =>
        `<p class="note">${escapeHtml(model.displayName)} has been retired by its vendor. Its column shows the last rates it was sold at, kept for reference.</p>`,
    )
    .join('\n        ');

  const differences =
    page.differences.length > 0
      ? `<ul>
${page.differences.map((line) => `          <li>${escapeHtml(line)}</li>`).join('\n')}
        </ul>`
      : `<p>Beyond price there is little to choose: the two match on context window, output ceiling, reasoning, vision, caching and batch pricing.</p>`;

  // Other comparisons that include either model: how a comparison is reached
  // from its siblings and not only from the index. Nothing is drawn when there
  // are none, rather than an empty heading.
  const moreComparisons =
    page.related.length === 0
      ? ''
      : `        <h2>More comparisons</h2>
        <p class="muted">Other head-to-heads that include ${escapeHtml(page.left.displayName)} or ${escapeHtml(page.right.displayName)}.</p>
        <ul class="links">
${page.related
  .map(
    (link) =>
      `          <li><a href="${escapeHtml(href(ctx, link.path))}">${escapeHtml(link.label)}</a></li>`,
  )
  .join('\n')}
        </ul>`;

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="lede">
          ${escapeHtml(page.leftProvider)} against ${escapeHtml(page.rightProvider)}, costed on the same three workloads.
          <strong>${escapeHtml(page.verdict)}</strong>
        </p>
        ${retiredNotes}
        ${leadActions(ctx, [page.left.id, page.right.id], 'Run this comparison on your own numbers')}

        <h2>Monthly bill, side by side</h2>
        <div class="card tablewrap" tabindex="0">
          <table>
            <thead><tr><th>Workload</th><th class="num">${escapeHtml(page.left.displayName)}</th><th class="num">${escapeHtml(page.right.displayName)}</th><th class="num">Difference</th></tr></thead>
            <tbody>
${workloadRows}
            </tbody>
          </table>
        </div>
        <p class="muted">No prompt caching and no batch discount on either side, so the comparison is like for like. Both figures assume 30 days a month.</p>

        <h2>The rate cards</h2>
        <div class="card tablewrap" tabindex="0">
          <table>
            <thead><tr><th></th><th class="num">${escapeHtml(page.left.displayName)}</th><th class="num">${escapeHtml(page.right.displayName)}</th></tr></thead>
            <tbody>
${spec('Input, per 1M tokens', rateCell(page.left, page.leftEffective, 'input'), rateCell(page.right, page.rightEffective, 'input'))}
${spec('Output, per 1M tokens', rateCell(page.left, page.leftEffective, 'output'), rateCell(page.right, page.rightEffective, 'output'))}
${spec('Cached input', rateCell(page.left, page.leftEffective, 'cachedInput'), rateCell(page.right, page.rightEffective, 'cachedInput'))}
${spec('Context window', escapeHtml(formatContext(page.left.contextWindow)), escapeHtml(formatContext(page.right.contextWindow)))}
${spec('Maximum output', page.left.maxOutput ? escapeHtml(formatContext(page.left.maxOutput)) : '—', page.right.maxOutput ? escapeHtml(formatContext(page.right.maxOutput)) : '—')}
${spec('Reasoning model', page.left.capabilities.reasoning ? 'yes' : 'no', page.right.capabilities.reasoning ? 'yes' : 'no')}
${spec('Vision', page.left.capabilities.vision ? 'yes' : 'no', page.right.capabilities.vision ? 'yes' : 'no')}
            </tbody>
          </table>
        </div>

        <h2>Beyond the price</h2>
        ${differences}

        ${calculatorLink(ctx, [page.left.id, page.right.id], 'Run this comparison on your own numbers')}

        <p>
          Full detail: <a href="${escapeHtml(href(ctx, `/models/${page.leftSlug}/`))}">${escapeHtml(page.left.displayName)} pricing</a>
          &middot; <a href="${escapeHtml(href(ctx, `/models/${page.rightSlug}/`))}">${escapeHtml(page.right.displayName)} pricing</a>
        </p>
${moreComparisons}
${faqSection(faqs)}      </main>`;

  return layout(ctx, {
    path: page.path,
    title: page.title,
    description: page.description,
    graph: [
      breadcrumbLd(ctx, crumbs, page.path),
      ...faqLd(faqs),
      {
        '@type': 'WebPage',
        name: page.heading,
        url: absolute(ctx, page.path),
        description: page.description,
        about: [
          {
            '@type': 'Product',
            name: page.left.displayName,
            url: absolute(ctx, `/models/${page.leftSlug}/`),
          },
          {
            '@type': 'Product',
            name: page.right.displayName,
            url: absolute(ctx, `/models/${page.rightSlug}/`),
          },
        ],
      },
    ],
    body,
  });
}

/**
 * The page left at a comparison URL whose pair can no longer be built.
 *
 * `noindex`, kept out of the sitemap, and canonical to the best surviving page,
 * so it neither competes in search nor 404s for the people and links that still
 * arrive. A static host cannot send a real 301, and a meta refresh would strand
 * anyone who wanted to know why the comparison went.
 */
export function renderRetiredComparisonPage(page: RetiredComparisonPage, ctx: RenderContext): string {
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: 'Comparisons', path: '/compare/' },
    { label: page.heading, path: null },
  ];

  const links = [
    ...page.survivors,
    { path: '/compare/', label: 'Every current comparison' },
    { path: '/models/', label: 'Every model, by price' },
  ];

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="lede">
          This comparison has been retired: ${escapeHtml(page.leftName)} or ${escapeHtml(page.rightName)} is no
          longer in the catalog, so there are no current prices to set side by side.
        </p>
        <ul class="links">
${links.map((link) => `          <li><a href="${escapeHtml(href(ctx, link.path))}">${escapeHtml(link.label)}</a></li>`).join('\n')}
        </ul>
      </main>`;

  return layout(ctx, {
    path: page.path,
    canonicalPath: page.canonicalPath,
    robots: 'noindex, follow',
    title: page.title,
    description: page.description,
    graph: [breadcrumbLd(ctx, crumbs, page.path)],
    body,
  });
}

// ---------------------------------------------------------------- indexes

export function renderModelsIndex(set: PageSet, ctx: RenderContext): string {
  const page: IndexPage = set.modelsIndex;
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: 'Models', path: null },
  ];

  // By blended rate, every row — not by `rank`, which is null for anything not
  // current and would have quietly dumped the legacy models at the bottom in id
  // order. A table that claims to be sorted by price has to be.
  const ordered = [...set.models].sort(
    (a, b) => blendedRate(a.model) - blendedRate(b.model) || a.id.localeCompare(b.id),
  );

  const rows = ordered
    .map(
      (entry) => `            <tr>
              <td><a href="${escapeHtml(href(ctx, entry.path))}">${escapeHtml(entry.model.displayName)}</a>${
                entry.model.status === 'current'
                  ? ''
                  : ` <span class="pill">${escapeHtml(statusPill(entry.model))}</span>`
              }</td>
              <td><a href="${escapeHtml(href(ctx, entry.providerPath))}">${escapeHtml(entry.providerName)}</a></td>
              <td class="num">${rateCell(entry.model, entry.effective, 'input')}</td>
              <td class="num">${rateCell(entry.model, entry.effective, 'output')}</td>
              <td class="num">${escapeHtml(formatContext(entry.model.contextWindow))}</td>
              <td class="num">${escapeHtml(formatMoney(entry.examples[0]?.perMonth ?? 0))}</td>
            </tr>`,
    )
    .join('\n');

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="lede">
          ${set.models.length} models from ${set.providers.length} providers, cheapest first on a blended rate
          (75% input, 25% output). The last column is what a support chatbot handling 2,500 six-turn
          conversations a day would cost on each — the same workload, every row.
        </p>
        <div class="card tablewrap" tabindex="0">
          <table>
            <caption class="unit cap">USD per 1M tokens</caption>
            <thead><tr><th>Model</th><th>Provider</th><th class="num">Input</th><th class="num">Output</th><th class="num">Context</th><th class="num">Chatbot / month</th></tr></thead>
            <tbody>
${rows}
            </tbody>
          </table>
        </div>
        ${recentChangesSection(set, ctx)}
        ${calculatorLink(ctx, [], 'Price your own workload')}
      </main>`;

  return layout(ctx, {
    path: page.path,
    title: page.title,
    description: page.description,
    graph: [
      breadcrumbLd(ctx, crumbs, page.path),
      {
        '@type': 'CollectionPage',
        name: page.heading,
        url: absolute(ctx, page.path),
        description: page.description,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: ordered.length,
          itemListElement: ordered.map((entry, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: entry.model.displayName,
            url: absolute(ctx, entry.path),
          })),
        },
      },
    ],
    body,
  });
}

function freeTierCell(ctx: RenderContext, link: FreeTierLink | undefined): string {
  if (!link) return '<span class="muted">—</span>';
  return `<a href="${escapeHtml(href(ctx, link.path))}">${escapeHtml(VERDICT_LABEL[link.verdict])}</a>`;
}

export function renderProvidersIndex(
  set: PageSet,
  ctx: RenderContext,
  freeTiers?: ReadonlyMap<string, FreeTierLink>,
): string {
  const page = set.providersIndex;
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: 'Providers', path: null },
  ];

  const rows = set.providers
    .map(
      (entry) => `            <tr>
              <td><a href="${escapeHtml(href(ctx, entry.path))}">${escapeHtml(entry.provider.name)}</a></td>
              <td>${escapeHtml(entry.provider.country)}</td>
              <td class="num">${entry.models.length}</td>
              <td>${entry.cheapest ? escapeHtml(entry.cheapest.displayName) : '—'}</td>
              <td class="num">${entry.models[0] ? rateCell(entry.models[0].model, entry.models[0].effective, 'input') : '—'}</td>${
                freeTiers
                  ? `
              <td>${freeTierCell(ctx, freeTiers.get(entry.id))}</td>`
                  : ''
              }
            </tr>`,
    )
    .join('\n');

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="lede">${set.providers.length} providers tracked. &ldquo;Cheapest model&rdquo; is by blended rate, not by input price alone — a model with cheap input and expensive output is not a cheap model.</p>
        <div class="card tablewrap" tabindex="0">
          <table>
            <thead><tr><th>Provider</th><th>Country</th><th class="num">Models</th><th>Cheapest model</th><th class="num">Its input rate</th>${freeTiers ? '<th>Free tier</th>' : ''}</tr></thead>
            <tbody>
${rows}
            </tbody>
          </table>
        </div>
      </main>`;

  return layout(ctx, {
    path: page.path,
    title: page.title,
    description: page.description,
    graph: [
      breadcrumbLd(ctx, crumbs, page.path),
      {
        '@type': 'CollectionPage',
        name: page.heading,
        url: absolute(ctx, page.path),
        description: page.description,
      },
    ],
    body,
  });
}

export function renderComparisonsIndex(set: PageSet, ctx: RenderContext): string {
  const page = set.comparisonsIndex;
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: 'Comparisons', path: null },
  ];

  const items = set.comparisons
    .map(
      (entry) =>
        `          <li><a href="${escapeHtml(href(ctx, entry.path))}">${escapeHtml(entry.left.displayName)} vs ${escapeHtml(entry.right.displayName)}</a> <span class="unit">${escapeHtml(entry.leftProvider)} &middot; ${escapeHtml(entry.rightProvider)}</span></li>`,
    )
    .join('\n');

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="lede">
          ${set.comparisons.length} comparisons. A pair is added only for models from <em>different</em> providers
          within 3&times; of each other on price — a $0.14 model against a $75 one is not a decision anybody is
          weighing. Once published, a comparison stays, so a few pairs may since have drifted further apart.
        </p>
        <ul class="links">
${items}
        </ul>
      </main>`;

  return layout(ctx, {
    path: page.path,
    title: page.title,
    description: page.description,
    graph: [
      breadcrumbLd(ctx, crumbs, page.path),
      {
        '@type': 'CollectionPage',
        name: page.heading,
        url: absolute(ctx, page.path),
        description: page.description,
      },
    ],
    body,
  });
}

// ------------------------------------------------------------ writing page

/**
 * A prose page — the calculator's pages so far are all catalog-driven, this
 * is the one kind that isn't. `bodyHtml` arrives pre-rendered (see
 * `../seo/prose.ts`) rather than being built here, so this stays a thin,
 * consistent wrapper: same `layout()`, same breadcrumb and CSP handling as
 * every other page, none of the markdown-to-HTML concern mixed in.
 */
export interface WritingPage {
  path: string;
  title: string;
  description: string;
  heading: string;
  /** ISO date (`YYYY-MM-DD`) the article was published. */
  publishedDate: string;
  bodyHtml: string;
}

export function renderWritingPage(page: WritingPage, ctx: RenderContext): string {
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: page.heading, path: null },
  ];

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <article>
          <h1>${escapeHtml(page.heading)}</h1>
          <p class="lede">Published ${escapeHtml(page.publishedDate)}</p>
${analyticsChoice(page.bodyHtml)}
        </article>
      </main>`;

  return layout(ctx, {
    path: page.path,
    title: page.title,
    description: page.description,
    graph: [
      breadcrumbLd(ctx, crumbs, page.path),
      {
        '@type': 'Article',
        headline: page.heading,
        description: page.description,
        url: absolute(ctx, page.path),
        datePublished: page.publishedDate,
        author: { '@type': 'Organization', name: 'PromptSpend' },
      },
    ],
    body,
  });
}

// ------------------------------------------------------------ writing index

/** Where the articles are listed. */
export const WRITING_INDEX_PATH = '/writing/';

/**
 * The page that lists every article and report, newest first.
 *
 * Until it existed the articles had no inbound link at all and this address
 * answered "not found". A page nobody links to is a page a crawler is given no
 * reason to value, and the monthly price reports are among the best things on
 * the site.
 */
export function renderWritingIndex(pages: readonly WritingPage[], ctx: RenderContext): string {
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: 'Writing', path: null },
  ];
  const newestFirst = [...pages].sort(
    (a, b) => b.publishedDate.localeCompare(a.publishedDate) || a.path.localeCompare(b.path),
  );
  const items = newestFirst
    .map(
      (page) =>
        `          <li><a href="${escapeHtml(href(ctx, page.path))}">${escapeHtml(page.heading)}</a> <span class="unit">${escapeHtml(page.publishedDate)}</span><br /><span class="muted">${escapeHtml(page.description)}</span></li>`,
    )
    .join('\n');

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>Writing</h1>
        <p class="lede">
          The monthly price-movement reports and notes on how LLM API costs are really counted. Every figure
          names the vendor page it came from and the date it was checked.
        </p>
        <ul class="links">
${items}
        </ul>
        <p>The same price changes as they happen: <a href="${escapeHtml(href(ctx, '/feed.xml'))}">the Atom feed</a>.</p>
      </main>`;

  const description =
    'Monthly LLM price-movement reports and notes on how AI API costs are really counted, each figure with its source and the date it was checked.';
  return layout(ctx, {
    path: WRITING_INDEX_PATH,
    title: 'Writing: LLM price reports and notes on what AI really costs',
    description,
    graph: [
      breadcrumbLd(ctx, crumbs, WRITING_INDEX_PATH),
      {
        '@type': 'CollectionPage',
        name: 'Writing',
        url: absolute(ctx, WRITING_INDEX_PATH),
        description,
      },
      {
        '@type': 'ItemList',
        itemListElement: newestFirst.map((page, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: page.heading,
          url: absolute(ctx, page.path),
        })),
      },
    ],
    body,
  });
}

// ---------------------------------------------------------------- not found

/**
 * The page GitHub Pages serves for any address that does not exist.
 *
 * Until now that was GitHub's own "page not found", which says nothing about
 * this site and offers nobody a next step. This one is `noindex`, links to the
 * places people are usually looking for, and is built from the same layout as
 * every other page, so it keeps the header and footer.
 */
export function renderNotFoundPage(ctx: RenderContext): string {
  const link = (path: string, label: string): string =>
    `          <li><a href="${escapeHtml(href(ctx, path))}">${escapeHtml(label)}</a></li>`;
  const body = `      <main id="main">
        <h1>That page is not here</h1>
        <p class="lede">The address may be old or mistyped. These are the places most people are looking for.</p>
        <ul class="links">
${[
  link('/', 'The cost calculator'),
  link('/models/', 'Every model, by price'),
  link('/providers/', 'Prices by provider'),
  link('/compare/', 'Head-to-head comparisons'),
  link(FREE_TIERS_PATH, 'Free API tiers, compared'),
  link(WRITING_INDEX_PATH, 'Writing and the monthly price reports'),
].join('\n')}
        </ul>
        <p>If a link on this site brought you here, please tell <a href="mailto:info@promptspend.com">info@promptspend.com</a>.</p>
      </main>`;

  return layout(ctx, {
    path: NOT_FOUND_PATH,
    title: 'Page not found | PromptSpend',
    description:
      'That address is not on PromptSpend. Start from the model prices, the providers, the comparisons or the writing.',
    graph: [{ '@type': 'WebPage', name: 'Page not found', url: absolute(ctx, NOT_FOUND_PATH) }],
    robots: 'noindex, follow',
    body,
  });
}

/** The file GitHub Pages serves for a missing address, at the site root. */
export const NOT_FOUND_PATH = '/404.html';

// ------------------------------------------------------------- what changed

export const CHANGES_PATH = '/changes/';

function changeCell(value: string, unit: string): string {
  return escapeHtml(historyValue(value, unit));
}

function changesTable(
  ctx: RenderContext,
  input: ChangesPageInput,
  rows: ChangeRow[],
  caption: string,
  withPercent: boolean,
): string {
  const link = (row: ChangeRow): string => {
    const path = input.modelPaths[row.modelId];
    return path
      ? `<a href="${escapeHtml(href(ctx, path))}">${escapeHtml(row.modelName)}</a>`
      : escapeHtml(row.modelName);
  };
  const body = rows
    .map((row) => {
      const percent =
        row.change === null
          ? '<td class="num"></td>'
          : `<td class="num ${row.change < 0 ? 'save' : 'cost'}">${escapeHtml(`${row.change < 0 ? '−' : '+'}${formatPercent(Math.abs(row.change))}`)} <span class="unit">${row.change < 0 ? 'cut' : 'rise'}</span></td>`;
      return `              <tr>
                <td>${link(row)}</td>
                <th scope="row">${escapeHtml(FIELD_LABEL[row.field] ?? row.field)}</th>
                <td class="num">${changeCell(row.from, row.unit)}</td>
                <td class="num">${changeCell(row.to, row.unit)}</td>${withPercent ? `\n                ${percent}` : ''}
              </tr>`;
    })
    .join('\n');
  return `          <div class="card tablewrap" tabindex="0">
            <table>
              <caption class="unit cap">${escapeHtml(caption)}</caption>
              <thead><tr><th>Model</th><th>Rate</th><th class="num">Was</th><th class="num">Now</th>${withPercent ? '<th class="num">Change</th>' : ''}</tr></thead>
              <tbody>
${body}
              </tbody>
            </table>
          </div>`;
}

/**
 * `/changes/`: every recorded price change, newest first, in words.
 *
 * The page form of the Atom feed, built from the same days. It prints nothing
 * that depends on the date it was built, so the page's date in the sitemap
 * moves only when a price does.
 */
export function renderChangesPage(input: ChangesPageInput, ctx: RenderContext): string {
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: 'Price changes', path: null },
  ];
  const t = input.totals;
  const modelLink = (id: string, name: string): string => {
    const path = input.modelPaths[id];
    return path ? `<a href="${escapeHtml(href(ctx, path))}">${escapeHtml(name)}</a>` : escapeHtml(name);
  };

  const days = input.days
    .map((day) => {
      const parts: string[] = [];
      if (day.startedWith) {
        parts.push(
          `          <p>PromptSpend began tracking on this day, with ${day.startedWith} ${day.startedWith === 1 ? 'model' : 'models'} in the catalog. Nothing before it is on record here.</p>`,
        );
      }
      if (day.repriced.length > 0) {
        parts.push(
          `          <h3>Price changes</h3>
          <p class="muted small">The vendor changed a published rate.</p>
${changesTable(ctx, input, day.repriced, `Vendor rate changes on ${day.date}. USD per 1M tokens.`, true)}`,
        );
      }
      if (day.corrected.length > 0) {
        parts.push(
          `          <h3>Corrections</h3>
          <p class="muted small">PromptSpend had been reading the wrong page. The vendor&rsquo;s rate did not move.</p>
${changesTable(ctx, input, day.corrected, `Corrections on ${day.date}. USD per 1M tokens.`, false)}`,
        );
      }
      if (day.added.length > 0) {
        parts.push(
          `          <h3>Models added</h3>
          <ul class="plain">
${day.added
  .map(
    (m) =>
      `            <li>${modelLink(m.id, m.name)}${m.input && m.output ? ` &mdash; ${escapeHtml(rate(Number(m.input)))} in, ${escapeHtml(rate(Number(m.output)))} out per 1M tokens` : ''}</li>`,
  )
  .join('\n')}
          </ul>`,
        );
      }
      if (day.removed.length > 0) {
        parts.push(
          `          <h3>Models removed</h3>
          <ul class="plain">
${day.removed.map((m) => `            <li>${modelLink(m.id, m.name)}</li>`).join('\n')}
          </ul>`,
        );
      }
      return `        <section id="${escapeHtml(day.date)}" class="change-day">
          <h2><a href="#${escapeHtml(day.date)}">${escapeHtml(day.date)}</a></h2>
${parts.join('\n')}
        </section>`;
    })
    .join('\n');

  const faqs = changesFaq(input);
  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>LLM API price changes</h1>
        <p class="lede">
          Every change PromptSpend has recorded to an LLM API price, newest first. Since tracking began on
          ${escapeHtml(input.firstDate)}, vendors have changed a published rate ${t.repriced} ${t.repriced === 1 ? 'time' : 'times'}
          on ${t.repricingDays} ${t.repricingDays === 1 ? 'day' : 'days'}, ${t.added} ${t.added === 1 ? 'model was' : 'models were'} added and
          ${t.removed} ${t.removed === 1 ? 'was' : 'were'} removed.
        </p>
        <div class="card">
          <p>
            <strong>How to read it.</strong> A <em>price change</em> is the vendor changing a rate. A
            <em>correction</em> is PromptSpend reading a better page, so the figure changes here but the
            vendor&rsquo;s price did not; it is labeled apart so repricing is never overstated. A rate
            PromptSpend only began recording is not a change to anyone&rsquo;s bill and is left out.
          </p>
          <p class="muted small">
            The same changes, one entry a day: <a href="${escapeHtml(href(ctx, '/feed.xml'))}">the Atom feed</a>.
            Every row, with the commit that published it:
            <a href="${escapeHtml(absolute(ctx, '/data/price-history.csv'))}">the price-history dataset</a>.
            Current prices with their sources are on <a href="${escapeHtml(href(ctx, '/models/'))}">the models page</a>.
          </p>
        </div>

${days}
${faqSection(faqs)}      </main>`;

  const description =
    'Every LLM API price change PromptSpend has recorded, newest first: what vendors changed, what PromptSpend corrected, and which models were added or removed.';
  return layout(ctx, {
    path: CHANGES_PATH,
    title: 'LLM API price changes: every change, dated and sourced',
    description,
    graph: [
      breadcrumbLd(ctx, crumbs, CHANGES_PATH),
      {
        '@type': 'WebPage',
        name: 'LLM API price changes',
        url: absolute(ctx, CHANGES_PATH),
        description,
        dateModified: input.lastChangeDate,
      },
      ...faqLd(faqs),
    ],
    body,
  });
}

// ------------------------------------------------------------ token counter

export const TOKEN_COUNTER_PATH = '/token-counter/';

function attributeString(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
    .join(' ');
}

/**
 * `/token-counter/`: paste text, see tokens and input cost for any model.
 *
 * Drawn complete at build time (the explanation, every model and its rate), with
 * the counting added by `src/chrome/token-counter.ts` when scripts run. The text
 * a visitor pastes is counted in their browser and goes nowhere.
 */
export function renderTokenCounterPage(input: TokenCounterInput, ctx: RenderContext): string {
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: 'Token counter', path: null },
  ];
  const first = input.models.find((m) => m.id === 'gpt-5') ?? input.models[0];

  const options = input.models
    .map(
      (m) =>
        `              <option value="${escapeHtml(m.id)}" data-input="${m.input}" data-context="${m.contextWindow}" ${attributeString(tokenizerAttributes(m.tokenizer))}${m.id === first?.id ? ' selected' : ''}>${escapeHtml(m.providerName)}: ${escapeHtml(m.name)}</option>`,
    )
    .join('\n');

  const rows = input.models
    .map(
      (m) => `              <tr data-input="${m.input}" ${attributeString(tokenizerAttributes(m.tokenizer))}>
                <td><a href="${escapeHtml(href(ctx, m.path))}">${escapeHtml(m.name)}</a></td>
                <td>${escapeHtml(m.providerName)}</td>
                <td class="num tc-row-tokens">&mdash;</td>
                <td class="tc-row-method">&mdash;</td>
                <td class="num tc-row-cost">&mdash;</td>
              </tr>`,
    )
    .join('\n');

  const faqs = tokenCounterFaq();
  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>Token counter</h1>
        <p class="lede">
          Paste text to see how many tokens it is for any model in the catalog, and what it would cost as
          input. Counting runs in your browser: your text is never sent anywhere.
        </p>

        <div class="card tc">
          <label for="tc-text" class="tc-label">Your text</label>
          <textarea id="tc-text" class="tc-text" rows="10" spellcheck="false" placeholder="Paste or type text here"></textarea>
          <p id="tc-needs-js" class="note">The counter needs JavaScript. The explanation and the model list below do not.</p>

          <label for="tc-model" class="tc-label">Count for this model</label>
          <select id="tc-model" class="tc-select">
${options}
          </select>

          <dl class="tc-stats" aria-live="polite">
            <div><dt>Tokens</dt><dd id="tc-tokens">0</dd></div>
            <div><dt>Count</dt><dd id="tc-method">&mdash;</dd></div>
            <div><dt>As input</dt><dd id="tc-cost">$0</dd></div>
            <div><dt>Context window used</dt><dd id="tc-context">0%</dd></div>
            <div><dt>Characters</dt><dd id="tc-chars">0</dd></div>
            <div><dt>Words</dt><dd id="tc-words">0</dd></div>
            <div><dt>Lines</dt><dd id="tc-lines">0</dd></div>
          </dl>
          <p id="tc-note" class="muted small"></p>
        </div>

        <h2>The same text on every model</h2>
        <p class="muted">
          Each family has its own tokenizer, so one text is a different number of tokens on different
          models. The cost is for sending this text as input at each model&rsquo;s current rate, per
          <a href="${escapeHtml(href(ctx, '/models/'))}">its page</a>.
        </p>
        <div class="card tablewrap" tabindex="0">
          <table>
            <caption class="unit cap">USD for this text as input. Rates in force when the page was built.</caption>
            <thead><tr><th>Model</th><th>Provider</th><th class="num">Tokens</th><th>Count</th><th class="num">As input</th></tr></thead>
            <tbody>
${rows}
            </tbody>
          </table>
        </div>

        <h2>What a token is</h2>
        <p>
          Language models read and bill in tokens: pieces of words rather than whole words. A short common
          word is usually one token; a long or rare word, a number or a line of code is several. As a rough
          guide, English text averages somewhere around four characters per token, and code and
          non-Latin scripts use more tokens for the same number of characters.
        </p>

        <h2>Exact and estimated counts</h2>
        <p>
          For OpenAI-family models this page runs the real tokenizer in your browser, so the count is exact
          for the text. For other families the vendor&rsquo;s tokenizer is not available in a browser, so
          the count is an estimate from a calibrated characters-per-token ratio, and it is labeled as one.
        </p>

        <h2>What the count leaves out</h2>
        <p>
          ${escapeHtml(FRAMING_CAVEAT)} The cost shown is for sending the text as input; the reply is billed
          separately as output tokens, usually at a higher rate. Cached input, batch discounts, long-context
          tiers and tool fees are not included. For a full estimate use
          <a href="${escapeHtml(href(ctx, '/'))}">the calculator</a>.
        </p>
${faqSection(faqs)}      </main>`;

  const description =
    'Paste text to count its tokens and see its input cost on any LLM. Runs in your browser, so your text is never sent anywhere; exact counts for OpenAI-family models.';
  return layout(ctx, {
    path: TOKEN_COUNTER_PATH,
    title: 'Token counter: tokens and input cost for any LLM',
    description,
    graph: [
      breadcrumbLd(ctx, crumbs, TOKEN_COUNTER_PATH),
      {
        '@type': 'WebApplication',
        name: 'PromptSpend token counter',
        url: absolute(ctx, TOKEN_COUNTER_PATH),
        description,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
      ...faqLd(faqs),
    ],
    scripts: ctx.tokenCounterScript ? [ctx.tokenCounterScript] : [],
    body,
  });
}

// ---------------------------------------------------------------- open data

export const DATA_PAGE_PATH = '/data/';

/** The archived copy of the price history on Zenodo (the 2026-10-05 version). */
export const PRICE_HISTORY_DOI = '10.5281/zenodo.23170741';

export interface DataPageInput {
  /** Models and providers in the catalog this build was made from. */
  models: number;
  providers: number;
  history: {
    firstDate: string;
    /** Rows in the published table. */
    rows: number;
    /** The date of the newest row, which moves only when a price does. */
    lastChangeDate: string;
  };
}

/**
 * The page that describes the files the site already publishes as data.
 *
 * The facts here are the ones the repository already states (docs/PRICE_HISTORY.md
 * and llms.txt): the catalog is MIT, the price history is CC0, and the history
 * has an archived copy with a DOI. Nothing is printed that changes every day,
 * so the page's date in the sitemap moves only when a price does.
 */
export function renderDataPage(input: DataPageInput, ctx: RenderContext): string {
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: 'Open data', path: null },
  ];
  const file = (path: string, label: string): string =>
    `<a href="${escapeHtml(href(ctx, path))}">${escapeHtml(label)}</a>`;
  const { history } = input;

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>Open data</h1>
        <p class="lede">
          Everything PromptSpend publishes about LLM API prices is a plain file you can download, with no key
          and no sign-up. The pages on this site are built from the same files.
        </p>

        <h2>The price catalog</h2>
        <p>
          ${file('/data/pricing.json', 'pricing.json')} holds ${input.models} models from ${input.providers} providers.
          Every price carries the vendor page it came from and the date it was last confirmed, and the file is
          rebuilt every morning. License: MIT. Use it in anything, including commercially; a link back is
          appreciated and not required. Notes on reading a price correctly are in ${file('/llms.txt', 'llms.txt')}.
        </p>

        <h2>Price history</h2>
        <p>
          ${file('/data/price-history.csv', 'price-history.csv')} and ${file('/data/price-history.json', 'price-history.json')}
          list every rate PromptSpend has published: one row for each rate that appeared, moved, was restated or went
          away, from ${escapeHtml(history.firstDate)} onward (${history.rows} rows so far). Every row names the commit that published it.
          License: public domain (<a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a>).
          An archived copy is on Zenodo, <a href="https://doi.org/${PRICE_HISTORY_DOI}">doi:${PRICE_HISTORY_DOI}</a>.
        </p>

        <h2>Free-tier facts</h2>
        <p>
          ${file('/data/free-tiers.json', 'free-tiers.json')} records what each tracked provider says about free use,
          with a link and the date it was read on every fact. License: MIT, like the rest of the repository.
        </p>

        <h2>Price changes as a feed</h2>
        <p>
          New models, price changes and corrections, one entry a day, in ${file('/feed.xml', 'the Atom feed')}.
          Corrections (PromptSpend misread a page) are labeled apart from repricing (the vendor changed a rate).
        </p>

        <h2>The pricing API</h2>
        <p>
          The same prices as JSON or CSV, keyless and open to browsers, at
          <a href="${escapeHtml(ctx.apiUrl)}">${escapeHtml(ctx.apiUrl.replace(/^https?:\/\//, ''))}</a>.
        </p>

        <h2>Citing it</h2>
        <p>
          Cite the archived price history by its DOI. For the catalog, a link to PromptSpend is enough. The code
          that builds all of it is open source on <a href="https://github.com/AndrewAvery7/promptspend">GitHub</a>.
        </p>
      </main>`;

  const creator = { '@type': 'Organization', name: 'PromptSpend', url: absolute(ctx, '/') };
  const dataset = (
    name: string,
    description: string,
    anchor: string,
    license: string,
    downloads: { path: string; type: string }[],
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    '@type': 'Dataset',
    name,
    description,
    url: `${absolute(ctx, DATA_PAGE_PATH)}#${anchor}`,
    creator,
    license,
    isAccessibleForFree: true,
    dateModified: history.lastChangeDate,
    distribution: downloads.map((download) => ({
      '@type': 'DataDownload',
      encodingFormat: download.type,
      contentUrl: absolute(ctx, download.path),
    })),
    ...extra,
  });

  const description =
    'Download PromptSpend’s LLM price catalog, its price history and its free-tier facts as plain files, with the license for each and no key or sign-up.';
  return layout(ctx, {
    path: DATA_PAGE_PATH,
    title: 'Open data: LLM API prices, price history and free tiers',
    description,
    graph: [
      breadcrumbLd(ctx, crumbs, DATA_PAGE_PATH),
      {
        '@type': 'WebPage',
        name: 'Open data',
        url: absolute(ctx, DATA_PAGE_PATH),
        description,
      },
      dataset(
        'PromptSpend LLM API price catalog',
        `Current API prices for ${input.models} language models from ${input.providers} providers, each with the vendor page it came from and the date it was last confirmed. Rebuilt every morning.`,
        'catalog',
        'https://opensource.org/licenses/MIT',
        [{ path: '/data/pricing.json', type: 'application/json' }],
      ),
      dataset(
        'PromptSpend LLM API price history',
        'Every rate PromptSpend has published for an LLM API: one row for each rate that appeared, moved, was restated or went away, each naming the commit that published it.',
        'history',
        'https://creativecommons.org/publicdomain/zero/1.0/',
        [
          { path: '/data/price-history.csv', type: 'text/csv' },
          { path: '/data/price-history.json', type: 'application/json' },
        ],
        {
          identifier: `https://doi.org/${PRICE_HISTORY_DOI}`,
          temporalCoverage: `${history.firstDate}/..`,
        },
      ),
      dataset(
        'PromptSpend free-tier facts',
        'What each tracked LLM provider says about free use of its API, with a link and the date it was read on every fact.',
        'free-tiers',
        'https://opensource.org/licenses/MIT',
        [{ path: '/data/free-tiers.json', type: 'application/json' }],
      ),
    ],
    body,
  });
}

// -------------------------------------------------------- information page

/** A durable product-information page such as Support or Privacy. */
export interface InformationPage {
  path: string;
  title: string;
  description: string;
  heading: string;
  /** ISO date (`YYYY-MM-DD`) the information was last reviewed. */
  updatedDate: string;
  bodyHtml: string;
}

/**
 * Where a page's markdown asks for the Google Analytics on/off control, written
 * on a line of its own. The generated HTML holds a sentence that is true
 * without JavaScript (Google Analytics cannot load without it), which the site
 * header's script replaces with the live control (`src/lib/analytics/notice.ts`).
 */
export const ANALYTICS_CHOICE_MARKER = '<p>[[analytics-choice]]</p>';

function analyticsChoice(bodyHtml: string): string {
  return bodyHtml.replace(
    ANALYTICS_CHOICE_MARKER,
    `<div id="analytics-choice" class="ga-choice"><p class="ga-choice__state">JavaScript is off, so Google Analytics is not running in this browser.</p></div>`,
  );
}

export function renderInformationPage(page: InformationPage, ctx: RenderContext): string {
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: page.heading, path: null },
  ];

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <article>
          <h1>${escapeHtml(page.heading)}</h1>
          <p class="lede">Last reviewed ${escapeHtml(page.updatedDate)}</p>
${analyticsChoice(page.bodyHtml)}
        </article>
      </main>`;

  return layout(ctx, {
    path: page.path,
    title: page.title,
    description: page.description,
    graph: [
      breadcrumbLd(ctx, crumbs, page.path),
      {
        '@type': 'WebPage',
        name: page.heading,
        description: page.description,
        url: absolute(ctx, page.path),
        dateModified: page.updatedDate,
      },
    ],
    body,
  });
}

// ------------------------------------------------------------------ app page

/** When the app page's copy was last reviewed against the two store listings. */
export const APP_PAGE_UPDATED = '2026-09-23';

const ANDROID_ROBOT_CREDIT =
  'The Android robot is reproduced or modified from work created and shared by Google and used according to terms described in the Creative Commons 3.0 Attribution License.';

/**
 * The permanent home of the two native apps.
 *
 * Every surface that mentions the apps links here (the footer's apps band, the
 * calculator's side list and the store listings). It is generated rather than
 * drawn by the calculator so it renders without JavaScript — which is also what a store reviewer, a crawler, or
 * anyone following a printed link gets.
 *
 * The feature list is taken from the store listings, not written fresh, so the
 * page cannot promise something the app does not do.
 */
export function renderAppPage(ctx: RenderContext): string {
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: 'iPhone & Android apps', path: null },
  ];
  const store = (url: string) => `href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"`;
  const asset = (path: string) => escapeHtml(href(ctx, path));

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <article class="app-page">
          <h1>PromptSpend for iPhone and Android</h1>
          <p class="lede">The same catalog, the same sources and dates, built for a phone. The apps are free, with no account, no ads and no tracking in the app's own code.</p>
          <div class="store-badges">
            <a ${store(APP_STORE_URL)}><img src="${asset('/store/app-store-badge.svg')}" alt="Download on the App Store" width="120" height="40" /></a>
            <a ${store(GOOGLE_PLAY_URL)}><img src="${asset('/store/google-play-badge.png')}" alt="Get it on Google Play" width="134" height="40" /></a>
          </div>
          <p class="store-qr store-qr__hint">On a computer? Point your phone&rsquo;s camera at the code for your phone.</p>
          <div class="store-qr">
            <a class="store-qr__code" ${store(APP_STORE_URL)}><img src="${asset('/store/qr-ios.svg')}" alt="QR code: PromptSpend on the App Store" width="132" height="132" /><span>iPhone &amp; iPad</span></a>
            <a class="store-qr__code" ${store(GOOGLE_PLAY_URL)}><img src="${asset('/store/qr-android.svg')}" alt="QR code: PromptSpend on Google Play" width="132" height="132" /><span>Android</span></a>
          </div>

          <h2>What it does</h2>
          <ul class="plain">
            <li><b>Forecast a conversation.</b> Paste sample text or enter known token counts, choose your traffic, and see the cost per conversation, day, month and year.</li>
            <li><b>Compare up to four models</b> side by side, ranked, with the monthly difference from the lowest-cost option.</li>
            <li><b>See what moves the number</b>: input, output, prompt-cache writes, long-context tiers, reasoning assumptions, batch discounts and conversation growth.</li>
            <li><b>Prices with evidence.</b> The same public catalog as this site, showing when each source was checked and flagging disagreements for review.</li>
            <li><b>Optional price alerts</b> by email, without creating an account.</li>
            <li><b>Share the result</b> as a readable estimate, a four-model comparison, a CSV or an Estimate Receipt &mdash; built from counts and costs, never your pasted text.</li>
          </ul>

          <h2>Private by design</h2>
          <p>Text you paste is processed on your phone and is not uploaded or saved by PromptSpend. There is no account, advertising SDK, behavioral analytics or cross-app tracking, and the random installation code the update check carries is not read, logged or stored. The details are in the <a href="${escapeHtml(href(ctx, '/privacy/'))}">privacy policy</a>.</p>

          <h2>Rather use the browser?</h2>
          <p>Nothing to install: <a href="${escapeHtml(href(ctx, '/'))}">the PromptSpend calculator</a> runs the same estimates in any browser.</p>

          <p class="credit">${escapeHtml(ANDROID_ROBOT_CREDIT)}</p>
        </article>
      </main>`;

  const app = (name: string, os: string, url: string) => ({
    '@type': 'MobileApplication',
    name,
    operatingSystem: os,
    applicationCategory: 'DeveloperApplication',
    url,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  });

  return layout(ctx, {
    path: APP_PAGE_PATH,
    title: 'PromptSpend for iPhone and Android — free AI cost estimates',
    description:
      "Forecast what an AI conversation will cost and compare up to four models, with every price's source. Free on the App Store and Google Play, no account, no ads.",
    // Safari on iPhone turns this into its own "Open in the App Store" strip.
    extraHead: `    <meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}" />\n`,
    // This page is the apps; the footer band would repeat its own badges and codes.
    appBand: false,
    graph: [
      breadcrumbLd(ctx, crumbs, APP_PAGE_PATH),
      {
        '@type': 'WebPage',
        name: 'PromptSpend for iPhone and Android',
        url: absolute(ctx, APP_PAGE_PATH),
        dateModified: APP_PAGE_UPDATED,
      },
      app('PromptSpend for iPhone and iPad', 'iOS', APP_STORE_URL),
      app('PromptSpend for Android', 'Android', GOOGLE_PLAY_URL),
    ],
    body,
  });
}

// ---------------------------------------------------------- free-tier pages

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10-05` as "5 Oct 2026" inside a machine-readable `<time>`. Built by
 *  hand rather than with `toLocaleDateString`, so two builds on machines with
 *  different locales still write identical pages. */
function dateTag(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const label = `${day} ${MONTHS[(month ?? 1) - 1]} ${year}`;
  return `<time datetime="${escapeHtml(iso)}">${escapeHtml(label)}</time>`;
}

/** The host a link goes to, which is what tells a reader whose page it is. */
function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const CARD_LABEL: Record<FreeTierRecord['card'], string> = { yes: 'Yes', no: 'No', unclear: 'Not stated' };
const TRAINING_LABEL: Record<FreeTierRecord['training'], string> = {
  yes: 'Yes',
  no: 'No',
  'opt-out': 'Yes, unless you opt out',
  unclear: 'Not clear',
};

function verdictBadge(verdict: FreeTierRecord['verdict']): string {
  return `<span class="verdict verdict-${escapeHtml(verdict)}">${escapeHtml(VERDICT_LABEL[verdict])}</span>`;
}

function factHtml(fact: CheckedFact, conflictName: string | null): string {
  const check = fact.check;
  const status =
    check.status === 'missing'
      ? `\n              <p class="note">When we re-read this page on ${dateTag(check.changedOn ?? check.lastConfirmed)}, this wording was no longer there. It is under review; treat it as possibly out of date.</p>`
      : '';
  const confirmed =
    check.lastConfirmed > fact.readOn ? ` &middot; still there on ${dateTag(check.lastConfirmed)}` : '';
  const conflict = conflictName
    ? `\n              <p class="conflict">Another of ${escapeHtml(conflictName)}&rsquo;s own pages says something different. Both are shown; we don&rsquo;t pick one.</p>`
    : '';
  return `            <li class="fact" id="${escapeHtml(fact.id)}">
              <p>${escapeHtml(fact.statement)}</p>${conflict}
              <details class="quote">
                <summary>Their exact words</summary>
                <blockquote cite="${escapeHtml(fact.url)}"><p>&ldquo;${escapeHtml(fact.quote)}&rdquo;</p></blockquote>
              </details>
              <p class="src">Source: <a href="${escapeHtml(fact.url)}" rel="nofollow noopener">${escapeHtml(sourceHost(fact.url))}</a> &middot; read ${dateTag(fact.readOn)}${confirmed}</p>${status}
            </li>`;
}

export function renderFreeTierPage(page: FreeTierPage, ctx: RenderContext): string {
  const name = page.provider.name;
  const record = page.record;
  const faqs = freeTierFaq(page);
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: NAV_LABELS.freeTiers, path: FREE_TIERS_PATH },
    { label: name, path: null },
  ];

  const sections = TOPIC_SECTIONS.map((section) => {
    const facts = page.facts.filter((fact) => section.topics.includes(fact.topic));
    if (facts.length === 0) return '';
    const items = facts.map((fact) => factHtml(fact, fact.conflictsWith ? name : null)).join('\n');
    return `        <h2>${escapeHtml(section.heading)}</h2>
        <ul class="facts">
${items}
        </ul>`;
  })
    .filter(Boolean)
    .join('\n');

  const unpublished =
    record.unpublished.length > 0
      ? `        <h2>What ${escapeHtml(name)} doesn&rsquo;t publish</h2>
        <p>We looked for these on ${escapeHtml(name)}&rsquo;s own pages and could not find them. We leave them blank rather than guess.</p>
        <ul class="plain">
${record.unpublished.map((item) => `          <li>${escapeHtml(item)}</li>`).join('\n')}
        </ul>`
      : '';

  const after = page.after
    ? `        <h2>After the free tier</h2>
        <p>${escapeHtml(name)}&rsquo;s lowest-priced model on sale today is
          <a href="${escapeHtml(href(ctx, page.after.path))}">${escapeHtml(page.after.model.displayName)}</a>, at
          ${rateCell(page.after.model, page.after.effective, 'input')} per million input tokens and
          ${rateCell(page.after.model, page.after.effective, 'output')} per million output tokens.
          <a href="${escapeHtml(href(ctx, page.providerPath))}">Every ${escapeHtml(name)} price</a> is checked against ${escapeHtml(name)}&rsquo;s own pricing page each morning.</p>
        ${calculatorLink(ctx, [page.after.model.id], `Estimate what ${page.after.model.displayName} would cost you`)}`
    : '';

  const training = `${TRAINING_LABEL[record.training]}${record.trainingNote ? ` (${record.trainingNote})` : ''}`;

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>${escapeHtml(page.heading)}</h1>
        <div class="card answer">
          <p>${verdictBadge(record.verdict)}</p>
          <p class="answer-text">${escapeHtml(record.answer)}</p>
        </div>
        <div class="card tablewrap" tabindex="0">
          <table>
            <caption class="unit cap">At a glance, from ${escapeHtml(name)}&rsquo;s own pages &middot; last updated ${dateTag(record.updated)}</caption>
            <tbody>
              <tr><th scope="row">Free to start</th><td>${escapeHtml(VERDICT_LABEL[record.verdict])}</td></tr>
              <tr><th scope="row">What is free</th><td>${escapeHtml(record.whatsFree)}</td></tr>
              <tr><th scope="row">Payment needed to start</th><td>${escapeHtml(CARD_LABEL[record.card])}</td></tr>
              <tr><th scope="row">Free use trains their models</th><td>${escapeHtml(training)}</td></tr>
            </tbody>
          </table>
        </div>
${[sections, unpublished, after].filter(Boolean).join('\n')}
        <h2>How this page is kept accurate</h2>
        <p class="small muted">Every fact above is ${escapeHtml(name)}&rsquo;s own wording, with a link to the page it came from and the date it was read. Each morning we re-read those pages and check the wording is still there; if it has gone, the fact is marked as under review rather than quietly changed. <a href="${escapeHtml(href(ctx, FREE_TIERS_PATH))}">Compare every provider&rsquo;s free tier</a>.</p>
${faqSection(faqs)}      </main>`;

  return layout(ctx, {
    path: page.path,
    title: page.title,
    description: page.description,
    graph: [
      breadcrumbLd(ctx, crumbs, page.path),
      ...faqLd(faqs),
      {
        '@type': 'WebPage',
        name: page.heading,
        description: page.description,
        url: absolute(ctx, page.path),
        dateModified: page.lastmod,
        about: {
          '@type': 'Organization',
          name,
          ...(page.provider.pricingUrl ? { url: page.provider.pricingUrl } : {}),
        },
        citation: [...new Set(page.facts.map((fact) => fact.url))],
      },
    ],
    body,
  });
}

export function renderFreeTierIndex(set: FreeTierPageSet, ctx: RenderContext): string {
  const page = set.index;
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: NAV_LABELS.freeTiers, path: null },
  ];
  const count = (verdict: FreeTierRecord['verdict']) =>
    set.pages.filter((p) => p.record.verdict === verdict).length;
  const unclear = count('unclear');
  const verb = (n: number, one: string, many: string) => (n === 1 ? one : many);

  const rows = set.pages
    .map(
      (entry) => `            <tr>
              <td><a href="${escapeHtml(href(ctx, entry.path))}">${escapeHtml(entry.provider.name)}</a></td>
              <td>${verdictBadge(entry.record.verdict)}</td>
              <td>${escapeHtml(entry.record.whatsFree)}</td>
              <td>${escapeHtml(CARD_LABEL[entry.record.card])}</td>
              <td>${escapeHtml(TRAINING_LABEL[entry.record.training])}${entry.record.trainingNote ? '<sup>*</sup>' : ''}</td>
            </tr>`,
    )
    .join('\n');
  const notes = set.pages
    .filter((entry) => entry.record.trainingNote)
    .map(
      (entry) =>
        `        <p class="small muted"><sup>*</sup> ${escapeHtml(entry.provider.name)}: ${escapeHtml(entry.record.trainingNote!)}.</p>`,
    )
    .join('\n');

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="lede">Of ${set.pages.length} providers, ${count('ongoing')} ${verb(count('ongoing'), 'has', 'have')} an ongoing free tier, ${count('one-time')} ${verb(count('one-time'), 'gives', 'give')} one-time credit, ${count('none')} ${verb(count('none'), 'has', 'have')} none, and ${unclear} ${verb(unclear, 'is', 'are')} unclear because the provider&rsquo;s own pages don&rsquo;t settle it. Every answer links to a page quoting the provider&rsquo;s own words, with sources and dates.</p>
        <div class="card tablewrap" tabindex="0">
          <table>
            <caption class="unit cap">Ongoing free tiers first. &ldquo;Trains models&rdquo; means the provider says it may use free-tier prompts and responses to train or improve its models.</caption>
            <thead><tr><th>Provider</th><th>Free to start</th><th>What is free</th><th>Payment to start</th><th>Free use trains models</th></tr></thead>
            <tbody>
${rows}
            </tbody>
          </table>
        </div>
${notes}
        <h2>What the answers mean</h2>
        <ul class="plain">
          <li><b>Ongoing free tier</b>: you can keep using some models without paying, within limits.</li>
          <li><b>One-time credit</b>: a starting allowance that runs out or expires; after that you pay.</li>
          <li><b>No free tier</b>: you pay, usually in advance, before your first real request.</li>
          <li><b>Unclear</b>: the provider&rsquo;s own pages contradict each other or leave the terms unpublished. We show what they say rather than guess.</li>
        </ul>
        <p class="small muted">Free tiers change often and are phrased loosely, so each provider page quotes the provider word for word and links to the source. We re-read every source each morning and mark any wording that has disappeared. For prices once the free part ends, see <a href="${escapeHtml(href(ctx, '/providers/'))}">every provider&rsquo;s pricing</a>.</p>
      </main>`;

  return layout(ctx, {
    path: page.path,
    title: page.title,
    description: page.description,
    graph: [
      breadcrumbLd(ctx, crumbs, page.path),
      {
        '@type': 'CollectionPage',
        name: page.heading,
        url: absolute(ctx, page.path),
        description: page.description,
        dateModified: page.lastmod,
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: set.pages.length,
          itemListElement: set.pages.map((entry, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: `${entry.provider.name} free tier`,
            url: absolute(ctx, entry.path),
          })),
        },
      },
    ],
    body,
  });
}
