import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Catalog } from '@/lib/pricing/catalog';
import { SCHEMA_VERSION, type Model, type PricingCatalog } from '@/lib/pricing/types';
import { DEFAULT_SCENARIO, MAX_MODELS } from '@/lib/url/scenario';
import { useEstimator } from '@/state/useEstimator';
import { STARTERS, StarterPicker, activeStarter } from './StarterPicker';

function model(id: string, overrides: Partial<Model> = {}): Model {
  return {
    id,
    providerId: 'acme',
    displayName: id,
    status: 'current',
    contextWindow: 200_000,
    pricing: { input: 1, output: 4 },
    tokenizer: { kind: 'approx', charsPerToken: 3.6, cjkCharsPerToken: 1.5 },
    capabilities: { reasoning: false, vision: false },
    capabilityIndex: 50,
    provenance: { source: 'vendor', lastVerified: '2026-08-01' },
    ...overrides,
  } as Model;
}

const support = STARTERS.find((starter) => starter.id === 'support')!;

describe('STARTERS', () => {
  it('offers four or five examples with distinct ids and labels', () => {
    expect(STARTERS.length).toBeGreaterThanOrEqual(4);
    expect(STARTERS.length).toBeLessThanOrEqual(5);
    expect(new Set(STARTERS.map((s) => s.id)).size).toBe(STARTERS.length);
    expect(new Set(STARTERS.map((s) => s.label)).size).toBe(STARTERS.length);
  });

  // The sliders stop at 16,000 / 16,000 / 32,000 tokens, 30 turns and 50,000
  // conversations a day. A starter past those would put a thumb off the end of
  // its track and the label would disagree with the slider.
  it('keeps every value inside the range its slider can show', () => {
    for (const starter of STARTERS) {
      expect(starter.systemTokens).toBeGreaterThan(0);
      expect(starter.systemTokens).toBeLessThanOrEqual(16000);
      expect(starter.userTokens).toBeLessThanOrEqual(16000);
      expect(starter.outputTokens).toBeLessThanOrEqual(32000);
      expect(starter.turns).toBeGreaterThanOrEqual(1);
      expect(starter.turns).toBeLessThanOrEqual(30);
      expect(starter.conversationsPerDay).toBeGreaterThanOrEqual(10);
      expect(starter.conversationsPerDay).toBeLessThanOrEqual(50000);
      expect(starter.modelIds.length).toBeLessThanOrEqual(MAX_MODELS);
    }
  });

  // Otherwise a first-time visitor's untouched page would show a chip pressed
  // that they never pressed.
  it('does not match the default scenario', () => {
    expect(activeStarter(DEFAULT_SCENARIO)).toBeUndefined();
  });
});

describe('StarterPicker', () => {
  it('renders real buttons, presses the one the numbers match, and reports clicks', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const scenario = {
      ...DEFAULT_SCENARIO,
      systemTokens: support.systemTokens,
      userTokens: support.userTokens,
      outputTokens: support.outputTokens,
      turns: support.turns,
      conversationsPerDay: support.conversationsPerDay,
    };
    render(<StarterPicker scenario={scenario} onPick={onPick} />);

    expect(screen.getByRole('group', { name: 'Start from an example:' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Support chatbot' })).toHaveAttribute('aria-pressed', 'true');
    for (const other of STARTERS.filter((s) => s !== support)) {
      expect(screen.getByRole('button', { name: other.label })).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.getByText(/Illustrative starting points/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Coding assistant' }));
    expect(onPick).toHaveBeenCalledWith(STARTERS.find((s) => s.id === 'coding'));
  });

  it('lets go of the chip once any value it set is changed', () => {
    const scenario = {
      ...DEFAULT_SCENARIO,
      systemTokens: support.systemTokens,
      userTokens: support.userTokens,
      outputTokens: support.outputTokens,
      turns: support.turns + 1,
      conversationsPerDay: support.conversationsPerDay,
    };
    expect(activeStarter(scenario)).toBeUndefined();
  });
});

describe('useEstimator.applyStarter', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  const catalogWith = (models: Model[]) =>
    new Catalog({
      schemaVersion: SCHEMA_VERSION,
      generatedAt: '2026-08-01T06:00:00.000Z',
      providers: [{ id: 'acme', name: 'Acme', country: 'US' }],
      models,
    } as PricingCatalog);

  it('fills the workload and swaps in the suggested models that exist, skipping the rest', () => {
    const [first, second, third] = support.modelIds;
    const catalog = catalogWith([
      model('other-a'),
      model('other-b'),
      model(first!),
      // Shut down since the list was written: kept as a record, never selected.
      model(second!, { status: 'deprecated' }),
      model(third!),
    ]);
    const { result } = renderHook(() => useEstimator(catalog));

    act(() => result.current.applyStarter(support));

    const { scenario } = result.current;
    expect(scenario.systemTokens).toBe(support.systemTokens);
    expect(scenario.userTokens).toBe(support.userTokens);
    expect(scenario.outputTokens).toBe(support.outputTokens);
    expect(scenario.turns).toBe(support.turns);
    expect(scenario.conversationsPerDay).toBe(support.conversationsPerDay);
    // The fourth id is not in this catalog at all; the second is shut down.
    expect(scenario.modelIds).toEqual([first, third]);
    expect(window.location.search).toMatch(`sys=${support.systemTokens}`);
    expect(window.location.search).toMatch(`cpd=${support.conversationsPerDay}`);
  });

  it('keeps the current models when fewer than two suggestions are available', () => {
    const catalog = catalogWith([model('other-a'), model('other-b'), model(support.modelIds[0]!)]);
    const { result } = renderHook(() => useEstimator(catalog));
    const before = result.current.scenario.modelIds;

    act(() => result.current.applyStarter(support));

    expect(result.current.scenario.modelIds).toEqual(before);
    expect(result.current.scenario.turns).toBe(support.turns);
  });

  // A field left in Paste mode would have its pasted count mirrored straight
  // back over the example's number, so the starter would appear to do nothing.
  it('puts pasted fields back on their sliders so the example takes effect', () => {
    const catalog = catalogWith([model('other-a'), model('other-b')]);
    const { result } = renderHook(() => useEstimator(catalog));

    act(() => {
      result.current.setFieldMode('system', 'paste');
      result.current.setFieldText('system', 'You are a helpful assistant.');
    });
    act(() => result.current.applyStarter(support));

    expect(result.current.fields.system.mode).toBe('slider');
    // The text is kept, so switching back to Paste does not lose it.
    expect(result.current.fields.system.text).toBe('You are a helpful assistant.');
    expect(result.current.scenario.systemTokens).toBe(support.systemTokens);
  });
});
