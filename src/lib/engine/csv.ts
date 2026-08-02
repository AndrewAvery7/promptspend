/**
 * CSV encoding.
 *
 * Two separate problems, both of which the naive version had:
 *
 *   Quoting. A value containing a comma, a quote or a newline has to be wrapped
 *   and its quotes doubled. Model display names come partly from an upstream
 *   feed, so "trust the data" is not available as a strategy.
 *
 *   Formula injection. A spreadsheet treats a cell beginning `=`, `+`, `-`, `@`
 *   or a control character as a formula and will happily evaluate it on open.
 *   That turns a downloaded estimate into an execution vector, so those values
 *   get a leading apostrophe — the standard neutraliser, and invisible in every
 *   major spreadsheet.
 */

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (FORMULA_LEAD.test(text)) text = `'${text}`;
  if (NEEDS_QUOTING.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map(csvCell).join(',');
}

/** CRLF line endings: what the CSV RFC specifies and what Excel expects. */
export function csvDocument(rows: readonly (readonly unknown[])[]): string {
  return `${rows.map(csvRow).join('\r\n')}\r\n`;
}
