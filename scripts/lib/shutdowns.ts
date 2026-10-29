/**
 * The daily shut-down check: is any model the catalogue shows as live one its
 * vendor has already shut down?
 *
 * The vendor-page check (vendor-check.ts) confirms a model's PRICE, and a
 * vendor's pricing table can keep printing a rate for weeks after the model
 * behind it is gone. On 2026-10-29 OpenAI's table still priced o1, o1-pro,
 * o3-mini and o4-mini six days after its deprecations page said "Access to
 * these models was shut down on October 23, 2026", and Google had shut down
 * gemini-3.1-flash-lite-preview in May — all of them still "current" here,
 * every one re-confirmed each morning. A price check cannot see that; the
 * deprecation page can.
 *
 * Five vendors publish such a table (OpenAI, Anthropic, Google, Cohere,
 * Mistral); docs/AUTOMATION.md lists the rest and why each is not read.
 *
 * Deprecation pages are tables, so they are read by code rather than by a
 * model: a column named like "Shutdown date" and a column of model names. Only
 * an exact calendar date counts — "Not sooner than…", "To be announced" and
 * "N/A" never do — and the check never edits the catalogue. It reports, and
 * the merge raises a review flag on a still-live row whose shutdown date has
 * passed. Archiving stays a deliberate edit (`status: "deprecated"` with a
 * `$note` quoting the vendor), as it always has.
 *
 * Pure, so it can be tested against fixtures; scripts/check-shutdowns.ts owns
 * the network.
 */

export interface ShutdownSource {
  providerId: string;
  /** Who is speaking, for the review note: "OpenAI's deprecations page". */
  label: string;
  url: string;
  format: 'markdown' | 'html';
  /** Header of the column naming the model. */
  modelColumn: RegExp;
  /** Header of the column holding the shutdown date. */
  dateColumn: RegExp;
  /** Where the page also states a lifecycle state, a row it still calls active never counts as shut down. */
  state?: { column: RegExp; active: RegExp };
  /**
   * Match a dated snapshot to its undated catalogue id (`claude-opus-4-1-20250805`
   * is `claude-opus-4-1`). Right where a model has one snapshot; wrong for
   * OpenAI, whose `gpt-4o-2024-05-13` can be shut down while `gpt-4o` lives on.
   */
  matchUndated?: boolean;
  /**
   * Match on the page's human name instead of an API id, for vendors whose ids
   * are dated snapshots the catalogue does not use (Mistral's
   * `mistral-medium-2505` is the catalogue's "Mistral Medium 3"). A name the page
   * repeats across versions only matches together with its version.
   */
  matchDisplayName?: { versionColumn: RegExp };
  /** The date cell holds several dates ("deprecated retired"); the last one is the shutdown. */
  lastDateInCell?: boolean;
}

export const SOURCES: readonly ShutdownSource[] = [
  {
    providerId: 'openai',
    label: "OpenAI's deprecations page",
    url: 'https://developers.openai.com/api/docs/deprecations.md',
    format: 'markdown',
    modelColumn: /^(model snapshot|model \/ system|deprecated model|model|legacy model)/i,
    dateColumn: /^shutdown date/i,
  },
  {
    providerId: 'anthropic',
    label: "Anthropic's model deprecations page",
    url: 'https://platform.claude.com/docs/en/about-claude/model-deprecations.md',
    format: 'markdown',
    modelColumn: /^api model name/i,
    dateColumn: /retirement date/i,
    state: { column: /^current state/i, active: /^active$/i },
    matchUndated: true,
  },
  {
    providerId: 'google',
    label: "Google's Gemini API deprecations page",
    url: 'https://ai.google.dev/gemini-api/docs/deprecations',
    format: 'html',
    modelColumn: /^model$/i,
    dateColumn: /^shutdown date/i,
  },
  {
    providerId: 'cohere',
    label: "Cohere's deprecations page",
    url: 'https://docs.cohere.com/docs/deprecations.md',
    format: 'markdown',
    modelColumn: /^deprecated model$/i,
    dateColumn: /^shutdown date/i,
  },
  {
    providerId: 'mistral',
    label: "Mistral's models page",
    url: 'https://docs.mistral.ai/models/',
    format: 'html',
    modelColumn: /^model$/i,
    // One cell holds both dates: "5/22/2026 8/31/2026" is deprecation, then retirement.
    dateColumn: /retirement/i,
    lastDateInCell: true,
    matchDisplayName: { versionColumn: /^version$/i },
  },
];

/** One model a deprecation page gives an exact shutdown date for. */
export interface Notice {
  name: string;
  /** The page's version for the row, where it has a version column. */
  version?: string;
  date: string;
  /** False when the page's own state column still calls the model active. */
  stateAllows: boolean;
}

/** A catalogue model a deprecation page names. */
export interface ShutdownItem {
  id: string;
  providerId: string;
  /** The name the vendor's page uses. */
  vendorName: string;
  /** YYYY-MM-DD. */
  date: string;
  /** True when the date has passed (and, where the page states one, the state says so). */
  shutDown: boolean;
  source: string;
  url: string;
}

export const SHUTDOWN_CHECK_SCHEMA_VERSION = 1;

export interface ShutdownReport {
  schemaVersion: number;
  checkedAt: string;
  sources: { url: string; ok: boolean; notices: number; note?: string }[];
  items: ShutdownItem[];
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

function validIso(iso: string): string | null {
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * "October 23, 2026", "Dec 11, 2026", "2025-04-30" or "8/31/2026" (US order) ->
 * ISO. Anything that is not exactly one date is null.
 */
export function parseDate(cell: string): string | null {
  const text = cell.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return validIso(text);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (us) return validIso(`${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`);
  const m = /^([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})$/.exec(text);
  if (!m) return null;
  const word = m[1]!.toLowerCase();
  const month = MONTHS.findIndex((name) => name === word || (word.length >= 3 && name.startsWith(word)));
  if (month === -1) return null;
  const iso = `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(text: string): string {
  return text
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
      if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16));
      if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every table on the page as rows of cells; the first row of each is its header. */
export function tables(text: string, format: ShutdownSource['format']): string[][][] {
  const found: string[][][] = [];
  if (format === 'html') {
    for (const table of text.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
      const rows = (table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []).map((row) =>
        (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []).map((cell) =>
          decode(cell.replace(/<[^>]+>/g, ' ')),
        ),
      );
      if (rows.length > 0) found.push(rows);
    }
    return found;
  }
  let current: string[][] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      if (current.length > 0) found.push(current);
      current = [];
      continue;
    }
    // Split on unescaped pipes; a model cell can hold `a` \| `b`.
    const cells = trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split(/(?<!\\)\|/)
      .map((cell) => cell.replace(/\\\|/g, '|').trim());
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue; // the --- row
    current.push(cells);
  }
  if (current.length > 0) found.push(current);
  return found;
}

/** Model names in a cell: backticked ids where the page uses them, else the cell's first word. */
function names(cell: string): string[] {
  const ticked = [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!.trim());
  if (ticked.length > 0) return ticked;
  const first = cell.split(/[\s(]/)[0]?.trim() ?? '';
  return /^[a-z0-9][a-z0-9._:-]+$/i.test(first) ? [first] : [];
}

/** The last date in a cell that holds several, e.g. "5/22/2026 8/31/2026". */
function lastDate(cell: string): string | null {
  const found = cell.match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|[A-Za-z]+\.? \d{1,2}, \d{4}/g) ?? [];
  return found.length > 0 ? parseDate(found[found.length - 1]!) : null;
}

/** A display name as the catalogue writes it: no trailing link arrow, single spaces. */
function displayName(cell: string): string {
  return cell.replace(/[↗→]/g, '').replace(/\s+/g, ' ').trim();
}

export function readNotices(source: ShutdownSource, text: string): Notice[] {
  const notices: Notice[] = [];
  // Carried into the next table only when this one held nothing but its header:
  // Mistral renders its header and its rows as two separate tables.
  let carried: string[] | null = null;
  for (const table of tables(text, source.format)) {
    // A page can restate its header inside one table (Google does, per section).
    let header: string[] | null = carried;
    carried = null;
    let dataRows = 0;
    for (const row of table) {
      const looksLikeHeader =
        row.some((cell) => source.dateColumn.test(cell)) && row.some((cell) => source.modelColumn.test(cell));
      if (looksLikeHeader) {
        header = row;
        continue;
      }
      if (!header) continue;
      dataRows += 1;
      const modelAt = header.findIndex((cell) => source.modelColumn.test(cell));
      const dateAt = header.findIndex((cell) => source.dateColumn.test(cell));
      const date = source.lastDateInCell ? lastDate(row[dateAt] ?? '') : parseDate(row[dateAt] ?? '');
      if (!date) continue;
      let stateAllows = true;
      if (source.state) {
        const stateAt = header.findIndex((cell) => source.state!.column.test(cell));
        stateAllows = stateAt === -1 || !source.state.active.test(row[stateAt] ?? '');
      }
      if (source.matchDisplayName) {
        const versionAt = header.findIndex((cell) => source.matchDisplayName!.versionColumn.test(cell));
        const name = displayName(row[modelAt] ?? '');
        const version = (row[versionAt] ?? '').trim();
        if (name) notices.push({ name, date, stateAllows, ...(version ? { version } : {}) });
        continue;
      }
      for (const name of names(row[modelAt] ?? '')) notices.push({ name, date, stateAllows });
    }
    if (header && dataRows === 0) carried = header;
  }
  return notices;
}

/**
 * The names a catalogue id may appear under on its vendor's page: the id itself
 * (`o1`, `claude-opus-4-1`), and for Gemini the key without the catalogue's own
 * `gemini-` prefix (`gemini-gemini-3.1-pro-preview`).
 */
function catalogNames(id: string, providerId: string): string[] {
  return providerId === 'google' && id.startsWith('gemini-') ? [id, id.slice('gemini-'.length)] : [id];
}

/** A vendor name without a trailing date stamp: `claude-opus-4-1-20250805` -> `claude-opus-4-1`. */
function undated(name: string): string {
  return name.replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/, '');
}

export function matchShutdowns(args: {
  models: readonly { id: string; providerId: string; displayName?: string }[];
  results: readonly { source: ShutdownSource; notices: readonly Notice[] }[];
  today: string;
}): ShutdownItem[] {
  const items: ShutdownItem[] = [];
  for (const { source, notices } of args.results) {
    if (source.matchDisplayName) {
      const repeated = new Set(notices.map((n) => n.name).filter((name, i, all) => all.indexOf(name) !== i));
      const byDisplay = new Map<string, Notice>();
      for (const notice of notices) {
        // A name the page lists once stands alone; a repeated one ("Codestral"
        // 25.01 and 24.05) only ever matches with its version attached.
        const key = repeated.has(notice.name) ? `${notice.name} ${notice.version ?? ''}`.trim() : notice.name;
        const seen = byDisplay.get(key.toLowerCase());
        if (!seen || notice.date < seen.date) byDisplay.set(key.toLowerCase(), notice);
      }
      for (const model of args.models.filter((m) => m.providerId === source.providerId)) {
        const hit = model.displayName ? byDisplay.get(model.displayName.toLowerCase()) : undefined;
        if (!hit) continue;
        items.push({
          id: model.id,
          providerId: model.providerId,
          vendorName: hit.version ? `${hit.name} (${hit.version})` : hit.name,
          date: hit.date,
          shutDown: hit.date <= args.today && hit.stateAllows,
          source: source.label,
          url: source.url,
        });
      }
      continue;
    }
    const byName = new Map<string, Notice>();
    for (const notice of notices) {
      for (const key of new Set(source.matchUndated ? [notice.name, undated(notice.name)] : [notice.name])) {
        const seen = byName.get(key);
        // The earliest date wins: a snapshot shut down before its alias is still shut down.
        if (!seen || notice.date < seen.date) byName.set(key, notice);
      }
    }
    for (const model of args.models.filter((m) => m.providerId === source.providerId)) {
      const hit = catalogNames(model.id, model.providerId)
        .map((name) => byName.get(name))
        .find((notice) => notice !== undefined);
      if (!hit) continue;
      items.push({
        id: model.id,
        providerId: model.providerId,
        vendorName: hit.name,
        date: hit.date,
        shutDown: hit.date <= args.today && hit.stateAllows,
        source: source.label,
        url: source.url,
      });
    }
  }
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

const REPORT_MAX_AGE_MS = 36 * 60 * 60 * 1000;

/** A report from this morning's run, not one left over from a run that never happened since. */
export function isFreshShutdownReport(
  report: ShutdownReport | undefined,
  now: Date,
): report is ShutdownReport {
  if (!report || report.schemaVersion !== SHUTDOWN_CHECK_SCHEMA_VERSION) return false;
  const checkedAt = Date.parse(report.checkedAt);
  return Number.isFinite(checkedAt) && now.getTime() - checkedAt <= REPORT_MAX_AGE_MS;
}
