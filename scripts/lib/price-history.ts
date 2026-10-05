/**
 * The price history as a table: one row per published rate that appeared,
 * moved, was restated, or went away, reconstructed by replaying every
 * committed version of `public/data/pricing.json` in order.
 *
 * Why replay git rather than parse `docs/pricing-changelog.md`: the changelog
 * is prose written for people, and it only holds what the daily sync wrote.
 * The git history holds every version that was ever published — sync runs and
 * hand corrections alike — and each row can then name the exact commit that
 * published it, so any figure in the export can be checked against the
 * catalog as it stood that day.
 *
 * The comparison is `diffCatalogs`, the same one the changelog uses, so the
 * two records cannot disagree about what counts as a change.
 */
import type { Model, PricingCatalog } from '../../src/lib/pricing/types';
import { diffCatalogs, PRICING_FIELDS as RATE_FIELDS } from './diff';

/** One committed version of the catalog. */
export interface CatalogVersion {
  commit: string;
  /** ISO timestamp of the commit. */
  committedAt: string;
  catalog: PricingCatalog;
}

/**
 * What kind of event a row records.
 *
 * `listed`     — the model entered the catalog; one row per rate it arrived with.
 * `delisted`   — the model left the catalog; one row per rate it carried.
 * `price`      — a rate we already recorded took a different value.
 * `correction` — a rate took a different value in the same commit its source
 *                changed. That is us reading a better page, not the vendor
 *                repricing — the same rule `mergeCatalog` uses to decide not
 *                to stamp `lastChanged`.
 * `coverage`   — a rate we were not recording appeared, or one we were
 *                recording stopped being recorded, on a model that stayed.
 *                Nobody's bill moved; our coverage did.
 */
export type HistoryChange = 'listed' | 'delisted' | 'price' | 'correction' | 'coverage';

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

export const COLUMNS: readonly (keyof HistoryRow)[] = [
  'date',
  'commit',
  'model_id',
  'model_name',
  'provider_id',
  'provider_name',
  'change',
  'field',
  'old_value',
  'new_value',
  'unit',
  'source',
  'source_url',
  'provider_pricing_url',
];

export function unitOf(field: string): string {
  if (field === 'batchDiscount') return 'multiplier';
  if (field === 'intro.until') return 'date';
  if (field === 'longContext.thresholdTokens') return 'tokens';
  if (field === 'cacheStoragePerMillionTokenHour') return 'USD per 1M tokens per hour';
  return 'USD per 1M tokens';
}

function at(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (typeof node !== 'object' || node === null) return undefined;
    return (node as Record<string, unknown>)[key];
  }, value);
}

/** Absent is an empty cell; a number keeps its JSON spelling. */
function cell(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function sourceMoved(before: Model, after: Model): boolean {
  return (
    before.provenance.source !== after.provenance.source ||
    before.provenance.verifiedUrl !== after.provenance.verifiedUrl
  );
}

/** Rows for one step from `previous` to `next`. */
export function rowsForStep(previous: PricingCatalog | undefined, next: CatalogVersion): HistoryRow[] {
  const { catalog, commit } = next;
  // UTC, so a hand commit made late in the evening in Texas lands on the same
  // day the daily sync (which runs on UTC) would have recorded it.
  const date = new Date(next.committedAt).toISOString().slice(0, 10);
  const providers = new Map(
    [...(previous?.providers ?? []), ...catalog.providers].map((p) => [p.id, p] as const),
  );
  const prior = new Map((previous?.models ?? []).map((m) => [m.id, m]));
  const current = new Map(catalog.models.map((m) => [m.id, m]));
  const diff = diffCatalogs(previous, catalog);
  const rows: HistoryRow[] = [];

  const row = (
    model: Model,
    change: HistoryChange,
    field: string,
    from: unknown,
    to: unknown,
  ): HistoryRow => {
    const provider = providers.get(model.providerId);
    return {
      date,
      commit,
      model_id: model.id,
      model_name: model.displayName,
      provider_id: model.providerId,
      provider_name: provider?.name ?? '',
      change,
      field,
      old_value: cell(from),
      new_value: cell(to),
      unit: unitOf(field),
      source: model.provenance.source,
      source_url: model.provenance.verifiedUrl ?? '',
      provider_pricing_url: provider?.pricingUrl ?? '',
    };
  };

  for (const { id } of diff.added) {
    const model = current.get(id)!;
    for (const field of RATE_FIELDS) {
      const value = at(model.pricing, field);
      if (value !== undefined && value !== null) rows.push(row(model, 'listed', field, undefined, value));
    }
  }

  for (const change of diff.changed) {
    const before = prior.get(change.id)!;
    const after = current.get(change.id)!;
    const kind: HistoryChange =
      change.kind === 'coverage' ? 'coverage' : sourceMoved(before, after) ? 'correction' : 'price';
    rows.push(row(after, kind, change.field, change.from, change.to));
  }

  for (const { id } of diff.removed) {
    const model = prior.get(id)!;
    for (const field of RATE_FIELDS) {
      const value = at(model.pricing, field);
      if (value !== undefined && value !== null) rows.push(row(model, 'delisted', field, value, undefined));
    }
  }

  return rows;
}

/** Replay versions oldest first. The first version lists every model it holds. */
export function buildHistory(versions: readonly CatalogVersion[]): HistoryRow[] {
  const rows: HistoryRow[] = [];
  let previous: PricingCatalog | undefined;
  for (const version of versions) {
    rows.push(...rowsForStep(previous, version));
    previous = version.catalog;
  }
  return rows;
}

/** RFC 4180: quote a field only when it holds a comma, a quote or a line break. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: readonly HistoryRow[]): string {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) lines.push(COLUMNS.map((c) => csvField(r[c])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
