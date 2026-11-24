import { describe, expect, it } from 'vitest';
import { BUDGET, LCP_BUDGET_BY_PAGE, overBudget } from './check-pagespeed';

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
  it('gives the homepage its own largest-paint limit, and only the homepage', () => {
    const home = LCP_BUDGET_BY_PAGE['/']!;
    expect(home).toBe(3000);
    expect(overBudget({ performance: 95, lcp: 2900, cls: 0 }, '/')).toEqual([]);
    expect(overBudget({ performance: 95, lcp: 3100, cls: 0 }, '/')[0]).toContain('> 3000 ms');
    expect(overBudget({ performance: 95, lcp: 2900, cls: 0 }, '/models/')[0]).toContain(`> ${BUDGET.lcp} ms`);
  });
});
