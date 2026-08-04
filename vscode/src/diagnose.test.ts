import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Catalog } from '@/lib/pricing/catalog';
import type { Model, PricingCatalog } from '@/lib/pricing/types';
import { ModelIndex, type ModelMatch } from './scan';
import { diagnose } from './diagnose';

let catalog: Catalog;
let index: ModelIndex;

beforeAll(() => {
  const raw = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../public/data/pricing.json'), 'utf8'),
  ) as PricingCatalog;
  catalog = new Catalog(raw);
  index = new ModelIndex(catalog);
});

const matchFor = (model: Model): ModelMatch => ({
  written: model.id,
  model,
  start: 0,
  end: model.id.length,
});

const kinds = (matches: readonly ModelMatch[]) => diagnose(matches, catalog).map((f) => f.kind);

describe('facts the catalog knows', () => {
  it('flags a disputed price', () => {
    const model = catalog.models[0]!;
    const disputed = { ...model, provenance: { ...model.provenance, needsReview: true } };
    expect(kinds([matchFor(disputed)])).toContain('disputed');
  });

  it('carries the review note when the catalog has one', () => {
    const model = catalog.models[0]!;
    const disputed = {
      ...model,
      provenance: { ...model.provenance, needsReview: true, reviewNote: 'OpenRouter says $9.' },
    };
    expect(diagnose([matchFor(disputed)], catalog)[0]?.message).toBe('OpenRouter says $9.');
  });

  it('flags a deprecated model', () => {
    const model = { ...catalog.models[0]!, status: 'deprecated' as const };
    expect(kinds([matchFor(model)])).toContain('deprecated');
  });

  it('flags a legacy model separately from a deprecated one', () => {
    const model = { ...catalog.models[0]!, status: 'legacy' as const };
    const found = kinds([matchFor(model)]);
    expect(found).toContain('legacy');
    expect(found).not.toContain('deprecated');
  });

  it('flags a row upstream has stopped listing', () => {
    const model = catalog.models[0]!;
    const stale = { ...model, provenance: { ...model.provenance, stale: true } };
    expect(kinds([matchFor(stale)])).toContain('stale');
  });

  it('attaches the vendor page as the diagnostic code target where there is one', () => {
    const model = catalog.models.find((m) => m.provenance.verifiedUrl !== undefined)!;
    const deprecated = { ...model, status: 'deprecated' as const };
    expect(diagnose([matchFor(deprecated)], catalog)[0]?.url).toBe(model.provenance.verifiedUrl);
  });
});

describe('noise control', () => {
  it('reports a model once however many times it appears', () => {
    // A file listing the same model eight times should not produce eight
    // identical entries in the Problems panel.
    const model = { ...catalog.models[0]!, status: 'deprecated' as const };
    const repeated = Array.from({ length: 8 }, () => matchFor(model));
    expect(kinds(repeated).filter((k) => k === 'deprecated')).toHaveLength(1);
  });

  it('says nothing about an ordinary current, verified model', () => {
    const plain = catalog.primaryModels.find(
      (m) =>
        m.status === 'current' &&
        !m.provenance.needsReview &&
        !m.provenance.stale &&
        m.capabilityIndex === undefined,
    );
    if (!plain) return;
    expect(kinds([matchFor(plain)])).toEqual([]);
  });

  it('does not suggest an alternative when the saving is not material', () => {
    // The cheapest scored model has nothing meaningfully cheaper above its bar.
    const scored = catalog.primaryModels.filter((m) => m.capabilityIndex !== undefined);
    const cheapest = [...scored].sort((a, b) => a.pricing.output - b.pricing.output)[0];
    if (!cheapest) return;
    expect(kinds([matchFor(cheapest)])).not.toContain('cheaper-available');
  });
});

describe('the cheaper-model suggestion', () => {
  it('offers one where a scored sibling is dramatically cheaper', () => {
    const scored = catalog.primaryModels.filter((m) => m.capabilityIndex !== undefined);
    const dearest = [...scored].sort((a, b) => b.pricing.output - a.pricing.output)[0];
    expect(dearest, 'catalog has no scored models').toBeDefined();

    const found = diagnose([matchFor(dearest!)], catalog).find((f) => f.kind === 'cheaper-available');
    expect(found).toBeDefined();
    // Wording is the point: an illustrative index cannot support "switch to this".
    expect(found!.message).toContain('worth testing');
    expect(found!.message).toContain('not a benchmark');
  });

  it('stays silent when the model has no capability score to compare against', () => {
    // Without a bar, every candidate is a guess about quality. Saying nothing
    // beats recommending blind.
    const unscored = catalog.primaryModels.find((m) => m.capabilityIndex === undefined);
    if (!unscored) return;
    expect(kinds([matchFor(unscored)])).not.toContain('cheaper-available');
  });
});

describe('against a real file', () => {
  it('produces findings that all point at a real range in the text', () => {
    const source = `
model = "kimi-k2.6"
fallback = "gpt-5"
`;
    const { matches } = index.scan(source);
    for (const finding of diagnose(matches, catalog)) {
      expect(source.slice(finding.match.start, finding.match.end)).toBe(finding.match.written);
    }
  });

  it('never produces an empty or NaN-bearing message', () => {
    const { matches } = index.scan(catalog.models.map((m) => `"${m.id}"`).join('\n'));
    for (const finding of diagnose(matches, catalog)) {
      expect(finding.message.length, finding.kind).toBeGreaterThan(20);
      expect(finding.message, finding.kind).not.toMatch(/NaN|undefined/);
    }
  });
});
