import { describe, expect, it } from 'vitest';
import { findCoverageGaps, keyNames, nameKey, platformOwners, renderGapReport } from './coverage-gaps';
import type { Allowlist } from './normalize';

const ALLOWLIST: Allowlist = {
  providers: [
    { id: 'openai', name: 'OpenAI', country: 'US' },
    { id: 'alibaba', name: 'Alibaba', country: 'CN' },
    { id: 'amazon', name: 'Amazon', country: 'US' },
  ],
  globalExclude: ['-latest$'],
  families: [
    {
      id: 'openai-gpt',
      providerId: 'openai',
      include: ['^gpt-5(\\.\\d+)?$'],
      tokenizer: { kind: 'tiktoken', encoding: 'o200k_base' },
      capabilities: { reasoning: true, vision: true },
    },
    {
      id: 'alibaba-qwen',
      providerId: 'alibaba',
      include: ['^dashscope/qwen3\\.\\d+-max$'],
      tokenizer: { kind: 'approx', charsPerToken: 3.5, cjkCharsPerToken: 1.5 },
      capabilities: { reasoning: true, vision: false },
    },
    {
      id: 'amazon-nova',
      providerId: 'amazon',
      include: ['^amazon\\.nova-2-pro'],
      tokenizer: { kind: 'approx', charsPerToken: 3.8, cjkCharsPerToken: 1.7 },
      capabilities: { reasoning: true, vision: true },
    },
  ],
};

const row = (platform: string, input: number, output: number, mode = 'chat') => ({
  litellm_provider: platform,
  mode,
  input_cost_per_token: input / 1e6,
  output_cost_per_token: output / 1e6,
});

const FEED: Record<string, unknown> = {
  // Captured today: these teach the check which platform is whose.
  'gpt-5': row('openai', 1.25, 10),
  'dashscope/qwen3.8-max': row('dashscope', 2, 6),
  'amazon.nova-2-pro-v1:0': row('bedrock_converse', 1.25, 10),
  // Gaps: the vendor's own platform, no rule takes them.
  'gpt-5.5-pro': row('openai', 30, 180, 'responses'),
  'dashscope/qwen3.8-flash': row('dashscope', 0.15, 0.47),
  'amazon.nova-pro-v1:0': row('bedrock_converse', 0.8, 3.2),
  // Not gaps.
  'anthropic.claude-opus-5': row('bedrock_converse', 5, 25), // Amazon's copy of someone else's model
  'dashscope/deepseek-v4-pro': row('dashscope', 2.4, 4.8), // Alibaba hosting DeepSeek
  'together_ai/Qwen/Qwen3.8-Flash': row('together_ai', 0.2, 0.6), // a reseller
  'deepseek-v4-pro': row('openai', 1.32, 3.96), // published already, under another key
  'gpt-5-free': row('openai', 0, 0), // nothing to compare
  'gpt-realtime-3': row('openai', 4, 24, 'realtime'), // not token-priced chat
  'gpt-5.9-latest': row('openai', 1, 2), // a floating alias, excluded for everyone
  'gpt-5-codex': row('openai', 1.25, 10), // left out on purpose
};

const HINTS = [
  {
    provider: 'OpenAI',
    model: 'GPT-5.5 Pro',
    status: 'Current',
    modality: ['text'],
    detail_url: 'https://x/a',
  },
  { provider: 'Alibaba', model: 'Qwen3.8-Flash', status: 'Current' },
  { provider: 'Amazon', model: 'Nova Pro', status: 'Current', modality: ['text', 'image'] },
  { provider: 'Anthropic', model: 'anthropic.claude-opus-5', status: 'Current' },
  { provider: 'DeepSeek', model: 'deepseek-v4-pro', status: 'Current' },
  { provider: 'Together', model: 'Qwen3.8 Flash', status: 'Current' },
  { provider: 'OpenAI', model: 'gpt-5-free', status: 'Current' },
  { provider: 'OpenAI', model: 'GPT Realtime 3', status: 'Current' },
  { provider: 'OpenAI', model: 'gpt-5-codex', status: 'Current' },
  { provider: 'OpenAI', model: 'GPT-4 Old', status: 'Retired' },
  { provider: 'OpenAI', model: 'Image Thing', status: 'Current', modality: ['image'] },
];

const PUBLISHED = [
  { id: 'gpt-5', displayName: 'GPT-5' },
  { id: 'deepseek-deepseek-v4-pro', displayName: 'DeepSeek V4 Pro' },
];

const IGNORE = [{ feedKey: '-codex$', reason: 'left out on purpose' }];

describe('the coverage-gap check', () => {
  const gaps = findCoverageGaps({
    hints: HINTS,
    feed: FEED,
    allowlist: ALLOWLIST,
    published: PUBLISHED,
    ignore: IGNORE,
  });

  it('reports only the vendors’ own priced rows that no rule captures', () => {
    expect(gaps.map((g) => g.key)).toEqual([
      'amazon.nova-pro-v1:0',
      'dashscope/qwen3.8-flash',
      'gpt-5.5-pro',
    ]);
  });

  it('carries the feed’s price and the names that pointed at it, never the other list’s price', () => {
    const pro = gaps.find((g) => g.key === 'gpt-5.5-pro')!;
    expect(pro.inputPerMillion).toBe(30);
    expect(pro.outputPerMillion).toBe(180);
    expect(pro.hints).toEqual([{ provider: 'OpenAI', model: 'GPT-5.5 Pro', url: 'https://x/a' }]);
  });

  it('learns whose platform each row is from the rows already captured', () => {
    const owners = platformOwners(FEED, ALLOWLIST);
    expect(owners.get('openai')).toBe('openai');
    expect(owners.get('dashscope')).toBe('alibaba');
    expect(owners.get('bedrock_converse')).toBe('amazon');
    expect(owners.has('together_ai')).toBe(false);
  });

  it('matches names across spellings, including an API-version suffix', () => {
    expect(nameKey('Qwen3.8-Flash')).toBe('qwen3-8-flash');
    expect(nameKey('GPT-5.5 Pro (preview)')).toBe('gpt-5-5-pro');
    expect([...keyNames('amazon.nova-pro-v1:0')]).toContain('nova-pro');
    expect([...keyNames('dashscope/qwen3.8-flash')]).toEqual(['qwen3-8-flash']);
  });

  it('writes a report that says nothing was added and how to act on each row', () => {
    const report = renderGapReport(gaps, '2026-10-29', 'https://modelpricewatch.com');
    expect(report).toContain('3 models that the price feed carries');
    expect(report).toContain('| `gpt-5.5-pro` | $30 / $180 | [OpenAI GPT-5.5 Pro](https://x/a) |');
    expect(report).toContain('nothing has been added');
    expect(report).toContain('data/coverage-ignore.json');
    expect(renderGapReport(gaps.slice(0, 1), '2026-10-29', 'x')).toContain('One model that');
  });

  it('finds nothing when every gap is captured, published or ignored', () => {
    const none = findCoverageGaps({
      hints: HINTS,
      feed: FEED,
      allowlist: ALLOWLIST,
      published: PUBLISHED,
      ignore: [...IGNORE, { feedKey: '.', reason: 'everything' }],
    });
    expect(none).toEqual([]);
  });
});
