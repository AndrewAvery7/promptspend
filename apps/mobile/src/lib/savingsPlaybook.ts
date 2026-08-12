import {
  SUGGESTED_CACHE_SHARE,
  conversationCost,
  costAtScale,
  type ComparisonRow,
  type EngineOptions,
  type Model,
  type Scale,
  type Workload,
} from '@promptspend/core';

export type SavingsLeverKind = 'batch' | 'cache' | 'model' | 'output' | 'turns';

export interface SavingsLever {
  annualSavings: number;
  basis: string;
  caution: string;
  id: string;
  kind: SavingsLeverKind;
  monthlySavings: number;
  percentSavings: number;
  proposedModelId?: string;
  proposedValue?: number;
  title: string;
}

interface SavingsPlaybookInput {
  comparisonRows: readonly ComparisonRow[];
  model: Model;
  options: Partial<EngineOptions>;
  scale: Scale;
  workload: Workload;
}

export function buildSavingsPlaybook({
  comparisonRows,
  model,
  options,
  scale,
  workload,
}: SavingsPlaybookInput): SavingsLever[] {
  const baseline = priceScenario(model, workload, scale, options);
  if (baseline <= 0) return [];

  const levers: SavingsLever[] = [];
  const addLever = (lever: Omit<SavingsLever, 'annualSavings' | 'percentSavings'>) => {
    if (!Number.isFinite(lever.monthlySavings) || lever.monthlySavings < 0.01) return;
    levers.push({
      ...lever,
      annualSavings: lever.monthlySavings * 12,
      percentSavings: Math.min(1, lever.monthlySavings / baseline),
    });
  };

  const cheapestAlternative = comparisonRows.find(
    (row) => row.model.id !== model.id && row.scaled.perMonth + 0.01 < baseline,
  );
  if (cheapestAlternative) {
    addLever({
      basis: `${cheapestAlternative.model.displayName} prices the same modeled workload at ${formatCompactMoney(cheapestAlternative.scaled.perMonth)} per month.`,
      caution:
        'Price does not establish equivalent quality, latency, safety, context handling, or tool support. Validate the workload before switching.',
      id: `model-${cheapestAlternative.model.id}`,
      kind: 'model',
      monthlySavings: baseline - cheapestAlternative.scaled.perMonth,
      proposedModelId: cheapestAlternative.model.id,
      title: `Evaluate ${cheapestAlternative.model.displayName}`,
    });
  }

  if (workload.outputTokens >= 50) {
    const proposed = Math.max(1, Math.round(workload.outputTokens * 0.8));
    const monthly = priceScenario(model, { ...workload, outputTokens: proposed }, scale, options);
    addLever({
      basis: `Previews a 20% reduction from ${Math.round(workload.outputTokens).toLocaleString()} to ${proposed.toLocaleString()} output tokens per turn.`,
      caution:
        'Use a representative response sample; aggressive length limits can reduce usefulness or omit required detail.',
      id: 'output-20',
      kind: 'output',
      monthlySavings: baseline - monthly,
      proposedValue: proposed,
      title: 'Tighten response length by 20%',
    });
  }

  if (workload.turns > 1) {
    const proposed = Math.max(1, Math.floor(workload.turns) - 1);
    const monthly = priceScenario(model, { ...workload, turns: proposed }, scale, options);
    addLever({
      basis: `Previews ${proposed} turns instead of ${Math.floor(workload.turns)}; this also removes one layer of re-sent conversation history.`,
      caution:
        'Shorter sessions may require better routing, summarization, or handoff design rather than simply ending a useful conversation.',
      id: 'turns-minus-one',
      kind: 'turns',
      monthlySavings: baseline - monthly,
      proposedValue: proposed,
      title: 'Remove one history-bearing turn',
    });
  }

  const cachedShare = options.cachedInputShare ?? 0;
  if (cachedShare <= 0 && model.pricing.cachedInput !== undefined) {
    const monthly = priceScenario(model, workload, scale, {
      ...options,
      cachedInputShare: SUGGESTED_CACHE_SHARE,
    });
    addLever({
      basis: `Previews a ${Math.round(SUGGESTED_CACHE_SHARE * 100)}% cache-hit share using this model's published cached-input rate and cache-write rate where available.`,
      caution:
        'Savings require a stable reusable prefix and actual provider cache hits; they are not guaranteed.',
      id: 'cache-suggested',
      kind: 'cache',
      monthlySavings: baseline - monthly,
      proposedValue: SUGGESTED_CACHE_SHARE * 100,
      title: 'Prototype prompt caching',
    });
  }

  if (!options.useBatchApi && model.pricing.batchDiscount !== undefined) {
    const monthly = priceScenario(model, workload, scale, { ...options, useBatchApi: true });
    addLever({
      basis: `Uses the provider's published ${Math.round((1 - model.pricing.batchDiscount) * 100)}% batch discount for this model.`,
      caution:
        'Batch processing is suitable only when the workload can tolerate asynchronous completion and provider-specific limits.',
      id: 'batch-api',
      kind: 'batch',
      monthlySavings: baseline - monthly,
      title: 'Move eligible work to batch',
    });
  }

  return levers
    .sort((left, right) => right.monthlySavings - left.monthlySavings || left.id.localeCompare(right.id))
    .slice(0, 5);
}

function priceScenario(
  model: Model,
  workload: Workload,
  scale: Scale,
  options: Partial<EngineOptions>,
): number {
  const breakdown = conversationCost(model, workload, options);
  return costAtScale(breakdown.total, scale).perMonth;
}

function formatCompactMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
    style: 'currency',
  }).format(value);
}
