import { describe, expect, it } from 'vitest';
import { escapeXml, parseShareReceipt, renderShareReceiptSvg } from './shareReceipt';

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
});
