import { describe, expect, it } from 'vitest';
import { cacheBreakEven, mixBreakEven, workloadTokens } from './featured';
import { WORKLOAD_PROFILES } from './workloads';

describe('mixBreakEven', () => {
  it('finds the output-per-1k-input point where two bills are equal', () => {
    // left: cheap input, dear output. 1000 in + x out: 1*1 + 10x/1000 = 2*1 + 5x/1000 → x = 200
    expect(mixBreakEven({ input: 1, output: 10 }, { input: 2, output: 5 })).toBeCloseTo(200);
  });
  it('is null when one side is cheaper on both rates', () => {
    expect(mixBreakEven({ input: 1, output: 5 }, { input: 2, output: 10 })).toBeNull();
  });
  it('is null for identical rates', () => {
    expect(mixBreakEven({ input: 2, output: 10 }, { input: 2, output: 10 })).toBeNull();
  });
});

describe('cacheBreakEven', () => {
  it('finds the cache-hit share where input bills match', () => {
    // left 1 fresh / 0.5 cached, right 2 fresh / 0.1 cached: 1 - 0.5h = 2 - 1.9h → h = 1/1.4
    expect(
      cacheBreakEven({ input: 1, output: 1, cachedInput: 0.5 }, { input: 2, output: 1, cachedInput: 0.1 }),
    ).toBeCloseTo(1 / 1.4);
  });
  it('is null without cached rates on both sides', () => {
    expect(cacheBreakEven({ input: 1, output: 1 }, { input: 2, output: 1, cachedInput: 0.1 })).toBeNull();
  });
});

describe('workloadTokens', () => {
  it('re-sends history each turn', () => {
    const summarizer = WORKLOAD_PROFILES.find((profile) => profile.id === 'summarizer')!;
    expect(workloadTokens(summarizer)).toEqual({ input: 12_200, output: 800 });
  });
});
