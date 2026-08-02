import type { Model, Pricing } from '@/lib/pricing/types';
import { costPico, picoToDollars } from './money';

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

export const DEFAULT_OPTIONS: EngineOptions = {
  cachedInputShare: 0.6,
  reasoningMultiplier: 1,
  useBatchApi: false,
  asOf: new Date(),
};

/**
 * Fallback discount applied to cached input when a provider advertises prompt
 * caching but we have no published cached rate. Roughly the industry norm
 * (~90% off). Always surfaced to the user as an assumption.
 */
export const ASSUMED_CACHE_MULTIPLIER = 0.1;

export interface SessionTokens {
  /** Total input tokens billed across the whole conversation. */
  inputTokens: number;
  /** Total output tokens billed across the whole conversation. */
  outputTokens: number;
  /** The share of `inputTokens` that is re-sent conversation history. */
  historyTokens: number;
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
  };
}

/** Pricing in force on a given date, honouring promotional windows. */
export function effectivePricing(pricing: Pricing, asOf: Date): Pricing {
  const intro = pricing.intro;
  if (!intro) return pricing;
  const until = Date.parse(intro.until);
  if (Number.isNaN(until) || asOf.getTime() > until) return pricing;
  return { ...pricing, input: intro.input, output: intro.output };
}

export interface CostBreakdown extends SessionTokens {
  /** What input would have cost with no caching. */
  inputCostUncached: number;
  /** What input actually costs after the cache assumption. */
  inputCost: number;
  cacheSavings: number;
  outputCost: number;
  total: number;
  /** Human-readable notes about every non-published number used. */
  assumptions: string[];
}

/** Cost of one conversation on one model. */
export function conversationCost(
  model: Model,
  workload: Workload,
  options: Partial<EngineOptions> = {},
): CostBreakdown {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const tokens = sessionTokens(workload);
  const assumptions: string[] = [];

  let pricing = effectivePricing(model.pricing, opts.asOf);
  if (pricing !== model.pricing) {
    assumptions.push(`Promotional pricing applied (ends ${model.pricing.intro?.until}).`);
  }

  if (opts.useBatchApi) {
    const discount = pricing.batchDiscount;
    if (discount !== undefined) {
      pricing = { ...pricing, input: pricing.input * discount, output: pricing.output * discount };
      assumptions.push(`Batch API discount of ${Math.round((1 - discount) * 100)}% applied.`);
    } else {
      assumptions.push('This provider publishes no batch discount — full rates used.');
    }
  }

  const cachedShare = clamp01(opts.cachedInputShare);
  const cachedTokens = Math.round(tokens.inputTokens * cachedShare);
  const freshTokens = tokens.inputTokens - cachedTokens;

  let cachedRate: number;
  if (pricing.cachedInput !== undefined) {
    cachedRate = pricing.cachedInput;
  } else {
    cachedRate = pricing.input * ASSUMED_CACHE_MULTIPLIER;
    if (cachedShare > 0) {
      assumptions.push(
        `No published cached-input rate for this model; assumed ${Math.round(
          ASSUMED_CACHE_MULTIPLIER * 100,
        )}% of the input rate.`,
      );
    }
  }
  if (cachedShare > 0) {
    assumptions.push(`${Math.round(cachedShare * 100)}% of input tokens assumed to hit the cache.`);
  }

  const reasoningMultiplier = Math.max(1, opts.reasoningMultiplier);
  const billedOutput = Math.round(tokens.outputTokens * reasoningMultiplier);
  if (reasoningMultiplier > 1) {
    assumptions.push(`Output billed at ${reasoningMultiplier}× to account for hidden reasoning tokens.`);
  }

  const inputCostUncached = picoToDollars(costPico(tokens.inputTokens, pricing.input));
  const inputCost = picoToDollars(costPico(freshTokens, pricing.input) + costPico(cachedTokens, cachedRate));
  const outputCost = picoToDollars(costPico(billedOutput, pricing.output));

  return {
    ...tokens,
    inputCostUncached,
    inputCost,
    cacheSavings: inputCostUncached - inputCost,
    outputCost,
    total: inputCost + outputCost,
    assumptions,
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
    perYear: perDay * 365,
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
  /** Multiple of the cheapest model's monthly cost (1 for the cheapest). */
  multipleOfCheapest: number;
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

  return priced.map((row, index) => ({
    ...row,
    deltaPerMonth: cheapest ? row.scaled.perMonth - cheapest.scaled.perMonth : 0,
    multipleOfCheapest:
      cheapest && cheapest.scaled.perMonth > 0 ? row.scaled.perMonth / cheapest.scaled.perMonth : 1,
    isCheapest: index === 0,
  }));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
