import type { ComparisonRow, Workload } from './cost';
import { formatMoney, formatPercent } from './format';

export interface Insight {
  id: string;
  /** Short sentence with `**bold**` spans for the numbers that matter. */
  text: string;
  /** Learn module this insight is teaching, if any. */
  learnId?: string;
}

/**
 * Live diagnosis of the current scenario: which dial is actually driving the
 * bill. Every claim is derived from the same numbers on screen, so a reader can
 * always check the arithmetic against the cards.
 */
export function buildInsights(rows: ComparisonRow[], workload: Workload, revenuePerUser: number): Insight[] {
  const cheapest = rows[0];
  if (!cheapest) return [];
  const priciest = rows[rows.length - 1];
  const insights: Insight[] = [];
  const { breakdown } = cheapest;

  if (breakdown.total > 0) {
    const outputShare = breakdown.outputCost / breakdown.total;
    insights.push({
      id: 'output-share',
      learnId: 'output-costs-more',
      text: `Output is **${formatPercent(outputShare)}** of the bill on ${cheapest.model.displayName} — response length is your biggest lever.`,
    });
  }

  if (workload.turns > 1 && breakdown.inputTokens > 0) {
    const historyShare = breakdown.historyTokens / breakdown.inputTokens;
    insights.push({
      id: 'history-share',
      learnId: 'history-compounds',
      text: `Re-sent history is **${formatPercent(historyShare)}** of input tokens at ${workload.turns} turns — long conversations compound.`,
    });
  }

  if (breakdown.cacheSavings > 0) {
    const monthlySaving = breakdown.cacheSavings * (cheapest.scaled.perMonth / breakdown.total || 0);
    insights.push({
      id: 'cache-savings',
      learnId: 'caching-and-batching',
      text: `The cache assumption saves **${formatMoney(monthlySaving)}/mo** on ${cheapest.model.displayName} alone — real caching is a config change, not a rewrite.`,
    });
  }

  if (revenuePerUser > 0 && priciest && priciest !== cheapest) {
    const low = cheapest.scaled.margin;
    const high = priciest.scaled.margin;
    if (low !== null && high !== null) {
      insights.push({
        id: 'margin-spread',
        text: `At ${formatMoney(revenuePerUser)}/user: ${cheapest.model.displayName} leaves a **${formatPercent(low)}** margin, ${priciest.model.displayName} leaves **${formatPercent(high)}**. Model choice *is* your margin.`,
      });
    }
  }

  if (priciest && priciest !== cheapest && cheapest.scaled.perMonth > 0) {
    insights.push({
      id: 'spread',
      learnId: 'price-spread',
      text: `${priciest.model.displayName} costs **${priciest.multipleOfCheapest.toFixed(1)}×** what ${cheapest.model.displayName} does for this exact workload.`,
    });
  }

  return insights;
}
