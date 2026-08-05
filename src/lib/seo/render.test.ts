import { describe, expect, it } from 'vitest';
import type { Model, PricingCatalog } from '@/lib/pricing/types';
import { SCHEMA_VERSION } from '@/lib/pricing/types';
import { buildPages } from './pages';
import {
  escapeHtml,
  renderComparisonPage,
  renderComparisonsIndex,
  renderModelPage,
  renderModelsIndex,
  renderProviderPage,
  renderProvidersIndex,
  type RenderContext,
} from './render';

const ASOF = new Date('2026-08-02T00:00:00Z');

/** Records what it was asked to hash, so the CSP and the emitted block can be
 *  checked against each other without pulling `node:crypto` into a jsdom test. */
function recordingContext(overrides: Partial<RenderContext> = {}): RenderContext & { hashed: string[] } {
  const hashed: string[] = [];
  return {
    siteUrl: 'https://promptspend.com',
    basePath: '/',
    cssPath: '/assets/pages.abc12345.css',
    generatedAt: '2026-08-02T02:00:00.000Z',
    apiUrl: 'https://promptspend.dev',
    hashInline: (content: string) => {
      hashed.push(content);
      return `LEN${content.length}`;
    },
    hashed,
    ...overrides,
  };
}

function model(id: string, overrides: Partial<Model> = {}): Model {
  return {
    id,
    providerId: 'openai',
    displayName: id,
    status: 'current',
    contextWindow: 400_000,
    maxOutput: 100_000,
    capabilityIndex: 70,
    pricing: { input: 1, output: 4 },
    tokenizer: { kind: 'tiktoken', encoding: 'o200k_base' },
    capabilities: { reasoning: false, vision: false },
    provenance: { source: 'vendor', lastVerified: '2026-08-01' },
    ...overrides,
  };
}

function catalog(models: Model[]): PricingCatalog {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: '2026-08-02T02:00:00.000Z',
    providers: [
      { id: 'openai', name: 'OpenAI', country: 'US', pricingUrl: 'https://openai.com/api/pricing/' },
      { id: 'anthropic', name: 'Anthropic', country: 'US' },
    ],
    models,
  };
}

function everyPage(models: Model[]): { html: string; ctx: ReturnType<typeof recordingContext> }[] {
  const ctx = recordingContext();
  const set = buildPages(catalog(models), { asOf: ASOF });
  return [
    renderModelsIndex(set, ctx),
    renderProvidersIndex(set, ctx),
    renderComparisonsIndex(set, ctx),
    ...set.models.map((page) => renderModelPage(page, ctx)),
    ...set.providers.map((page) => renderProviderPage(page, ctx)),
    ...set.comparisons.map((page) => renderComparisonPage(page, ctx)),
  ].map((html) => ({ html, ctx }));
}

const SAMPLE = [model('gpt-5'), model('claude-opus-5', { providerId: 'anthropic' })];

describe('escapeHtml', () => {
  it('neutralises every character that can end an attribute or open a tag', () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;',
    );
  });
});

describe('rendered pages', () => {
  it('escapes a display name that arrived from upstream carrying markup', () => {
    const hostile = model('evil', { displayName: '<script>alert(1)</script>' });
    const set = buildPages(catalog([hostile]), { asOf: ASOF });
    const html = renderModelPage(set.models[0]!, recordingContext());

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('never lets a display name break out of the JSON-LD block', () => {
    const hostile = model('evil', { displayName: 'x</script><script>alert(1)</script>' });
    const set = buildPages(catalog([hostile]), { asOf: ASOF });
    const html = renderModelPage(set.models[0]!, recordingContext());

    // One script element, and it is the data block.
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain('\\u003c/script>');
  });

  it('hashes exactly the JSON-LD it emits, so the policy cannot drift', () => {
    for (const { html, ctx } of everyPage(SAMPLE)) {
      const emitted = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
      expect(emitted).toBeDefined();
      expect(ctx.hashed).toContain(emitted);
      expect(html).toContain(`script-src &#39;sha256-LEN${emitted!.length}&#39;`);
    }
  });

  it('emits JSON-LD that parses', () => {
    for (const { html } of everyPage(SAMPLE)) {
      const emitted = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!;
      const parsed = JSON.parse(emitted) as { '@context': string; '@graph': unknown[] };
      expect(parsed['@context']).toBe('https://schema.org');
      expect(parsed['@graph'].length).toBeGreaterThan(0);
    }
  });

  it('carries a self-referencing absolute canonical', () => {
    const set = buildPages(catalog(SAMPLE), { asOf: ASOF });
    const html = renderModelPage(set.models[0]!, recordingContext());

    expect(html).toContain(`<link rel="canonical" href="https://promptspend.com${set.models[0]!.path}" />`);
    expect(html).toContain(
      `<meta property="og:url" content="https://promptspend.com${set.models[0]!.path}" />`,
    );
  });

  it('offers the API in the footer, since llms.txt tells readers to prefer it', () => {
    // These are the most-crawled pages here, and llms.txt says in as many words:
    // "Prefer the API over scraping these pages." Their footer offered the
    // calculator, the indexes and the source, and no way to reach the API at
    // all — two generated artifacts disagreeing about how a machine should read
    // the catalog, each looking perfectly fine on its own.
    for (const { html, ctx } of everyPage(SAMPLE)) {
      expect(html).toContain(`<a href="${ctx.apiUrl}">Pricing API</a>`);
    }
  });

  it('uses no inline style attributes, which the policy would silently drop', () => {
    // style-src is 'self' with no 'unsafe-inline'. An inline style attribute
    // would not error — it would just not apply, on every page at once.
    for (const { html } of everyPage(SAMPLE)) {
      expect(html).not.toMatch(/\sstyle="/);
    }
  });

  it('prefixes every internal link with the base path when the site is on a subpath', () => {
    const ctx = recordingContext({ basePath: '/promptspend/' });
    const set = buildPages(catalog(SAMPLE), { asOf: ASOF });
    const html = renderModelPage(set.models[0]!, ctx);

    expect(html).toContain('href="/promptspend/models/');
    expect(html).toContain('href="/promptspend/assets/pages.abc12345.css"');
    // ...and never a root-relative one that would 404 on a project page.
    expect(html).not.toMatch(/href="\/models\//);
  });

  it('links a model page to the calculator with that model already chosen', () => {
    const set = buildPages(catalog(SAMPLE), { asOf: ASOF });
    const html = renderModelPage(
      set.models.find((page) => page.id === 'gpt-5')!,
      recordingContext(),
    );

    expect(html).toContain('href="/?m=gpt-5&amp;sys=800&amp;usr=400&amp;out=900&amp;t=6&amp;cpd=2500');
  });

  it('states the promotional window rather than quietly showing the promoted rate', () => {
    const set = buildPages(
      catalog([
        model('promo', {
          pricing: { input: 1, output: 4, intro: { input: 0.5, output: 2, until: '2026-08-31' } },
        }),
      ]),
      { asOf: ASOF },
    );
    const html = renderModelPage(set.models[0]!, recordingContext());

    expect(html).toContain('promotional rates, in force until 2026-08-31');
    expect(html).toContain('$0.5');
  });

  it('surfaces a review flag instead of presenting a disputed price as settled', () => {
    const set = buildPages(
      catalog([
        model('doubtful', {
          provenance: {
            source: 'litellm',
            lastVerified: '2026-08-01',
            needsReview: true,
            reviewNote: 'sources disagree by 40%',
          },
        }),
      ]),
      { asOf: ASOF },
    );
    const html = renderModelPage(set.models[0]!, recordingContext());

    expect(html).toContain('flagged for review');
    expect(html).toContain('sources disagree by 40%');
  });

  it('shows a small gap as a percentage and a large one as a multiple', () => {
    const set = buildPages(
      catalog([
        model('a', { providerId: 'openai', pricing: { input: 1, output: 4 } }),
        model('b', { providerId: 'anthropic', pricing: { input: 2.4, output: 9.6 } }),
      ]),
      { asOf: ASOF },
    );
    const html = renderComparisonPage(set.comparisons[0]!, recordingContext());

    // 2.4x apart on every rate, so every row reads as a multiple.
    expect(html).toContain('2.4×');
    expect(html).not.toMatch(/\(\+\d+%\)/);
  });

  it('sorts the index by price even for models that carry no rank', () => {
    // `rank` is null for anything not current, and sorting on it dumped the
    // legacy rows at the bottom in id order — under a heading that says the
    // table is sorted by price.
    const set = buildPages(
      catalog([
        model('dear-current', { pricing: { input: 10, output: 40 } }),
        model('cheap-legacy', { status: 'legacy', pricing: { input: 0.1, output: 0.4 } }),
      ]),
      { asOf: ASOF },
    );
    const html = renderModelsIndex(set, recordingContext());

    expect(html.indexOf('cheap-legacy')).toBeLessThan(html.indexOf('dear-current'));
    // ...and the reader is told why one of them is at the bottom of a list.
    expect(html).toContain('<span class="pill">legacy</span>');
  });

  it('declares a policy with no unsafe-inline and no remote origins', () => {
    for (const { html } of everyPage(SAMPLE)) {
      const csp = /content="(default-src[^"]*)"/.exec(html)?.[1] ?? '';
      expect(csp).toContain('default-src &#39;none&#39;');
      expect(csp).not.toContain('unsafe-inline');
      expect(csp).not.toContain('http');
    }
  });
});
