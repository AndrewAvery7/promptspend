import { describe, expect, it } from 'vitest';
import {
  changedModelIds,
  describeChange,
  formatRate,
  percentChange,
  summariseChangeSet,
  validateChangeSet,
  type ChangeSet,
  type PriceChange,
} from './changes';

const priceChange = (overrides: Partial<PriceChange> = {}): PriceChange => ({
  modelId: 'gpt-5.6-sol',
  displayName: 'GPT-5.6 Sol',
  provider: 'OpenAI',
  kind: 'price',
  before: { input: 5, output: 30 },
  after: { input: 4, output: 24 },
  ...overrides,
});

const set = (changes: PriceChange[]): ChangeSet => ({
  eventId: 'catalog-abc12345',
  generatedAt: '2026-08-02T06:00:00.000Z',
  changes,
});

describe('validation', () => {
  it('accepts a well-formed change set', () => {
    expect(validateChangeSet(set([priceChange()]))).toEqual([]);
  });

  it.each([
    ['not an object', 'nope'],
    ['a short event id', { ...set([priceChange()]), eventId: 'abc' }],
    ['a bad timestamp', { ...set([priceChange()]), generatedAt: 'yesterday' }],
    ['no changes', set([])],
  ])('rejects %s', (_label, payload) => {
    expect(validateChangeSet(payload).length).toBeGreaterThan(0);
  });

  it('insists a price change carries both sides of the move', () => {
    const problems = validateChangeSet(set([priceChange({ before: undefined })]));
    expect(problems.join(' ')).toContain('before/after');
  });

  it('rejects negative rates', () => {
    const problems = validateChangeSet(set([priceChange({ after: { input: -1, output: 24 } })]));
    expect(problems.length).toBeGreaterThan(0);
  });
});

describe('describing a change', () => {
  it('states direction, magnitude and the new rate', () => {
    expect(describeChange(priceChange())).toBe(
      'GPT-5.6 Sol: input 20.0% down to $4/M, output 20.0% down to $24/M',
    );
  });

  it('mentions only the side that moved', () => {
    const description = describeChange(
      priceChange({ before: { input: 5, output: 30 }, after: { input: 5, output: 45 } }),
    );
    expect(description).toBe('GPT-5.6 Sol: output 50.0% up to $45/M');
    expect(description).not.toContain('input');
  });

  /**
   * A model going from free to paid is a real change but not an infinite
   * percentage — the summary has to stay readable rather than print "+∞%".
   */
  it('handles a move away from free without dividing by zero', () => {
    expect(percentChange(0, 3)).toBeNull();
    expect(
      describeChange(priceChange({ before: { input: 0, output: 0 }, after: { input: 3, output: 9 } })),
    ).toBe('GPT-5.6 Sol: input up to $3/M, output up to $9/M');
  });

  it('formats sub-dollar rates with enough precision to matter', () => {
    expect(formatRate(0)).toBe('free');
    expect(formatRate(0.2)).toBe('$0.2/M');
    expect(formatRate(0.075)).toBe('$0.075/M');
    expect(formatRate(15)).toBe('$15/M');
    expect(formatRate(2.5)).toBe('$2.5/M');
  });

  it('describes additions, removals and flags in their own terms', () => {
    expect(describeChange(priceChange({ kind: 'added', before: undefined }))).toContain('added at $4/M in');
    expect(describeChange(priceChange({ kind: 'removed' }))).toContain('no longer listed upstream');
    expect(describeChange(priceChange({ kind: 'flagged', note: 'sources disagree' }))).toContain(
      'flagged for review — sources disagree',
    );
  });
});

describe('summarising a set', () => {
  it('uses the single change verbatim when there is only one', () => {
    expect(summariseChangeSet(set([priceChange()]))).toBe(describeChange(priceChange()));
  });

  it('names the provider when a batch comes from one place', () => {
    const summary = summariseChangeSet(set([priceChange(), priceChange({ modelId: 'gpt-5.6-luna' })]));
    expect(summary).toBe('2 price changes across OpenAI');
  });

  it('counts providers when a batch spans several', () => {
    const summary = summariseChangeSet(
      set([priceChange(), priceChange({ modelId: 'claude-sonnet-5', provider: 'Anthropic' })]),
    );
    expect(summary).toBe('2 price changes across 2 providers');
  });

  it('deduplicates model ids for targeting', () => {
    expect(changedModelIds(set([priceChange(), priceChange()]))).toEqual(['gpt-5.6-sol']);
  });
});
