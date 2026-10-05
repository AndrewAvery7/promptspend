/**
 * The daily free-tier check's report: `public/data/free-tier-check.json`.
 *
 * Written by `scripts/check-free-tiers.ts`, read by the page build. It records
 * what the vendor's page said this morning, per fact, and never touches the
 * facts themselves — a quote that has gone missing is a reason for a person to
 * look, not for a script to rewrite anything.
 *
 * Three states, because "could not read the page" and "read it and the words
 * are gone" mean very different things and must never be confused:
 *
 * - `confirmed` — the page was read and still contains the quote.
 * - `missing`   — the page was read and the quote is no longer in it.
 * - `unread`    — the page could not be fetched today. Says nothing about the
 *                 wording; the last confirmation still stands.
 */

export type FactCheckStatus = 'confirmed' | 'missing' | 'unread';

export interface FactCheck {
  status: FactCheckStatus;
  /** YYYY-MM-DD the quote was last seen on the page; the fact's `readOn` until a check confirms it. */
  lastConfirmed: string;
  /** YYYY-MM-DD the fact last moved between `confirmed` and `missing`. Absent until it first does.
   *  This, not the check date, is what can move a page's sitemap `lastmod`. */
  changedOn?: string;
}

export interface FreeTierCheckReport {
  /** ISO timestamp of the run, or null when no run has happened yet. */
  checkedAt: string | null;
  facts: Record<string, FactCheck>;
}

export const EMPTY_CHECK_REPORT: FreeTierCheckReport = { checkedAt: null, facts: {} };

const STATUSES: readonly FactCheckStatus[] = ['confirmed', 'missing', 'unread'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A report from disk, or the empty report if the shape is wrong. Never throws:
 *  a damaged report must not stop the site building, it only loses the daily dates. */
export function parseCheckReport(raw: unknown): FreeTierCheckReport {
  if (typeof raw !== 'object' || raw === null) return EMPTY_CHECK_REPORT;
  const record = raw as Record<string, unknown>;
  const facts: Record<string, FactCheck> = {};
  if (typeof record.facts === 'object' && record.facts !== null) {
    for (const [id, value] of Object.entries(record.facts as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue;
      const entry = value as Record<string, unknown>;
      if (!STATUSES.includes(entry.status as FactCheckStatus)) continue;
      if (typeof entry.lastConfirmed !== 'string' || !DATE.test(entry.lastConfirmed)) continue;
      facts[id] = {
        status: entry.status as FactCheckStatus,
        lastConfirmed: entry.lastConfirmed,
        ...(typeof entry.changedOn === 'string' && DATE.test(entry.changedOn)
          ? { changedOn: entry.changedOn }
          : {}),
      };
    }
  }
  return { checkedAt: typeof record.checkedAt === 'string' ? record.checkedAt : null, facts };
}

/** What the page should say about one fact, falling back to its own read date. */
export function factCheckFor(report: FreeTierCheckReport, id: string, readOn: string): FactCheck {
  const entry = report.facts[id];
  if (!entry) return { status: 'confirmed', lastConfirmed: readOn };
  // A fact re-read by hand after the check last saw it supersedes that check.
  if (entry.lastConfirmed < readOn) return { status: 'confirmed', lastConfirmed: readOn };
  return entry;
}

/**
 * The next report entry for a fact, given today's reading.
 *
 * `found` is null when the page could not be read. A fact that was re-read by
 * hand since the last check (its `readOn` is newer than anything the check
 * recorded) starts again from that date.
 */
export function nextFactCheck(
  previous: FactCheck | undefined,
  readOn: string,
  found: boolean | null,
  today: string,
): FactCheck {
  const prior = previous && previous.lastConfirmed >= readOn ? previous : undefined;
  if (found === null) {
    return prior
      ? { ...prior, status: prior.status === 'missing' ? 'missing' : 'unread' }
      : { status: 'unread', lastConfirmed: readOn };
  }
  const status: FactCheckStatus = found ? 'confirmed' : 'missing';
  const lastConfirmed = found ? today : (prior?.lastConfirmed ?? readOn);
  // `changedOn` moves only on a real flip between the two readable states. The
  // first reading of a fact that is simply still there is not a change.
  const wasMissing = prior?.status === 'missing';
  const flipped = found ? wasMissing : !wasMissing;
  const changedOn = flipped ? today : prior?.changedOn;
  return { status, lastConfirmed, ...(changedOn ? { changedOn } : {}) };
}
