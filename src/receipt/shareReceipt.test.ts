import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHARE_RECEIPT,
  escapeXml,
  parseShareReceipt,
  receiptEyebrow,
  renderShareReceiptSvg,
  shareReceiptFilename,
} from './shareReceipt';
import { isSampleReceipt } from './ShareReceiptBuilder';

const result = {
  conversation: '47 visible turns',
  estimatedTokens: '128,440 estimated',
  currentModel: 'Model A',
  estimatedCost: '$1.82 estimated',
  alternativeModel: 'Model B',
  alternativeCost: '$0.19 estimated',
  priceDifference: '9.6×',
  note: 'Estimate, not invoice.',
};

describe('share receipt contract', () => {
  it('parses a fenced result', () => {
    expect(parseShareReceipt(`\`\`\`promptspend-receipt\n${JSON.stringify(result)}\n\`\`\``)).toEqual(result);
  });

  it('rejects incomplete or invalid results', () => {
    expect(() => parseShareReceipt('{"conversation":"one"}')).toThrow('missing receipt fields');
    expect(() => parseShareReceipt('not json')).toThrow('not valid receipt JSON');
  });

  it('escapes user-controlled SVG text', () => {
    expect(escapeXml('<script> & "quoted"')).toBe('&lt;script&gt; &amp; &quot;quoted&quot;');
    expect(renderShareReceiptSvg({ ...result, currentModel: '<script>' })).not.toContain('<script>');
  });

  it('stamps a sample as an example in the image and the filename, and a real result as a personal one', () => {
    expect(renderShareReceiptSvg(DEFAULT_SHARE_RECEIPT, true)).toContain('EXAMPLE RECEIPT · NOT YOUR DATA');
    expect(renderShareReceiptSvg(result)).toContain('YOUR AI RECEIPT');
    expect(receiptEyebrow(true)).not.toBe(receiptEyebrow(false));
    expect(shareReceiptFilename(true)).toContain('example-receipt');
    expect(shareReceiptFilename()).not.toContain('example');
  });

  it('treats the built-in sample as an example until its usage figures are replaced', () => {
    expect(isSampleReceipt(DEFAULT_SHARE_RECEIPT)).toBe(true);
    expect(
      isSampleReceipt({
        ...DEFAULT_SHARE_RECEIPT,
        conversation: '3 turns',
        estimatedTokens: '900 estimated',
      }),
    ).toBe(false);
    // A partial import no longer inherits the sample's turns or tokens.
    const partial = parseShareReceipt(
      JSON.stringify({
        currentModel: 'A',
        estimatedCost: '$1',
        alternativeModel: 'B',
        alternativeCost: '$0.5',
      }),
    );
    expect(isSampleReceipt(partial)).toBe(false);
  });
});
