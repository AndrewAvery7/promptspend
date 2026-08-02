import { describe, expect, it } from 'vitest';
import type { Model } from '@/lib/pricing/types';
import { characterMix, countTokens, estimateForModel, estimateTokens } from './index';

const base = {
  providerId: 'test',
  status: 'current' as const,
  contextWindow: 200_000,
  capabilities: { reasoning: false, vision: false },
  provenance: { source: 'vendor' as const, lastVerified: '2026-08-01' },
};

const GPT: Model = {
  ...base,
  id: 'gpt',
  displayName: 'GPT',
  pricing: { input: 1, output: 2 },
  tokenizer: { kind: 'tiktoken', encoding: 'o200k_base' },
};

const CLAUDE: Model = {
  ...base,
  id: 'claude',
  displayName: 'Claude',
  pricing: { input: 1, output: 2 },
  tokenizer: { kind: 'approx', charsPerToken: 3.6, cjkCharsPerToken: 1.5, note: 'ratio' },
};

describe('characterMix', () => {
  it('separates CJK characters from everything else', () => {
    expect(characterMix('hello')).toEqual({ cjk: 0, other: 5 });
    expect(characterMix('你好')).toEqual({ cjk: 2, other: 0 });
    expect(characterMix('hi 你好')).toEqual({ cjk: 2, other: 3 });
  });
});

describe('estimateTokens', () => {
  it('lands near the four-characters-per-token rule for English prose', () => {
    const text = 'The quick brown fox jumps over the lazy dog and keeps on running.'; // 65 chars
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(12);
    expect(tokens).toBeLessThan(22);
  });

  it('charges CJK text far more per character — the trap this tool exposes', () => {
    const english = estimateTokens('aaaaaaaaaa');
    const chinese = estimateTokens('一一一一一一一一一一');
    expect(chinese).toBeGreaterThan(english * 2);
  });

  it('honours a family-specific ratio', () => {
    const dense = estimateTokens('a'.repeat(100), {
      kind: 'approx',
      charsPerToken: 2,
      cjkCharsPerToken: 1,
    });
    const sparse = estimateTokens('a'.repeat(100), {
      kind: 'approx',
      charsPerToken: 5,
      cjkCharsPerToken: 1,
    });
    expect(dense).toBe(50);
    expect(sparse).toBe(20);
  });

  it('returns zero for empty text and never a fraction', () => {
    expect(estimateTokens('')).toBe(0);
    expect(Number.isInteger(estimateTokens('abc'))).toBe(true);
  });
});

describe('countTokens', () => {
  it('runs the real tokenizer for OpenAI-family models', async () => {
    const result = await countTokens('The quick brown fox jumps over the lazy dog.', GPT);
    expect(result.method).toBe('exact');
    expect(result.tokens).toBeGreaterThan(6);
    expect(result.tokens).toBeLessThan(15);
    expect(result.note).toMatch(/o200k_base/);
  });

  it('labels ratio-based families honestly rather than implying precision', async () => {
    const result = await countTokens('The quick brown fox jumps over the lazy dog.', CLAUDE);
    expect(result.method).toBe('estimate');
    expect(result.note).toBe('ratio');
  });

  it('agrees with the estimate within a sane margin on ordinary prose', async () => {
    const text = 'Estimating the cost of a language model feature before you build it is cheap insurance.';
    const exact = await countTokens(text, GPT);
    const approx = estimateTokens(text);
    const ratio = approx / exact.tokens;
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(1.6);
  });

  it('reports empty input as an exact zero', async () => {
    expect(await countTokens('', GPT)).toMatchObject({ tokens: 0, method: 'exact' });
  });
});

describe('estimateForModel', () => {
  it('is synchronous so typing never waits on a tokenizer download', () => {
    const result = estimateForModel('hello world', GPT);
    expect(result.method).toBe('estimate');
    expect(result.note).toMatch(/loading/);
  });
});
