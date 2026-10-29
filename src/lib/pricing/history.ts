/**
 * The published price history, and what a model cost on a given day.
 *
 * `data/price-history.json` is written by the site build from a replay of every
 * committed version of the catalog (`scripts/lib/price-history.ts`), so it is
 * the same table as the citable CSV dataset. This module only reads it.
 *
 * "What did it cost on 15 August" has two honest answers and one dishonest
 * one. Honest: the rate PromptSpend published that day, or "we were not
 * tracking it yet". Dishonest: the nearest rate we have, quietly substituted
 * for a day we have no record of. A day before a model was listed therefore
 * returns `not_tracked`, never the first rate we saw.
 *
 * A `correction` row is PromptSpend reading a better page, not the vendor
 * repricing — so a figure published before a later correction may not be what
 * the vendor actually charged. Those corrections are returned alongside the
 * rate, so the caller can say so rather than present the old figure as fact.
 */
import { effectivePricing } from '../engine/cost';
import type { Pricing } from './types';

export type HistoryChange = 'listed' | 'delisted' | 'price' | 'correction' | 'coverage';

/** One row of the published history. Values are strings, as in the CSV: empty means not recorded. */
export interface HistoryRow {
  date: string;
  commit: string;
  model_id: string;
  model_name: string;
  provider_id: string;
  provider_name: string;
  change: HistoryChange;
  field: string;
  old_value: string;
  new_value: string;
  unit: string;
  source: string;
  source_url: string;
  provider_pricing_url: string;
}

export interface PriceHistory {
  schemaVersion: 1;
  /** UTC date of the first catalog. Nothing before it is on record. */
  firstDate: string;
  /** UTC date of the newest version the history was built from. */
  lastDate: string;
  rows: HistoryRow[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isPriceHistory(value: unknown): value is PriceHistory {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<PriceHistory>;
  return (
    v.schemaVersion === 1 &&
    typeof v.firstDate === 'string' &&
    DATE.test(v.firstDate) &&
    typeof v.lastDate === 'string' &&
    DATE.test(v.lastDate) &&
    Array.isArray(v.rows) &&
    v.rows.every(
      (r) =>
        typeof r === 'object' &&
        r !== null &&
        typeof r.date === 'string' &&
        typeof r.model_id === 'string' &&
        typeof r.change === 'string' &&
        typeof r.field === 'string' &&
        typeof r.new_value === 'string',
    )
  );
}

/** A calendar date that really exists, written YYYY-MM-DD. */
export function isCalendarDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export interface LaterChange {
  date: string;
  change: 'price' | 'correction' | 'delisted';
  field: string;
  from: string;
  to: string;
}

export type PriceOn =
  | { kind: 'before_history'; firstDate: string }
  | { kind: 'after_history'; lastDate: string }
  | { kind: 'not_tracked'; listedOn: string | null }
  | { kind: 'delisted'; delistedOn: string }
  | {
      kind: 'ok';
      /** The rates published that day, with any promotion then in force applied. */
      pricing: Pricing;
      /** The standard rates, before any promotion. */
      standard: Pricing;
      modelName: string;
      providerId: string;
      listedOn: string;
      source: string;
      sourceUrl: string;
      /** Rate moves after the date, oldest first. Corrections mean the old figure was a misreading. */
      later: LaterChange[];
    };

function setPath(target: Record<string, unknown>, path: string, raw: string): void {
  const keys = path.split('.');
  let node = target;
  for (const key of keys.slice(0, -1)) {
    if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1]!;
  if (raw === '') delete node[last];
  else node[last] = path === 'intro.until' ? raw : Number(raw);
}

/** Drop a nested tier whose rates are no longer all recorded, so the engine never sees half of one. */
function tidy(pricing: Record<string, unknown>): Pricing {
  const intro = pricing.intro as Record<string, unknown> | undefined;
  if (intro && (typeof intro.input !== 'number' || typeof intro.output !== 'number' || !intro.until))
    delete pricing.intro;
  const tier = pricing.longContext as Record<string, unknown> | undefined;
  if (
    tier &&
    (typeof tier.thresholdTokens !== 'number' ||
      typeof tier.input !== 'number' ||
      typeof tier.output !== 'number')
  )
    delete pricing.longContext;
  return pricing as unknown as Pricing;
}

/**
 * The rates PromptSpend published for `modelId` at the end of UTC day `date`.
 * A row dated `date` counts: the daily sync publishes at about 11:00 UTC.
 */
export function priceOn(history: PriceHistory, modelId: string, date: string): PriceOn {
  if (date < history.firstDate) return { kind: 'before_history', firstDate: history.firstDate };
  if (date > history.lastDate) return { kind: 'after_history', lastDate: history.lastDate };

  const rows = history.rows.filter((r) => r.model_id === modelId);
  const listed = rows.find((r) => r.change === 'listed');
  let state: Record<string, unknown> | null = null;
  let current: HistoryRow | undefined;
  let delistedOn: string | null = null;
  let listedOn: string | null = null;

  for (const row of rows) {
    if (row.date > date) break;
    if (row.change === 'listed') {
      // A re-listing after a delisting starts the record afresh.
      if (state === null || delistedOn !== null) {
        state = {};
        delistedOn = null;
        listedOn = row.date;
      }
      setPath(state, row.field, row.new_value);
    } else if (row.change === 'delisted') {
      delistedOn = row.date;
    } else if (state !== null) {
      setPath(state, row.field, row.new_value);
    }
    current = row;
  }

  if (state === null || listedOn === null) return { kind: 'not_tracked', listedOn: listed?.date ?? null };
  if (delistedOn !== null) return { kind: 'delisted', delistedOn };

  const standard = tidy(state);
  const later: LaterChange[] = rows
    .filter(
      (r) => r.date > date && (r.change === 'price' || r.change === 'correction' || r.change === 'delisted'),
    )
    .map((r) => ({
      date: r.date,
      change: r.change as LaterChange['change'],
      field: r.field,
      from: r.old_value,
      to: r.new_value,
    }));

  return {
    kind: 'ok',
    pricing: effectivePricing(standard, new Date(`${date}T12:00:00Z`)),
    standard,
    modelName: current!.model_name,
    providerId: current!.provider_id,
    listedOn,
    source: current!.source,
    sourceUrl: current!.source_url,
    later,
  };
}
