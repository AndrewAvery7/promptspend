import {
  compareModels,
  estimateTokens,
  type ComparisonRow,
  type EngineOptions,
  type Model,
  type Scale,
  type Workload,
} from '@promptspend/core';

export const MAX_PASTE_CHARS = 200_000;

export type PromptFieldKey = 'system' | 'user' | 'output';
export type PromptInputMode = 'tokens' | 'text';

export interface PromptInputFieldState {
  mode: PromptInputMode;
  text: string;
}

export type PromptInputState = Record<PromptFieldKey, PromptInputFieldState>;

export type NumericPromptValues = Workload;

export function createDefaultPromptInputs(): PromptInputState {
  return {
    system: { mode: 'tokens', text: '' },
    user: { mode: 'tokens', text: '' },
    output: { mode: 'tokens', text: '' },
  };
}

/** Native maxLength is the first guard; this also protects non-UI callers. */
export function clampPromptText(text: string): string {
  return text.slice(0, MAX_PASTE_CHARS);
}

export function promptFieldTokens(
  state: PromptInputFieldState,
  fallbackTokens: number,
  model: Model,
): number {
  return state.mode === 'text' ? estimateTokens(state.text, model.tokenizer) : fallbackTokens;
}

/** Resolve one model's workload without exposing the underlying text. */
export function workloadForModel(
  model: Model,
  inputs: PromptInputState,
  values: NumericPromptValues,
): Workload {
  return {
    systemTokens: promptFieldTokens(inputs.system, values.systemTokens, model),
    userTokens: promptFieldTokens(inputs.user, values.userTokens, model),
    outputTokens: promptFieldTokens(inputs.output, values.outputTokens, model),
    turns: values.turns,
  };
}

/**
 * Price pasted text with every model's own tokenizer profile, then normalize
 * the rows against the true cheapest result.
 */
export function compareModelsForInputs(
  models: readonly Model[],
  inputs: PromptInputState,
  values: NumericPromptValues,
  scale: Scale,
  options: Partial<EngineOptions> = {},
): ComparisonRow[] {
  const rows = models.map(
    (model) => compareModels([model], workloadForModel(model, inputs, values), scale, options)[0]!,
  );
  rows.sort(
    (left, right) =>
      left.scaled.perMonth - right.scaled.perMonth || left.model.id.localeCompare(right.model.id),
  );
  const cheapest = rows[0];
  if (!cheapest) return [];

  return rows.map((row) => ({
    ...row,
    deltaPerMonth: row.scaled.perMonth - cheapest.scaled.perMonth,
    multipleOfCheapest:
      cheapest.scaled.perMonth > 0
        ? row.scaled.perMonth / cheapest.scaled.perMonth
        : row.scaled.perMonth === 0
          ? 1
          : null,
    isCheapest: row.scaled.perMonth === cheapest.scaled.perMonth,
  }));
}
