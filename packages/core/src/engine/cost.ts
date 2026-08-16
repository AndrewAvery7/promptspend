import type { Model, Pricing } from '../pricing/types';
import { costPico, isExactCost, picoToDollars } from './money';

/** One typical exchange, described in tokens. */
export interface Workload {
  systemTokens: number;
  userTokens: number;
  outputTokens: number;
  /** Turns in a single conversation; turn N re-sends turns 1..N-1 as input. */
  turns: number;
}

export interface EngineOptions {
  /** Fraction of input tokens (0–1) assumed to be served from prompt cache. */
  cachedInputShare: number;
  /** Bill output at this multiple to account for hidden reasoning tokens. */
  reasoningMultiplier: number;
  /** Apply the provider's batch-API discount where one is published. */
  useBatchApi: boolean;
  /** Date used to decide whether promotional pricing is still in effect. */
  asOf: Date;
}

/**
 * No caching by default.
 *
 * A cache-hit rate is a property of someone's traffic, not of the model, and
 * the first number a visitor sees should contain no discount they have not
 * asked for. Assuming a healthy hit rate made the headline figure the best
 * case rather than the expected one — the control is on the main panel, one
 * click away, and every assumption it turns on is listed under the results.
 */
export const DEFAULT_OPTIONS: Omit<EngineOptions, 'asOf'> = {
  cachedInputShare: 0,
  reasoningMultiplier: 1,
  useBatchApi: false,
};

/** The cache share applied when the visitor switches caching on. */
export const SUGGESTED_CACHE_SHARE = 0.6;

export interface SessionTokens {
  /** Total input tokens billed across the whole conversation. */
  inputTokens: number;
  /** Total output tokens billed across the whole conversation. */
  outputTokens: number;
  /** The share of `inputTokens` that is re-sent conversation history. */
  historyTokens: number;
  /** Input tokens in the single largest request — the last turn. This, not the
   *  conversation total, is what a context window and a long-context price
   *  tier are measured against. */
  peakRequestTokens: number;
}

/**
 * Token accounting for one conversation.
 *
 * At turn `t` the request carries the system prompt, the new user message and
 * every previous (user, response) pair. Summing t = 1..T:
 *
 *   input  = T·(system + user) + (user + output)·T·(T−1)/2
 *   output = T·output
 *
 * The second term is why long conversations get expensive faster than people
 * expect: it grows with the square of the turn count.
 */
export function sessionTokens(w: Workload): SessionTokens {
  const turns = Math.max(1, Math.floor(w.turns));
  const system = Math.max(0, w.systemTokens);
  const user = Math.max(0, w.userTokens);
  const output = Math.max(0, w.outputTokens);

  const historyPairs = (turns * (turns - 1)) / 2;
  const historyTokens = historyPairs * (user + output);
  return {
    inputTokens: turns * (system + user) + historyTokens,
    outputTokens: turns * output,
    historyTokens,
    peakRequestTokens: system + user + (turns - 1) * (user + output),
  };
}

/** Pricing in force on a given date, honouring promotional windows. */
export function effectivePricing(pricing: Pricing, asOf: Date): Pricing {
  const intro = pricing.intro;
  if (!intro) return pricing;
  // A date-only promotion includes the full named UTC calendar day. Parsing
  // YYYY-MM-DD alone yields midnight and used to expire the rate 24 hours early.
  const until = Date.parse(`${intro.until}T23:59:59.999Z`);
  if (Number.isNaN(until) || asOf.getTime() > until) return pricing;
  return {
    ...pricing,
    input: intro.input,
    output: intro.output,
    // Cache rates are a multiple of the input rate, so a promotion moves them
    // too. Only override where the vendor actually publishes the promoted
    // figure — otherwise the standard rate stands, which errs high.
    ...(intro.cachedInput !== undefined ? { cachedInput: intro.cachedInput } : {}),
    ...(intro.cacheWrite !== undefined ? { cacheWrite: intro.cacheWrite } : {}),
  };
}

/** The four rates one request is billed at, after every modifier. */
interface RateSet {
  input: number;
  output: number;
  cachedInput: number | undefined;
  cacheWrite: number | undefined;
}

function baseRates(pricing: Pricing): RateSet {
  return {
    input: pricing.input,
    output: pricing.output,
    cachedInput: pricing.cachedInput,
    cacheWrite: pricing.cacheWrite,
  };
}

function longContextRates(pricing: Pricing): RateSet | null {
  const tier = pricing.longContext;
  if (!tier) return null;
  return {
    input: tier.input,
    output: tier.output,
    cachedInput: tier.cachedInput,
    cacheWrite: tier.cacheWrite,
  };
}

function discounted(rates: RateSet, multiplier: number): RateSet {
  return {
    input: rates.input * multiplier,
    output: rates.output * multiplier,
    cachedInput: rates.cachedInput === undefined ? undefined : rates.cachedInput * multiplier,
    cacheWrite: rates.cacheWrite === undefined ? undefined : rates.cacheWrite * multiplier,
  };
}

export interface CostBreakdown extends SessionTokens {
  /** Output tokens actually billed after a reasoning multiplier is applied. */
  billedOutputTokens: number;
  /** What input would have cost with no caching. */
  inputCostUncached: number;
  /** What input actually costs after the cache assumption. */
  inputCost: number;
  /** What it costs to *write* the cached prefix, where a rate is published. */
  cacheWriteCost: number;
  /** Net saving from caching: uncached input minus (cached input + writes). */
  cacheSavings: number;
  outputCost: number;
  total: number;
  /** Requests in this conversation billed at the long-context tier. */
  longContextTurns: number;
  /** Human-readable notes about every non-published number used. */
  assumptions: string[];
  /** Things that make this scenario questionable rather than merely assumed —
   *  a request that cannot fit, a response past the model's ceiling. */
  warnings: string[];
  /** False once the numbers are large enough that the last pico-dollars of the
   *  integer arithmetic have been rounded. Never false for a real workload. */
  exact: boolean;
}

/** Cost of one conversation on one model. */
export function conversationCost(
  model: Model,
  workload: Workload,
  options: Partial<EngineOptions> = {},
): CostBreakdown {
  const opts: EngineOptions = { ...DEFAULT_OPTIONS, asOf: new Date(), ...options };
  const tokens = sessionTokens(workload);
  const assumptions: string[] = [];
  const warnings: string[] = [];

  const pricing = effectivePricing(model.pricing, opts.asOf);
  if (pricing !== model.pricing) {
    assumptions.push(`Promotional pricing applied (ends ${model.pricing.intro?.until}).`);
  }

  let batchMultiplier = 1;
  if (opts.useBatchApi) {
    if (pricing.batchDiscount !== undefined) {
      batchMultiplier = pricing.batchDiscount;
      assumptions.push(`Batch API discount of ${Math.round((1 - batchMultiplier) * 100)}% applied.`);
    } else {
      assumptions.push('This provider publishes no batch discount — full rates used.');
    }
  }

  const standard = discounted(baseRates(pricing), batchMultiplier);
  const longTier = longContextRates(pricing);
  const long = longTier ? discounted(longTier, batchMultiplier) : null;
  const threshold = pricing.longContext?.thresholdTokens ?? Infinity;

  const cachedShare = clamp01(opts.cachedInputShare);
  const reasoningMultiplier = Math.max(1, opts.reasoningMultiplier);

  const turns = Math.max(1, Math.floor(workload.turns));
  const system = Math.max(0, workload.systemTokens);
  const user = Math.max(0, workload.userTokens);
  const output = Math.max(0, workload.outputTokens);

  let inputPico = 0;
  let inputUncachedPico = 0;
  let outputPico = 0;
  let billedOutputTokens = 0;
  let longContextTurns = 0;
  let exact = true;

  const charge = (count: number, rate: number): number => {
    if (count <= 0) return 0;
    if (exact && !isExactCost(count, rate)) exact = false;
    return costPico(count, rate);
  };

  // Per turn rather than in aggregate: the long-context tier is a property of a
  // single request, so a conversation can start on the standard rate and cross
  // over partway through. Aggregating first would price every turn wrong.
  for (let turn = 1; turn <= turns; turn += 1) {
    const requestInput = system + user + (turn - 1) * (user + output);
    const useLong = long !== null && requestInput > threshold;
    if (useLong) longContextTurns += 1;
    const rates = useLong ? long : standard;

    const cachedTokens = Math.round(requestInput * cachedShare);
    const freshTokens = requestInput - cachedTokens;
    const cachedRate = rates.cachedInput ?? rates.input;

    inputUncachedPico += charge(requestInput, rates.input);
    inputPico += charge(freshTokens, rates.input) + charge(cachedTokens, cachedRate);
    const billedOutput = Math.round(output * reasoningMultiplier);
    billedOutputTokens += billedOutput;
    outputPico += charge(billedOutput, rates.output);
  }

  // The cached prefix has to be written before it can be read. Both OpenAI and
  // Anthropic charge 1.25x base input for that write. Modelled as one write per
  // conversation: the prefix is stable within a session, which is the case the
  // cache assumption is about.
  let cacheWritePico = 0;
  if (cachedShare > 0) {
    const prefix = Math.round((system + user) * cachedShare);
    const prefixUsesLongTier = long !== null && system + user > threshold;
    const writeRates = prefixUsesLongTier ? long : standard;
    if (writeRates.cacheWrite !== undefined) {
      cacheWritePico = charge(prefix, writeRates.cacheWrite);
      assumptions.push(
        `One cache write per conversation, at the provider’s published ${prefixUsesLongTier ? 'long-context ' : ''}write rate.`,
      );
    } else if (prefix > 0) {
      assumptions.push(
        'Cache writes are not modelled for this model — no published write rate, so the real bill is a little higher.',
      );
    }
  }

  if (cachedShare > 0) {
    assumptions.push(`${Math.round(cachedShare * 100)}% of input tokens assumed to hit the cache.`);
    if (pricing.cachedInput === undefined) {
      // Inventing a discount here is what makes a calculator flattering rather
      // than useful. If the provider does not publish a cached rate, the honest
      // number is the full one.
      assumptions.push(
        `${model.displayName} publishes no cached-input rate — cached tokens are billed at the full input rate.`,
      );
    }
    if (pricing.cacheStoragePerMillionTokenHour !== undefined) {
      warnings.push(
        `Cache storage is billed separately at $${pricing.cacheStoragePerMillionTokenHour}/1M cached tokens/hour and is not included because no retention duration was supplied.`,
      );
    }
  }
  if (reasoningMultiplier > 1) {
    assumptions.push(`Output billed at ${reasoningMultiplier}× to account for hidden reasoning tokens.`);
  }
  if (longContextTurns > 0 && pricing.longContext) {
    assumptions.push(
      `${longContextTurns} of ${turns} turns exceed ${formatTokens(pricing.longContext.thresholdTokens)} input tokens and are billed at this model’s long-context rates.`,
    );
  } else if (long === null && tokens.peakRequestTokens > 272_000) {
    assumptions.push(
      'No long-context tier is published for this model — some providers bill large requests at a premium that this estimate does not include.',
    );
  }

  if (tokens.peakRequestTokens + output > model.contextWindow) {
    warnings.push(
      `The largest turn needs ${formatTokens(tokens.peakRequestTokens + output)} tokens, past ${model.displayName}’s ${formatTokens(model.contextWindow)} context window — this conversation could not actually run.`,
    );
  }
  if (model.maxOutput !== undefined && output > model.maxOutput) {
    warnings.push(
      `A ${formatTokens(output)}-token response is past ${model.displayName}’s ${formatTokens(model.maxOutput)} output ceiling.`,
    );
  }

  const inputCostUncached = picoToDollars(inputUncachedPico);
  const inputCost = picoToDollars(inputPico);
  const cacheWriteCost = picoToDollars(cacheWritePico);
  const outputCost = picoToDollars(outputPico);

  return {
    ...tokens,
    inputCostUncached,
    inputCost,
    cacheWriteCost,
    cacheSavings: picoToDollars(inputUncachedPico - inputPico - cacheWritePico),
    outputCost,
    billedOutputTokens,
    total: picoToDollars(inputPico + cacheWritePico + outputPico),
    longContextTurns,
    assumptions,
    warnings,
    exact,
  };
}

export interface Scale {
  conversationsPerDay: number;
  monthlyActiveUsers: number;
  revenuePerUserPerMonth: number;
  /** Days billed per month. 30 keeps month-to-month comparisons stable. */
  daysPerMonth?: number;
}

export interface ScaledCost {
  perConversation: number;
  perDay: number;
  perMonth: number;
  perYear: number;
  costPerUser: number;
  /** Gross margin on AI cost alone, as a fraction. Null when no revenue given. */
  margin: number | null;
  /** Conversations/day at which AI cost consumes all revenue. Null if never. */
  breakEvenConversationsPerDay: number | null;
}

export function costAtScale(perConversation: number, scale: Scale): ScaledCost {
  const days = scale.daysPerMonth ?? 30;
  const perDay = perConversation * Math.max(0, scale.conversationsPerDay);
  const perMonth = perDay * days;
  const users = Math.max(1, scale.monthlyActiveUsers);
  const costPerUser = perMonth / users;
  const revenue = Math.max(0, scale.revenuePerUserPerMonth);
  const monthlyRevenue = revenue * users;

  let breakEven: number | null = null;
  if (monthlyRevenue > 0 && perConversation > 0) {
    breakEven = monthlyRevenue / (perConversation * days);
  }

  return {
    perConversation,
    perDay,
    perMonth,
    // "Per year" is twelve forecast months, so custom daysPerMonth stays
    // internally consistent instead of mixing a 30-day month with 365 days.
    perYear: perMonth * 12,
    costPerUser,
    margin: revenue > 0 ? (revenue - costPerUser) / revenue : null,
    breakEvenConversationsPerDay: breakEven,
  };
}

export interface ComparisonRow {
  model: Model;
  breakdown: CostBreakdown;
  scaled: ScaledCost;
  /** Extra monthly spend versus the cheapest model in the comparison. */
  deltaPerMonth: number;
  /** Multiple of the cheapest model's monthly cost; null when the baseline is
   *  free and a ratio would be mathematically undefined. */
  multipleOfCheapest: number | null;
  isCheapest: boolean;
}

/** Cost every selected model on the same workload, cheapest first. */
export function compareModels(
  models: Model[],
  workload: Workload,
  scale: Scale,
  options: Partial<EngineOptions> = {},
): ComparisonRow[] {
  const priced = models.map((model) => {
    const breakdown = conversationCost(model, workload, options);
    return { model, breakdown, scaled: costAtScale(breakdown.total, scale) };
  });

  priced.sort((a, b) => a.scaled.perMonth - b.scaled.perMonth || a.model.id.localeCompare(b.model.id));
  const cheapest = priced[0];

  return priced.map((row) => ({
    ...row,
    deltaPerMonth: cheapest ? row.scaled.perMonth - cheapest.scaled.perMonth : 0,
    multipleOfCheapest:
      cheapest && cheapest.scaled.perMonth > 0
        ? row.scaled.perMonth / cheapest.scaled.perMonth
        : row.scaled.perMonth === 0
          ? 1
          : null,
    isCheapest: Boolean(cheapest && row.scaled.perMonth === cheapest.scaled.perMonth),
  }));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}K`;
  return String(Math.round(count));
}
