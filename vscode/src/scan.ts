/**
 * Finding model ids in a document.
 *
 * Deliberately NOT the MCP server's `resolveModel`. That function is built for
 * an agent asking "how much is sonnet?" and falls back to substring matching,
 * which is right there and catastrophic here — `m.id.includes(needle)` against a
 * whole source file would light up half of it. Editor matching has to be exact.
 *
 * Pure on purpose: no `vscode` import anywhere in this file, so the whole of it
 * is unit-testable without downloading an editor.
 */
import type { Catalog } from '@/lib/pricing/catalog';
import type { Model } from '@/lib/pricing/types';
import { writtenFormsOf } from './vendor-ids';
import { commentRanges, isInside, type CommentSyntax } from './comments';

export interface ModelMatch {
  /** The literal text found in the document. */
  written: string;
  /** The row to price against — a routing alias has already been followed. */
  model: Model;
  /** The alias row, when `written` reached `model` through one. */
  routedFrom?: Model;
  /** Offsets into the scanned text; the caller converts to editor positions. */
  start: number;
  end: number;
}

/**
 * Ids at or below this length must be the entire contents of a quoted string to
 * count. Only `o1` and `o3` are this short today, and without the rule a line
 * like `let o3 = compute()` would be annotated with a price.
 */
const SHORT_ID_MAX = 3;

const QUOTES = new Set(['"', "'", '`']);

/**
 * Above this, scanning is skipped rather than done slowly. Reported through
 * `truncated` rather than returning silently — a file that quietly shows no
 * prices is indistinguishable from a file with no models in it.
 */
export const MAX_SCAN_CHARS = 2_000_000;

export interface ScanResult {
  matches: ModelMatch[];
  /** True when the document was too large to scan and nothing was looked at. */
  skipped: boolean;
}

export interface ScanOptions {
  /**
   * The language's comment syntax. When given, ids inside comments are skipped:
   * a model named in a comment is being discussed rather than called, and an
   * annotation on the line `# this should be left alone` reads as a bug.
   *
   * Omit to annotate everything, which is what `annotateComments` does.
   */
  comments?: CommentSyntax;
}

/** Escape a literal for use inside a regular expression. Ids contain `.` and `-`. */
function escape(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A compiled lookup from every written form of every catalog id to its row.
 *
 * Built once per catalog refresh, not per keystroke: the alternation below runs
 * to a few thousand characters and recompiling it on every edit of a large file
 * was the obvious way to make typing stutter.
 */
export class ModelIndex {
  private readonly byWritten: Map<string, Model>;
  private readonly pattern: RegExp;

  constructor(private readonly catalog: Catalog) {
    this.byWritten = new Map();
    for (const model of catalog.models) {
      for (const written of writtenFormsOf(model.id)) {
        // First writer wins, and catalog order is stable, so a collision
        // between a stripped form and a real id resolves the same way twice.
        if (!this.byWritten.has(written)) this.byWritten.set(written, model);
      }
    }

    // Longest first, so `gpt-5.6-sol` is preferred over `gpt-5.6` and neither is
    // consumed piecemeal. Alternation in JS is first-match, not longest-match.
    const alternatives = [...this.byWritten.keys()]
      .sort((a, b) => b.length - a.length || a.localeCompare(b))
      .map(escape)
      .join('|');

    // The boundary is not `\b`. Ids contain `.`, `-` and digits, and `\b` would
    // happily match `claude-sonnet-5` inside `claude-sonnet-5-20260101` — a
    // dated snapshot id the catalog does not carry, priced as if it were the
    // undated one. The explicit character class refuses that.
    this.pattern = new RegExp(`(?<![A-Za-z0-9._-])(?:${alternatives})(?![A-Za-z0-9._-])`, 'g');
  }

  /** How many distinct written forms this index recognises. */
  get size(): number {
    return this.byWritten.size;
  }

  /** The row a literal resolves to, or undefined. Alias not followed. */
  lookup(written: string): Model | undefined {
    return this.byWritten.get(written);
  }

  scan(text: string, options: ScanOptions = {}): ScanResult {
    if (text.length > MAX_SCAN_CHARS) return { matches: [], skipped: true };

    // Computed once for the document, not per match. Both passes are linear, so
    // this is one extra sweep rather than one per model id found.
    const skipRanges = options.comments ? commentRanges(text, options.comments) : [];

    const matches: ModelMatch[] = [];
    this.pattern.lastIndex = 0;
    let hit: RegExpExecArray | null;

    while ((hit = this.pattern.exec(text)) !== null) {
      const written = hit[0];
      const start = hit.index;
      const end = start + written.length;

      if (isInside(skipRanges, start)) continue;
      if (written.length <= SHORT_ID_MAX && !isWholeQuotedString(text, start, end)) continue;

      const row = this.byWritten.get(written);
      if (!row) continue;

      // Price against the routing target, which carries the fuller record: the
      // `gpt-5.6` alias row has base rates but no cache-write, batch discount or
      // long-context tier, all of which live on `gpt-5.6-sol`.
      const target = row.aliasOf ? this.catalog.get(row.aliasOf) : undefined;
      matches.push(
        target
          ? { written, model: target, routedFrom: row, start, end }
          : { written, model: row, start, end },
      );
    }

    return { matches, skipped: false };
  }
}

/**
 * True when the span is exactly a quoted string's contents — `"o3"`, `'o3'` or
 * backticked. Used only to keep two-character ids from matching identifiers.
 *
 * Deliberately narrow: it checks the characters either side and nothing more, so
 * it cannot be fooled into a false negative by quoting elsewhere on the line,
 * and it makes no attempt to understand escapes or multi-line strings. For ids
 * this short, "must be the whole string literal" is the entire requirement.
 */
function isWholeQuotedString(text: string, start: number, end: number): boolean {
  const before = text[start - 1];
  const after = text[end];
  return before !== undefined && QUOTES.has(before) && before === after;
}
