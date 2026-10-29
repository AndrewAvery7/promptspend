import { describe, expect, it } from 'vitest';
import type { HistoryRow, PriceHistory } from '@/lib/pricing/history';
import type { Model, PricingCatalog } from '@/lib/pricing/types';
import { SCHEMA_VERSION } from '@/lib/pricing/types';
import type { FreeTierRecord } from '@/lib/free-tiers/types';
import { comparisonFaq, freeTierFaq, modelFaq, providerFaq } from './faq';
import type { FreeTierPage } from './free-tier-pages';
import { buildPages } from './pages';
import { renderComparisonPage, renderFreeTierPage, renderModelPage, renderProviderPage } from './render';
import type { RenderContext } from './render';

const ASOF = new Date('2026-08-02T00:00:00Z');

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

const CATALOG: PricingCatalog = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: '2026-08-02T02:00:00.000Z',
  providers: [
    { id: 'openai', name: 'OpenAI', country: 'US', pricingUrl: 'https://openai.com/api/pricing/' },
    { id: 'anthropic', name: 'Anthropic', country: 'US' },
  ],
  models: [
    model('gpt-5'),
    model('gpt-5-mini', { pricing: { input: 0.25, output: 1 } }),
    model('claude-opus-5', { providerId: 'anthropic', pricing: { input: 5, output: 25 } }),
  ],
};

const SET = buildPages(CATALOG, { asOf: ASOF });
const SOURCE = "the vendor's own published pricing";

function ctx(history?: PriceHistory): RenderContext & { hashed: string[] } {
  const hashed: string[] = [];
  return {
    siteUrl: 'https://promptspend.com',
    basePath: '/',
    cssPath: '/assets/pages.css',
    generatedAt: CATALOG.generatedAt,
    apiUrl: 'https://promptspend.dev',
    hashInline: (content: string) => {
      hashed.push(content);
      return `LEN${content.length}`;
    },
    hashed,
    history,
  };
}

function row(overrides: Partial<HistoryRow>): HistoryRow {
  return {
    date: '2026-08-02',
    commit: 'abc',
    model_id: 'claude-opus-5',
    model_name: 'claude-opus-5',
    provider_id: 'anthropic',
    provider_name: 'Anthropic',
    change: 'listed',
    field: 'input',
    old_value: '',
    new_value: '5',
    unit: 'USD per 1M tokens',
    source: 'vendor',
    source_url: '',
    provider_pricing_url: '',
    ...overrides,
  };
}

const MOVED: PriceHistory = {
  schemaVersion: 1,
  firstDate: '2026-08-02',
  lastDate: '2026-10-01',
  rows: [
    row({}),
    row({ field: 'output', new_value: '25' }),
    row({ date: '2026-09-01', change: 'price', old_value: '5', new_value: '4' }),
    row({ date: '2026-09-01', change: 'price', field: 'output', old_value: '25', new_value: '20' }),
    row({ date: '2026-09-05', change: 'correction', field: 'output', old_value: '20', new_value: '21' }),
  ],
};

const page = (id: string) => SET.models.find((p) => p.id === id)!;

describe('modelFaq', () => {
  it('answers cost, monthly cost, alternatives, context and sources from the page itself', () => {
    const faqs = modelFaq(page('gpt-5'), { sourceLabel: SOURCE });
    expect(faqs.map((f) => f.question)).toEqual([
      'How much does gpt-5 cost?',
      'How much does gpt-5 cost to run for a month?',
      'Is there a cheaper alternative to gpt-5?',
      'How large is the context window of gpt-5?',
      'Where do the prices for gpt-5 come from?',
    ]);
    expect(faqs[0]!.answer).toContain('$1 per 1M input tokens and $4 per 1M output tokens');
    expect(faqs[0]!.answer).toContain('2026-08-01');
    expect(faqs[2]!.answer).toContain('gpt-5-mini');
    expect(faqs[3]!.answer).toContain('400K tokens');
  });

  it('says plainly when nothing is cheaper', () => {
    const faqs = modelFaq(page('gpt-5-mini'), { sourceLabel: SOURCE });
    expect(faqs.find((f) => f.question.startsWith('Is there a cheaper'))!.answer).toMatch(/^No\./);
  });

  it('asks about price changes only when there is history, and counts days not rows', () => {
    expect(modelFaq(page('claude-opus-5'), { sourceLabel: SOURCE }).map((f) => f.question)).not.toContain(
      'Has the price of claude-opus-5 changed?',
    );
    const answer = modelFaq(page('claude-opus-5'), { sourceLabel: SOURCE, history: MOVED }).find((f) =>
      f.question.startsWith('Has the price'),
    )!.answer;
    expect(answer).toContain('on 1 day (2 rates in all)');
    expect(answer).toContain('most recently on 2026-09-01');
    expect(answer).toContain('corrected its own reading of a page 1 time, which is not a vendor change');
  });

  it('reports an unchanged model as unchanged', () => {
    const quiet: PriceHistory = { ...MOVED, rows: [row({}), row({ field: 'output', new_value: '25' })] };
    const answer = modelFaq(page('claude-opus-5'), { sourceLabel: SOURCE, history: quiet }).find((f) =>
      f.question.startsWith('Has the price'),
    )!.answer;
    expect(answer).toMatch(/^No vendor change is on record/);
  });

  it('mentions a promotional rate and its end date', () => {
    const promo = buildPages(
      {
        ...CATALOG,
        models: [
          model('gpt-5', {
            pricing: { input: 2, output: 8, intro: { input: 1, output: 4, until: '2026-12-31' } },
          }),
        ],
      },
      { asOf: ASOF },
    ).models[0]!;
    const answer = modelFaq(promo, { sourceLabel: SOURCE })[0]!.answer;
    expect(answer).toContain('promotional rates, in force until 2026-12-31');
    expect(answer).toContain('standard rates are $2 in and $8 out');
  });
});

describe('providerFaq', () => {
  const openai = SET.providers.find((p) => p.id === 'openai')!;

  it('gives the range and the source, and the free-tier verdict only when there is one', () => {
    const faqs = providerFaq(openai, undefined);
    expect(faqs[0]!.answer).toContain('tracks 2 OpenAI models');
    expect(faqs[0]!.answer).toContain('gpt-5-mini');
    expect(faqs.map((f) => f.question)).not.toContain('Does OpenAI have a free API tier?');
    expect(faqs.at(-1)!.answer).toContain('https://openai.com/api/pricing/');

    const withTier = providerFaq(openai, { verdict: 'one-time', label: 'One-time credit' });
    expect(withTier.find((f) => f.question.includes('free API tier'))!.answer).toContain('One-time credit');
  });
});

describe('comparisonFaq', () => {
  it('answers which is cheaper, the monthly cost per workload, and the non-price differences', () => {
    const cmp = SET.comparisons[0];
    if (!cmp) return;
    const faqs = comparisonFaq(cmp);
    expect(faqs[0]!.answer).toBe(cmp.verdict);
    expect(faqs[1]!.answer).toContain('per month');
    expect(faqs[2]!.question).toContain('apart from price');
  });
});

describe('freeTierFaq', () => {
  const record = (overrides: Partial<FreeTierRecord>): FreeTierRecord => ({
    verdict: 'ongoing',
    answer: 'Yes, a free tier with limits.',
    card: 'no',
    training: 'opt-out',
    trainingNote: 'Not in the EEA.',
    whatsFree: 'Some models',
    updated: '2026-10-05',
    basis: { verdict: [], card: [], training: [] },
    facts: [],
    unpublished: [],
    ...overrides,
  });
  const freePage = (r: FreeTierRecord, after = true): FreeTierPage =>
    ({
      kind: 'free-tier',
      providerId: 'openai',
      provider: CATALOG.providers[0]!,
      path: '/providers/openai/free/',
      providerPath: '/providers/openai/',
      title: 't',
      description: 'd',
      heading: 'h',
      record: r,
      facts: [],
      after: after
        ? { model: CATALOG.models[1]!, path: '/models/gpt-5-mini/', effective: { input: 0.25, output: 1 } }
        : undefined,
      lastmod: '2026-10-05',
    }) as FreeTierPage;

  it('turns each headline field into a sentence that does not go beyond the vendor', () => {
    const faqs = freeTierFaq(freePage(record({})));
    expect(faqs[0]!.answer).toBe('Yes, a free tier with limits.');
    expect(faqs[1]!.answer).toMatch(/^No\. According to OpenAI's own pages/);
    expect(faqs[2]!.answer).toContain('unless you opt out');
    expect(faqs[2]!.answer).toContain('Not in the EEA.');
    expect(faqs[3]!.answer).toContain('gpt-5-mini');
  });

  it('refuses to guess where the vendor is unclear, and drops the pricing question with no model on sale', () => {
    const faqs = freeTierFaq(
      freePage(record({ card: 'unclear', training: 'unclear', trainingNote: undefined }), false),
    );
    expect(faqs[1]!.answer).toContain('do not say clearly, so PromptSpend does not guess');
    expect(faqs[2]!.answer).toContain('not clear on this, so PromptSpend does not guess');
    expect(faqs).toHaveLength(3);
  });
});

describe('the Q&A on rendered pages', () => {
  function ld(html: string): {
    '@graph': { '@type': string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] }[];
  } {
    return JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!);
  }

  it('prints every question and answer on the page and carries the same strings in the markup', () => {
    const c = ctx(MOVED);
    const pages = [
      renderModelPage(page('claude-opus-5'), c),
      renderProviderPage(SET.providers[0]!, c),
      ...(SET.comparisons[0] ? [renderComparisonPage(SET.comparisons[0], c)] : []),
    ];
    for (const html of pages) {
      const faq = ld(html)['@graph'].find((n) => n['@type'] === 'FAQPage');
      expect(faq?.mainEntity?.length).toBeGreaterThan(1);
      const visible = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
      for (const q of faq!.mainEntity!) {
        // The page escapes text; compare through a decode.
        const decoded = visible
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        expect(decoded).toContain(q.name);
        expect(decoded).toContain(q.acceptedAnswer.text);
      }
    }
  });

  it('hashes the markup into the policy with the rest of the JSON-LD, and adds no script', () => {
    const c = ctx(MOVED);
    const html = renderModelPage(page('claude-opus-5'), c);
    expect(c.hashed.some((s) => s.includes('FAQPage'))).toBe(true);
    expect(html.match(/<script/g)).toHaveLength(1); // the JSON-LD, and nothing else
  });

  it('renders the free-tier Q&A', () => {
    const html = renderFreeTierPage(
      {
        kind: 'free-tier',
        providerId: 'openai',
        provider: CATALOG.providers[0]!,
        path: '/providers/openai/free/',
        providerPath: '/providers/openai/',
        title: 'Free tier',
        description: 'd',
        heading: 'OpenAI free tier',
        record: {
          verdict: 'none',
          answer: 'No free tier.',
          card: 'yes',
          training: 'no',
          whatsFree: 'Nothing',
          updated: '2026-10-05',
          basis: { verdict: [], card: [], training: [] },
          facts: [],
          unpublished: [],
        },
        facts: [],
        after: undefined,
        lastmod: '2026-10-05',
      } as FreeTierPage,
      ctx(),
    );
    expect(html).toContain('id="faq"');
    expect(html).toContain('Does OpenAI&#39;s free API tier need a payment method?');
  });
});
