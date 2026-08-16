import {
  buildComparisonShareText,
  buildEstimateShareText,
  formatMoney,
  type Catalog,
  type ComparisonRow,
} from '@promptspend/core';

import type { PromptFieldKey } from '@/lib/promptInput';

export interface CostReceiptInput {
  batchEnabled: boolean;
  cacheShare: number;
  catalog: Catalog;
  conversationsPerDay: number;
  outputTokens: number;
  pastedFields: readonly PromptFieldKey[];
  reasoningMultiplier: number;
  rows: readonly ComparisonRow[];
  systemTokens: number;
  turns: number;
  userTokens: number;
}

export interface CostReceiptRow {
  deltaLabel: string | null;
  isLowest: boolean;
  modelName: string;
  monthly: string;
  perConversation: string;
  providerName: string;
  yearly: string;
}

export interface CostReceiptData {
  assumptionLines: string[];
  freshnessLabel: string;
  headline: string;
  isComparison: boolean;
  privacyLine: string;
  rows: CostReceiptRow[];
  savingsLabel: string | null;
  shareText: string;
  title: string;
}

/**
 * Produces the complete share artifact from derived values only. Raw prompt text
 * is deliberately absent from this function's input contract.
 */
export function buildCostReceiptData(input: CostReceiptInput): CostReceiptData | null {
  const rows = [...input.rows].sort(
    (left, right) =>
      left.scaled.perMonth - right.scaled.perMonth || left.model.id.localeCompare(right.model.id),
  );
  const lowest = rows[0];
  if (!lowest) return null;

  const highest = rows.at(-1) ?? lowest;
  const isComparison = rows.length > 1;
  const lastVerified = rows
    .map((row) => row.model.provenance.lastVerified)
    .sort()
    .at(-1);
  const receiptRows = rows.map((row, index): CostReceiptRow => ({
    deltaLabel: index === 0 ? null : `+${formatMoney(row.scaled.perMonth - lowest.scaled.perMonth)}/mo`,
    isLowest: index === 0,
    modelName: row.model.displayName,
    monthly: `${formatMoney(row.scaled.perMonth)}/mo`,
    perConversation: `${formatMoney(row.breakdown.total)}/conversation`,
    providerName: input.catalog.providerName(row.model),
    yearly: `${formatMoney(row.scaled.perYear)}/year`,
  }));

  const assumptionLines = [
    isComparison && input.pastedFields.length > 0
      ? 'Pasted fields were tokenized separately for every model; each row uses that model’s derived counts.'
      : `Base prompt counts: ${Math.round(input.systemTokens + input.userTokens).toLocaleString('en-US')} input + ${Math.round(input.outputTokens).toLocaleString('en-US')} response tokens`,
    `${input.turns.toLocaleString('en-US')} ${input.turns === 1 ? 'turn' : 'turns'} · ${Math.round(input.conversationsPerDay).toLocaleString('en-US')} conversations/day`,
  ];
  if (input.cacheShare > 0)
    assumptionLines.push(`${Math.round(input.cacheShare * 100)}% prompt-cache hit share`);
  if (input.batchEnabled) assumptionLines.push('Published batch pricing applied where available');
  if (input.reasoningMultiplier !== 1)
    assumptionLines.push(`${input.reasoningMultiplier.toFixed(1)}× reasoning-token multiplier`);

  return {
    assumptionLines,
    freshnessLabel: `Prices checked ${input.catalog.sourcesLastChecked() ?? lastVerified ?? 'date unavailable'}`,
    headline: isComparison
      ? `${formatMoney(lowest.scaled.perMonth)}/mo lowest`
      : formatMoney(lowest.scaled.perMonth),
    isComparison,
    privacyLine:
      input.pastedFields.length > 0
        ? 'Private pasted text stayed on-device; only derived counts are shown.'
        : 'Built from derived counts and assumptions—never private prompt text.',
    rows: receiptRows,
    savingsLabel:
      isComparison && highest.scaled.perMonth > lowest.scaled.perMonth
        ? `${formatMoney(highest.scaled.perYear - lowest.scaled.perYear)} annual spread across this shortlist`
        : null,
    shareText: isComparison
      ? buildComparisonShareText(rows)
      : buildEstimateShareText({
          breakdown: lowest.breakdown,
          model: lowest.model,
          scaled: lowest.scaled,
        }),
    title: isComparison ? 'AI cost comparison' : `${lowest.model.displayName} estimate`,
  };
}

export function costReceiptAccessibilityLabel(receipt: CostReceiptData): string {
  const rows = receipt.rows
    .map((row) => `${row.modelName}, ${row.monthly}, ${row.perConversation}, ${row.yearly}`)
    .join('. ');
  return `PromptSpend ${receipt.title}. ${receipt.headline}. ${rows}. ${receipt.freshnessLabel}. ${receipt.privacyLine}`;
}
