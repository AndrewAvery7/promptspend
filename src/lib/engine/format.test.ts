import { describe, expect, it } from 'vitest';
import {
  formatContext,
  formatCount,
  formatMoney,
  formatPercent,
  formatTokens,
  renderEmphasis,
} from './format';

describe('formatMoney', () => {
  it('scales precision to magnitude so small costs stay legible', () => {
    expect(formatMoney(8838.45)).toBe('$8,838');
    expect(formatMoney(294.6)).toBe('$295');
    expect(formatMoney(1.5)).toBe('$1.50');
    expect(formatMoney(0.117846)).toBe('$0.118');
    expect(formatMoney(0.000028)).toBe('$0.000028');
    expect(formatMoney(0)).toBe('$0');
  });

  it('keeps the sign on negative amounts', () => {
    expect(formatMoney(-12.5)).toBe('-$12.50');
  });

  it('degrades to a dash rather than printing NaN', () => {
    expect(formatMoney(Number.NaN)).toBe('—');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatTokens', () => {
  it('uses k and M suffixes past a thousand', () => {
    expect(formatTokens(800)).toBe('800 tok');
    expect(formatTokens(26_700)).toBe('26.7k tok');
    expect(formatTokens(5_000)).toBe('5k tok');
    expect(formatTokens(1_400_000)).toBe('1.4M tok');
  });
});

describe('formatPercent and formatCount', () => {
  it('renders fractions as percentages', () => {
    expect(formatPercent(0.98)).toBe('98%');
    expect(formatPercent(0.5089, 1)).toBe('50.9%');
  });

  it('groups large counts', () => {
    expect(formatCount(2500)).toBe('2,500');
  });
});

describe('formatContext', () => {
  it('renders context windows the way vendors quote them', () => {
    expect(formatContext(1_000_000)).toBe('1M');
    expect(formatContext(200_000)).toBe('200K');
    expect(formatContext(163_840)).toBe('164K');
  });
});

describe('renderEmphasis', () => {
  it('splits bold and italic spans out of insight strings', () => {
    const parts = renderEmphasis('Output is **39%** of the bill and model choice *is* your margin.');
    expect(parts).toEqual([
      { text: 'Output is ', emphasis: 'none' },
      { text: '39%', emphasis: 'strong' },
      { text: ' of the bill and model choice ', emphasis: 'none' },
      { text: 'is', emphasis: 'em' },
      { text: ' your margin.', emphasis: 'none' },
    ]);
  });

  it('passes plain text through untouched', () => {
    expect(renderEmphasis('no markup here')).toEqual([{ text: 'no markup here', emphasis: 'none' }]);
  });
});
