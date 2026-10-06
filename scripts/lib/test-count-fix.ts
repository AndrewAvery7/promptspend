/**
 * Rewriting the published test counts, instead of reporting them.
 *
 * `check-test-badge.ts` knows every place a count is published and what each one
 * must say, so a stale one is not a judgement call: it is a number that has to
 * change. Until this existed that took one failed gate and one hand edit per
 * count, and the same four or five figures went stale every time a test was
 * added, because the people who wrote the check are also the people it
 * interrupts.
 *
 * What it does **not** fix, on purpose, is the prose beside a number. A row in
 * the per-file table of `docs/TESTING.md` needs a description of what the file
 * guards, and a placeholder there would be a fabricated claim the check cannot
 * police. Those stay as problems for a person.
 *
 * Pure functions over text, so the rewriting can be tested without running a
 * single suite.
 */

export interface Edit {
  start: number;
  end: number;
  value: string;
}

/** `d` makes the engine report where each capture group sits. */
function withIndices(pattern: RegExp): RegExp {
  const flags = new Set(pattern.flags.split(''));
  flags.add('g');
  flags.add('d');
  return new RegExp(pattern.source, [...flags].join(''));
}

function groupEdit(
  match: RegExpMatchArray & { indices?: [number, number][] },
  group: number,
  value: number,
): Edit | null {
  const range = match.indices?.[group];
  if (!range) return null;
  const [start, end] = range;
  return Number(match[group]) === value ? null : { start, end, value: String(value) };
}

/** One edit per occurrence of a figure that is not `expected`. The pattern's
 *  first capture group is the figure. */
export function claimEdits(text: string, pattern: RegExp, expected: number): Edit[] {
  return [...text.matchAll(withIndices(pattern))]
    .map((match) => groupEdit(match, 1, expected))
    .filter((edit): edit is Edit => edit !== null);
}

/** The per-file table in docs/TESTING.md: a row's count follows the file's real
 *  one. Rows for files that are gone, and files with no row, are not touched. */
export function tableEdits(text: string, row: RegExp, byFile: Map<string, number>): Edit[] {
  const edits: Edit[] = [];
  for (const match of text.matchAll(withIndices(row))) {
    const actual = byFile.get(match[1]!);
    if (actual === undefined) continue;
    const edit = groupEdit(match, 2, actual);
    if (edit) edits.push(edit);
  }
  return edits;
}

/**
 * A count in prose that names the browser suite ("192 browser tests") but is not
 * a figure any suite reports. Only that wording is rewritten: a bare "N tests"
 * could mean anything, and guessing which suite it meant is how a wrong number
 * gets a green tick.
 */
export function browserStrayEdits(
  text: string,
  anyCount: RegExp,
  browserCount: number,
  permitted: ReadonlyMap<number, string>,
): Edit[] {
  const edits: Edit[] = [];
  for (const match of text.matchAll(withIndices(anyCount))) {
    if (permitted.has(Number(match[1])) || !/\bbrowser\b/i.test(match[0])) continue;
    const edit = groupEdit(match, 1, browserCount);
    if (edit) edits.push(edit);
  }
  return edits;
}

/** Apply edits from the end of the text backwards so earlier offsets stay valid.
 *  Two edits at one position (the same figure found by two rules) apply once. */
export function applyEdits(text: string, edits: readonly Edit[]): string {
  const seen = new Set<number>();
  const ordered = [...edits]
    .sort((a, b) => b.start - a.start)
    .filter((edit) => !seen.has(edit.start) && seen.add(edit.start));
  let out = text;
  for (const { start, end, value } of ordered) out = out.slice(0, start) + value + out.slice(end);
  return out;
}
