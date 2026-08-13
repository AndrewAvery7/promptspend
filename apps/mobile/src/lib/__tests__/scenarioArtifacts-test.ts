import { Catalog, SCHEMA_VERSION, compareModels, type Model, type PricingCatalog } from '@promptspend/core';

import { buildScenarioUrl, csvForRows } from '@/components/ScenarioActions';

const SENTINEL = 'SENTINEL_PRIVATE_PROMPT_DO_NOT_EXPORT';

function model(id: string, displayName: string, input: number, output: number): Model {
  return {
    capabilities: { reasoning: false, vision: false },
    contextWindow: 128_000,
    displayName,
    id,
    pricing: { input, output },
    provenance: {
      lastChanged: '2026-08-01',
      lastVerified: '2026-08-13',
      source: 'vendor',
      verifiedUrl: 'https://example.com/pricing',
    },
    providerId: 'test',
    status: 'current',
    tokenizer: { charsPerToken: 4, cjkCharsPerToken: 1.5, kind: 'approx' },
  };
}

const efficient = model('efficient', 'Efficient Model', 1, 2);
const premium = model('premium', 'Premium Model', 8, 24);
const raw: PricingCatalog = {
  generatedAt: '2026-08-13T12:00:00.000Z',
  models: [efficient, premium],
  providers: [
    { country: 'US', id: 'test', name: 'Test Provider', pricingUrl: 'https://example.com/pricing' },
  ],
  schemaVersion: SCHEMA_VERSION,
};
const catalog = new Catalog(raw);
const rows = compareModels(
  [premium, efficient],
  { outputTokens: 900, systemTokens: 800, turns: 6, userTokens: 400 },
  { conversationsPerDay: 2500, monthlyActiveUsers: 1000, revenuePerUserPerMonth: 0 },
);
const safeProps = {
  batchEnabled: false,
  cacheShare: 0.6,
  catalog,
  conversationsPerDay: 2500,
  monthlyActiveUsers: 1000,
  modelIds: ['premium', 'efficient'],
  outputTokens: 900,
  pastedFields: ['system', 'user'] as const,
  reasoningMultiplier: 1,
  revenuePerUserPerMonth: 0,
  rows,
  systemTokens: 800,
  turns: 6,
  userTokens: 400,
};

describe('scenario sharing and export privacy', () => {
  test('encodes only model choices, derived counts, and assumptions in the URL', () => {
    const url = buildScenarioUrl({ ...safeProps, promptText: SENTINEL } as typeof safeProps);
    const parsed = new URL(url);

    expect(parsed.origin).toBe('https://promptspend.com');
    expect(parsed.searchParams.get('m')).toBe('premium,efficient');
    expect(parsed.searchParams.get('px')).toBe('system,user');
    expect(decodeURIComponent(url)).not.toContain(SENTINEL);
  });

  test('limits a shared shortlist to four model identifiers', () => {
    const url = buildScenarioUrl({
      ...safeProps,
      modelIds: ['one', 'two', 'three', 'four', 'five'],
    });

    expect(new URL(url).searchParams.get('m')).toBe('one,two,three,four');
  });

  test('exports evidence and derived counts without injected private text', () => {
    const csv = csvForRows({ ...safeProps, promptText: SENTINEL } as typeof safeProps);

    expect(csv).toContain('prices last changed,2026-08-01');
    expect(csv).toContain('estimated:ratio');
    expect(csv).toContain('Efficient Model');
    expect(csv).not.toContain(SENTINEL);
  });

  test('escapes formulas and delimiter-like evidence as plain CSV cells', () => {
    const hostile = model('formula', '=HYPERLINK("https://example.com")', 1, 2);
    const hostileCatalog = new Catalog({ ...raw, models: [hostile] });
    const hostileRows = compareModels(
      [hostile],
      { outputTokens: 1, systemTokens: 1, turns: 1, userTokens: 1 },
      { conversationsPerDay: 1, monthlyActiveUsers: 1, revenuePerUserPerMonth: 0 },
    );
    const csv = csvForRows({
      ...safeProps,
      catalog: hostileCatalog,
      modelIds: [hostile.id],
      rows: hostileRows,
    });

    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');
    expect(csv).not.toContain('\r\n=HYPERLINK');
  });
});
