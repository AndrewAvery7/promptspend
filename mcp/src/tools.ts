/**
 * Three tools. Deliberately three.
 *
 * The competing pricing server exposes eight, covering benchmarks, latency and
 * endpoint availability as well as prices. That breadth is not free: MCP tool
 * definitions are loaded into every message, and a heavy server can add
 * thousands of tokens to every turn. The emerging advice in the ecosystem is to
 * prefer a CLI over MCP for read-only data precisely because of that overhead.
 *
 * A pricing server that quietly taxes every turn, in order to tell you about
 * token costs, would be an easy and deserved joke. So this one keeps the surface
 * small, keeps the descriptions short, and measures its own footprint in CI
 * (`npm run check:footprint`). The measurement is published in the README, which
 * nothing else in the ecosystem appears to do.
 *
 * Choosing which three:
 *   get_price      the question people actually ask, answered with provenance
 *   estimate_cost  the one a price lookup CANNOT answer - it runs the real engine
 *   find_cheaper   the decision the price is usually being looked up to make
 *
 * `estimate_cost` is the reason to install this rather than a competitor. A
 * lookup returns dollars per million tokens and leaves the arithmetic - cache
 * writes at 1.25x, long-context tiers applied per request, reasoning multipliers,
 * conversation history compounding quadratically - to whoever asked. Those are
 * exactly the things this project documents everyone getting wrong.
 */
import { compareModels, effectivePricing, type Workload, type Scale } from '@/lib/engine/cost';
import type { Catalog } from '@/lib/pricing/catalog';
import type { Model } from '@/lib/pricing/types';
import { provenanceOf } from './provenance';

// The comparison workload and the cheaper-model search moved to the site's lib
// when the VS Code extension needed them verbatim. Re-exported here so this
// module's public surface is unchanged — what `findCheaper` returns is this
// server's response shape, and that stays here where it belongs.
import { findCheaperModels, DEFAULT_WORKLOAD, DEFAULT_SCALE } from '@/lib/select/cheaper';

export { DEFAULT_WORKLOAD, DEFAULT_SCALE };

export interface PriceBlock {
  model: string;
  display_name: string;
  provider: string;
  status: string;
  input_per_million_usd: number;
  output_per_million_usd: number;
  cached_input_per_million_usd?: number;
  cache_write_per_million_usd?: number;
  context_window: number;
  max_output?: number;
  promotional_pricing?: {
    in_force_until: string;
    standard_input_per_million_usd: number;
    standard_output_per_million_usd: number;
    note: string;
  };
  provenance: ReturnType<typeof provenanceOf>;
}

function priceBlock(catalog: Catalog, model: Model, asOf: Date): PriceBlock {
  // Quote the rate actually in force, not the standard one. `estimate_cost`
  // has always billed through the engine, which honours promotional windows —
  // so reading `pricing.input` here made the two tools disagree about the same
  // model on the same day. Claude Sonnet 5 is the live case: $2/$10 through
  // 2026-08-31, $3/$15 after, and `get_price` was quoting next month's rate as
  // today's while stamping it "confirmed against the vendor's page".
  const p = effectivePricing(model.pricing, asOf);
  const block: PriceBlock = {
    model: model.id,
    display_name: model.displayName,
    provider: catalog.providerName(model),
    status: model.status,
    input_per_million_usd: p.input,
    output_per_million_usd: p.output,
    context_window: model.contextWindow,
    provenance: provenanceOf(model),
  };
  if (p.cachedInput !== undefined) block.cached_input_per_million_usd = p.cachedInput;
  if (p.cacheWrite !== undefined) block.cache_write_per_million_usd = p.cacheWrite;
  if (model.maxOutput !== undefined) block.max_output = model.maxOutput;
  // A promoted rate that silently differs from the vendor's headline number is
  // the kind of unexplained discrepancy this server exists to avoid, so say
  // both figures and when the cheaper one lapses.
  if (p !== model.pricing && model.pricing.intro) {
    const intro = model.pricing.intro;
    block.promotional_pricing = {
      in_force_until: intro.until,
      standard_input_per_million_usd: model.pricing.input,
      standard_output_per_million_usd: model.pricing.output,
      note:
        `Promotional pricing is in force until ${intro.until}. The rates above are ` +
        `what you are billed today; the standard rates take over afterwards.`,
    };
  }
  return block;
}

/** Resolve a user-supplied name to a catalog model, tolerantly. */
export function resolveModel(catalog: Catalog, query: string): Model | undefined {
  if (typeof query !== 'string') return undefined;
  const direct = catalog.get(query);
  if (direct) return direct;
  const needle = query
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  if (needle.length < 2 || !/[a-z0-9]/.test(needle)) return undefined;
  const all = catalog.models;
  return (
    all.find((m) => m.id.toLowerCase() === needle) ??
    all.find((m) => m.displayName.toLowerCase() === query.trim().toLowerCase()) ??
    all.find((m) => m.id.toLowerCase().includes(needle)) ??
    all.find((m) =>
      m.displayName
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .includes(needle),
    )
  );
}

function notFound(catalog: Catalog, query: string) {
  const suggestions = catalog.models
    .filter((m) => !m.aliasOf)
    .map((m) => m.id)
    .filter((id) => id.split('-')[0] === query.trim().toLowerCase().split(/[-\s]/)[0])
    .slice(0, 8);
  return {
    error: `No model matching "${query}" in the PromptSpend catalog.`,
    did_you_mean: suggestions.length > 0 ? suggestions : undefined,
    hint: 'Use list ids from https://promptspend.dev/v1/prices, or call estimate_cost with a provider name.',
  };
}

// ---------------------------------------------------------------------------

export function getPrice(catalog: Catalog, generatedAt: string, model_name: string, asOf: Date = new Date()) {
  const model = resolveModel(catalog, model_name);
  if (!model) return notFound(catalog, model_name);
  return {
    ...priceBlock(catalog, model, asOf),
    catalog_generated_at: generatedAt,
    note:
      'Rates are the list prices in force today, in USD per million tokens, at standard ' +
      'tier. Where a promotional rate applies it is quoted here and flagged in ' +
      'promotional_pricing. Excludes regional premiums, priority tiers, server-side tool ' +
      'fees and negotiated discounts.',
  };
}

export interface EstimateInput {
  models: string[];
  system_tokens?: number;
  user_tokens?: number;
  output_tokens?: number;
  turns?: number;
  conversations_per_day?: number;
  cached_input_share?: number;
  reasoning_multiplier?: number;
  use_batch_api?: boolean;
}

export function estimateCost(catalog: Catalog, generatedAt: string, input: EstimateInput) {
  const invalid = validateEstimateInput(input);
  if (invalid) return { error: invalid };
  const resolved: Model[] = [];
  const unknown: string[] = [];
  for (const name of input.models) {
    const m = resolveModel(catalog, name);
    if (m) resolved.push(m);
    else unknown.push(name);
  }
  if (resolved.length === 0) {
    return { error: 'None of the requested models are in the catalog.', unknown_models: unknown };
  }

  const workload: Workload = {
    systemTokens: input.system_tokens ?? DEFAULT_WORKLOAD.systemTokens,
    userTokens: input.user_tokens ?? DEFAULT_WORKLOAD.userTokens,
    outputTokens: input.output_tokens ?? DEFAULT_WORKLOAD.outputTokens,
    turns: input.turns ?? DEFAULT_WORKLOAD.turns,
  };
  const scale: Scale = {
    ...DEFAULT_SCALE,
    conversationsPerDay: input.conversations_per_day ?? DEFAULT_SCALE.conversationsPerDay,
  };

  const rows = compareModels(resolved, workload, scale, {
    cachedInputShare: input.cached_input_share ?? 0,
    reasoningMultiplier: input.reasoning_multiplier ?? 1,
    useBatchApi: input.use_batch_api ?? false,
  });

  return {
    workload: {
      system_tokens: workload.systemTokens,
      user_tokens: workload.userTokens,
      output_tokens: workload.outputTokens,
      turns: workload.turns,
      conversations_per_day: scale.conversationsPerDay,
      note:
        `Turn N re-sends turns 1..N-1 as input, so a ${workload.turns}-turn conversation ` +
        `bills far more input than ${workload.userTokens} tokens. This is the single most ` +
        `common mistake in hand-rolled estimates.`,
    },
    results: rows.map((r) => ({
      model: r.model.id,
      display_name: r.model.displayName,
      provider: catalog.providerName(r.model),
      cost_per_conversation_usd: Number(r.breakdown.total.toFixed(6)),
      cost_per_month_usd: Number(r.scaled.perMonth.toFixed(2)),
      cost_per_year_usd: Number(r.scaled.perYear.toFixed(2)),
      input_share_of_cost: Number((r.breakdown.inputCost / (r.breakdown.total || 1)).toFixed(3)),
      extra_per_month_vs_cheapest_usd: Number(r.deltaPerMonth.toFixed(2)),
      multiple_of_cheapest: r.multipleOfCheapest === null ? null : Number(r.multipleOfCheapest.toFixed(2)),
      is_cheapest: r.isCheapest,
      provenance: provenanceOf(r.model),
    })),
    unknown_models: unknown.length > 0 ? unknown : undefined,
    catalog_generated_at: generatedAt,
    assumptions:
      'Standard-tier list prices. Cache writes are billed where the provider publishes a rate. ' +
      'Long-context tiers are applied per request where published. Excludes regional premiums, ' +
      'priority tiers, tool-call fees and negotiated discounts.',
  };
}

export interface CheaperInput {
  model: string;
  system_tokens?: number;
  user_tokens?: number;
  output_tokens?: number;
  turns?: number;
  conversations_per_day?: number;
  min_capability?: number;
}

export function findCheaper(catalog: Catalog, generatedAt: string, input: CheaperInput) {
  const invalid = validateCheaperInput(input);
  if (invalid) return { error: invalid };
  const target = resolveModel(catalog, input.model);
  if (!target) return notFound(catalog, input.model);

  const { targetRow, capabilityBar, cheaper, note } = findCheaperModels(catalog, target, {
    minCapability: input.min_capability,
    workload: {
      systemTokens: input.system_tokens ?? DEFAULT_WORKLOAD.systemTokens,
      userTokens: input.user_tokens ?? DEFAULT_WORKLOAD.userTokens,
      outputTokens: input.output_tokens ?? DEFAULT_WORKLOAD.outputTokens,
      turns: input.turns ?? DEFAULT_WORKLOAD.turns,
    },
    scale: {
      ...DEFAULT_SCALE,
      conversationsPerDay: input.conversations_per_day ?? DEFAULT_SCALE.conversationsPerDay,
    },
  });

  if (note !== undefined) {
    return {
      model: target.id,
      alternatives: [],
      // The shared helper words this for a general caller; the tool's own
      // parameter is what an agent can actually change, so say so.
      note: note.replace('lower the bar', 'lower min_capability'),
    };
  }

  return {
    model: target.id,
    current_cost_per_month_usd: Number((targetRow?.scaled.perMonth ?? 0).toFixed(2)),
    capability_bar: capabilityBar ?? null,
    alternatives: cheaper.slice(0, 5).map((r) => ({
      model: r.model.id,
      display_name: r.model.displayName,
      provider: catalog.providerName(r.model),
      cost_per_month_usd: Number(r.scaled.perMonth.toFixed(2)),
      saves_per_month_usd: Number(((targetRow?.scaled.perMonth ?? 0) - r.scaled.perMonth).toFixed(2)),
      saves_per_year_usd: Number((((targetRow?.scaled.perMonth ?? 0) - r.scaled.perMonth) * 12).toFixed(2)),
      capability_index: r.model.capabilityIndex ?? null,
      provenance: provenanceOf(r.model),
    })),
    catalog_generated_at: generatedAt,
    caveat:
      'The capability index is an illustrative estimate, not a benchmark. A cheaper model ' +
      'clearing the bar is a candidate to TEST, not a decision. Testing it costs pennies.',
  };
}

function validateEstimateInput(input: EstimateInput): string | null {
  if (!input || !Array.isArray(input.models)) return 'models must be an array of model names.';
  if (input.models.length < 1 || input.models.length > 20)
    return 'models must contain between 1 and 20 model names.';
  if (input.models.some((value) => typeof value !== 'string' || value.trim().length < 2))
    return 'Every model name must be a non-blank string.';
  return validateNumbers(input);
}

function validateCheaperInput(input: CheaperInput): string | null {
  if (!input || typeof input.model !== 'string' || input.model.trim().length < 2)
    return 'model must be a non-blank model name.';
  return validateNumbers(input);
}

function validateNumbers(input: EstimateInput | CheaperInput): string | null {
  type NumericField =
    | 'system_tokens'
    | 'user_tokens'
    | 'output_tokens'
    | 'turns'
    | 'conversations_per_day'
    | 'cached_input_share'
    | 'reasoning_multiplier'
    | 'min_capability';
  const fields: Array<[NumericField, number, number]> = [
    ['system_tokens', 0, 200_000],
    ['user_tokens', 0, 200_000],
    ['output_tokens', 0, 200_000],
    ['turns', 1, 200],
    ['conversations_per_day', 0, 100_000_000],
    ['cached_input_share', 0, 1],
    ['reasoning_multiplier', 1, 5],
    ['min_capability', 0, 100],
  ];
  for (const [field, min, max] of fields) {
    const value = (input as Partial<Record<NumericField, unknown>>)[field];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      return `${String(field)} must be a finite number from ${min} to ${max}.`;
    }
  }
  return null;
}
