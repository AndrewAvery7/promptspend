import pricing from '../../../public/data/pricing.json';
import {
  MAX_PASTE_CHARS,
  clampPromptText,
  compareModelsForInputs,
  createDefaultPromptInputs,
  promptFieldTokens,
  workloadForModel,
} from '../../../apps/mobile/src/lib/promptInput';
import { buildComparisonShareText } from '@/lib/engine/share';
import { Catalog } from '@/lib/pricing/catalog';
import type { PricingCatalog } from '@/lib/pricing/types';

const catalog = new Catalog(pricing as PricingCatalog);
const claude = catalog.get('claude-sonnet-5')!;
const gpt = catalog.get('gpt-5.4')!;
const manual = { systemTokens: 800, userTokens: 400, outputTokens: 900, turns: 6 };

describe('mobile pasted prompt inputs', () => {
  it('starts in manual token mode without retaining text', () => {
    expect(createDefaultPromptInputs()).toEqual({
      system: { mode: 'tokens', text: '' },
      user: { mode: 'tokens', text: '' },
      output: { mode: 'tokens', text: '' },
    });
  });

  it('passes manual token counts through unchanged', () => {
    const inputs = createDefaultPromptInputs();
    expect(workloadForModel(claude, inputs, manual)).toEqual(manual);
  });

  it('uses zero for empty pasted text instead of the hidden manual value', () => {
    const inputs = createDefaultPromptInputs();
    inputs.system.mode = 'text';
    expect(promptFieldTokens(inputs.system, 800, claude)).toBe(0);
  });

  it('estimates the same text independently for each model profile', () => {
    const inputs = createDefaultPromptInputs();
    inputs.system = { mode: 'text', text: 'a'.repeat(3_600) };

    const claudeWorkload = workloadForModel(claude, inputs, manual);
    const gptWorkload = workloadForModel(gpt, inputs, manual);

    expect(claudeWorkload.systemTokens).toBe(1_000);
    expect(gptWorkload.systemTokens).not.toBe(claudeWorkload.systemTokens);
    expect(claudeWorkload.userTokens).toBe(400);
    expect(claudeWorkload.outputTokens).toBe(900);
  });

  it('clamps oversized clipboard text to the documented boundary', () => {
    const oversized = 'x'.repeat(MAX_PASTE_CHARS + 25);
    expect(clampPromptText(oversized)).toHaveLength(MAX_PASTE_CHARS);
    expect(clampPromptText('short')).toBe('short');
  });

  it('handles emoji, combining marks, line breaks, and CJK as a finite estimate', () => {
    const inputs = createDefaultPromptInputs();
    inputs.user = { mode: 'text', text: 'Hello 👋\r\ne\u0301\n你好世界' };
    const tokens = workloadForModel(claude, inputs, manual).userTokens;
    expect(Number.isInteger(tokens)).toBe(true);
    expect(tokens).toBeGreaterThan(0);
  });

  it('re-ranks four per-model workloads and never puts prompt text in sharing', () => {
    const sentinel = 'PRIVATE-PROMPT-SENTINEL-93472';
    const inputs = createDefaultPromptInputs();
    inputs.system = { mode: 'text', text: `${sentinel} ${'architecture '.repeat(200)}` };
    inputs.user = { mode: 'text', text: 'Summarize the tradeoffs.' };

    const models = catalog.getAll([
      'claude-sonnet-5',
      'gpt-5.4',
      'deepseek-deepseek-v3.2',
      'moonshot-kimi-k2.5',
    ]);
    const rows = compareModelsForInputs(
      models,
      inputs,
      manual,
      { conversationsPerDay: 2500, monthlyActiveUsers: 1, revenuePerUserPerMonth: 0 },
      { cachedInputShare: 0 },
    );

    expect(rows).toHaveLength(4);
    expect(rows[0]?.isCheapest).toBe(true);
    expect(rows.map((row) => row.scaled.perMonth)).toEqual(
      [...rows].map((row) => row.scaled.perMonth).sort((left, right) => left - right),
    );
    expect(buildComparisonShareText(rows)).not.toContain(sentinel);
    expect(JSON.stringify(rows)).not.toContain(sentinel);
  });

  it('handles an empty comparison and stable zero-cost ties', () => {
    const inputs = createDefaultPromptInputs();
    const scale = { conversationsPerDay: 2500, monthlyActiveUsers: 1, revenuePerUserPerMonth: 0 };
    expect(compareModelsForInputs([], inputs, manual, scale)).toEqual([]);

    const zeroA = { ...claude, displayName: 'Zero A', id: 'zero-a', pricing: { input: 0, output: 0 } };
    const zeroB = { ...gpt, displayName: 'Zero B', id: 'zero-b', pricing: { input: 0, output: 0 } };
    const rows = compareModelsForInputs([zeroB, zeroA], inputs, manual, scale);

    expect(rows.map((row) => row.model.id)).toEqual(['zero-a', 'zero-b']);
    expect(rows.every((row) => row.multipleOfCheapest === 1)).toBe(true);
  });
});
