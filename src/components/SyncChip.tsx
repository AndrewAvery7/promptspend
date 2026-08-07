/**
 * The status chip on the results panel head.
 *
 * It answers two questions that a single date cannot, and that a reader
 * deciding whether to trust these numbers asks in this order:
 *
 *   1. Is anybody still checking?   ← the colour, from the health manifest
 *   2. Have the prices moved?       ← the text, from the catalog
 *
 * Before this, the chip answered only the second, and answered it in green
 * whatever it said. A permanently green pill reading "PRICES CHANGED <date>"
 * carries no information about whether the pipeline is alive — which is the
 * failure worth catching, because a dead pipeline and a quiet market look
 * identical from a change date alone.
 */
import type { Catalog, Freshness } from '@/lib/pricing/catalog';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `2026-08-06` → `6 Aug`. Parsed by hand rather than through `Date` so the
 * label cannot shift by a day for a reader west of UTC, which is exactly the
 * kind of quiet wrongness this chip exists to avoid.
 */
export function shortDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS[month - 1] ?? '?'}`;
}

export interface SyncChipContent {
  level: Freshness['level'];
  /** The freshness clause — what the colour is about. */
  checked: string;
  /** The price clause. Always present: "no change" is a real answer. */
  prices: string;
}

/**
 * Pure so the wording can be tested without rendering. Kept beside the
 * component rather than in `catalog.ts` because it is presentation: the
 * catalog decides the state, this decides how to say it.
 */
export function syncChipContent(freshness: Freshness, pricesLastChanged: string | null): SyncChipContent {
  const prices = pricesLastChanged
    ? `PRICES CHANGED ${shortDate(pricesLastChanged)}`
    : 'NO PRICE CHANGE RECORDED';

  if (freshness.level === 'unknown' || !freshness.checkedOn) {
    return { level: 'unknown', checked: 'CHECK STATUS UNAVAILABLE', prices };
  }

  const when = freshness.ageDays === 0 ? 'TODAY' : shortDate(freshness.checkedOn);
  const checked = freshness.level === 'stale' ? `LAST CLEAN CHECK ${when}` : `CHECKED ${when}`;
  return { level: freshness.level, checked, prices };
}

const LEVEL_CLASS: Record<Freshness['level'], string> = {
  fresh: '',
  aging: ' sync-chip--info',
  stale: ' sync-chip--warn',
  unknown: ' sync-chip--mute',
};

/**
 * The sentence a screen reader gets, in place of two shouted fragments and a
 * middot. Deliberately not `role="status"`: that is a live region, reserved
 * here for things that appear in response to something the reader did. This
 * chip is present from first paint and announcing it would be noise — and it
 * would make `getByRole('status')` ambiguous for everything else on the page.
 */
export function syncChipSentence({ level, checked, prices }: SyncChipContent): string {
  const lead =
    level === 'stale'
      ? 'Sources may be out of date:'
      : level === 'unknown'
        ? 'Sync status could not be loaded.'
        : 'Sources';
  return `${lead} ${checked.toLowerCase()}. ${prices.toLowerCase()}.`;
}

export function SyncChip({ catalog, now }: { catalog: Catalog; now?: Date }) {
  const freshness = catalog.freshness(now);
  const content = syncChipContent(freshness, catalog.pricesLastChanged());
  const { level, checked, prices } = content;

  return (
    <span className={`sync-chip${LEVEL_CLASS[level]}`} data-freshness={level}>
      <span className="visually-hidden">{syncChipSentence(content)}</span>
      <span className="sync-chip__dot" aria-hidden="true" />
      <span aria-hidden="true">{checked}</span>
      <span className="sync-chip__sep" aria-hidden="true">
        ·
      </span>
      <span className="sync-chip__prices" aria-hidden="true">
        {prices}
      </span>
    </span>
  );
}
