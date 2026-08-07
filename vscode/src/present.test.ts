import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Catalog } from '@/lib/pricing/catalog';
import type { PricingCatalog } from '@/lib/pricing/types';
import { decodeScenario } from '@/lib/url/scenario';
import { ModelIndex, type ModelMatch } from './scan';
import { inlineText, hoverMarkdown, warningsFor, estimatorLink } from './present';

let catalog: Catalog;
let index: ModelIndex;

beforeAll(() => {
  const raw = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../public/data/pricing.json'), 'utf8'),
  ) as PricingCatalog;
  catalog = new Catalog(raw);
  index = new ModelIndex(catalog);
});

const matchIn = (text: string): ModelMatch => {
  const [first] = index.scan(text).matches;
  if (!first) throw new Error(`no model matched in: ${text}`);
  return first;
};

describe('inlineText', () => {
  it('is terse in compact mode', () => {
    expect(inlineText(matchIn('"claude-sonnet-5"'), 'compact')).toMatch(/^\$[\d.]+ \/ \$[\d.]+ per M$/);
  });

  it('carries the confirmation date in full mode', () => {
    const text = inlineText(matchIn('"claude-sonnet-5"'), 'full');
    expect(text).toContain('confirmed 20');
  });

  it('renders nothing when switched off', () => {
    expect(inlineText(matchIn('"claude-sonnet-5"'), 'off')).toBeNull();
  });

  it('never invents a rate the catalog does not carry', () => {
    // Every model, every mode: the annotation may only contain numbers that are
    // in the row. A `$NaN` or `$undefined` reaching a gutter would be the worst
    // possible failure for this project specifically.
    for (const model of catalog.models) {
      const match: ModelMatch = { written: model.id, model, start: 0, end: model.id.length };
      for (const detail of ['compact', 'full'] as const) {
        const text = inlineText(match, detail);
        expect(text, `${model.id} (${detail})`).not.toMatch(/NaN|undefined|null|\$—/);
      }
    }
  });
});

describe('impossible requests are named, not priced', () => {
  const model = () => matchIn('"claude-sonnet-5"').model;

  it('omits the cost entirely when the cap exceeds what the model can emit', () => {
    // From a review screenshot: the line read "max out $5,000  ⚠ above model max".
    // That $5,000 is money nobody will ever be billed — the request is rejected,
    // not charged. The warning has to replace the figure, not sit beside it.
    const text = inlineText({ written: 'x', model: model(), start: 0, end: 1 }, 'compact', {
      maxTokens: 999_999_999,
      outputCostUsd: 5000,
      exceedsModelMax: true,
    });
    expect(text).toContain('above model max');
    expect(text).not.toContain('max out');
    expect(text).not.toContain('5,000');
  });

  it('still shows the cost for a cap the model can meet', () => {
    const text = inlineText({ written: 'x', model: model(), start: 0, end: 1 }, 'compact', {
      maxTokens: 4096,
      outputCostUsd: 0.06144,
      exceedsModelMax: false,
    });
    expect(text).toContain('max out');
    expect(text).not.toContain('above model max');
  });
});

describe('estimatorLink', () => {
  it('round-trips through the site’s own decoder', () => {
    // Built with encodeScenario rather than by concatenating `?m=`, so this is
    // the test that a parameter rename cannot silently break the link.
    const url = new URL(estimatorLink('claude-sonnet-5'));
    expect(decodeScenario(url.search).modelIds).toEqual(['claude-sonnet-5']);
  });
});

describe('hoverMarkdown', () => {
  it('leads with the model and its provider', () => {
    const markdown = hoverMarkdown(matchIn('"claude-sonnet-5"'), catalog);
    expect(markdown.startsWith('### ')).toBe(true);
    expect(markdown).toContain('Anthropic');
  });

  it('states both rates and the context window', () => {
    const markdown = hoverMarkdown(matchIn('"claude-sonnet-5"'), catalog);
    expect(markdown).toContain('| Input |');
    expect(markdown).toContain('| Output |');
    expect(markdown).toContain('| Context |');
  });

  it('always says where the number came from and when', () => {
    for (const model of catalog.models) {
      const markdown = hoverMarkdown({ written: model.id, model, start: 0, end: 0 }, catalog);
      expect(markdown, model.id).toMatch(/confirmed \d{4}-\d{2}-\d{2}\./);
    }
  });

  it('explains a long-context tier where the provider publishes one', () => {
    const markdown = hoverMarkdown(matchIn('"gpt-5.6-sol"'), catalog);
    expect(markdown).toContain('whole request');
  });

  it('warns that cache writes are billed', () => {
    const markdown = hoverMarkdown(matchIn('"gpt-5.6-sol"'), catalog);
    expect(markdown).toContain('Cache writes are billed');
  });

  it('produces no NaN or undefined for any model in the catalog', () => {
    for (const model of catalog.models) {
      const markdown = hoverMarkdown({ written: model.id, model, start: 0, end: 0 }, catalog);
      expect(markdown, model.id).not.toMatch(/NaN|undefined/);
    }
  });
});

describe('warningsFor', () => {
  it('explains a routing alias and says which row was priced', () => {
    const match = matchIn('"gpt-5.6"');
    const warnings = warningsFor(match);
    expect(warnings.join(' ')).toContain('routing alias');
    expect(match.model.id).toBe('gpt-5.6-sol');
  });

  it('says nothing for an ordinary, verified, current model', () => {
    const model = catalog.models.find(
      (m) => m.status === 'current' && !m.aliasOf && !m.provenance.needsReview && !m.provenance.stale,
    );
    expect(model, 'catalog has no plain current model to test with').toBeDefined();
    expect(warningsFor({ written: model!.id, model: model!, start: 0, end: 0 })).toEqual([]);
  });

  it('flags a disputed price rather than presenting it plainly', () => {
    const disputed = {
      ...catalog.models[0]!,
      provenance: { ...catalog.models[0]!.provenance, needsReview: true },
    };
    const warnings = warningsFor({ written: disputed.id, model: disputed, start: 0, end: 0 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('disagree');
  });
});

describe('a promotional rate is the rate', () => {
  // The extension shipped 0.1.7 quoting two different prices for one model at
  // one moment: the gutter and the hover read `pricing.input` raw and showed
  // $3/$15 for claude-sonnet-5, while Estimate selection went through
  // `effectivePricing` and showed $2/$10. Only `estimate.ts` had been converted
  // when the same defect was fixed in the MCP server and the public API.
  const INSIDE = new Date('2026-08-06T00:00:00Z');
  const AFTER = new Date('2099-01-01T00:00:00Z');

  const promoted = () => {
    const model = catalog.get('claude-sonnet-5');
    return model?.pricing.intro ? model : undefined;
  };

  it('quotes the promoted rate in the gutter', () => {
    const model = promoted();
    if (!model) return; // promotion ended; the standard rate is now correct
    const text = inlineText(matchIn('"claude-sonnet-5"'), 'compact', undefined, INSIDE);
    expect(text).toContain(`$${model.pricing.intro!.input}`);
    expect(text).not.toContain(`$${model.pricing.input} /`);
  });

  it('puts the promoted rate in the hover table, not in a footnote', () => {
    const model = promoted();
    if (!model) return;
    const md = hoverMarkdown(matchIn('"claude-sonnet-5"'), catalog, undefined, INSIDE);
    expect(md).toContain(`| Input | $${model.pricing.intro!.input} per 1M tokens |`);
    // And says what replaces it, rather than announcing the promotion as news.
    expect(md).toContain('promotional and hold until');
  });

  it('reverts to the standard rate once the window has passed', () => {
    const model = promoted();
    if (!model) return;
    const text = inlineText(matchIn('"claude-sonnet-5"'), 'compact', undefined, AFTER);
    expect(text).toContain(`$${model.pricing.input}`);
    const md = hoverMarkdown(matchIn('"claude-sonnet-5"'), catalog, undefined, AFTER);
    expect(md).not.toContain('promotional and hold until');
  });

  it('leaves a model with no promotion alone', () => {
    const model = catalog.get('claude-sonnet-4-6');
    if (!model) return;
    expect(model.pricing.intro).toBeUndefined();
    const text = inlineText(matchIn('"claude-sonnet-4-6"'), 'compact', undefined, INSIDE);
    expect(text).toContain(`$${model.pricing.input}`);
  });
});
