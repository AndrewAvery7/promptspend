import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Catalog } from '../pricing/catalog';
import type { Model, PricingCatalog } from '../pricing/types';
import { findCheaperModels, DEFAULT_WORKLOAD, DEFAULT_SCALE } from './cheaper';

let catalog: Catalog;

beforeAll(() => {
  const raw = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../../public/data/pricing.json'), 'utf8'),
  ) as PricingCatalog;
  catalog = new Catalog(raw);
});

const model = (id: string): Model => {
  const found = catalog.get(id);
  if (!found) throw new Error(`${id} is not in the catalog`);
  return found;
};

describe('findCheaperModels', () => {
  it('returns only models that actually cost less', () => {
    const expensive = [...catalog.primaryModels].sort((a, b) => b.pricing.output - a.pricing.output)[0]!;
    const result = findCheaperModels(catalog, expensive);

    expect(result.targetRow).toBeDefined();
    for (const row of result.cheaper) {
      expect(row.scaled.perMonth, row.model.id).toBeLessThan(result.targetRow!.scaled.perMonth);
    }
  });

  it('orders them cheapest first', () => {
    const expensive = [...catalog.primaryModels].sort((a, b) => b.pricing.output - a.pricing.output)[0]!;
    const costs = findCheaperModels(catalog, expensive).cheaper.map((r) => r.scaled.perMonth);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });

  it('never offers a routing alias as an alternative', () => {
    // An alias and its target are one purchasable model. Offering `gpt-5.6` as a
    // saving over `gpt-5.6-sol` would be offering someone what they already have.
    for (const target of catalog.primaryModels.slice(0, 8)) {
      for (const row of findCheaperModels(catalog, target).cheaper) {
        expect(row.model.aliasOf, `${target.id} was offered the alias ${row.model.id}`).toBeUndefined();
      }
    }
  });

  it('never offers the target as an alternative to itself', () => {
    const target = model('gpt-5');
    expect(findCheaperModels(catalog, target).cheaper.map((r) => r.model.id)).not.toContain('gpt-5');
  });

  it('excludes stale and non-current rows', () => {
    for (const target of catalog.primaryModels.slice(0, 8)) {
      for (const row of findCheaperModels(catalog, target).cheaper) {
        expect(row.model.status, row.model.id).toBe('current');
        expect(row.model.provenance.stale, row.model.id).not.toBe(true);
      }
    }
  });
});

describe('the capability bar', () => {
  it('defaults to the target’s own index and excludes anything below it', () => {
    const target = catalog.primaryModels.find((m) => m.capabilityIndex !== undefined);
    expect(target, 'catalog has no scored model').toBeDefined();

    const result = findCheaperModels(catalog, target!);
    expect(result.capabilityBar).toBe(target!.capabilityIndex);
    for (const row of result.cheaper) {
      expect(row.model.capabilityIndex, row.model.id).toBeGreaterThanOrEqual(target!.capabilityIndex!);
    }
  });

  it('excludes unscored models rather than assuming they clear the bar', () => {
    // A model that *might* be worse is not an answer to "what is cheaper and as
    // good". The index is illustrative, so an absent one cannot be defaulted.
    const target = catalog.primaryModels.find((m) => m.capabilityIndex !== undefined)!;
    for (const row of findCheaperModels(catalog, target).cheaper) {
      expect(row.model.capabilityIndex, row.model.id).toBeDefined();
    }
  });

  it('applies no bar when the target has no index', () => {
    const unscored = catalog.primaryModels.find((m) => m.capabilityIndex === undefined);
    if (!unscored) return;
    expect(findCheaperModels(catalog, unscored).capabilityBar).toBeUndefined();
  });

  it('explains itself rather than returning bare emptiness when nothing qualifies', () => {
    const result = findCheaperModels(catalog, model('gpt-5'), { minCapability: 101 });
    expect(result.cheaper).toEqual([]);
    expect(result.note).toContain('illustrative');
  });
});

describe('defaults', () => {
  it('models a conversation with history rather than a single turn', () => {
    // The workload is chosen to exercise history compounding; a one-turn
    // default would hide the effect the comparison exists to reveal.
    expect(DEFAULT_WORKLOAD.turns).toBeGreaterThan(1);
    expect(DEFAULT_SCALE.conversationsPerDay).toBeGreaterThan(0);
  });

  it('honours a caller-supplied workload', () => {
    const target = model('gpt-5');
    const heavy = findCheaperModels(catalog, target, {
      workload: { ...DEFAULT_WORKLOAD, outputTokens: DEFAULT_WORKLOAD.outputTokens * 100 },
    });
    const light = findCheaperModels(catalog, target);
    expect(heavy.targetRow!.scaled.perMonth).toBeGreaterThan(light.targetRow!.scaled.perMonth);
  });
});
