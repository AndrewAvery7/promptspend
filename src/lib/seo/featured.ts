/**
 * The extra analysis drawn on the featured comparison pages.
 *
 * Most comparisons are a rate table and three monthly bills. The featured set,
 * listed by hand in `data/featured-comparisons.json`, gets what makes a page
 * worth citing: a written verdict per workload that says *why* one side wins,
 * the points where the answer flips, each model's recorded price moves, and a
 * benchmark figure with its source. Every sentence is worked out from the
 * catalog, the price history or a sourced benchmark row, never written freehand,
 * so a price change rewrites the page instead of leaving it wrong.
 */
import type { Model, Pricing } from '../pricing/types';
import type { PriceHistory } from '../pricing/history';
import { formatMoney } from '../engine/format';
import { modelHistory, type RateChange } from './price-history-view';
import type { WorkloadProfile } from './workloads';
import type { ComparisonRowData } from './pages';

export interface BenchmarkEntry {
  modelId: string;
  benchmark: string;
  score: number | null;
  unit: string;
  url: string;
  quote: string;
  reportedBy: string;
  readOn: string;
}

/** Tokens one conversation of a workload reads and writes, history re-sent each turn. */
export function workloadTokens(profile: WorkloadProfile): { input: number; output: number } {
  const { systemTokens, userTokens, outputTokens, turns } = profile.workload;
  let input = 0;
  for (let turn = 1; turn <= turns; turn++) {
    input += systemTokens + turn * userTokens + (turn - 1) * outputTokens;
  }
  return { input, output: turns * outputTokens };
}

/**
 * Output tokens per 1,000 input tokens at which the two bills are equal, when
 * one side has the cheaper input rate and the other the cheaper output rate.
 * Null when one side is cheaper (or equal) on both, so no mix flips it.
 */
export function mixBreakEven(left: Pricing, right: Pricing): number | null {
  const inputGap = right.input - left.input;
  const outputGap = left.output - right.output;
  if (inputGap === 0 || outputGap === 0 || Math.sign(inputGap) !== Math.sign(outputGap)) return null;
  return (inputGap / outputGap) * 1000;
}

/**
 * Share of input tokens served from cache at which the two input bills match.
 * Null when either side has no cached rate, or one side wins at every hit rate.
 */
export function cacheBreakEven(left: Pricing, right: Pricing): number | null {
  if (left.cachedInput === undefined || right.cachedInput === undefined) return null;
  const fresh = left.input - right.input;
  const cached = left.cachedInput - right.cachedInput;
  if (fresh === cached) return null;
  const share = fresh / (fresh - cached);
  return share > 0 && share < 1 ? share : null;
}

function rounded(value: number): string {
  return value >= 100 ? Math.round(value).toLocaleString('en-US') : value.toFixed(value >= 10 ? 0 : 1);
}

/** One paragraph per workload: who wins, by how much, and which rate decides it. */
export function workloadVerdict(row: ComparisonRowData, left: Model, right: Model): string {
  const tokens = workloadTokens(row.profile);
  const outputPer1k = (tokens.output / tokens.input) * 1000;
  const shape = `Each conversation reads about ${tokens.input.toLocaleString('en-US')} input tokens and writes ${tokens.output.toLocaleString('en-US')}, so roughly ${rounded(outputPer1k)} output tokens per 1,000 input`;
  if (row.cheaper === 'tie') return `${row.profile.label}: ${shape}. The two bills come out the same.`;
  const [winner, loser] = row.cheaper === 'left' ? [left, right] : [right, left];
  const inputHeavy = outputPer1k < 250;
  const decider = inputHeavy
    ? 'the input rate decides most of this bill'
    : 'the output rate carries real weight in this bill';
  return `${row.profile.label}: ${winner.displayName} wins, saving ${formatMoney(row.difference)} a month over ${loser.displayName} (${row.multiple.toFixed(1)}x). ${shape}; ${decider}.`;
}

export function mixBreakEvenSentence(left: Model, right: Model, l: Pricing, r: Pricing): string {
  const point = mixBreakEven(l, r);
  if (point === null && l.input === r.input && l.output === r.output) {
    return `${left.displayName} and ${right.displayName} charge identical input and output rates, so no mix of reading and writing separates them on price. The choice comes down to the differences listed below.`;
  }
  if (point === null) {
    const cheaper = l.input + l.output <= r.input + r.output ? left : right;
    return `There is no read-versus-write mix where the answer flips: ${cheaper.displayName} is as cheap or cheaper on both the input and the output rate.`;
  }
  const cheapInput = l.input < r.input ? left : right;
  const cheapOutput = cheapInput === left ? right : left;
  return `The bills are equal at about ${rounded(point)} output tokens for every 1,000 input tokens. Below that, where reading dominates, ${cheapInput.displayName} is cheaper; above it, where writing dominates, ${cheapOutput.displayName} is.`;
}

export function cacheBreakEvenSentence(left: Model, right: Model, l: Pricing, r: Pricing): string | null {
  const share = cacheBreakEven(l, r);
  if (share === null) return null;
  const fresher = l.input < r.input ? left : right;
  const other = fresher === left ? right : left;
  return `With prompt caching, the input bills cross when about ${Math.round(share * 100)}% of input tokens are served from cache: below that ${fresher.displayName} reads for less, above it ${other.displayName} does.`;
}

export interface PairHistory {
  model: Model;
  listedOn: string | null;
  changes: RateChange[];
}

export function pairHistory(history: PriceHistory, models: Model[]): PairHistory[] {
  return models.map((model) => {
    const view = modelHistory(history, model.id);
    return {
      model,
      listedOn: view.listedOn,
      changes: view.changes.filter((change) => change.field === 'input' || change.field === 'output'),
    };
  });
}
