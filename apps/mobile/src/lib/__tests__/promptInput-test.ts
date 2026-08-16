import { type Model } from '@promptspend/core';

import {
  clampPromptText,
  compareModelsForInputs,
  createDefaultPromptInputs,
  MAX_PASTE_CHARS,
  promptFieldTokens,
  workloadForModel,
  type PromptInputState,
} from '@/lib/promptInput';

function model(id: string, charsPerToken: number, input: number, output: number): Model {
  return {
    capabilities: { reasoning: false, vision: false },
    contextWindow: 128_000,
    displayName: id,
    id,
    pricing: { input, output },
    provenance: { lastVerified: '2026-08-13', source: 'vendor' },
    providerId: 'test',
    status: 'current',
    tokenizer: { charsPerToken, cjkCharsPerToken: 1.5, kind: 'approx' },
  };
}

const compact = model('compact-tokenizer', 2, 1, 2);
const roomy = model('roomy-tokenizer', 8, 4, 12);
const numericValues = {
  outputTokens: 900,
  systemTokens: 800,
  turns: 6,
  userTokens: 400,
};
const scale = {
  conversationsPerDay: 100,
  monthlyActiveUsers: 50,
  revenuePerUserPerMonth: 0,
};

describe('private prompt input conversion', () => {
  test('starts every field in numeric mode without retaining text', () => {
    expect(createDefaultPromptInputs()).toEqual({
      output: { mode: 'tokens', text: '' },
      system: { mode: 'tokens', text: '' },
      user: { mode: 'tokens', text: '' },
    });
  });

  test('keeps numeric values unchanged in token mode', () => {
    expect(promptFieldTokens({ mode: 'tokens', text: 'ignored private text' }, 731, compact)).toBe(731);
  });

  test('empty pasted text becomes zero rather than restoring the numeric fallback', () => {
    expect(promptFieldTokens({ mode: 'text', text: '' }, 731, compact)).toBe(0);
  });

  test('derives a separate workload for each model tokenizer profile', () => {
    const inputs: PromptInputState = {
      output: { mode: 'text', text: 'z'.repeat(80) },
      system: { mode: 'text', text: 'x'.repeat(80) },
      user: { mode: 'text', text: 'y'.repeat(80) },
    };

    expect(workloadForModel(compact, inputs, numericValues)).toMatchObject({
      outputTokens: 40,
      systemTokens: 40,
      turns: 6,
      userTokens: 40,
    });
    expect(workloadForModel(roomy, inputs, numericValues)).toMatchObject({
      outputTokens: 10,
      systemTokens: 10,
      turns: 6,
      userTokens: 10,
    });
  });

  test('clamps oversized text at the native privacy and performance limit', () => {
    const oversized = `SENTINEL_PRIVATE_PROMPT${'x'.repeat(MAX_PASTE_CHARS)}`;
    const clamped = clampPromptText(oversized);

    expect(clamped).toHaveLength(MAX_PASTE_CHARS);
    expect(clamped).toBe(oversized.slice(0, MAX_PASTE_CHARS));
  });

  test('sorts model-specific pasted-text results and recomputes global deltas', () => {
    const inputs: PromptInputState = {
      output: { mode: 'text', text: 'response '.repeat(100) },
      system: { mode: 'text', text: 'policy '.repeat(100) },
      user: { mode: 'text', text: 'question '.repeat(100) },
    };
    const rows = compareModelsForInputs([roomy, compact], inputs, numericValues, scale);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.isCheapest).toBe(true);
    expect(rows[0]?.deltaPerMonth).toBe(0);
    expect(rows[1]?.scaled.perMonth).toBeGreaterThanOrEqual(rows[0]?.scaled.perMonth ?? 0);
    expect(rows[1]?.deltaPerMonth).toBeCloseTo(
      (rows[1]?.scaled.perMonth ?? 0) - (rows[0]?.scaled.perMonth ?? 0),
    );
  });

  test('handles empty and zero-cost comparisons deterministically', () => {
    const freeA = model('a-free', 4, 0, 0);
    const freeB = model('b-free', 4, 0, 0);
    const empty = createDefaultPromptInputs();

    expect(compareModelsForInputs([], empty, numericValues, scale)).toEqual([]);
    expect(compareModelsForInputs([freeB, freeA], empty, numericValues, scale)).toEqual([
      expect.objectContaining({ deltaPerMonth: 0, isCheapest: true, multipleOfCheapest: 1 }),
      expect.objectContaining({ deltaPerMonth: 0, isCheapest: true, multipleOfCheapest: 1 }),
    ]);
  });
});
