/**
 * What the published price history says about one model, and about the site as
 * a whole, shaped for the generated pages.
 *
 * The history (`/data/price-history.json`) has four kinds of row that move a
 * number: `listed` (the model arrived with this rate), `price` (the vendor's
 * rate changed), `correction` (PromptSpend read a better page; the vendor's
 * rate did not move) and `coverage` (we began or stopped recording a rate;
 * nobody's bill changed). A chart that drew all four as "price moves" would
 * overstate how often vendors reprice, which is the mistake the Atom feed was
 * rebuilt to avoid. So here a vendor repricing and a correction are kept apart,
 * and coverage rows never appear at all.
 *
 * Nothing here looks at the clock. The pages say "recorded since" and "no
 * change since", never "this many days ago", so a page's text only changes when
 * its data does.
 */
import type { HistoryRow, PriceHistory } from '../pricing/history';

/** The two headline rates, the only ones drawn as lines. */
export type ChartRate = 'input' | 'output';

export interface StepPoint {
  date: string;
  value: number;
}

export interface RateChange {
  date: string;
  field: string;
  /** Empty means the rate had not been recorded. */
  from: string;
  to: string;
  unit: string;
  /** `price`: the vendor changed it. `correction`: PromptSpend read a better page. */
  kind: 'price' | 'correction';
}

export interface ModelHistory {
  /** The day PromptSpend first listed the model; null if it never did. */
  listedOn: string | null;
  /** Set when the model has since left the catalog. */
  delistedOn: string | null;
  /** Step series for the two headline rates, oldest first. */
  series: Record<ChartRate, StepPoint[]>;
  /** Every vendor repricing and correction, any rate, oldest first. */
  changes: RateChange[];
}

const CHART_RATES: readonly ChartRate[] = ['input', 'output'];

function numeric(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function modelHistory(history: PriceHistory, modelId: string): ModelHistory {
  const series: Record<ChartRate, StepPoint[]> = { input: [], output: [] };
  const changes: RateChange[] = [];
  let listedOn: string | null = null;
  let delistedOn: string | null = null;

  // Rows are in commit order, which is date order.
  for (const row of history.rows) {
    if (row.model_id !== modelId) continue;

    if (row.change === 'listed') {
      // A re-listing after a delisting starts the record afresh.
      if (listedOn === null || delistedOn !== null) {
        listedOn = listedOn ?? row.date;
        delistedOn = null;
      }
    } else if (row.change === 'delisted') {
      delistedOn = row.date;
    }

    if (row.change === 'price' || row.change === 'correction') {
      changes.push({
        date: row.date,
        field: row.field,
        from: row.old_value,
        to: row.new_value,
        unit: row.unit,
        kind: row.change,
      });
    }

    if (row.change === 'listed' || row.change === 'price' || row.change === 'correction') {
      const rate = CHART_RATES.find((name) => name === row.field);
      const value = rate ? numeric(row.new_value) : null;
      if (rate && value !== null) series[rate].push({ date: row.date, value });
    }
  }

  return { listedOn, delistedOn, series, changes };
}

/** Whether a headline rate ever took more than one value: the only case a line says anything. */
export function hasChartableMove(view: ModelHistory): boolean {
  return CHART_RATES.some((rate) => new Set(view.series[rate].map((point) => point.value)).size > 1);
}

export interface Repricing {
  date: string;
  modelId: string;
  modelName: string;
  field: string;
  from: number;
  to: number;
  unit: string;
}

/**
 * The vendor-side rate changes, newest first. Corrections are not here: they
 * are PromptSpend's own fixes, and listing them beside real repricings is what
 * the feed was rebuilt to stop doing. A change with no recorded earlier value
 * is not a change, so it is skipped.
 */
export function recentRepricings(history: PriceHistory, limit: number): Repricing[] {
  const moves: Repricing[] = [];
  for (const row of history.rows as readonly HistoryRow[]) {
    if (row.change !== 'price') continue;
    const from = numeric(row.old_value);
    const to = numeric(row.new_value);
    if (from === null || to === null || from === to) continue;
    moves.push({
      date: row.date,
      modelId: row.model_id,
      modelName: row.model_name,
      field: row.field,
      from,
      to,
      unit: row.unit,
    });
  }
  return moves.reverse().slice(0, limit);
}

export function correctionCount(history: PriceHistory): number {
  return history.rows.filter((row) => row.change === 'correction').length;
}
