import { describe, expect, it } from 'vitest';

import { DEFAULT_SHARE_RECEIPT, SHARE_RECEIPT_LIMITS, parseShareReceipt } from './share';

const complete = {
  conversation: '12 visible turns',
  estimatedTokens: '4,000–5,000 estimated',
  currentModel: 'Model A',
  estimatedCost: '$0.12–$0.18',
  alternativeModel: 'Model B',
  alternativeCost: '$0.03–$0.05',
  priceDifference: 'about 3.6×',
  note: 'Estimate, not invoice.',
};

describe('shared PromptSpend Receipt parser', () => {
  it('accepts fenced and nested share blocks', () => {
    expect(
      parseShareReceipt(`\`\`\`promptspend-receipt\n${JSON.stringify({ receipt: complete })}\n\`\`\``),
    ).toEqual(complete);
  });

  it('normalizes display text and preserves defaults for omitted optional fields', () => {
    const parsed = parseShareReceipt(
      JSON.stringify({
        conversation: '  12   visible\nturns ',
        estimatedTokens: '4,000 estimated',
        currentModel: 'Model A',
        estimatedCost: '$0.12',
      }),
    );
    expect(parsed.conversation).toBe('12 visible turns');
    expect(parsed.alternativeModel).toBe(DEFAULT_SHARE_RECEIPT.alternativeModel);
  });

  it('rejects oversized, malformed, and incomplete input', () => {
    expect(() => parseShareReceipt('x'.repeat(SHARE_RECEIPT_LIMITS.input + 1))).toThrow('too long');
    expect(() => parseShareReceipt('not JSON')).toThrow('not valid receipt JSON');
    expect(() => parseShareReceipt('{"conversation":"one"}')).toThrow('missing receipt fields');
  });

  it('caps imported fields before they reach a share artifact', () => {
    const parsed = parseShareReceipt(JSON.stringify({ ...complete, note: 'n'.repeat(500) }));
    expect(parsed.note).toHaveLength(SHARE_RECEIPT_LIMITS.note);
  });
});
