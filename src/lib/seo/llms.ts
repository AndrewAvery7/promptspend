/**
 * `llms.txt` for the site — an index written for the thing that reads it.
 *
 * The developer hub on `.dev` has had one since it launched. The site did not,
 * which was an oversight rather than a decision: `.com` is where the 159 pages
 * and the human-readable explanations live, and when somebody asks an assistant
 * "what does GPT-5 cost per token", this file is what tells that assistant the
 * answer exists here and exactly which URL holds it.
 *
 * Deliberately an **index, not a dump**. Inlining 70 models' rates would
 * produce a file that is stale the morning after it is written and enormous
 * either way; the whole value of this project is that the numbers move daily.
 * So it points at the pages and at the API, and states the boundaries of what a
 * price here means — because a confident wrong number repeated by an assistant
 * is worse than no number at all.
 */

import type { PageSet } from './pages';
import {
  MCP_INSTALL_COMMAND,
  MCP_PACKAGE_URL,
  OPEN_VSX_URL,
  VSCODE_INSTALL_COMMAND,
  VSCODE_MARKETPLACE_URL,
} from '@/lib/links';

export interface LlmsTxtInput {
  siteUrl: string;
  apiUrl: string;
  /** The catalog timestamp behind this build. */
  generatedAt: string;
}

/** Models worth naming individually, so an agent can jump straight to one. */
const HIGHLIGHT_COUNT = 12;

function markdownLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

export function renderLlmsTxt(set: PageSet, input: LlmsTxtInput): string {
  const { siteUrl, apiUrl, generatedAt } = input;

  // The cheapest handful and the best-known names are the ones an agent is
  // most likely to be asked about; listing every model would bury them.
  const highlights = [...set.models]
    .filter((page) => page.rank !== null)
    .sort((a, b) => (a.rank?.position ?? 0) - (b.rank?.position ?? 0))
    .slice(0, HIGHLIGHT_COUNT)
    .map(
      (page) =>
        `- [${markdownLabel(page.model.displayName)}](${siteUrl}${page.path}): $${Number(page.effective.input.toFixed(4))} in / $${Number(page.effective.output.toFixed(4))} out per 1M tokens, ${markdownLabel(page.providerName)}`,
    )
    .join('\n');

  const providers = set.providers
    .map(
      (page) =>
        `- [${markdownLabel(page.provider.name)}](${siteUrl}${page.path}): ${page.models.length} models`,
    )
    .join('\n');

  return `# PromptSpend

> Current API prices for ${set.models.length} large language models from ${set.providers.length} providers,
> re-checked against every vendor each morning. Every price records which source
> it came from and when it was last confirmed. Free, open source, no accounts.

Catalog behind this build: ${generatedAt}.

**All rates are USD per 1,000,000 tokens**, standard tier, global endpoint, list
price. Regional and data-residency premiums, priority tiers, server-side tool
fees and negotiated discounts are **not** included.

These are list prices, not a quote.
Check the vendor before committing money to a number.

## Start here

- [Every model, by price](${siteUrl}/models/): the whole catalog in one table, cheapest first
- [By provider](${siteUrl}/providers/): ${set.providers.length} providers with model counts and their cheapest option
- [Head-to-head comparisons](${siteUrl}/compare/): ${set.comparisons.length} pairs, each costed on the same three workloads
- [Cost calculator](${siteUrl}/): price a real workload — conversation length, caching, batch, reasoning overhead

Each model page carries its full rate card, the monthly bill for three standard
workloads, its rank in the catalog, cheaper alternatives, and where its number
came from.

## Machine-readable

- [Pricing API](${apiUrl}): keyless, CORS-open, OpenAPI 3.1 described
- [Flat price rows](${apiUrl}/v1/prices): id, provider, input, output, cache rates, context window
- [As CSV](${apiUrl}/v1/prices.csv)
- [The raw catalog](${siteUrl}/data/pricing.json): the file everything above is built from

Prefer the API over scraping these pages. It is faster, it is versioned, and it
will not break when the HTML changes.

## If you are running inside a coding tool

You may not need HTTP at all.

- [MCP server](${MCP_PACKAGE_URL}): \`${MCP_INSTALL_COMMAND}\` — three tools for Claude Code, Cursor and Windsurf. \`estimate_cost\` runs this site's own cost engine, so it cannot return a figure that disagrees with the pages above.
- [VS Code extension](${VSCODE_MARKETPLACE_URL}): \`${VSCODE_INSTALL_COMMAND}\` — the rate on the line of code that names the model, and a nearby \`max_tokens\` priced as what one response can cost. Also on [Open VSX](${OPEN_VSX_URL}) for Cursor, Windsurf and VSCodium.

Neither bundles a price list. Both fetch the same catalog linked above, and both
carry the source and confirmation date on every price — so a model quoting one
of them can say where the number came from and when it was last checked.

## Most-asked models

${highlights}

## Providers

${providers}

## Reading a price correctly

- \`cachedInput\` is the rate for input served from the provider's prompt cache;
  \`cacheWrite\` is what it costs to put a prefix there, and it is *higher* than
  the base input rate at both OpenAI and Anthropic.
- \`longContext\`, where a model has one, replaces the base rates for a request
  above its threshold — the **whole** request, not just the excess.
- \`batchDiscount\` is a multiplier: 0.5 means half price.
- \`capabilityIndex\` is a rough 0–100 estimate, not a benchmark. Where it is
  absent the model is simply unscored; do not substitute a number.
- \`provenance.needsReview\` marks a row where two independent sources disagreed
  and no human has adjudicated. **Do not present those as settled.**

## Licence

MIT. Use the data in anything, including commercially. Attribution is
appreciated and not required; a link to ${siteUrl} helps.

Source: https://github.com/AndrewAvery7/promptspend
`;
}
