import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { matchFamily, type Allowlist } from './normalize';

/**
 * The real filter file, not a fixture. `pipeline.test.ts` carries its own
 * small allowlist, so a typo in `data/models-allowlist.json` was only ever
 * caught by the next morning's sync. The patterns here are the ones that
 * decide what reaches the public catalogue.
 */
const ALLOWLIST = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../data/models-allowlist.json'), 'utf8'),
) as Allowlist;

const familyOf = (key: string): string | undefined => matchFamily(key, ALLOWLIST)?.id;

describe('data/models-allowlist.json', () => {
  it('names a declared provider for every family', () => {
    const providers = new Set(ALLOWLIST.providers.map((provider) => provider.id));
    for (const family of ALLOWLIST.families) {
      expect(providers.has(family.providerId), `${family.id} -> ${family.providerId}`).toBe(true);
    }
  });

  it('has only patterns that compile, and unique family ids', () => {
    const patterns = [
      ...ALLOWLIST.globalExclude,
      ...ALLOWLIST.families.flatMap((family) => [...family.include, ...(family.exclude ?? [])]),
    ];
    for (const pattern of patterns) expect(() => new RegExp(pattern), pattern).not.toThrow();
    const ids = ALLOWLIST.families.map((family) => family.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('captures the models vendors list on their own pricing pages', () => {
    expect(familyOf('gpt-6-sol')).toBe('openai-gpt');
    expect(familyOf('gpt-6.1-sol')).toBe('openai-gpt');
    expect(familyOf('gpt-6-astra')).toBe('openai-gpt');
    expect(familyOf('gpt-6-luna')).toBe('openai-gpt');
    expect(familyOf('gemini/gemini-4-argon')).toBe('google-gemini');
    expect(familyOf('gemini/gemini-2.5-flash-lite')).toBe('google-gemini');
    expect(familyOf('xai/grok-build-0.1')).toBe('xai-grok');
    expect(familyOf('zai/glm-5.3-flash')).toBe('zai-glm');
    expect(familyOf('zai/glm-4.5-airx')).toBe('zai-glm');
    expect(familyOf('zai/glm-4-32b-0414-128k')).toBe('zai-glm');
    expect(familyOf('dashscope/qwen3.8-max')).toBe('alibaba-qwen');
  });

  it('captures the newer labs by their first-party keys only', () => {
    expect(familyOf('meta/muse-spark-1.3')).toBe('meta-muse');
    expect(familyOf('meta/muse-wonder-1.0')).toBe('meta-muse');
    expect(familyOf('xiaomi_mimo/mimo-v2.6-pro')).toBe('xiaomi-mimo');
    expect(familyOf('xiaomi_mimo/mimo-v2.6-flash')).toBe('xiaomi-mimo');
    expect(familyOf('inception/mercury-2')).toBe('inception-mercury');
    expect(familyOf('inception/mercury-2.5')).toBe('inception-mercury');
    expect(familyOf('azure_ai/MAI-Thinking-1')).toBe('microsoft-mai');
  });

  it('leaves out what the newer labs sell but a comparison cannot use', () => {
    const excluded = [
      'meta/muse-spark-1.2', // billed at the 1.3 rate: one row, like Grok 4.20
      'meta/muse-spark-1.3-contributor', // discount in exchange for training on your data
      'meta/muse-image-1.0', // not a chat model
      'inception/mercury-edit-2', // code-completion endpoint
      'azure_ai/MAI-Cyber-1-Flash', // restricted access
      'azure_ai/MAI-Code-1.1-Flash', // retiring
      'azure_ai/MAI-DS-R1', // a DeepSeek derivative
      'tencent/hy3', // other labs' models hosted by a cloud are not that lab's price
    ];
    for (const key of excluded) expect(familyOf(key), key).toBeUndefined();
  });

  it('does not treat the GPT-4 generation as reasoning models', () => {
    for (const key of ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini']) {
      const family = matchFamily(key, ALLOWLIST);
      expect(family?.id, key).toBe('openai-gpt-4');
      expect(family?.capabilities.reasoning, key).toBe(false);
    }
  });

  it('leaves out what is not a comparable chat model or is not sold in the open', () => {
    const excluded = [
      'gpt-5.5-cyber', // approval-only
      'gpt-rosalind-research', // approval-only
      'claude-mythos-5', // limited availability
      'gpt-4.1-nano', // retired in the feed while the page still lists it
      'gpt-4o-2024-08-06', // dated snapshot
      'gpt-4o-search-preview',
      'ft:gpt-4o-2024-08-06', // a fine-tune, not a base model
      'gemini/gemini-2.5-pro-preview-tts',
      'gemini/gemini-4-argon-latest',
      'xai/grok-build-latest',
      'xai/grok-code-fast',
      'zai/glm-4.5v',
      'zai/glm-4.5-flash', // free: no cost to compare
      'dashscope/glm-5.2', // another lab's model hosted by Alibaba
      'azure_ai/gpt-4.1', // somebody else's copy
    ];
    for (const key of excluded) expect(familyOf(key), key).toBeUndefined();
  });

  it('captures the first-party models a coverage check found missing on 2026-10-29', () => {
    expect(familyOf('gpt-5.5-pro')).toBe('openai-gpt');
    expect(familyOf('gpt-5.2-pro')).toBe('openai-gpt');
    expect(familyOf('mistral/codestral-2508')).toBe('mistral');
    expect(familyOf('moonshot/kimi-k3.1-pro')).toBe('moonshot-kimi');
    expect(familyOf('moonshot/kimi-k2.7-code')).toBe('moonshot-kimi');
    expect(familyOf('dashscope/qwen3.8-flash')).toBe('alibaba-qwen');
    expect(familyOf('command-r-plus-08-2024')).toBe('cohere-command');
    expect(familyOf('amazon.nova-micro-v1:0')).toBe('amazon-nova');
    // Still out: the codex variants, a floating alias, and a dated snapshot.
    expect(familyOf('gpt-5.2-codex')).toBeUndefined();
    expect(familyOf('mistral/codestral-latest')).toBeUndefined();
    expect(familyOf('gpt-5.5-pro-2026-04-23')).toBeUndefined();
  });

  it('keeps the established families matching what they always matched', () => {
    expect(familyOf('claude-opus-5-5')).toBe('anthropic-claude');
    expect(familyOf('gpt-5.6-sol')).toBe('openai-gpt');
    expect(familyOf('o3-mini')).toBe('openai-gpt');
    expect(familyOf('gemini/gemini-3.8-flash')).toBe('google-gemini');
    expect(familyOf('moonshot/kimi-k3')).toBe('moonshot-kimi');
    expect(familyOf('xai/grok-4.20')).toBe('xai-grok');
    expect(familyOf('dashscope/qwen3.7-max')).toBe('alibaba-qwen');
  });
});
