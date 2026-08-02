import { describe, expect, it } from 'vitest';
import { costPico, dollarsToPico, isExactCost, picoToDollars, rateToMicros, toCents } from './money';

describe('rateToMicros', () => {
  it('converts published rates to integer micro-dollars', () => {
    expect(rateToMicros(0.435)).toBe(435_000);
    expect(rateToMicros(50)).toBe(50_000_000);
    expect(rateToMicros(0)).toBe(0);
  });

  it('rejects nonsense rates instead of silently producing NaN', () => {
    expect(() => rateToMicros(-1)).toThrow(RangeError);
    expect(() => rateToMicros(Number.NaN)).toThrow(RangeError);
  });
});

describe('costPico', () => {
  it('is exact where plain floating point is not', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; the integer path has no such
    // problem, which is what keeps sums of card values matching their total.
    const a = costPico(100_000, 0.1);
    const b = costPico(100_000, 0.2);
    const c = costPico(100_000, 0.3);
    expect(a + b).toBe(c);
  });

  it('produces clean decimal dollars for realistic requests', () => {
    expect(picoToDollars(costPico(1_000_000, 3))).toBe(3);
    expect(picoToDollars(costPico(26_700, 3))).toBe(0.0801);
    expect(picoToDollars(costPico(5_400, 15))).toBe(0.081);
  });

  it('rounds fractional token counts, which are always estimation artefacts', () => {
    expect(costPico(10.4, 1)).toBe(costPico(10, 1));
    expect(costPico(10.6, 1)).toBe(costPico(11, 1));
  });

  it('rejects inputs that are meaningless rather than merely enormous', () => {
    expect(() => costPico(-5, 1)).toThrow(RangeError);
    expect(() => costPico(Number.NaN, 1)).toThrow(RangeError);
    expect(() => costPico(10, -1)).toThrow(RangeError);
  });

  it('degrades past the exact range instead of throwing', () => {
    // This used to throw. `costPico` is called during render, nothing caught
    // it, and the result was a blank page from a URL the app itself accepted.
    // The answer is finite and correct to ~15 significant figures; only the
    // last pico-dollars of a figure already past $9,000 per request are lost.
    const huge = costPico(Number.MAX_SAFE_INTEGER, 50);
    expect(Number.isFinite(huge)).toBe(true);
    expect(huge).toBeGreaterThan(0);
    expect(isExactCost(Number.MAX_SAFE_INTEGER, 50)).toBe(false);
  });

  it('stays exact across the whole realistic range', () => {
    // A million-token request against the priciest model in the catalog.
    expect(Number.isSafeInteger(costPico(1_000_000, 50))).toBe(true);
    expect(isExactCost(1_000_000, 50)).toBe(true);
    // And a single turn's input at the very top of what the URL decoder
    // permits (~80M tokens), against a rate above anything in the catalog.
    expect(isExactCost(80_000_000, 60)).toBe(true);
  });
});

describe('conversions', () => {
  it('round-trips dollars through pico-dollars', () => {
    expect(picoToDollars(dollarsToPico(1234.56))).toBeCloseTo(1234.56, 10);
  });

  it('rounds to cents only when asked', () => {
    expect(toCents(0.11784)).toBe(0.12);
    expect(toCents(8838.4499)).toBe(8838.45);
  });
});
