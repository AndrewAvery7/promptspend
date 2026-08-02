import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO, clampField, decodeScenario, encodeScenario } from './scenario';

describe('encode/decode', () => {
  it('round-trips a scenario without loss', () => {
    const scenario = {
      ...DEFAULT_SCENARIO,
      modelIds: ['claude-sonnet-5', 'gpt-5.4'],
      systemTokens: 1200,
      turns: 9,
      revenuePerUserPerMonth: 24.5,
    };
    expect(decodeScenario(encodeScenario(scenario))).toEqual(scenario);
  });

  it('accepts a query string with or without the leading question mark', () => {
    const encoded = encodeScenario({ ...DEFAULT_SCENARIO, turns: 11 });
    expect(decodeScenario(`?${encoded}`).turns).toBe(11);
    expect(decodeScenario(encoded).turns).toBe(11);
  });

  it('falls back to defaults for anything missing', () => {
    expect(decodeScenario('')).toEqual(DEFAULT_SCENARIO);
  });

  it('never lets a hand-edited URL produce nonsense numbers', () => {
    const decoded = decodeScenario('sys=-999&t=9999&cpd=abc&mau=0&cache=7');
    expect(decoded.systemTokens).toBe(0);
    expect(decoded.turns).toBe(200);
    expect(decoded.conversationsPerDay).toBe(DEFAULT_SCENARIO.conversationsPerDay);
    expect(decoded.monthlyActiveUsers).toBe(1);
    expect(decoded.cachedInputShare).toBe(1);
  });

  it('caps the model list at the comparison limit', () => {
    const decoded = decodeScenario('m=a,b,c,d,e,f');
    expect(decoded.modelIds).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops model ids that could not have come from the catalog', () => {
    const decoded = decodeScenario('m=good-id,<script>,also.good');
    expect(decoded.modelIds).toEqual(['good-id', 'also.good']);
  });

  it('keeps pasted prompt text out of the URL entirely', () => {
    // Only derived counts travel: prompts are often proprietary and URLs leak.
    const encoded = encodeScenario({ ...DEFAULT_SCENARIO, systemTokens: 1234 });
    expect(encoded).not.toMatch(/text|prompt|paste/i);
    expect(encoded).toMatch(/sys=1234/);
  });

  it('omits optional parameters at their defaults to keep links short', () => {
    const encoded = encodeScenario(DEFAULT_SCENARIO);
    expect(encoded).not.toMatch(/rsn=/);
    expect(encoded).not.toMatch(/batch=/);
  });
});

describe('clampField', () => {
  it('holds every field inside its documented range', () => {
    expect(clampField('turns', 0)).toBe(1);
    expect(clampField('turns', 10_000)).toBe(200);
    expect(clampField('cachedInputShare', 1.5)).toBe(1);
    expect(clampField('cachedInputShare', -0.5)).toBe(0);
  });

  it('substitutes the default for values that are not numbers at all', () => {
    expect(clampField('systemTokens', Number.NaN)).toBe(DEFAULT_SCENARIO.systemTokens);
  });
});
