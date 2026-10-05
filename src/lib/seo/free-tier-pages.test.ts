import { describe, expect, it } from 'vitest';
import { Catalog } from '@/lib/pricing/catalog';
import type { Model, PricingCatalog } from '@/lib/pricing/types';
import { SCHEMA_VERSION } from '@/lib/pricing/types';
import { EMPTY_CHECK_REPORT, type FreeTierCheckReport } from '@/lib/free-tiers/check';
import type { FreeTierFile } from '@/lib/free-tiers/types';
import { buildPages } from './pages';
import { buildFreeTierPages, FREE_TIERS_PATH } from './free-tier-pages';
import {
  renderFreeTierIndex,
  renderFreeTierPage,
  renderProviderPage,
  renderProvidersIndex,
  type RenderContext,
} from './render';

const CTX: RenderContext = {
  siteUrl: 'https://promptspend.com',
  basePath: '/',
  cssPath: '/assets/pages.test.css',
  generatedAt: '2026-10-05T02:00:00.000Z',
  apiUrl: 'https://promptspend.dev',
  hashInline: () => 'stub',
};
const AS_OF = new Date('2026-10-05T00:00:00Z');

function model(id: string, providerId: string, input: number, overrides: Partial<Model> = {}): Model {
  return {
    id,
    providerId,
    displayName: id,
    status: 'current',
    contextWindow: 200_000,
    pricing: { input, output: input * 4 },
    tokenizer: { kind: 'tiktoken', encoding: 'o200k_base' },
    capabilities: { reasoning: false, vision: false },
    provenance: { source: 'vendor', lastVerified: '2026-10-05' },
    ...overrides,
  };
}

const catalog: PricingCatalog = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: '2026-10-05T02:00:00.000Z',
  providers: [
    { id: 'acme', name: 'Acme', country: 'US', pricingUrl: 'https://acme.example/pricing' },
    { id: 'globex', name: "Globex's Lab", country: 'FR' },
  ],
  models: [
    model('acme-big', 'acme', 10),
    model('acme-mini', 'acme', 0.5),
    model('acme-ancient', 'acme', 0.01, { status: 'deprecated' }),
    model('globex-one', 'globex', 2),
  ],
};

function fact(id: string, topic: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    topic,
    statement: `Statement for ${id}.`,
    quote: `Quote for ${id}.`,
    url: `https://acme.example/${id}`,
    readOn: '2026-10-01',
    ...extra,
  };
}

const file = {
  schemaVersion: 1,
  providers: {
    globex: {
      verdict: 'none',
      answer: 'No. Globex is prepaid.',
      card: 'yes',
      training: 'no',
      whatsFree: 'Nothing',
      updated: '2026-10-01',
      basis: { verdict: ['g-pay'], card: ['g-pay'], training: ['g-pay'] },
      facts: [fact('g-pay', 'card')],
      unpublished: [],
    },
    acme: {
      verdict: 'ongoing',
      answer: 'Yes. Acme Mini is free <for now>.',
      card: 'no',
      training: 'opt-out',
      trainingNote: 'not in the EU',
      whatsFree: 'Acme Mini',
      updated: '2026-10-02',
      basis: { verdict: ['a-free'], card: ['a-free'], training: ['a-data'] },
      facts: [
        fact('a-free', 'free', { quote: 'Acme Mini is <b>free</b> & "unlimited".' }),
        fact('a-faq', 'credits', { conflictsWith: 'a-help' }),
        fact('a-help', 'credits', { conflictsWith: 'a-faq' }),
        fact('a-data', 'data'),
      ],
      unpublished: ['Rate limits, shown only in the console.'],
    },
  },
} as unknown as FreeTierFile;

const SET = buildPages(catalog, { asOf: AS_OF });
const build = (report: FreeTierCheckReport = EMPTY_CHECK_REPORT) =>
  buildFreeTierPages(file, report, new Catalog(catalog), SET, AS_OF);

describe('buildFreeTierPages', () => {
  const free = build();
  const acme = free.pages.find((page) => page.providerId === 'acme')!;

  it('puts each page under its provider and lists free tiers first', () => {
    expect(acme.path).toBe('/providers/acme/free/');
    expect(free.pages.map((page) => page.providerId)).toEqual(['acme', 'globex']);
    expect(free.index.path).toBe(FREE_TIERS_PATH);
  });

  it('closes on the cheapest model still on sale, not a retired one', () => {
    expect(acme.after?.model.id).toBe('acme-mini');
  });

  it('dates the page by its content, not by the build', () => {
    // The record says 10-02, but the closing section quotes Acme's prices, so the
    // provider page's date (the build date, with no ledger in a test) wins.
    expect(acme.lastmod).toBe('2026-10-05');
    expect(acme.lastmod >= acme.record.updated).toBe(true);
  });

  it('moves the date when the daily check sees a quote disappear', () => {
    const report: FreeTierCheckReport = {
      checkedAt: '2026-10-09T06:00:00Z',
      facts: { 'a-data': { status: 'missing', lastConfirmed: '2026-10-08', changedOn: '2026-10-09' } },
    };
    expect(build(report).pages[0]!.lastmod).toBe('2026-10-09');
  });

  it('keeps titles and descriptions inside the limits check-seo enforces, as written', () => {
    for (const page of [...free.pages, free.index]) {
      const written = (text: string) => text.replace(/[&<>"']/g, '-----').length;
      expect(written(page.title)).toBeLessThanOrEqual(70);
      expect(written(page.description)).toBeLessThanOrEqual(165);
    }
  });
});

describe('renderFreeTierPage', () => {
  const free = build();
  const acme = free.pages.find((page) => page.providerId === 'acme')!;
  const html = renderFreeTierPage(acme, CTX);

  it('escapes the vendor’s words and our answer alike', () => {
    expect(html).toContain('Acme Mini is &lt;b&gt;free&lt;/b&gt; &amp; &quot;unlimited&quot;.');
    expect(html).toContain('free &lt;for now&gt;');
    expect(html).not.toContain('<b>free</b>');
  });

  it('links every fact to its source with the date it was read', () => {
    expect(html).toContain('href="https://acme.example/a-free" rel="nofollow noopener">acme.example</a>');
    expect(html).toContain('read <time datetime="2026-10-01">1 Oct 2026</time>');
  });

  it('flags both sides of a contradiction', () => {
    expect(html.match(/class="conflict"/g)).toHaveLength(2);
  });

  it('lists what the vendor does not publish', () => {
    expect(html).toContain('What Acme doesn&rsquo;t publish');
    expect(html).toContain('Rate limits, shown only in the console.');
  });

  it('says plainly when a quote has gone from its page', () => {
    const report: FreeTierCheckReport = {
      checkedAt: null,
      facts: { 'a-data': { status: 'missing', lastConfirmed: '2026-10-03', changedOn: '2026-10-04' } },
    };
    const flagged = renderFreeTierPage(build(report).pages[0]!, CTX);
    expect(flagged).toContain('this wording was no longer there');
    expect(flagged).toContain('<time datetime="2026-10-04">4 Oct 2026</time>');
    expect(html).not.toContain('this wording was no longer there');
  });

  it('shows a later confirmation beside the original read date', () => {
    const report: FreeTierCheckReport = {
      checkedAt: null,
      facts: { 'a-free': { status: 'confirmed', lastConfirmed: '2026-10-05' } },
    };
    expect(renderFreeTierPage(build(report).pages[0]!, CTX)).toContain(
      'still there on <time datetime="2026-10-05">',
    );
  });

  it('carries the training qualifier and the price after the free tier', () => {
    expect(html).toContain('Yes, unless you opt out (not in the EU)');
    expect(html).toContain('href="/models/acme-mini/"');
  });

  it('uses no inline style attribute, which the page policy would drop', () => {
    expect(html).not.toMatch(/\sstyle="/);
  });
});

describe('the pages that link to the free-tier pages', () => {
  const free = build();
  const links = new Map(
    free.pages.map((page) => [page.providerId, { verdict: page.record.verdict, path: page.path }]),
  );

  it('gives each provider page a pointer to its free-tier page', () => {
    const acmePage = SET.providers.find((page) => page.id === 'acme')!;
    const html = renderProviderPage(acmePage, CTX, links.get('acme'));
    expect(html).toContain('href="/providers/acme/free/"');
    expect(renderProviderPage(acmePage, CTX)).not.toContain('/providers/acme/free/');
  });

  it('adds a free-tier column to the providers index only when given the data', () => {
    expect(renderProvidersIndex(SET, CTX, links)).toContain('<th>Free tier</th>');
    expect(renderProvidersIndex(SET, CTX)).not.toContain('<th>Free tier</th>');
  });

  it('summarises the verdicts on the index and escapes provider names', () => {
    const html = renderFreeTierIndex(free, CTX);
    expect(html).toContain(
      'Of 2 providers, 1 has an ongoing free tier, 0 give one-time credit, 1 has none, and 0 are unclear',
    );
    expect(html).toContain('Globex&#39;s Lab');
    expect(html).toContain('<sup>*</sup> Acme: not in the EU.');
  });
});
