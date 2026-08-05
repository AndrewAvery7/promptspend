/**
 * The generated pages, as HTML strings.
 *
 * Three deliberate constraints, each of which is the reason for the next:
 *
 * 1. **No JavaScript.** These pages state numbers. A React bundle to render
 *    static text would cost every visitor a download and every crawler a render
 *    pass, and would make the content invisible to anything that does not run
 *    scripts. The only `<script>` on the page is the JSON-LD data block, which
 *    is not executed.
 * 2. **Therefore a very tight Content Security Policy** — `default-src 'none'`,
 *    with the JSON-LD admitted by its exact SHA-256 rather than by
 *    `'unsafe-inline'`. The hash is computed over the string that is actually
 *    emitted (see `hashInline`), so the two cannot drift apart.
 * 3. **Therefore no external anything**: no fonts, no analytics, no images
 *    beyond an inline SVG favicon. Which is also the honest position for a site
 *    whose footer says "no accounts, no tracking".
 *
 * Every string that reaches the output goes through `escapeHtml`. Catalog data
 * is not user input, but it is *upstream* input — it arrives from LiteLLM and
 * OpenRouter — and a display name is exactly the field an injection would ride
 * in on.
 */

import { DEFAULT_SCENARIO, encodeScenario } from '../url/scenario';
import { formatContext, formatMoney, formatPercent } from '../engine/format';
import type { Model, Pricing } from '../pricing/types';
import {
  blendedRate,
  type ComparisonPage,
  type IndexPage,
  type ModelPage,
  type PageSet,
  type ProviderPage,
} from './pages';

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

interface LayoutInput {
  path: string;
  title: string;
  description: string;
  /** Nodes for the JSON-LD `@graph`. */
  graph: unknown[];
  body: string;
}

function layout(ctx: RenderContext, input: LayoutInput): string {
  const canonical = absolute(ctx, input.path);
  const ld = jsonForScript({ '@context': 'https://schema.org', '@graph': input.graph });
  // The policy names the data block by its own hash. `'unsafe-inline'` would be
  // one word shorter and would also permit every future inline script, on pages
  // that are supposed to have none.
  const csp = [
    "default-src 'none'",
    "style-src 'self'",
    "img-src 'self' data:",
    `script-src 'sha256-${ctx.hashInline(ld)}'`,
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
    <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="PromptSpend" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:title" content="${escapeHtml(input.title)}" />
    <meta property="og:description" content="${escapeHtml(input.description)}" />
    <meta property="og:image" content="${escapeHtml(absolute(ctx, '/social-card.png'))}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${escapeHtml(absolute(ctx, '/social-card.png'))}" />
    <link rel="stylesheet" href="${escapeHtml(href(ctx, ctx.cssPath))}" />
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 26'%3E%3Crect x='1.5' y='1.5' width='23' height='23' rx='6' fill='none' stroke='%232456E6' stroke-width='2'/%3E%3Cpath d='M7 9.5h12M7 13.5h8M7 17.5h10' stroke='%232456E6' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E" />
    <script type="application/ld+json">${ld}</script>
  </head>
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
          <a href="${escapeHtml(href(ctx, '/models/'))}">All models</a> &middot;
          <a href="${escapeHtml(href(ctx, '/providers/'))}">Providers</a> &middot;
          <a href="${escapeHtml(href(ctx, '/compare/'))}">Comparisons</a> &middot;
          <a href="${escapeHtml(ctx.apiUrl)}">Pricing API</a> &middot;
          <a href="https://github.com/AndrewAvery7/promptspend">Source</a>
        </p>
      </footer>
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

function rateRows(pricing: Pricing): string {
  const rows: string[] = [
    row('Input', pricing.input, 'Every token you send: prompt, history, documents.'),
    row('Output', pricing.output, 'Every token the model generates, including hidden reasoning tokens.'),
  ];
  if (pricing.cachedInput !== undefined) {
    rows.push(row('Cached input', pricing.cachedInput, 'Input served from the provider’s prompt cache.'));
  }
  if (pricing.cacheWrite !== undefined) {
    rows.push(row('Cache write', pricing.cacheWrite, 'Charged once, to put a prefix into the cache.'));
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

  function row(label: string, value: number, note: string): string {
    return `            <tr>
              <th scope="row">${escapeHtml(label)}</th>
              <td class="num">${escapeHtml(rate(value))}</td>
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
              <td class="num">${escapeHtml(rate(alt.model.pricing.input))}</td>
              <td class="num">${escapeHtml(rate(alt.model.pricing.output))}</td>
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
    ['Status', model.status === 'current' ? 'Current' : model.status === 'legacy' ? 'Legacy' : 'Deprecated'],
    ...(model.releaseDate ? ([['Released', model.releaseDate]] as [string, string][]) : []),
    ['Reasoning model', model.capabilities.reasoning ? 'Yes' : 'No'],
    ['Vision', model.capabilities.vision ? 'Yes' : 'No'],
    [
      'Token counting',
      model.tokenizer.kind === 'tiktoken'
        ? `Exact, via <code>${escapeHtml(model.tokenizer.encoding)}</code>`
        : `Estimated at ~${model.tokenizer.charsPerToken} characters per token${model.tokenizer.note ? ` (${escapeHtml(model.tokenizer.note)})` : ''}`,
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
${rateRows(effective)}
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

export function renderProviderPage(page: ProviderPage, ctx: RenderContext): string {
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
                  : ` <span class="pill">${escapeHtml(entry.model.status)}</span>`
              }</td>
              <td class="num">${escapeHtml(rate(entry.model.pricing.input))}</td>
              <td class="num">${escapeHtml(rate(entry.model.pricing.output))}</td>
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
        </p>
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

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="lede">
          ${escapeHtml(page.leftProvider)} against ${escapeHtml(page.rightProvider)}, costed on the same three workloads.
          <strong>${escapeHtml(page.verdict)}</strong>
        </p>

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
${spec('Input, per 1M tokens', escapeHtml(rate(page.left.pricing.input)), escapeHtml(rate(page.right.pricing.input)))}
${spec('Output, per 1M tokens', escapeHtml(rate(page.left.pricing.output)), escapeHtml(rate(page.right.pricing.output)))}
${spec('Cached input', page.left.pricing.cachedInput === undefined ? '<span class="muted">not published</span>' : escapeHtml(rate(page.left.pricing.cachedInput)), page.right.pricing.cachedInput === undefined ? '<span class="muted">not published</span>' : escapeHtml(rate(page.right.pricing.cachedInput)))}
${spec('Context window', escapeHtml(formatContext(page.left.contextWindow)), escapeHtml(formatContext(page.right.contextWindow)))}
${spec('Maximum output', page.left.maxOutput ? escapeHtml(formatContext(page.left.maxOutput)) : '—', page.right.maxOutput ? escapeHtml(formatContext(page.right.maxOutput)) : '—')}
${spec('Reasoning model', page.left.capabilities.reasoning ? 'yes' : 'no', page.right.capabilities.reasoning ? 'yes' : 'no')}
${spec('Vision', page.left.capabilities.vision ? 'yes' : 'no', page.right.capabilities.vision ? 'yes' : 'no')}
            </tbody>
          </table>
        </div>

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
                  : ` <span class="pill">${escapeHtml(entry.model.status)}</span>`
              }</td>
              <td><a href="${escapeHtml(href(ctx, entry.providerPath))}">${escapeHtml(entry.providerName)}</a></td>
              <td class="num">${escapeHtml(rate(entry.effective.input))}</td>
              <td class="num">${escapeHtml(rate(entry.effective.output))}</td>
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

export function renderProvidersIndex(set: PageSet, ctx: RenderContext): string {
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
              <td class="num">${entry.cheapest ? escapeHtml(rate(entry.cheapest.pricing.input)) : '—'}</td>
            </tr>`,
    )
    .join('\n');

  const body = `      ${breadcrumbHtml(ctx, crumbs)}
      <main id="main">
        <h1>${escapeHtml(page.heading)}</h1>
        <p class="lede">${set.providers.length} providers tracked. &ldquo;Cheapest model&rdquo; is by blended rate, not by input price alone — a model with cheap input and expensive output is not a cheap model.</p>
        <div class="card tablewrap" tabindex="0">
          <table>
            <thead><tr><th>Provider</th><th>Country</th><th class="num">Models</th><th>Cheapest model</th><th class="num">Its input rate</th></tr></thead>
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
          ${set.comparisons.length} comparisons. Only models from <em>different</em> providers appear here, and
          only where the two are within 3&times; of each other on price — a $0.14 model against a $75 one is
          not a decision anybody is weighing.
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
