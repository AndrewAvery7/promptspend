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
 *    script and no third-party script beyond the approved beacon: the
 *    JSON-LD data block is admitted by its hash, and Cloudflare adds the Web
 *    Analytics beacon (owner-approved 2026-10-05) as it serves the page.
 * 2. **Therefore a very tight Content Security Policy** — `default-src 'none'`,
 *    with the JSON-LD admitted by its exact SHA-256 rather than by
 *    `'unsafe-inline'`. The hash is computed over the string that is actually
 *    emitted (see `hashInline`), so the two cannot drift apart.
 * 3. **Therefore almost no external anything**: no fonts, no third-party
 *    images beyond the listing badges in the footer. Those are same-origin
 *    copies, except LaunchNest's: its verifier refuses a copy, so - approved
 *    2026-10-05 - its image loads from launchnest.io, with no referrer, and
 *    `img-src` admits that one origin. The analytics beacon's script is the
 *    one other origin (`script-src`); it posts only to this site, so
 *    `connect-src` stays `'self'`.
 *
 * Every string that reaches the output goes through `escapeHtml`. Catalog data
 * is not user input, but it is *upstream* input — it arrives from LiteLLM and
 * OpenRouter — and a display name is exactly the field an injection would ride
 * in on.
 */

import { DEFAULT_SCENARIO, encodeScenario } from '../url/scenario';
import { formatContext, formatMoney, formatPercent } from '../engine/format';
import type { Model, Pricing } from '../pricing/types';
import { promoFor, promoTitle, type RateField } from '../pricing/promo';
import { APP_PAGE_PATH, APP_STORE_ID, APP_STORE_URL, GOOGLE_PLAY_URL } from '../links';
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
   * The directory-listing badges in the footer. On by default, and they must
   * stay on the pages the directories verify (`/models/` and the other catalog
   * pages: the calculator's own footer is drawn by script, so a fetch-only
   * verifier cannot see it there). Sell With Boost keeps the listing only while
   * a badge links back. Pages added since can leave them off.
   */
  listingBadges?: boolean;
}

export function layout(ctx: RenderContext, input: LayoutInput): string {
  const canonical = absolute(ctx, input.canonicalPath ?? input.path);
  const ld = jsonForScript({ '@context': 'https://schema.org', '@graph': input.graph });
  const scripts = input.scripts ?? [];
  for (const src of scripts) {
    if (!src.startsWith('/') || src.startsWith('//')) {
      throw new Error(`layout: script "${src}" must be a path on this site, not a URL`);
    }
  }
  // `'self'` admits PromptSpend's own script files. The data block is named by
  // its own hash: `'unsafe-inline'` would be one word shorter and would also
  // permit every future inline script, which nothing here needs.
  const csp = [
    "default-src 'none'",
    "style-src 'self'",
    "img-src 'self' data: https://launchnest.io",
    `script-src 'self' 'sha256-${ctx.hashInline(ld)}' https://static.cloudflareinsights.com`,
    "connect-src 'self'",
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
${input.robots ? `    <meta name="robots" content="${escapeHtml(input.robots)}" />\n` : ''}    <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
${input.extraHead ?? ''}    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="PromptSpend" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:title" content="${escapeHtml(input.title)}" />
    <meta property="og:description" content="${escapeHtml(input.description)}" />
    <meta property="og:image" content="${escapeHtml(absolute(ctx, '/social-card.png?v=a0fd6116'))}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${escapeHtml(absolute(ctx, '/social-card.png?v=a0fd6116'))}" />
    <link rel="stylesheet" href="${escapeHtml(href(ctx, ctx.cssPath))}" />
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 26'%3E%3Crect x='1.5' y='1.5' width='23' height='23' rx='6' fill='none' stroke='%232456E6' stroke-width='2'/%3E%3Cpath d='M7 9.5h12M7 13.5h8M7 17.5h10' stroke='%232456E6' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E" />
    <script type="application/ld+json">${ld}</script>
${scripts.map((src) => `    <script type="module" src="${escapeHtml(href(ctx, src))}"></script>\n`).join('')}  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    <div class="wrap">
${input.body}
      <footer>
        <p>
          Prices from a catalog re-checked every morning against the vendors&rsquo; own pages;
          this build read the catalog generated ${escapeHtml(ctx.generatedAt.slice(0, 10))}.
          Standard-tier, global-endpoint list prices in USD.
        </p>
        <p>
          <a href="${escapeHtml(href(ctx, '/'))}">PromptSpend calculator</a> &middot;
          <a href="${escapeHtml(href(ctx, APP_PAGE_PATH))}">iPhone &amp; Android apps</a> &middot;
          <a href="${escapeHtml(href(ctx, '/models/'))}">All models</a> &middot;
          <a href="${escapeHtml(href(ctx, '/providers/'))}">Providers</a> &middot;
          <a href="${escapeHtml(href(ctx, '/compare/'))}">Comparisons</a> &middot;
          <a href="${escapeHtml(href(ctx, '/free-tiers/'))}">Free tiers</a> &middot;
          <a href="${escapeHtml(href(ctx, '/support/'))}">Support</a> &middot;
          <a href="${escapeHtml(href(ctx, '/privacy/'))}">Privacy</a> &middot;
          <a href="${escapeHtml(ctx.apiUrl)}">Pricing API</a> &middot;
          <a href="https://github.com/AndrewAvery7/promptspend">Source</a>
        </p>
${
  input.listingBadges === false
    ? ''
    : `        <p class="listing">
          <a href="https://sellwithboost.com" target="_blank" rel="noopener noreferrer">
            <picture>
              <source srcset="${escapeHtml(href(ctx, '/sellwithboost-dark.svg'))}" media="(prefers-color-scheme: dark)" />
              <img src="${escapeHtml(href(ctx, '/sellwithboost-light.svg'))}" alt="Listed on Sell With boost" width="160" height="40" />
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
        </p>
`
}      </footer>
    </div>
  </body>
</html>
`;
}

// ------------------------------------------------------------- shared blocks

function calculatorLink(ctx: RenderContext, modelIds: string[], label: string): string {
  const query = encodeScenario({ ...DEFAULT_SCENARIO, modelIds });
  return `<p><a class="cta" href="${escapeHtml(`${href(ctx, '/')}?${query}`)}">${escapeHtml(label)}</a></p>`;
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
      row('Cache write', pricing.cacheWrite, 'Charged once, to put a prefix into the cache.', 'cacheWrite'),
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

// -------------------------------------------------------------- model page

export function renderModelPage(page: ModelPage, ctx: RenderContext): string {
  const { model, effective } = page;
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
        <p class="muted">The same three workloads are costed on every model page, so these numbers are directly comparable across the catalog. No prompt caching and no batch discount is assumed — the figures are what you pay before you optimise anything.</p>
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

        <h2>Where these numbers come from</h2>
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
      </main>`;

  return layout(ctx, {
    path: page.path,
    title: page.title,
    description: page.description,
    graph: [
      breadcrumbLd(ctx, crumbs, page.path),
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
 * catalogue that sells nothing came to be asked for a shipping policy.
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

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="lede">
          ${escapeHtml(page.leftProvider)} against ${escapeHtml(page.rightProvider)}, costed on the same three workloads.
          <strong>${escapeHtml(page.verdict)}</strong>
        </p>
        ${retiredNotes}

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
${page.bodyHtml}
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
${page.bodyHtml}
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
 * The calculator's launch banner can be dismissed, and a dismissal is
 * remembered; this page cannot, and every surface that mentions the apps links
 * here. It is generated rather than drawn by the calculator so it renders
 * without JavaScript — which is also what a store reviewer, a crawler, or
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
        <article>
          <h1>PromptSpend for iPhone and Android</h1>
          <p class="lede">The same catalog, the same sources and dates, built for a phone. Free, with no account, no ads and no tracking.</p>
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
          <p>Text you paste is processed on your phone and is not uploaded or saved by PromptSpend. There is no account, advertising SDK, behavioural analytics or tracking identifier. The details are in the <a href="${escapeHtml(href(ctx, '/privacy/'))}">privacy policy</a>.</p>

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
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: 'Free tiers', path: FREE_TIERS_PATH },
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
    listingBadges: false,
  });
}

export function renderFreeTierIndex(set: FreeTierPageSet, ctx: RenderContext): string {
  const page = set.index;
  const crumbs: Crumb[] = [
    { label: 'PromptSpend', path: '/' },
    { label: 'Free tiers', path: null },
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
    listingBadges: false,
  });
}
