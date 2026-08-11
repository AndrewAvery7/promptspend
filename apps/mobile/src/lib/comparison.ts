export const MAX_COMPARISON_MODELS = 4;

const PREFERRED_COMPARISON_MODELS = [
  'claude-sonnet-5',
  'gpt-5.4',
  'deepseek-deepseek-v3.2',
  'moonshot-kimi-k2.5',
] as const;

export interface ComparisonSelectionResult {
  accepted: boolean;
  selectedIds: string[];
}

interface SelectableModel {
  id: string;
  pricing: { output: number };
}

/** Match the website's useful frontier-to-budget starting shortlist. */
export function defaultComparisonSelection(models: readonly SelectableModel[]): string[] {
  const available = new Set(models.map((model) => model.id));
  const preferred = PREFERRED_COMPARISON_MODELS.filter((id) => available.has(id));
  if (preferred.length >= 2) return preferred.slice(0, MAX_COMPARISON_MODELS);

  const sorted = [...models].sort((left, right) => left.pricing.output - right.pricing.output);
  const inexpensive = sorted.slice(0, 2).map((model) => model.id);
  const expensive = sorted.slice(-2).map((model) => model.id);
  return [...new Set([...expensive, ...inexpensive])].slice(0, MAX_COMPARISON_MODELS);
}

/** Add or remove a model without ever allowing more than four selections. */
export function toggleComparisonSelection(
  selectedIds: readonly string[],
  id: string,
): ComparisonSelectionResult {
  if (selectedIds.includes(id)) {
    return { accepted: true, selectedIds: selectedIds.filter((selectedId) => selectedId !== id) };
  }

  if (selectedIds.length >= MAX_COMPARISON_MODELS) {
    return { accepted: false, selectedIds: [...selectedIds] };
  }

  return { accepted: true, selectedIds: [...selectedIds, id] };
}
