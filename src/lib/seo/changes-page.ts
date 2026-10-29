/**
 * The data behind `/changes/`: every day on which something worth reporting
 * happened to the catalog, newest first.
 *
 * It is the page form of the Atom feed and is built from the same days
 * (`newsworthyDays`), so the two cannot disagree about what counts. The rules
 * are the feed's: a vendor changing a rate is a repricing, PromptSpend reading
 * a better page is a correction and is labeled as one, and a rate PromptSpend
 * merely began recording is not news to anybody's bill and never appears.
 *
 * Nothing in the result depends on the clock, so the page changes only when the
 * data does and its date in the sitemap means something.
 */
import type { PriceHistory } from '../pricing/history';
import { newsworthyDays, type FeedDay } from './feed';

export interface ChangeRow {
  modelId: string;
  modelName: string;
  field: string;
  /** Empty string: the rate was not recorded before. */
  from: string;
  to: string;
  unit: string;
  /** Fractional change for a rate that moved between two numbers, else null. */
  change: number | null;
}

export interface ChangesDay {
  date: string;
  repriced: ChangeRow[];
  corrected: ChangeRow[];
  added: { id: string; name: string; input?: string; output?: string }[];
  removed: { id: string; name: string }[];
  /**
   * Set on the first day of tracking: the catalog that day is the starting
   * point, not a model launch, so it is counted here and never listed as
   * "added".
   */
  startedWith?: number;
}

export interface ChangesPageInput {
  firstDate: string;
  /** The newest day with news, which is what the sitemap dates the page by. */
  lastChangeDate: string;
  /** Newest first. */
  days: ChangesDay[];
  totals: {
    /** Days on which a vendor changed a rate. */
    repricingDays: number;
    repriced: number;
    corrected: number;
    added: number;
    removed: number;
  };
  /** Model id to the path of its page, for the models that have one. */
  modelPaths: Record<string, string>;
}

function row(source: FeedDay['repriced'][number]): ChangeRow {
  const from = Number(source.old_value);
  const to = Number(source.new_value);
  const numeric =
    source.old_value !== '' &&
    source.new_value !== '' &&
    Number.isFinite(from) &&
    Number.isFinite(to) &&
    from !== 0 &&
    source.unit.startsWith('USD');
  return {
    modelId: source.model_id,
    modelName: source.model_name,
    field: source.field,
    from: source.old_value,
    to: source.new_value,
    unit: source.unit,
    change: numeric ? (to - from) / from : null,
  };
}

export function changesPageInput(
  history: PriceHistory,
  modelPaths: Record<string, string>,
): ChangesPageInput {
  const days: ChangesDay[] = newsworthyDays(history)
    .map((day) => {
      const starting = day.date === history.firstDate;
      return {
        date: day.date,
        repriced: day.repriced.map(row),
        corrected: day.corrected.map(row),
        added: starting
          ? []
          : day.added.map((model) => ({
              id: model.id,
              name: model.name,
              ...(model.input ? { input: model.input } : {}),
              ...(model.output ? { output: model.output } : {}),
            })),
        removed: day.removed.map((model) => ({ id: model.id, name: model.name })),
        ...(starting && day.added.length > 0 ? { startedWith: day.added.length } : {}),
      };
    })
    .reverse();

  const sum = (pick: (day: ChangesDay) => number): number => days.reduce((n, day) => n + pick(day), 0);
  return {
    firstDate: history.firstDate,
    lastChangeDate: days[0]?.date ?? history.firstDate,
    days,
    totals: {
      repricingDays: days.filter((day) => day.repriced.length > 0).length,
      repriced: sum((day) => day.repriced.length),
      corrected: sum((day) => day.corrected.length),
      added: sum((day) => day.added.length),
      removed: sum((day) => day.removed.length),
    },
    modelPaths,
  };
}
