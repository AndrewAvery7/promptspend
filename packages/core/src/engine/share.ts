import type { ComparisonRow, CostBreakdown, ScaledCost } from './cost';
import { formatCount, formatMoney } from './format';
import type { Model } from '../pricing/types';

const PROMPTSPEND_URL = 'https://promptspend.com';
const SHARE_LINE_BREAK = '\r\n';

export interface EstimateShareInput {
  breakdown: CostBreakdown;
  model: Model;
  scaled: ScaledCost;
}

/**
 * Plain-text estimate summary for native share sheets, email, and messaging apps.
 * It deliberately excludes prompts and other user-authored content.
 */
export function buildEstimateShareText({ breakdown, model, scaled }: EstimateShareInput): string {
  const lines = [
    'PromptSpend estimate',
    '',
    `• Model: ${model.displayName}`,
    `• Estimated monthly cost: ${formatMoney(scaled.perMonth)}`,
    `• Per day: ${formatMoney(scaled.perDay)}`,
    `• Per conversation: ${formatMoney(breakdown.total)}`,
    `• Per year: ${formatMoney(scaled.perYear)}`,
    `• Input tokens per conversation: ${formatCount(breakdown.inputTokens)}`,
    `• Output tokens per conversation: ${formatCount(breakdown.outputTokens)}`,
  ];

  if (breakdown.assumptions.length > 0) {
    lines.push('', ...breakdown.assumptions.map((assumption) => `• Assumption: ${assumption}`));
  }

  if (breakdown.warnings.length > 0) {
    lines.push('', ...breakdown.warnings.map((warning) => `• Important: ${warning}`));
  }

  lines.push(
    '',
    `• Pricing last verified: ${model.provenance.lastVerified}`,
    '• Estimate note: Published API prices and the selected workload are used; actual bills can vary.',
    `• Create your own estimate: ${PROMPTSPEND_URL}`,
  );

  return lines.join(SHARE_LINE_BREAK);
}

/**
 * Reusable summary for the upcoming multi-model comparison result.
 * Rows are copied before sorting so sharing never changes the on-screen result.
 */
export function buildComparisonShareText(rows: readonly ComparisonRow[]): string {
  const sorted = [...rows].sort(
    (left, right) =>
      left.scaled.perMonth - right.scaled.perMonth || left.model.id.localeCompare(right.model.id),
  );
  const cheapest = sorted[0];

  if (!cheapest) {
    return [
      'PromptSpend LLM cost comparison',
      '',
      'No models were selected.',
      `Compare models at ${PROMPTSPEND_URL}`,
    ].join(SHARE_LINE_BREAK);
  }

  const comparisonLines = sorted.map((row, index) => {
    const lowestLabel = index === 0 ? ' (lowest estimated cost)' : '';
    const delta =
      index === 0 ? '' : `; +${formatMoney(row.scaled.perMonth - cheapest.scaled.perMonth)}/month`;

    return `${index + 1}. ${row.model.displayName}: ${formatMoney(row.scaled.perMonth)}/month | ${formatMoney(row.breakdown.total)}/conversation${delta}${lowestLabel}`;
  });

  const warningLines = sorted.flatMap((row) =>
    row.breakdown.warnings.map((warning) => `• ${row.model.displayName}: ${warning}`),
  );

  const lines = [
    'PromptSpend LLM cost comparison',
    '',
    ...comparisonLines,
    '',
    `• Lowest estimated cost: ${cheapest.model.displayName} at ${formatMoney(cheapest.scaled.perMonth)}/month.`,
    '• The same workload and usage assumptions were applied to every model.',
  ];

  if (warningLines.length > 0) {
    lines.push('', 'Important:', ...warningLines);
  }

  lines.push(
    '',
    '• Estimate note: Published API prices are used; actual bills can vary.',
    `• Compare your workload: ${PROMPTSPEND_URL}`,
  );

  return lines.join(SHARE_LINE_BREAK);
}
