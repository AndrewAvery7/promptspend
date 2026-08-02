import { describe, expect, it } from 'vitest';
import { assertUniqueSlugs, comparisonSlug, modelSlug, slugify } from './slug';

describe('slugify', () => {
  it('lowercases and replaces every run of non-alphanumerics with one hyphen', () => {
    expect(slugify('GPT-5.6 Sol')).toBe('gpt-5-6-sol');
    expect(slugify('amazon.nova-2-lite-v1-0')).toBe('amazon-nova-2-lite-v1-0');
    expect(slugify('dashscope-qwen3.7-max')).toBe('dashscope-qwen3-7-max');
  });

  it('never leaves a leading or trailing hyphen', () => {
    expect(slugify('...o3...')).toBe('o3');
    expect(slugify('  spaced  ')).toBe('spaced');
  });

  it('refuses an id with nothing slug-safe in it, rather than emitting //', () => {
    expect(() => slugify('///')).toThrow(/no slug-safe characters/);
  });
});

describe('modelSlug', () => {
  it('collapses a doubled leading token', () => {
    expect(modelSlug('gemini-gemini-3.1-pro-preview')).toBe('gemini-3-1-pro-preview');
    expect(modelSlug('deepseek-deepseek-r1')).toBe('deepseek-r1');
    expect(modelSlug('minimax-minimax-m2.5')).toBe('minimax-m2-5');
  });

  it('leaves a merely similar prefix alone', () => {
    // `zai` and `glm` are different tokens, so there is nothing to collapse.
    expect(modelSlug('zai-glm-5-code')).toBe('zai-glm-5-code');
    // Only the *first* token doubling collapses; this is not a general dedupe.
    expect(modelSlug('gpt-5-mini')).toBe('gpt-5-mini');
  });
});

describe('comparisonSlug', () => {
  it('is order-independent, so one comparison cannot occupy two URLs', () => {
    expect(comparisonSlug('gpt-5', 'claude-opus-5')).toBe('claude-opus-5-vs-gpt-5');
    expect(comparisonSlug('claude-opus-5', 'gpt-5')).toBe('claude-opus-5-vs-gpt-5');
  });
});

describe('assertUniqueSlugs', () => {
  it('passes when every slug is distinct', () => {
    expect(() =>
      assertUniqueSlugs(
        [
          { id: 'a', slug: 'a' },
          { id: 'b', slug: 'b' },
        ],
        'model',
      ),
    ).not.toThrow();
  });

  it('names both offenders when two ids collide', () => {
    expect(() =>
      assertUniqueSlugs(
        [
          { id: 'gpt-5.1', slug: 'gpt-5-1' },
          { id: 'gpt_5_1', slug: 'gpt-5-1' },
        ],
        'model',
      ),
    ).toThrow(/gpt-5\.1, gpt_5_1/);
  });
});
