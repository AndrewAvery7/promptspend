import { describe, expect, it } from 'vitest';
import { BUDGET, overBudget } from './check-pagespeed';

describe('overBudget', () => {
  it('passes a page inside every limit', () => {
    expect(overBudget({ performance: 95, lcp: 1300, cls: 0.01 })).toEqual([]);
  });
  it('passes a page exactly on the limits', () => {
    expect(overBudget({ performance: BUDGET.performance, lcp: BUDGET.lcp, cls: BUDGET.cls })).toEqual([]);
  });
  it('names each limit a page misses', () => {
    const misses = overBudget({ performance: 60, lcp: 4000, cls: 0.3 });
    expect(misses).toHaveLength(3);
    expect(misses[1]).toContain('4000 ms');
  });
});
