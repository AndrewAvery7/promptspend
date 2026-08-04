/**
 * Turning a matched model into the two things the editor shows: a short string
 * at the end of the line, and the panel behind a hover.
 *
 * Pure — no `vscode` import. The hover is a markdown string, which is what the
 * editor wants anyway, and which a test can read.
 *
 * Every number here comes from the catalog row. Nothing is derived, averaged or
 * defaulted: a rate the provider does not publish is absent from the output
 * rather than filled in, because a plausible invented number in an editor gutter
 * is the most quietly damaging thing this extension could produce.
 */
import type { Catalog } from '@/lib/pricing/catalog';
import type { Model } from '@/lib/pricing/types';
import { formatRate, formatContext, formatTokens, formatMoney, formatCount } from '@/lib/engine/format';
import { encodeScenario, DEFAULT_SCENARIO } from '@/lib/url/scenario';
import type { ModelMatch } from './scan';
import type { Ceiling } from './ceiling';

export const SITE = 'https://promptspend.com';

export type InlineDetail = 'compact' | 'full' | 'off';

/** How the source rung reads to someone who has not seen the trust ladder. */
const SOURCE_TEXT: Record<Model['provenance']['source'], string> = {
  vendor: "Hand-verified against the provider's own pricing page",
  litellm: 'From the LiteLLM community catalog',
  openrouter: 'From the OpenRouter API',
};

/**
 * A deep link into the estimator with this model selected, and optionally with a
 * real token count already filled in.
 */
export function estimatorLink(modelId: string, userTokens?: number): string {
  // Built through the site's own encoder rather than by concatenating `?m=`, so
  // a change to the parameter names cannot leave this link silently pointing at
  // a scenario with no model in it. present.test.ts round-trips it.
  return `${SITE}/?${encodeScenario({
    ...DEFAULT_SCENARIO,
    modelIds: [modelId],
    ...(userTokens !== undefined ? { userTokens } : {}),
  })}`;
}

/**
 * The end-of-line annotation. Deliberately terse: it sits inside someone's code,
 * and anything longer than a few words reads as clutter rather than help.
 *
 * The ceiling, when there is one, goes in both modes rather than only in `full`.
 * It is the most actionable thing on the line — a rate is abstract, and
 * "$0.061 every call" is not.
 */
export function inlineText(match: ModelMatch, detail: InlineDetail, ceiling?: Ceiling): string | null {
  if (detail === 'off') return null;
  const { pricing, provenance } = match.model;

  const parts = [`${formatRate(pricing.input)} / ${formatRate(pricing.output)} per M`];
  if (detail === 'full') parts.push(`confirmed ${provenance.lastVerified}`);

  // The ceiling is shown only when the request can actually happen.
  //
  // A cap above what the model can emit produces a rejected or truncated
  // request, not a more expensive one, so `maxTokens × output rate` for it is a
  // number nobody will ever be billed. Showing it beside the warning — which is
  // what this did until a review screenshot put "max out $5,000 ⚠ above model
  // max" on one line — names the impossibility and prices it anyway. The
  // warning replaces the figure rather than annotating it.
  const flags: string[] = [];
  if (ceiling?.exceedsModelMax) {
    flags.push('⚠ above model max');
  } else if (ceiling) {
    parts.push(`max out ${formatMoney(ceiling.outputCostUsd)}`);
  }
  if (provenance.needsReview) flags.push('⚠ disputed');

  return [parts.join(' · '), ...flags].join('  ');
}

/**
 * The hover panel.
 *
 * Ordered by what a reader is deciding: the rates first, then what changes them
 * (tiers, discounts, expiry), then the limits, then where the number came from.
 * Warnings interrupt at the top, because a disputed price should not be read
 * before it is known to be disputed.
 */
export function hoverMarkdown(match: ModelMatch, catalog: Catalog, ceiling?: Ceiling): string {
  const model = match.model;
  const { pricing } = model;
  const out: string[] = [];

  out.push(`### ${model.displayName}`);
  out.push(`${catalog.providerName(model)}${model.status !== 'current' ? ` · **${model.status}**` : ''}`);

  for (const warning of warningsFor(match)) out.push(`> ⚠ ${warning}`);

  const rows: string[] = [
    `| Input | ${formatRate(pricing.input)} per 1M tokens |`,
    `| Output | ${formatRate(pricing.output)} per 1M tokens |`,
  ];
  if (pricing.cachedInput !== undefined) {
    rows.push(`| Cached input | ${formatRate(pricing.cachedInput)} per 1M |`);
  }
  if (pricing.cacheWrite !== undefined) {
    rows.push(`| Cache write | ${formatRate(pricing.cacheWrite)} per 1M |`);
  }
  rows.push(`| Context | ${formatContext(model.contextWindow)} |`);
  if (model.maxOutput !== undefined) rows.push(`| Max output | ${formatTokens(model.maxOutput)} |`);

  out.push(['| | |', '| --- | --- |', ...rows].join('\n'));

  if (ceiling) out.push(ceilingLine(ceiling, model));

  const notes = pricingNotes(model);
  if (notes.length > 0) out.push(notes.map((n) => `- ${n}`).join('\n'));

  out.push(provenanceLine(model));
  out.push(`[Estimate this workload on PromptSpend](${estimatorLink(model.id)})`);

  return out.join('\n\n');
}

/**
 * What the cap on this call means in money.
 *
 * Says "the response alone" every time. The input side is unknown here and
 * frequently the larger half once history is included, so a number presented as
 * the cost of the call would be understating it — the precise error this project
 * exists to correct.
 */
function ceilingLine(ceiling: Ceiling, model: Model): string {
  if (ceiling.exceedsModelMax) {
    return (
      `> ⚠ This call asks for ${formatCount(ceiling.maxTokens)} output tokens, but ${model.displayName} ` +
      `can emit at most ${formatCount(model.maxOutput!)}. The request will be rejected or truncated ` +
      `rather than costing more.`
    );
  }
  return (
    `**Ceiling:** at ${formatCount(ceiling.maxTokens)} output tokens the response alone costs ` +
    `${formatMoney(ceiling.outputCostUsd)} per call. Input is extra and depends on what you send.`
  );
}

/**
 * Rows for the estimate quick pick.
 *
 * The count method is on every row rather than in a footnote: "exact" and
 * "estimate" are different kinds of claim, and a reader comparing an OpenAI
 * model against a Gemini one is comparing a measured number against a
 * calibrated ratio whether or not anyone tells them.
 */
export function estimateRowText(row: {
  model: Model;
  tokens: number;
  method: string;
  inputCostUsd: number;
}): { label: string; description: string; detail: string } {
  return {
    label: row.model.displayName,
    description: `${formatMoney(row.inputCostUsd)} · ${formatCount(row.tokens)} tokens (${row.method})`,
    detail: `${formatRate(row.model.pricing.input)} per M input · sending this text once. Output not included.`,
  };
}

/** Everything that should stop a reader before they trust the number. */
export function warningsFor(match: ModelMatch): string[] {
  const { model, routedFrom } = match;
  const warnings: string[] = [];

  if (routedFrom) {
    warnings.push(
      `\`${routedFrom.id}\` is a routing alias for \`${model.id}\`. Priced against the target, ` +
        `which is the row carrying the full rate card.`,
    );
  }
  if (model.provenance.needsReview) {
    warnings.push(
      model.provenance.reviewNote ??
        'Two sources disagree on this price and no human has adjudicated it. Treat it as indicative.',
    );
  }
  if (model.provenance.stale) {
    warnings.push(
      'Upstream stopped listing this model but no retirement has been confirmed. The row is kept and marked.',
    );
  }
  if (model.status === 'deprecated') {
    warnings.push('This model is deprecated. Check the provider for a migration path before relying on it.');
  }
  return warnings;
}

/** Published facts that change what a request actually costs. */
function pricingNotes(model: Model): string[] {
  const { pricing } = model;
  const notes: string[] = [];

  if (pricing.longContext) {
    const tier = pricing.longContext;
    notes.push(
      `Above ${formatTokens(tier.thresholdTokens)} of input the **whole request** is billed at ` +
        `${formatRate(tier.input)} / ${formatRate(tier.output)} per M — per request, so one conversation ` +
        `can cross over partway through.`,
    );
  }
  if (pricing.batchDiscount !== undefined) {
    notes.push(`Batch API bills at ${Math.round(pricing.batchDiscount * 100)}% of these rates.`);
  }
  if (pricing.intro) {
    notes.push(
      `Promotional pricing of ${formatRate(pricing.intro.input)} / ${formatRate(pricing.intro.output)} ` +
        `applies until ${pricing.intro.until}, after which the rates above take over.`,
    );
  }
  if (pricing.cacheWrite !== undefined) {
    notes.push(
      'Cache writes are billed. Counting only the cheaper reads reports a saving your invoice will not have.',
    );
  }
  return notes;
}

/** Where the number came from and when — the line that makes it auditable. */
function provenanceLine(model: Model): string {
  const { source, lastVerified, verifiedUrl, lastChanged } = model.provenance;
  const where = verifiedUrl ? `[${SOURCE_TEXT[source]}](${verifiedUrl})` : SOURCE_TEXT[source];
  const changed = lastChanged ? ` Rates last moved ${lastChanged}.` : '';
  return `${where}, confirmed ${lastVerified}.${changed}`;
}
