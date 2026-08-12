import {
  conversationCost,
  costAtScale,
  type EngineOptions,
  type Model,
  type Scale,
  type ScaledCost,
  type Workload,
} from '@promptspend/core';

export interface SensitivityDraft {
  conversationsPerDay: number;
  outputTokens: number;
  turns: number;
}

export interface SensitivityResult {
  baseline: ScaledCost;
  monthlyDelta: number;
  percentDelta: number | null;
  preview: ScaledCost;
}

export function evaluateSensitivity(
  model: Model,
  workload: Workload,
  scale: Scale,
  draft: SensitivityDraft,
  options: Partial<EngineOptions>,
): SensitivityResult {
  const baselineBreakdown = conversationCost(model, workload, options);
  const baseline = costAtScale(baselineBreakdown.total, scale);
  const previewBreakdown = conversationCost(
    model,
    {
      ...workload,
      outputTokens: sanitize(draft.outputTokens),
      turns: Math.max(1, sanitize(draft.turns)),
    },
    options,
  );
  const preview = costAtScale(previewBreakdown.total, {
    ...scale,
    conversationsPerDay: sanitize(draft.conversationsPerDay),
  });
  const monthlyDelta = preview.perMonth - baseline.perMonth;

  return {
    baseline,
    monthlyDelta,
    percentDelta: baseline.perMonth > 0 ? monthlyDelta / baseline.perMonth : null,
    preview,
  };
}

function sanitize(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
