/**
 * What a whole repository is spending, aggregated from its files.
 *
 * Grouped by **model** rather than by file, which is a deliberate departure from
 * the plan. Grouping by file produces a file browser, and the editor already has
 * one of those. The question this view exists to answer — "what is this codebase
 * spending, and where" — is answered by seeing the set of models in use, sorted
 * by what they cost, each openable to the lines that call them.
 *
 * Pure: no `vscode` import. The sweep hands it decoded text; this decides what
 * the tree says.
 */
import type { Model } from '@/lib/pricing/types';
import type { ModelMatch } from './scan';

export interface Reference {
  /** Workspace-relative, for display. */
  path: string;
  /** Zero-based, so the caller can turn it into a position directly. */
  line: number;
  /** The literal text found, which may be a routing alias. */
  written: string;
}

export interface ModelUsage {
  model: Model;
  references: Reference[];
  /** Distinct files this model appears in. */
  fileCount: number;
}

export interface Inventory {
  /** Most expensive first — the order someone auditing spend wants. */
  usage: ModelUsage[];
  filesScanned: number;
  /**
   * Files matching the glob that were not read because the cap was reached.
   *
   * Reported rather than swallowed. A truncated sweep that looks complete is
   * the same class of lie as a stale price presented as current: the number on
   * screen would be a floor, and nothing would say so.
   */
  filesSkipped: number;
}

export interface ScannedFile {
  path: string;
  matches: readonly ModelMatch[];
  /** Offsets of every line start, so references can report a line number. */
  lineStarts: readonly number[];
}

/** Offsets at which each line begins. Cheaper than splitting the whole text. */
export function lineStartsOf(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

/** The zero-based line an offset falls on. Binary search over `lineStarts`. */
export function lineAt(lineStarts: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (lineStarts[mid]! <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * Roll scanned files up into per-model usage.
 *
 * Sorted by output rate rather than by reference count: a model called once in
 * a batch job can cost more than one called everywhere in a test suite, and the
 * point of this view is money, not popularity.
 */
export function buildInventory(files: readonly ScannedFile[], filesSkipped = 0): Inventory {
  const byModel = new Map<string, { model: Model; references: Reference[]; files: Set<string> }>();

  for (const file of files) {
    for (const match of file.matches) {
      const existing = byModel.get(match.model.id) ?? {
        model: match.model,
        references: [],
        files: new Set<string>(),
      };
      existing.references.push({
        path: file.path,
        line: lineAt(file.lineStarts, match.start),
        written: match.written,
      });
      existing.files.add(file.path);
      byModel.set(match.model.id, existing);
    }
  }

  const usage = [...byModel.values()]
    .map(({ model, references, files: paths }) => ({ model, references, fileCount: paths.size }))
    .sort(
      (a, b) =>
        b.model.pricing.output - a.model.pricing.output ||
        b.references.length - a.references.length ||
        a.model.id.localeCompare(b.model.id),
    );

  return { usage, filesScanned: files.length, filesSkipped };
}
