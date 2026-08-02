/**
 * The page model for everything the site publishes as a real, crawlable URL.
 *
 * The calculator is one page whose views are client state, which is right for
 * the tool and useless for search: nobody types "LLM cost estimator" into
 * Google. They type "gpt-5.6 pricing" and "claude opus vs gemini pro cost".
 * This module turns the catalog into pages that answer exactly those, one URL
 * per question.
 *
 * Everything here is pure. It takes a catalog and a date, and returns data —
 * no HTML, no filesystem, no clock. That is what makes the numbers on 200 pages
 * testable, and it is why `asOf` is a parameter rather than `new Date()`: a
 * promotional rate that expires would otherwise make the test suite fail on a
 * date nobody chose.
 *
 * The rule these pages live or die by: **every page must contain something no
 * other page contains**. Mass-produced pages that differ only in a name are
 * doorway pages, they are recognised as such, and they drag down the pages
 * around them. So each one carries its own rates, its own three monthly bills,
 * its own position in the catalog, and its own honest warnings.
 */

import type { Model, Pricing, PricingCatalog, Provider } from '../pricing/types';
import { Catalog } from '../pricing/catalog';
import { conversationCost, costAtScale, effectivePricing } from '../engine/cost';
import { assertUniqueSlugs, comparisonSlug, modelSlug, slugify } from './slug';
import { WORKLOAD_PROFILES, type WorkloadProfile } from './workloads';

/** One workload, costed on one model. */
export interface WorkedExample {
  profile: WorkloadProfile;
  perConversation: number;
  perMonth: number;
  perYear: number;
  inputTokens: number;
  outputTokens: number;
  /** Reasons this scenario could not actually run — a request past the
   *  context window, a response past the output ceiling. Never suppressed:
   *  a cost for an impossible workload is a wrong answer stated confidently. */
  warnings: string[];
}

export interface Alternative {
  model: Model;
  slug: string;
  blended: number;
  /** Fraction saved on the blended rate, 0–1. */
  saving: number;
  comparisonPath: string | null;
}

export interface RelatedLink {
  path: string;
  label: string;
}

export interface ModelPage {
  kind: 'model';
  id: string;
  slug: string;
  path: string;
  title: string;
  description: string;
  heading: string;
  model: Model;
  provider: Provider | undefined;
  providerName: string;
  providerPath: string;
  /** Ids that route to this model, for the "also known as" line. */
  aliases: Model[];
  /** Rates in force on `asOf` — promotional pricing already applied. */
  effective: Pricing;
  /** True when `effective` differs from the published base rates. */
  promotional: boolean;
  examples: WorkedExample[];
  /** Position by blended rate among comparable models, cheapest first. */
  rank: { position: number; total: number; blended: number } | null;
  alternatives: Alternative[];
  /** Whether `alternatives` are "cheaper and scored at least as capable" or
   *  merely "cheaper" — two different claims that must not share a heading. */
  alternativesAreComparable: boolean;
  comparisons: RelatedLink[];
  /** The date this model's published rates last moved, when we know it. */
  lastChanged: string | undefined;
  lastmod: string;
}

export interface ProviderPage {
  kind: 'provider';
  id: string;
  slug: string;
  path: string;
  title: string;
  description: string;
  heading: string;
  provider: Provider;
  models: { model: Model; slug: string; path: string; blended: number }[];
  cheapest: Model | undefined;
  lastmod: string;
}

export interface ComparisonRowData {
  profile: WorkloadProfile;
  left: number;
  right: number;
  /** Monthly difference, always non-negative; `cheaper` says which side won. */
  difference: number;
  cheaper: 'left' | 'right' | 'tie';
  /** How many times the dearer bill is the cheaper one. */
  multiple: number;
}

export interface ComparisonPage {
  kind: 'comparison';
  id: string;
  slug: string;
  path: string;
  title: string;
  description: string;
  heading: string;
  left: Model;
  right: Model;
  leftSlug: string;
  rightSlug: string;
  leftProvider: string;
  rightProvider: string;
  rows: ComparisonRowData[];
  /** Models are only paired when both are current and comparably priced, so
   *  "cheaper across all three" is the common case and worth stating once. */
  verdict: string;
  lastmod: string;
}

export interface IndexPage {
  kind: 'index';
  path: string;
  title: string;
  description: string;
  heading: string;
  lastmod: string;
}

export type GeneratedPage = ModelPage | ProviderPage | ComparisonPage | IndexPage;

export interface PageSet {
  models: ModelPage[];
  providers: ProviderPage[];
  comparisons: ComparisonPage[];
  /** Every page, including the two index pages, in sitemap order. */
  all: GeneratedPage[];
  modelsIndex: IndexPage;
  providersIndex: IndexPage;
  comparisonsIndex: IndexPage;
  /** Pairs the comparison rule considered and dropped, and why. Reported by
   *  the build so a shrinking page count is never silent. */
  droppedComparisons: number;
}

export interface BuildOptions {
  /** Date used for promotional pricing and for `lastmod`. */
  asOf: Date;
  /** Hard ceiling on comparison pages, to keep the set curated rather than
   *  combinatorial. Reaching it is logged, never silently absorbed. */
  maxComparisons?: number;
}

const MODELS_ROOT = '/models/';
const PROVIDERS_ROOT = '/providers/';
const COMPARE_ROOT = '/compare/';

/** Peers offered per model. Three is enough to be useful and few enough that
 *  the set stays curated; see `buildComparisons`. */
const PEERS_PER_MODEL = 3;

/** Beyond this ratio of blended rates the two models are not alternatives to
 *  each other, and a page comparing them answers a question nobody asked. */
const MAX_PRICE_RATIO = 3;

export function blendedRate(model: Model): number {
  return Catalog.blendedRate(model);
}

/** Models that can carry a page: real products, currently sold, still listed. */
function isRankable(model: Model): boolean {
  return model.aliasOf === undefined && model.status === 'current' && model.provenance.stale !== true;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function rate(value: number): string {
  return `$${Number(value.toFixed(4))}`;
}

/**
 * The first candidate that fits.
 *
 * Google truncates a title somewhere around 70 characters and everything past
 * the cut does no work at all. Rather than one template that is too long for
 * the models with the longest names, each page tries progressively shorter
 * phrasings and takes the first that fits — so `Gemini 3.1 Flash Lite Preview`
 * gets a shorter template than `GPT 5` without either being hand-written.
 */
export function fitTitle(candidates: readonly string[], limit = 70): string {
  for (const candidate of candidates) {
    if (candidate.length <= limit) return candidate;
  }
  const last = candidates.at(-1) ?? '';
  return last.slice(0, limit);
}

/** Same idea for the meta description, which Google cuts near 160. */
export function fitDescription(candidates: readonly string[], limit = 160): string {
  return fitTitle(candidates, limit);
}

// --------------------------------------------------------------- model pages

function workedExample(model: Model, profile: WorkloadProfile, asOf: Date): WorkedExample {
  const breakdown = conversationCost(model, profile.workload, { asOf });
  const scaled = costAtScale(breakdown.total, profile.scale);
  return {
    profile,
    perConversation: breakdown.total,
    perMonth: scaled.perMonth,
    perYear: scaled.perYear,
    inputTokens: breakdown.inputTokens,
    outputTokens: breakdown.outputTokens,
    warnings: breakdown.warnings,
  };
}

function modelTitle(model: Model, pricing: Pricing): string {
  const name = model.displayName;
  return fitTitle([
    `${name} pricing — ${rate(pricing.input)} in / ${rate(pricing.output)} out per 1M tokens`,
    `${name} pricing — ${rate(pricing.input)}/${rate(pricing.output)} per 1M tokens`,
    `${name} pricing — ${rate(pricing.input)}/${rate(pricing.output)} per 1M`,
    `${name} API pricing`,
  ]);
}

function modelDescription(
  model: Model,
  pricing: Pricing,
  providerName: string,
  chatbotMonthly: number,
): string {
  const verified = model.provenance.lastVerified;
  return fitDescription([
    `${providerName}'s ${model.displayName} costs ${rate(pricing.input)} per 1M input tokens and ${rate(pricing.output)} per 1M output tokens, checked ${verified}. Priced here on three real workloads.`,
    `${model.displayName}: ${rate(pricing.input)} per 1M input tokens, ${rate(pricing.output)} per 1M output, checked ${verified}. A support chatbot on it runs ${formatCompactMoney(chatbotMonthly)}/mo.`,
    `${model.displayName}: ${rate(pricing.input)} in / ${rate(pricing.output)} out per 1M tokens, checked ${verified}. Costed on three real workloads.`,
    `${model.displayName} API pricing, checked ${verified}.`,
  ]);
}

function formatCompactMoney(dollars: number): string {
  if (dollars >= 1000) return `$${Math.round(dollars / 1000)}k`;
  if (dollars >= 1) return `$${Math.round(dollars)}`;
  return `$${dollars.toPrecision(2)}`;
}

// ---------------------------------------------------------------- comparisons

/**
 * Which models are worth a side-by-side page.
 *
 * The combinatorial answer is 69 × 68 ÷ 2 = 2,346 pages, nearly all of which
 * compare things nobody would choose between — a $0.14 flash model against a
 * $75 frontier model is not a decision, it is a category difference. Mass pages
 * like that are the textbook definition of thin content and they cost more
 * ranking than they earn.
 *
 * So a pair qualifies only when it is a real decision: both models current and
 * still listed, from **different providers** (which is what people actually
 * search — "claude vs gpt", never "gpt-5 vs gpt-5-mini"), both scored, and
 * within `MAX_PRICE_RATIO` of each other on blended rate. Each model then
 * contributes its `PEERS_PER_MODEL` nearest peers by capability, and the union
 * is deduplicated.
 */
function buildComparisons(
  ranked: Model[],
  slugById: Map<string, string>,
  catalog: Catalog,
  asOf: Date,
  maxComparisons: number,
): { pages: ComparisonPage[]; dropped: number } {
  const scored = ranked.filter((m) => typeof m.capabilityIndex === 'number');
  const wanted = new Map<string, { left: Model; right: Model }>();
  let dropped = 0;

  for (const model of scored) {
    const peers = scored
      .filter((other) => other.id !== model.id && other.providerId !== model.providerId)
      .filter((other) => {
        const ratio = blendedRate(other) / Math.max(blendedRate(model), Number.EPSILON);
        return ratio <= MAX_PRICE_RATIO && ratio >= 1 / MAX_PRICE_RATIO;
      })
      .sort((a, b) => {
        const byCapability =
          Math.abs((a.capabilityIndex ?? 0) - (model.capabilityIndex ?? 0)) -
          Math.abs((b.capabilityIndex ?? 0) - (model.capabilityIndex ?? 0));
        return byCapability || blendedRate(a) - blendedRate(b) || a.id.localeCompare(b.id);
      });

    for (const peer of peers.slice(0, PEERS_PER_MODEL)) {
      const leftSlug = slugById.get(model.id);
      const rightSlug = slugById.get(peer.id);
      if (!leftSlug || !rightSlug) continue;
      const key = comparisonSlug(leftSlug, rightSlug);
      if (wanted.has(key)) continue;
      // Order the page the way the slug is ordered, so the first column and the
      // first half of the URL always name the same model.
      const leftFirst = leftSlug.localeCompare(rightSlug) <= 0;
      wanted.set(key, leftFirst ? { left: model, right: peer } : { left: peer, right: model });
    }
  }

  const keys = [...wanted.keys()].sort((a, b) => a.localeCompare(b));
  if (keys.length > maxComparisons) dropped = keys.length - maxComparisons;

  const pages = keys.slice(0, maxComparisons).map((slug) => {
    const pair = wanted.get(slug)!;
    return comparisonPage(slug, pair.left, pair.right, slugById, catalog, asOf);
  });

  return { pages, dropped };
}

function comparisonPage(
  slug: string,
  left: Model,
  right: Model,
  slugById: Map<string, string>,
  catalog: Catalog,
  asOf: Date,
): ComparisonPage {
  const rows: ComparisonRowData[] = WORKLOAD_PROFILES.map((profile) => {
    const l = workedExample(left, profile, asOf).perMonth;
    const r = workedExample(right, profile, asOf).perMonth;
    const difference = Math.abs(l - r);
    const cheaper = l === r ? 'tie' : l < r ? 'left' : 'right';
    const low = Math.min(l, r);
    const high = Math.max(l, r);
    return {
      profile,
      left: l,
      right: r,
      difference,
      cheaper,
      multiple: low > 0 ? high / low : 1,
    };
  });

  const leftWins = rows.filter((row) => row.cheaper === 'left').length;
  const rightWins = rows.filter((row) => row.cheaper === 'right').length;
  const verdict =
    leftWins === rows.length
      ? `${left.displayName} is cheaper on all three workloads.`
      : rightWins === rows.length
        ? `${right.displayName} is cheaper on all three workloads.`
        : `Neither is cheaper everywhere — which one wins depends on how much you read versus write.`;

  const leftProvider = catalog.providerName(left);
  const rightProvider = catalog.providerName(right);

  return {
    kind: 'comparison',
    id: slug,
    slug,
    path: `${COMPARE_ROOT}${slug}/`,
    title: fitTitle([
      `${left.displayName} vs ${right.displayName}: API price comparison`,
      `${left.displayName} vs ${right.displayName}: price comparison`,
      `${left.displayName} vs ${right.displayName} pricing`,
    ]),
    description: fitDescription([
      `${left.displayName} costs ${rate(left.pricing.input)}/${rate(left.pricing.output)} per 1M tokens and ${right.displayName} ${rate(right.pricing.input)}/${rate(right.pricing.output)}. Here is the monthly bill for each on three real workloads.`,
      `${left.displayName} against ${right.displayName} on rates, context window and the monthly bill for three real workloads.`,
      `${left.displayName} vs ${right.displayName}: rates and monthly cost, side by side.`,
    ]),
    heading: `${left.displayName} vs ${right.displayName}`,
    left,
    right,
    leftSlug: slugById.get(left.id) ?? modelSlug(left.id),
    rightSlug: slugById.get(right.id) ?? modelSlug(right.id),
    leftProvider,
    rightProvider,
    rows,
    verdict,
    lastmod: isoDate(asOf),
  };
}

// ------------------------------------------------------------------- assembly

export function buildPages(raw: PricingCatalog, options: BuildOptions): PageSet {
  const { asOf, maxComparisons = 160 } = options;
  const catalog = new Catalog(raw);
  const lastmod = isoDate(asOf);

  const pageable = catalog.primaryModels.filter((m) => m.provenance.stale !== true);
  const slugById = new Map(pageable.map((m) => [m.id, modelSlug(m.id)]));
  assertUniqueSlugs(
    [...slugById.entries()].map(([id, slug]) => ({ id, slug })),
    'model',
  );

  const providerSlugs = new Map(catalog.providers.map((p) => [p.id, slugify(p.id)]));
  assertUniqueSlugs(
    [...providerSlugs.entries()].map(([id, slug]) => ({ id, slug })),
    'provider',
  );

  const ranked = [...pageable.filter(isRankable)].sort(
    (a, b) => blendedRate(a) - blendedRate(b) || a.id.localeCompare(b.id),
  );
  const rankIndex = new Map(ranked.map((m, index) => [m.id, index]));

  const { pages: comparisons, dropped } = buildComparisons(ranked, slugById, catalog, asOf, maxComparisons);
  const comparisonsByModel = new Map<string, RelatedLink[]>();
  for (const page of comparisons) {
    for (const [model, other] of [
      [page.left, page.right],
      [page.right, page.left],
    ] as const) {
      const list = comparisonsByModel.get(model.id) ?? [];
      list.push({ path: page.path, label: `${model.displayName} vs ${other.displayName}` });
      comparisonsByModel.set(model.id, list);
    }
  }

  const models: ModelPage[] = pageable.map((model) => {
    const slug = slugById.get(model.id)!;
    const effective = effectivePricing(model.pricing, asOf);
    const providerName = catalog.providerName(model);
    const examples = WORKLOAD_PROFILES.map((profile) => workedExample(model, profile, asOf));
    const position = rankIndex.get(model.id);
    const blended = blendedRate(model);

    const scored = typeof model.capabilityIndex === 'number';
    const cheaper = ranked.filter((other) => other.id !== model.id && blendedRate(other) < blended);
    const comparable = scored
      ? cheaper.filter((other) => (other.capabilityIndex ?? -1) >= (model.capabilityIndex ?? 0))
      : [];
    const pool = comparable.length > 0 ? comparable : cheaper;

    const alternatives: Alternative[] = pool
      .sort((a, b) => (b.capabilityIndex ?? 0) - (a.capabilityIndex ?? 0) || blendedRate(a) - blendedRate(b))
      .slice(0, 5)
      .map((other) => {
        const otherSlug = slugById.get(other.id)!;
        const pairSlug = comparisonSlug(slug, otherSlug);
        const hasPage = comparisons.some((page) => page.slug === pairSlug);
        return {
          model: other,
          slug: otherSlug,
          blended: blendedRate(other),
          saving: blended > 0 ? 1 - blendedRate(other) / blended : 0,
          comparisonPath: hasPage ? `${COMPARE_ROOT}${pairSlug}/` : null,
        };
      });

    return {
      kind: 'model',
      id: model.id,
      slug,
      path: `${MODELS_ROOT}${slug}/`,
      title: modelTitle(model, effective),
      description: modelDescription(model, effective, providerName, examples[0]?.perMonth ?? 0),
      heading: `${model.displayName} pricing`,
      model,
      provider: catalog.provider(model),
      providerName,
      providerPath: `${PROVIDERS_ROOT}${providerSlugs.get(model.providerId) ?? slugify(model.providerId)}/`,
      aliases: catalog.aliasesOf(model.id),
      effective,
      promotional: effective !== model.pricing,
      examples,
      rank: position === undefined ? null : { position: position + 1, total: ranked.length, blended },
      alternatives,
      alternativesAreComparable: comparable.length > 0,
      comparisons: (comparisonsByModel.get(model.id) ?? []).slice(0, 6),
      lastChanged: model.provenance.lastChanged,
      lastmod,
    };
  });

  const providers: ProviderPage[] = catalog.providers
    .map((provider) => {
      const slug = providerSlugs.get(provider.id)!;
      const owned = pageable
        .filter((m) => m.providerId === provider.id)
        .sort((a, b) => blendedRate(a) - blendedRate(b) || a.id.localeCompare(b.id))
        .map((model) => ({
          model,
          slug: slugById.get(model.id)!,
          path: `${MODELS_ROOT}${slugById.get(model.id)!}/`,
          blended: blendedRate(model),
        }));

      const cheapest = owned[0]?.model;
      return {
        kind: 'provider' as const,
        id: provider.id,
        slug,
        path: `${PROVIDERS_ROOT}${slug}/`,
        title: fitTitle([
          `${provider.name} API pricing — all ${owned.length} models compared`,
          `${provider.name} API pricing — ${owned.length} models`,
          `${provider.name} API pricing`,
        ]),
        description: fitDescription([
          `Current API prices for all ${owned.length} ${provider.name} models in one table${cheapest ? `, from ${cheapest.displayName} at ${rate(cheapest.pricing.input)} per 1M input tokens` : ''}. Re-checked every morning.`,
          `Current API prices for every ${provider.name} model, re-checked every morning against ${provider.name}'s own pricing page.`,
          `${provider.name} API pricing for all ${owned.length} models.`,
        ]),
        heading: `${provider.name} API pricing`,
        provider,
        models: owned,
        cheapest,
        lastmod,
      };
    })
    .filter((page) => page.models.length > 0);

  const modelsIndex: IndexPage = {
    kind: 'index',
    path: MODELS_ROOT,
    title: fitTitle([`LLM API pricing: every model, compared side by side`, `LLM API pricing by model`]),
    description: fitDescription([
      `Input and output prices for ${models.length} language models from ${providers.length} providers, in one sortable table, re-checked against the vendors every morning.`,
      `Input and output prices for ${models.length} models from ${providers.length} providers, re-checked every morning.`,
    ]),
    heading: 'Every model, by price',
    lastmod,
  };

  const providersIndex: IndexPage = {
    kind: 'index',
    path: PROVIDERS_ROOT,
    title: fitTitle([`LLM API pricing by provider`, `API pricing by provider`]),
    description: fitDescription([
      `Every provider in the catalog, with how many models each publishes and what the cheapest of them costs. ${providers.length} providers, re-checked every morning.`,
      `Every provider in the catalog, with model counts and the cheapest rate each publishes.`,
    ]),
    heading: 'Every provider',
    lastmod,
  };

  const comparisonsIndex: IndexPage = {
    kind: 'index',
    path: COMPARE_ROOT,
    title: fitTitle([`LLM price comparisons — ${comparisons.length} head-to-heads`, `LLM price comparisons`]),
    description: fitDescription([
      `${comparisons.length} side-by-side price comparisons between models from different providers, each costed on the same three real workloads.`,
      `Side-by-side LLM price comparisons, each costed on the same three real workloads.`,
    ]),
    heading: 'Head to head',
    lastmod,
  };

  // Sitemap order: the index pages first, then models, providers and
  // comparisons. Crawlers do not read priority from order, but a human reading
  // the file should be able to see the shape of the site from it.
  const all: GeneratedPage[] = [
    modelsIndex,
    providersIndex,
    comparisonsIndex,
    ...models,
    ...providers,
    ...comparisons,
  ];

  return {
    models,
    providers,
    comparisons,
    all,
    modelsIndex,
    providersIndex,
    comparisonsIndex,
    droppedComparisons: dropped,
  };
}
