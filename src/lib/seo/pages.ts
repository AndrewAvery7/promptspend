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
import { formatContext } from '../engine/format';
import { fingerprint, recordedPairs, resolveLastmod, type LedgerPage, type PageLedger } from './ledger';
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
  /** Rates in force on `asOf`, so the table prints what the reader would pay. */
  effective: Pricing;
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
  /** Hash of the page's material content — see `modelFacts`. */
  fingerprint: string;
  /** When that content last changed, from the page ledger. Never the build date
   *  on its own: see `./ledger.ts`. */
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
  models: { model: Model; slug: string; path: string; effective: Pricing; blended: number }[];
  /** `models[0]`, by blended rate — its `effective` rates sit in that entry. */
  cheapest: Model | undefined;
  fingerprint: string;
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
  /** Each side's rates in force on `asOf` — what the workload rows were costed at. */
  leftEffective: Pricing;
  rightEffective: Pricing;
  leftSlug: string;
  rightSlug: string;
  leftProvider: string;
  rightProvider: string;
  rows: ComparisonRowData[];
  /** Models are only paired when both are current and comparably priced, so
   *  "cheaper across all three" is the common case and worth stating once. */
  verdict: string;
  /** What separates the two apart from price — context, output ceiling,
   *  reasoning, vision, caching, batch — one sentence per real difference.
   *  Empty when they match on all of it. Derived from the catalog, so it is
   *  specific to this pair rather than a sentence every comparison shares. */
  differences: string[];
  /** True when today's curation would not pick this pair, and the page is
   *  built only because it was published before. See `buildComparisons`. */
  kept: boolean;
  fingerprint: string;
  lastmod: string;
}

/**
 * A comparison that was published once and can no longer be built, because one
 * of its models no longer has a page — upstream stopped listing it, or it became
 * a routing alias.
 *
 * Its URL keeps answering rather than falling through to GitHub Pages' bare 404:
 * a short page saying so, linking to whatever survives. It carries `noindex`
 * and is left out of the sitemap — it is a signpost for the people and links
 * that still arrive, not a page that should rank.
 */
export interface RetiredComparisonPage {
  kind: 'retired-comparison';
  slug: string;
  path: string;
  title: string;
  description: string;
  heading: string;
  /** Display names for the two sides, or the slug when the model is gone from
   *  the catalog entirely. */
  leftName: string;
  rightName: string;
  /** Model pages that still exist for either side. */
  survivors: RelatedLink[];
  /** The canonical target: the first survivor, or the comparisons index. */
  canonicalPath: string;
}

export interface IndexPage {
  kind: 'index';
  path: string;
  title: string;
  description: string;
  heading: string;
  fingerprint: string;
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
  /** Published comparisons that can no longer be built, each written as a
   *  `noindex` signpost. Not in `all`: they are not in the sitemap and not part
   *  of the page counts. */
  retiredComparisons: RetiredComparisonPage[];
  /** Pairs the comparison rule considered and dropped, and why. Reported by
   *  the build so a shrinking page count is never silent. */
  droppedComparisons: number;
}

export interface BuildOptions {
  /** Date used for promotional pricing, and the `lastmod` of any page the
   *  ledger has not recorded (or has recorded with different content). */
  asOf: Date;
  /** Hard ceiling on *new* comparison pages, to keep the set curated rather than
   *  combinatorial. Pairs already published do not count against it — they are
   *  kept regardless. Reaching it is logged, never silently absorbed. */
  maxComparisons?: number;
  /**
   * Every page published before, from `data/published-pages.json`. Supplies
   * each page's real `lastmod` and the comparison pairs that must keep being
   * built. Optional so a test can build from a catalog alone; every script
   * that builds or counts the real site passes it.
   */
  ledger?: PageLedger;
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

export function isoDate(date: Date): string {
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
 * The combinatorial answer is 84 × 83 ÷ 2 = 3,486 pages, nearly all of which
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
 *
 * **A pair, once published, stays published.** The rule above is re-run on
 * every build, and a model arriving shifts everybody's nearest peers — so until
 * 2026-10 a pair could qualify one morning and not the next, and its URL fell
 * through to a bare 404 along with whatever it had earned in search. Eight URLs
 * that Google had already shown people went that way. Now every pair in the
 * ledger is built for as long as both its models have pages, whether or not the
 * rule would pick it today, and the cap applies only to pairs being published
 * for the first time. A pair whose model has lost its page entirely becomes a
 * `RetiredComparisonPage` instead of disappearing.
 */
function buildComparisons(
  ranked: Model[],
  pageable: Model[],
  slugById: Map<string, string>,
  printById: Map<string, string>,
  catalog: Catalog,
  asOf: Date,
  maxComparisons: number,
  ledger: PageLedger | undefined,
): { pages: ComparisonPage[]; retired: RetiredComparisonPage[]; dropped: number } {
  const scored = ranked.filter((m) => typeof m.capabilityIndex === 'number');
  const wanted = new Map<string, { left: Model; right: Model }>();

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

  // Everything published before: rebuilt if both sides still have a page,
  // signposted if not.
  const modelBySlug = new Map(pageable.map((m) => [slugById.get(m.id)!, m]));
  const kept = new Map<string, { left: Model; right: Model }>();
  const retired: RetiredComparisonPage[] = [];
  for (const pair of recordedPairs(ledger, COMPARE_ROOT)) {
    const left = modelBySlug.get(pair.left);
    const right = modelBySlug.get(pair.right);
    if (left && right) kept.set(pair.slug, { left, right });
    else
      retired.push(retiredComparisonPage(pair.slug, pair.left, pair.right, left, right, catalog, slugById));
  }

  // The cap is on new pairs only. A published pair never counts against it,
  // because dropping one to make room is exactly the churn this is preventing.
  const fresh = [...wanted.keys()].filter((key) => !kept.has(key)).sort((a, b) => a.localeCompare(b));
  const dropped = Math.max(0, fresh.length - maxComparisons);
  const chosen = new Map<string, { left: Model; right: Model; kept: boolean }>();
  for (const [slug, pair] of kept) chosen.set(slug, { ...pair, kept: !wanted.has(slug) });
  for (const slug of fresh.slice(0, maxComparisons)) chosen.set(slug, { ...wanted.get(slug)!, kept: false });

  const pages = [...chosen.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((slug) => {
      const pair = chosen.get(slug)!;
      return comparisonPage(slug, pair.left, pair.right, pair.kept, slugById, printById, catalog, asOf);
    });

  return { pages, retired, dropped };
}

/**
 * The facts that set two models apart other than price, one sentence each.
 *
 * Only real differences are stated; a field the two share says nothing about
 * the choice. Context sizes are compared as the reader will see them printed —
 * 128K against 131K is not a difference worth a sentence.
 */
export function pairDifferences(
  left: Model,
  right: Model,
  leftRates: Pricing,
  rightRates: Pricing,
): string[] {
  const out: string[] = [];
  const name = (model: Model): string => model.displayName;

  if (formatContext(left.contextWindow) !== formatContext(right.contextWindow)) {
    const [big, small] = left.contextWindow > right.contextWindow ? [left, right] : [right, left];
    out.push(
      `${name(big)} reads up to ${formatContext(big.contextWindow)} tokens of context in one request; ${name(small)} stops at ${formatContext(small.contextWindow)}.`,
    );
  }
  if (
    left.maxOutput !== undefined &&
    right.maxOutput !== undefined &&
    formatContext(left.maxOutput) !== formatContext(right.maxOutput)
  ) {
    const [big, small] = left.maxOutput > right.maxOutput ? [left, right] : [right, left];
    out.push(
      `${name(big)} can write up to ${formatContext(big.maxOutput!)} tokens in one response, against ${formatContext(small.maxOutput!)} for ${name(small)}.`,
    );
  }
  if (left.capabilities.reasoning !== right.capabilities.reasoning) {
    const thinker = left.capabilities.reasoning ? left : right;
    out.push(
      `Only ${name(thinker)} is a reasoning model, so its output bill also pays for the thinking it does before it answers.`,
    );
  }
  if (left.capabilities.vision !== right.capabilities.vision) {
    const seer = left.capabilities.vision ? left : right;
    out.push(`Only ${name(seer)} accepts images as input.`);
  }

  const cacheDiscount = (rates: Pricing): number | undefined =>
    rates.cachedInput !== undefined && rates.input > 0 ? 1 - rates.cachedInput / rates.input : undefined;
  const leftCache = cacheDiscount(leftRates);
  const rightCache = cacheDiscount(rightRates);
  if ((leftCache === undefined) !== (rightCache === undefined)) {
    const caches = leftCache !== undefined ? left : right;
    out.push(
      `Only ${name(caches)} publishes a cached-input rate, which cuts the cost of resending a long, unchanging prompt.`,
    );
  } else if (
    leftCache !== undefined &&
    rightCache !== undefined &&
    Math.abs(leftCache - rightCache) >= 0.05 &&
    leftCache > 0 &&
    rightCache > 0
  ) {
    out.push(
      `Cached input costs ${Math.round(leftCache * 100)}% less than fresh input on ${name(left)} and ${Math.round(rightCache * 100)}% less on ${name(right)}, which matters most for workloads that resend the same prompt.`,
    );
  }

  const leftBatch = left.pricing.batchDiscount;
  const rightBatch = right.pricing.batchDiscount;
  if ((leftBatch === undefined) !== (rightBatch === undefined)) {
    const batches = leftBatch !== undefined ? left : right;
    const discount = 1 - (leftBatch ?? rightBatch ?? 1);
    out.push(
      `Only ${name(batches)} offers a batch discount — ${Math.round(discount * 100)}% off both rates for work that can wait.`,
    );
  }

  return out;
}

function comparisonPage(
  slug: string,
  left: Model,
  right: Model,
  kept: boolean,
  slugById: Map<string, string>,
  printById: Map<string, string>,
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
  const leftEffective = effectivePricing(left.pricing, asOf);
  const rightEffective = effectivePricing(right.pricing, asOf);
  const path = `${COMPARE_ROOT}${slug}/`;
  // The comparison says nothing its two models' facts do not, so its content
  // changes exactly when one of theirs does.
  const print = fingerprint({ left: printById.get(left.id), right: printById.get(right.id) });

  return {
    kind: 'comparison',
    id: slug,
    slug,
    path,
    title: fitTitle([
      `${left.displayName} vs ${right.displayName}: API price comparison`,
      `${left.displayName} vs ${right.displayName}: price comparison`,
      `${left.displayName} vs ${right.displayName} pricing`,
    ]),
    description: fitDescription([
      `${left.displayName} costs ${rate(leftEffective.input)}/${rate(leftEffective.output)} per 1M tokens and ${right.displayName} ${rate(rightEffective.input)}/${rate(rightEffective.output)}. Here is the monthly bill for each on three real workloads.`,
      `${left.displayName} against ${right.displayName} on rates, context window and the monthly bill for three real workloads.`,
      `${left.displayName} vs ${right.displayName}: rates and monthly cost, side by side.`,
    ]),
    heading: `${left.displayName} vs ${right.displayName}`,
    left,
    right,
    leftEffective,
    rightEffective,
    leftSlug: slugById.get(left.id) ?? modelSlug(left.id),
    rightSlug: slugById.get(right.id) ?? modelSlug(right.id),
    leftProvider,
    rightProvider,
    rows,
    verdict,
    differences: pairDifferences(left, right, leftEffective, rightEffective),
    kept,
    fingerprint: print,
    lastmod: '', // resolved against the ledger once every page exists
  };
}

/**
 * The signpost for a published pair that can no longer be built.
 *
 * A side "survives" when it still has a model page, or when its id now routes
 * to a model that does — an id that became an alias was renamed, not retired.
 */
function retiredComparisonPage(
  slug: string,
  leftSlug: string,
  rightSlug: string,
  left: Model | undefined,
  right: Model | undefined,
  catalog: Catalog,
  slugById: Map<string, string>,
): RetiredComparisonPage {
  const describe = (side: string, model: Model | undefined): { name: string; link: RelatedLink | null } => {
    if (model) {
      return { name: model.displayName, link: { path: `${MODELS_ROOT}${side}/`, label: model.displayName } };
    }
    const former = catalog.models.find((m) => modelSlug(m.id) === side);
    const target = former?.aliasOf ? catalog.get(former.aliasOf) : undefined;
    const targetSlug = target ? slugById.get(target.id) : undefined;
    return {
      name: former?.displayName ?? side,
      link: target && targetSlug ? { path: `${MODELS_ROOT}${targetSlug}/`, label: target.displayName } : null,
    };
  };
  const a = describe(leftSlug, left);
  const b = describe(rightSlug, right);
  const survivors = [a.link, b.link].filter((link): link is RelatedLink => link !== null);

  return {
    kind: 'retired-comparison',
    slug,
    path: `${COMPARE_ROOT}${slug}/`,
    title: fitTitle([`${a.name} vs ${b.name}: comparison retired`, `Comparison retired`]),
    description: fitDescription([
      `This comparison of ${a.name} and ${b.name} has been retired because one of them is no longer in the catalog.`,
      `This comparison has been retired because one of its models is no longer in the catalog.`,
    ]),
    heading: `${a.name} vs ${b.name}`,
    leftName: a.name,
    rightName: b.name,
    survivors,
    canonicalPath: survivors[0]?.path ?? COMPARE_ROOT,
  };
}

// ------------------------------------------------------------------- assembly

/**
 * What a reader came to a model page for: its rates, its limits, its status.
 *
 * Deliberately *not* here: `lastVerified`, which the sync moves every morning
 * whether or not anything changed — including it would put the build date
 * back into `lastmod` by another route — and anything that depends on other
 * models (rank, alternatives), which would re-date every page whenever one
 * model arrived.
 */
function modelFacts(model: Model, effective: Pricing, providerName: string, aliases: Model[]): unknown {
  return {
    id: model.id,
    name: model.displayName,
    provider: providerName,
    status: model.status,
    releaseDate: model.releaseDate,
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    capabilities: model.capabilities,
    tokenizer: model.tokenizer,
    pricing: model.pricing,
    effective,
    source: model.provenance.source,
    aliases: aliases.map((alias) => alias.id).sort(),
  };
}

export function buildPages(raw: PricingCatalog, options: BuildOptions): PageSet {
  const { asOf, maxComparisons = 160, ledger } = options;
  const catalog = new Catalog(raw);
  const today = isoDate(asOf);

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

  const printById = new Map(
    pageable.map((model) => [
      model.id,
      fingerprint(
        modelFacts(
          model,
          effectivePricing(model.pricing, asOf),
          catalog.providerName(model),
          catalog.aliasesOf(model.id),
        ),
      ),
    ]),
  );

  const ranked = [...pageable.filter(isRankable)].sort(
    (a, b) => blendedRate(a) - blendedRate(b) || a.id.localeCompare(b.id),
  );
  const rankIndex = new Map(ranked.map((m, index) => [m.id, index]));

  const {
    pages: comparisons,
    retired: retiredComparisons,
    dropped,
  } = buildComparisons(ranked, pageable, slugById, printById, catalog, asOf, maxComparisons, ledger);
  const comparisonBySlug = new Map(comparisons.map((page) => [page.slug, page]));
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
        const hasPage = comparisonBySlug.has(pairSlug);
        return {
          model: other,
          slug: otherSlug,
          effective: effectivePricing(other.pricing, asOf),
          blended: blendedRate(other),
          saving: blended > 0 ? 1 - blendedRate(other) / blended : 0,
          comparisonPath: hasPage ? `${COMPARE_ROOT}${pairSlug}/` : null,
        };
      });

    const path = `${MODELS_ROOT}${slug}/`;
    const print = printById.get(model.id)!;
    return {
      kind: 'model',
      id: model.id,
      slug,
      path,
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
      fingerprint: print,
      lastmod: resolveLastmod(ledger, path, print, today),
    };
  });

  for (const page of comparisons) page.lastmod = resolveLastmod(ledger, page.path, page.fingerprint, today);

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
          effective: effectivePricing(model.pricing, asOf),
          blended: blendedRate(model),
        }));

      // Retired rows stay in the provider's table as records, but "from X at
      // $Y" is an offer to the reader, so it names only a model still sold.
      const cheapestEntry = owned.find((entry) => Catalog.isSelectable(entry.model));
      const cheapest = cheapestEntry?.model;
      const cheapestRate = cheapestEntry?.effective.input;
      const path = `${PROVIDERS_ROOT}${slug}/`;
      // The table is its rows: a provider page changes when one of its models
      // does, or when one arrives or leaves.
      const print = fingerprint({
        name: provider.name,
        country: provider.country,
        pricingUrl: provider.pricingUrl,
        models: owned.map((entry) => [entry.slug, printById.get(entry.model.id)]),
      });
      return {
        kind: 'provider' as const,
        id: provider.id,
        slug,
        path,
        title: fitTitle([
          `${provider.name} API pricing — all ${owned.length} models compared`,
          `${provider.name} API pricing — ${owned.length} models`,
          `${provider.name} API pricing`,
        ]),
        description: fitDescription([
          `Current API prices for all ${owned.length} ${provider.name} models in one table${cheapest && cheapestRate !== undefined ? `, from ${cheapest.displayName} at ${rate(cheapestRate)} per 1M input tokens` : ''}. Re-checked every morning.`,
          `Current API prices for every ${provider.name} model, re-checked every morning against ${provider.name}'s own pricing page.`,
          `${provider.name} API pricing for all ${owned.length} models.`,
        ]),
        heading: `${provider.name} API pricing`,
        provider,
        models: owned,
        cheapest,
        fingerprint: print,
        lastmod: resolveLastmod(ledger, path, print, today),
      };
    })
    .filter((page) => page.models.length > 0);

  const indexPage = (
    path: string,
    content: unknown,
    page: Omit<IndexPage, 'kind' | 'path' | 'fingerprint' | 'lastmod'>,
  ): IndexPage => {
    const print = fingerprint(content);
    return {
      kind: 'index',
      path,
      ...page,
      fingerprint: print,
      lastmod: resolveLastmod(ledger, path, print, today),
    };
  };

  const modelsIndex = indexPage(
    MODELS_ROOT,
    models.map((page) => [page.slug, page.fingerprint]),
    {
      title: fitTitle([`LLM API pricing: every model, compared side by side`, `LLM API pricing by model`]),
      description: fitDescription([
        `Input and output prices for ${models.length} language models from ${providers.length} providers, in one sortable table, re-checked against the vendors every morning.`,
        `Input and output prices for ${models.length} models from ${providers.length} providers, re-checked every morning.`,
      ]),
      heading: 'Every model, by price',
    },
  );

  const providersIndex = indexPage(
    PROVIDERS_ROOT,
    providers.map((page) => [page.slug, page.fingerprint]),
    {
      title: fitTitle([`LLM API pricing by provider`, `API pricing by provider`]),
      description: fitDescription([
        `Every provider in the catalog, with how many models each publishes and what the cheapest of them costs. ${providers.length} providers, re-checked every morning.`,
        `Every provider in the catalog, with model counts and the cheapest rate each publishes.`,
      ]),
      heading: 'Every provider',
    },
  );

  const comparisonsIndex = indexPage(
    COMPARE_ROOT,
    comparisons.map((page) => [page.slug, page.left.displayName, page.right.displayName]),
    {
      title: fitTitle([
        `LLM price comparisons — ${comparisons.length} head-to-heads`,
        `LLM price comparisons`,
      ]),
      description: fitDescription([
        `${comparisons.length} side-by-side price comparisons between models from different providers, each costed on the same three real workloads.`,
        `Side-by-side LLM price comparisons, each costed on the same three real workloads.`,
      ]),
      heading: 'Head to head',
    },
  );

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
    retiredComparisons,
    droppedComparisons: dropped,
  };
}

/** What the ledger records for a build: every page in the sitemap. */
export function ledgerPages(set: PageSet): LedgerPage[] {
  return set.all.map((page) =>
    page.kind === 'comparison'
      ? { path: page.path, fingerprint: page.fingerprint, leftSlug: page.leftSlug, rightSlug: page.rightSlug }
      : { path: page.path, fingerprint: page.fingerprint },
  );
}
