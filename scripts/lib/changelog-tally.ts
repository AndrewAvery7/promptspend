/**
 * The monthly tally behind the Price Movement Report.
 *
 * The August report counted four days short and had to be corrected in the
 * September one, because the tally was taken by hand while the draft was being
 * written. This reads the same log, `docs/pricing-changelog.md`, and counts a
 * whole month the same way every time, so the first of the month is a matter
 * of running it and writing the prose.
 *
 * Pure: it takes the log's text and returns numbers, so it can be tested
 * without a checkout of the log.
 */

export interface ChangelogEntry {
  /** `YYYY-MM-DD`, from the `## ` heading the line sits under. */
  date: string;
  /** `Added`, `Price`, `Review`, `Coverage`, `Metadata`, `Provider` or `Corrected`. */
  kind: string;
  /** The model or provider id, without its backticks. */
  id: string;
  /** Everything after the dash. */
  detail: string;
}

/** One rate that moved: `input up 0.68 → 1.36`. */
export interface PriceMove {
  date: string;
  id: string;
  field: string;
  from: number;
  to: number;
  /** Signed change as a fraction of the old rate; 0.5 is +50%. */
  change: number;
}

export interface MonthTally {
  month: string;
  /** Entries per kind, in the order the report lists them. */
  byKind: Record<string, number>;
  /** Distinct model ids that had a Price entry. */
  pricedModels: string[];
  priceMoves: PriceMove[];
  /** Ids of models added during the month, in log order. */
  added: string[];
  /** Metadata entries by the field they changed (`status`, `contextWindow`, ...). */
  metadataByField: Record<string, number>;
  /** The last date the log reaches, so a month still in progress is visible. */
  logThrough: string;
  /** True when the log has at least one entry on or after the 1st of the next month. */
  monthIsComplete: boolean;
}

const KIND_ORDER = ['Review', 'Metadata', 'Coverage', 'Price', 'Added', 'Provider', 'Corrected'];

export function parseChangelog(text: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let date = '';
  for (const line of text.split('\n')) {
    const heading = /^## (\d{4}-\d{2}-\d{2})\s*$/.exec(line);
    if (heading) {
      date = heading[1]!;
      continue;
    }
    // The dash is optional: a Corrected entry is a sentence, not `id — detail`.
    const entry = /^- \*\*(\w+)\*\* `([^`]+)`\s*(?:— )?(.*)$/.exec(line);
    if (entry && date) entries.push({ date, kind: entry[1]!, id: entry[2]!, detail: entry[3]! });
  }
  return entries;
}

/** `input up 0.68 → 1.36` or `output down 3 → 1.25`, or null for any other Price detail. */
export function parsePriceMove(entry: ChangelogEntry): PriceMove | null {
  if (entry.kind !== 'Price') return null;
  const match = /^(\w+) (?:up|down) ([\d.]+) → ([\d.]+)$/.exec(entry.detail);
  if (!match) return null;
  const from = Number(match[2]);
  const to = Number(match[3]);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return { date: entry.date, id: entry.id, field: match[1]!, from, to, change: (to - from) / from };
}

function nextMonth(month: string): string {
  const [year, number] = month.split('-').map(Number) as [number, number];
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`;
}

export function previousMonth(month: string): string {
  const [year, number] = month.split('-').map(Number) as [number, number];
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
}

export function tallyMonth(entries: readonly ChangelogEntry[], month: string): MonthTally {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`"${month}" is not a month like 2026-10`);
  const inMonth = entries.filter((entry) => entry.date.startsWith(`${month}-`));
  const byKind: Record<string, number> = {};
  for (const kind of KIND_ORDER) byKind[kind] = 0;
  for (const entry of inMonth) byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;

  const priceMoves = inMonth.map(parsePriceMove).filter((move): move is PriceMove => move !== null);
  const pricedModels = [...new Set(inMonth.filter((entry) => entry.kind === 'Price').map((e) => e.id))];

  const metadataByField: Record<string, number> = {};
  for (const entry of inMonth.filter((candidate) => candidate.kind === 'Metadata')) {
    const field = /^([\w.]+):/.exec(entry.detail)?.[1] ?? 'other';
    metadataByField[field] = (metadataByField[field] ?? 0) + 1;
  }

  const logThrough = entries.reduce((latest, entry) => (entry.date > latest ? entry.date : latest), '');
  return {
    month,
    byKind,
    pricedModels,
    priceMoves,
    added: inMonth.filter((entry) => entry.kind === 'Added').map((entry) => entry.id),
    metadataByField,
    logThrough,
    monthIsComplete: entries.some((entry) => entry.date >= `${nextMonth(month)}-01`),
  };
}

function percent(change: number): string {
  const rounded = Math.round(change * 100);
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)}%`;
}

/** The tally as Markdown, with the previous month beside it, ready to read while writing the report. */
export function formatTally(current: MonthTally, previous: MonthTally): string {
  const lines: string[] = [];
  lines.push(`# Tally for ${current.month}`, '');
  lines.push(
    current.monthIsComplete
      ? `The log runs through ${current.logThrough}, so ${current.month} is complete.`
      : `**The log only runs through ${current.logThrough}, so ${current.month} is not complete.** Run this again on the 1st, after the day's sync.`,
    '',
  );
  lines.push(`## Entries by kind (${previous.month} in brackets)`, '');
  for (const kind of Object.keys(current.byKind)) {
    lines.push(`- ${kind}: ${current.byKind[kind]} (${previous.byKind[kind] ?? 0})`);
  }
  const total = Object.values(current.byKind).reduce((sum, n) => sum + n, 0);
  const previousTotal = Object.values(previous.byKind).reduce((sum, n) => sum + n, 0);
  lines.push(`- Total: ${total} (${previousTotal})`, '');

  lines.push(
    `## Price: ${current.byKind.Price ?? 0} rows across ${current.pricedModels.length} models (${previous.byKind.Price ?? 0} across ${previous.pricedModels.length})`,
    '',
  );
  const byMagnitude = [...current.priceMoves].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  for (const move of byMagnitude) {
    lines.push(
      `- ${move.date} \`${move.id}\` ${move.field}: ${move.from} → ${move.to} (${percent(move.change)})`,
    );
  }
  if (byMagnitude.length === 0) lines.push('- No rate moved.');
  lines.push('', '_Check each large move against the vendor’s own page before calling it a repricing._', '');

  lines.push(`## Added: ${current.added.length} (${previous.added.length})`, '');
  for (const id of current.added) lines.push(`- \`${id}\``);
  if (current.added.length === 0) lines.push('- None.');
  lines.push('', '## Metadata by field', '');
  for (const [field, count] of Object.entries(current.metadataByField).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${field}: ${count}`);
  }
  return `${lines.join('\n')}\n`;
}
