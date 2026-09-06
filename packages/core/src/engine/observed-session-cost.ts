import type { Model, Pricing } from '../pricing/types';
import { effectivePricing } from './cost';
import { costPico, isExactCost, picoToDollars } from './money';

/**
 * Usage for one request in a conversation that has already happened.
 *
 * `inputTokens` is the total input across fresh, cached-read and cache-write
 * categories. The optional cache counts are subsets of that total. Output is
 * the visible response; hidden reasoning is separate because an assistant
 * inspecting a transcript normally cannot see it.
 */
export interface ObservedRequestUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  /** Omit when hidden reasoning usage is unknown; pass 0 only when it is known to be zero. */
  reasoningTokens?: number;
}

export interface ObservedSessionUsage {
  requests: readonly ObservedRequestUsage[];
}

export interface ObservedSessionOptions {
  /** Date used to select promotional pricing. */
  asOf: Date;
}

export interface ObservedSessionBreakdown {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  inputCost: number;
  outputCost: number;
  cacheWriteCost: number;
  total: number;
  longContextRequests: number;
  assumptions: string[];
  warnings: string[];
  /** Whether the integer pico-dollar arithmetic stayed within Number's exact range. */
  exact: boolean;
}

interface RateSet {
  input: number;
  output: number;
  cachedInput: number | undefined;
  cacheWrite: number | undefined;
}

function ratesFor(pricing: Pricing, requestInput: number): { rates: RateSet; longContext: boolean } {
  const tier = pricing.longContext;
  if (tier && requestInput > tier.thresholdTokens) {
    return {
      longContext: true,
      rates: {
        input: tier.input,
        output: tier.output,
        cachedInput: tier.cachedInput,
        cacheWrite: tier.cacheWrite,
      },
    };
  }
  return {
    longContext: false,
    rates: {
      input: pricing.input,
      output: pricing.output,
      cachedInput: pricing.cachedInput,
      cacheWrite: pricing.cacheWrite,
    },
  };
}

function tokens(value: number | undefined, field: string, request: number, unknown = 0): number {
  if (value === undefined) return unknown;
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`request ${request}: ${field} must be a non-negative finite number`);
  }
  return Math.round(value);
}

/**
 * Cost request-by-request usage from an observed conversation.
 *
 * This is deliberately separate from `conversationCost`, which starts with a
 * representative turn and synthesizes the history re-sent on later turns. An
 * observed transcript has already accumulated that history. Passing its totals
 * through the synthetic-turn engine would count the same history twice.
 */
export function observedSessionCost(
  model: Model,
  usage: ObservedSessionUsage,
  options: Partial<ObservedSessionOptions> = {},
): ObservedSessionBreakdown {
  const asOf = options.asOf ?? new Date();
  const pricing = effectivePricing(model.pricing, asOf);
  const assumptions: string[] = [];
  const warnings: string[] = [];
  let inputPico = 0;
  let outputPico = 0;
  let cacheWritePico = 0;
  let inputTotal = 0;
  let outputTotal = 0;
  let reasoningTotal = 0;
  let cachedTotal = 0;
  let cacheWriteTotal = 0;
  let longContextRequests = 0;
  let exact = true;
  let hasUnknownReasoning = false;
  let usedCachedFallback = false;
  let usedWriteFallback = false;

  if (pricing !== model.pricing) {
    assumptions.push(`Promotional pricing applied (ends ${model.pricing.intro?.until}).`);
  }

  const charge = (count: number, rate: number): number => {
    if (count === 0) return 0;
    if (exact && !isExactCost(count, rate)) exact = false;
    return costPico(count, rate);
  };

  usage.requests.forEach((request, index) => {
    const requestNumber = index + 1;
    const input = tokens(request.inputTokens, 'inputTokens', requestNumber);
    const output = tokens(request.outputTokens, 'outputTokens', requestNumber);
    const cached = tokens(request.cachedInputTokens, 'cachedInputTokens', requestNumber);
    const written = tokens(request.cacheWriteTokens, 'cacheWriteTokens', requestNumber);
    const reasoning = tokens(request.reasoningTokens, 'reasoningTokens', requestNumber);

    if (cached + written > input) {
      throw new RangeError(
        `request ${requestNumber}: cachedInputTokens + cacheWriteTokens cannot exceed inputTokens`,
      );
    }

    if (request.reasoningTokens === undefined) hasUnknownReasoning = true;
    const fresh = input - cached - written;
    const { rates, longContext } = ratesFor(pricing, input);
    if (longContext) longContextRequests += 1;

    const cachedRate = rates.cachedInput ?? rates.input;
    const writeRate = rates.cacheWrite ?? rates.input;
    if (cached > 0 && rates.cachedInput === undefined) usedCachedFallback = true;
    if (written > 0 && rates.cacheWrite === undefined) usedWriteFallback = true;

    inputPico += charge(fresh, rates.input) + charge(cached, cachedRate);
    cacheWritePico += charge(written, writeRate);
    outputPico += charge(output + reasoning, rates.output);

    inputTotal += input;
    outputTotal += output;
    reasoningTotal += reasoning;
    cachedTotal += cached;
    cacheWriteTotal += written;

    if (input + output + reasoning > model.contextWindow) {
      warnings.push(
        `Request ${requestNumber} totals ${formatTokens(input + output + reasoning)} tokens, past ${model.displayName}'s ${formatTokens(model.contextWindow)} context window.`,
      );
    }
    if (model.maxOutput !== undefined && output + reasoning > model.maxOutput) {
      warnings.push(
        `Request ${requestNumber} uses ${formatTokens(output + reasoning)} output tokens, past ${model.displayName}'s ${formatTokens(model.maxOutput)} output ceiling.`,
      );
    }
  });

  if (hasUnknownReasoning) {
    warnings.push('Hidden reasoning tokens are not included where their usage was unavailable.');
  }
  if (usedCachedFallback) {
    assumptions.push(
      'No cached-input rate is published for this model; cached reads use the full input rate.',
    );
  }
  if (usedWriteFallback) {
    warnings.push('No cache-write rate is published for this model; cache writes use the full input rate.');
  }
  if (longContextRequests > 0 && pricing.longContext) {
    assumptions.push(
      `${longContextRequests} ${longContextRequests === 1 ? 'request uses' : 'requests use'} the published long-context rate above ${formatTokens(pricing.longContext.thresholdTokens)} input tokens.`,
    );
  }

  const inputCost = picoToDollars(inputPico);
  const outputCost = picoToDollars(outputPico);
  const cacheWriteCost = picoToDollars(cacheWritePico);

  return {
    requestCount: usage.requests.length,
    inputTokens: inputTotal,
    outputTokens: outputTotal,
    reasoningTokens: reasoningTotal,
    cachedInputTokens: cachedTotal,
    cacheWriteTokens: cacheWriteTotal,
    inputCost,
    outputCost,
    cacheWriteCost,
    total: picoToDollars(inputPico + outputPico + cacheWritePico),
    longContextRequests,
    assumptions,
    warnings,
    exact,
  };
}

function formatTokens(count: number): string {
  return Math.round(count).toLocaleString('en-US');
}
