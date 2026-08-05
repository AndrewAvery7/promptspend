import { describe, expect, it } from 'vitest';
import type { Model, PricingCatalog } from '@/lib/pricing/types';
import { SCHEMA_VERSION } from '@/lib/pricing/types';
import { PAGE_CSS } from './css';
import { buildPages } from './pages';
import {
  renderComparisonPage,
  renderComparisonsIndex,
  renderModelPage,
  renderModelsIndex,
  renderProviderPage,
  renderProvidersIndex,
  type RenderContext,
} from './render';

const CTX: RenderContext = {
  siteUrl: 'https://promptspend.com',
  basePath: '/',
  cssPath: '/assets/pages.test.css',
  generatedAt: '2026-08-02T02:00:00.000Z',
  apiUrl: 'https://promptspend.dev',
  hashInline: () => 'stub',
};

function model(id: string, overrides: Partial<Model> = {}): Model {
  return {
    id,
    providerId: 'openai',
    displayName: id,
    status: 'current',
    contextWindow: 400_000,
    maxOutput: 128_000,
    capabilityIndex: 70,
    pricing: { input: 1, output: 4, cachedInput: 0.1, cacheWrite: 1.25, batchDiscount: 0.5 },
    tokenizer: { kind: 'tiktoken', encoding: 'o200k_base' },
    capabilities: { reasoning: true, vision: true },
    provenance: { source: 'vendor', lastVerified: '2026-08-01', lastChanged: '2026-07-20' },
    ...overrides,
  };
}

const catalog: PricingCatalog = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: '2026-08-02T02:00:00.000Z',
  providers: [
    { id: 'openai', name: 'OpenAI', country: 'US', pricingUrl: 'https://openai.com/api/pricing/' },
    { id: 'anthropic', name: 'Anthropic', country: 'US' },
  ],
  models: [
    model('gpt-5'),
    model('claude-opus-5', { providerId: 'anthropic' }),
    model('legacy-one', { status: 'legacy', pricing: { input: 20, output: 80 } }),
  ],
};

const SET = buildPages(catalog, { asOf: new Date('2026-08-02T00:00:00Z') });

/** Every distinct class token the renderers actually emit. */
function emittedClasses(): Set<string> {
  const html = [
    renderModelsIndex(SET, CTX),
    renderProvidersIndex(SET, CTX),
    renderComparisonsIndex(SET, CTX),
    ...SET.models.map((page) => renderModelPage(page, CTX)),
    ...SET.providers.map((page) => renderProviderPage(page, CTX)),
    ...SET.comparisons.map((page) => renderComparisonPage(page, CTX)),
  ].join('\n');

  const classes = new Set<string>();
  for (const match of html.matchAll(/class="([^"]+)"/g)) {
    for (const token of match[1]!.trim().split(/\s+/)) classes.add(token);
  }
  return classes;
}

describe('the generated pages stylesheet', () => {
  it('defines every class the renderers emit', () => {
    // These two files can drift silently and the failure is invisible: the page
    // renders, the markup is valid, and one region is simply unstyled. It cost
    // an unaligned table caption once already.
    const missing = [...emittedClasses()].filter((name) => !PAGE_CSS.includes(`.${name}`));
    expect(missing).toEqual([]);
  });

  it('styles both colour schemes, since the pages carry no theme toggle', () => {
    // No JavaScript on these pages means no toggle, so `prefers-color-scheme`
    // is the only signal there is. Shipping light-only would leave every dark
    // reader on a white page.
    expect(PAGE_CSS).toContain('@media (prefers-color-scheme: dark)');
    for (const token of ['--bg', '--surface', '--ink', '--muted', '--border', '--accent']) {
      const declarations = PAGE_CSS.split(token).length - 1;
      expect(declarations, `${token} should be declared for both schemes`).toBeGreaterThanOrEqual(2);
    }
  });

  it('lets wide tables scroll inside their own container', () => {
    // Otherwise a rate card forces the whole page to scroll sideways on a
    // phone, which is where most search traffic reads it.
    expect(PAGE_CSS).toMatch(/\.tablewrap\s*\{[^}]*overflow-x:\s*auto/);
  });
});
