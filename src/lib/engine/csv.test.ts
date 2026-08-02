import { describe, expect, it } from 'vitest';
import { csvCell, csvDocument, csvRow } from './csv';

describe('csvCell', () => {
  it('leaves ordinary values alone', () => {
    expect(csvCell('Claude Sonnet 5')).toBe('Claude Sonnet 5');
    expect(csvCell(3.5)).toBe('3.5');
    expect(csvCell(0)).toBe('0');
  });

  it('renders null and undefined as empty rather than the word', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes anything containing a delimiter, a quote or a newline', () => {
    expect(csvCell('Model A, mini')).toBe('"Model A, mini"');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
  });

  it('doubles embedded quotes instead of truncating the field', () => {
    // The old exporter wrapped display names in quotes without escaping, so a
    // name containing one silently split into two columns.
    expect(csvCell('the "fast" one')).toBe('"the ""fast"" one"');
  });

  it('neutralises spreadsheet formulas', () => {
    // Display names come partly from an upstream feed. A downloaded estimate
    // should never be able to execute anything when it is opened.
    for (const dangerous of ['=1+1', '+1', '-1', '@SUM(A1)', '\tcmd']) {
      expect(csvCell(dangerous).replace(/^"|"$/g, '')).toMatch(/^'/);
    }
    expect(csvCell('=HYPERLINK("http://x","click")')).toBe('"\'=HYPERLINK(""http://x"",""click"")"');
  });

  it('does not mangle a negative number that is genuinely a number', () => {
    // A leading minus is neutralised, which is the accepted trade: a quoted
    // apostrophe is visible and harmless, an executed formula is not. Margin
    // columns are therefore written as plain values by the caller.
    expect(csvCell(-0.25)).toBe("'-0.25");
  });
});

describe('csvRow and csvDocument', () => {
  it('joins fields with commas and rows with CRLF', () => {
    expect(csvRow(['a', 'b'])).toBe('a,b');
    expect(csvDocument([['a', 'b'], ['c']])).toBe('a,b\r\nc\r\n');
  });

  it('survives a row that is entirely hostile', () => {
    const row = csvRow(['=cmd|"/c calc"!A1', 'safe', null]);
    expect(row.startsWith('"\'=')).toBe(true);
    expect(row.endsWith(',safe,')).toBe(true);
  });
});
