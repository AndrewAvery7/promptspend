import { Catalog, type PricingCatalog } from '@promptspend/core';

import {
  loadMobileCatalog,
  parseCacheRecord,
  type CacheEnvelope,
  type MobileCatalogCache,
} from '@/data/catalog';

const NOW = new Date('2026-08-12T18:00:00.000Z');

const PRICING: PricingCatalog = {
  schemaVersion: 2,
  generatedAt: '2026-08-12T11:00:00.000Z',
  providers: [{ id: 'test', name: 'Test Provider', country: 'US' }],
  models: [
    {
      id: 'test-model',
      providerId: 'test',
      displayName: 'Test Model',
      status: 'current',
      contextWindow: 128_000,
      pricing: { input: 1, output: 2 },
      tokenizer: { kind: 'approx', charsPerToken: 4, cjkCharsPerToken: 1.5 },
      capabilities: { reasoning: false, vision: false },
      provenance: {
        source: 'vendor',
        lastVerified: '2026-08-12',
        verifiedUrl: 'https://example.com/pricing',
      },
    },
  ],
};

function response(json: unknown, ok = true, status = 200): Response {
  return { json: async () => json, ok, status } as Response;
}

function network(pricing: unknown = PRICING): typeof fetch {
  return jest.fn(async (input: RequestInfo | URL) => {
    return response(String(input).includes('pricing.json') ? pricing : null);
  }) as unknown as typeof fetch;
}

function failedNetwork(): typeof fetch {
  return jest.fn(async () => {
    throw new Error('offline');
  }) as unknown as typeof fetch;
}

function cacheAt(cachedAt: string): MobileCatalogCache {
  const envelope: CacheEnvelope = { cachedAt, health: null, pricing: PRICING };
  return {
    read: jest.fn(async () => ({ envelope, catalog: new Catalog(PRICING) })),
    write: jest.fn(async () => undefined),
  };
}

describe('loadMobileCatalog resilience policy', () => {
  test.each([
    ['invalid JSON shape', 'corrupt'],
    ['missing timestamp', { pricing: PRICING }],
    ['invalid timestamp', { cachedAt: 'not-a-date', pricing: PRICING }],
    ['invalid catalog', { cachedAt: NOW.toISOString(), pricing: { schemaVersion: 999 } }],
  ])('rejects a corrupt cache record: %s', (_label, value) => {
    expect(parseCacheRecord(value)).toBeNull();
  });

  test('validates a network catalog and records the refresh for offline reuse', async () => {
    const cache: MobileCatalogCache = {
      read: jest.fn(async () => null),
      write: jest.fn(async () => undefined),
    };

    const result = await loadMobileCatalog({ cache, fetcher: network(), now: NOW });

    expect(result.source).toBe('network');
    expect(result.catalog.get('test-model')?.displayName).toBe('Test Model');
    expect(result.warning).toMatch(/freshness evidence is unavailable/i);
    expect(cache.write).toHaveBeenCalledWith({
      cachedAt: NOW.toISOString(),
      health: null,
      pricing: PRICING,
    });
  });

  test('uses a validated cache when refresh fails within the 24-hour ceiling', async () => {
    const cache = cacheAt('2026-08-11T18:00:00.001Z');

    const result = await loadMobileCatalog({ cache, fetcher: failedNetwork(), now: NOW });

    expect(result.source).toBe('cache');
    expect(result.refreshedAt.toISOString()).toBe('2026-08-11T18:00:00.001Z');
    expect(result.warning).toMatch(/could not be refreshed/i);
  });

  test.each([
    ['exactly 24 hours old', '2026-08-11T18:00:00.000Z'],
    ['older than 24 hours', '2026-08-11T17:59:59.999Z'],
    ['dated in the future', '2026-08-12T18:00:00.001Z'],
  ])('fails closed when cached prices are %s', async (_label, cachedAt) => {
    await expect(
      loadMobileCatalog({ cache: cacheAt(cachedAt), fetcher: failedNetwork(), now: NOW }),
    ).rejects.toThrow(/current validated catalog/i);
  });

  test('falls back to a fresh cache when a downloaded catalog is malformed', async () => {
    const result = await loadMobileCatalog({
      cache: cacheAt('2026-08-12T17:30:00.000Z'),
      fetcher: network({ schemaVersion: 999 }),
      now: NOW,
    });

    expect(result.source).toBe('cache');
    expect(result.catalog.get('test-model')).toBeDefined();
  });

  test('times out a hung download and reaches the validated cache fallback', async () => {
    const hungNetwork = jest.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;

    const result = await loadMobileCatalog({
      cache: cacheAt('2026-08-12T17:30:00.000Z'),
      fetcher: hungNetwork,
      now: NOW,
      timeoutMs: 5,
    });

    expect(result.source).toBe('cache');
    expect(result.warning).toMatch(/could not be refreshed/i);
  });

  test('times out a hung download instead of leaving a cold start pending forever', async () => {
    const hungNetwork = jest.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
    const emptyCache: MobileCatalogCache = {
      read: jest.fn(async () => null),
      write: jest.fn(async () => undefined),
    };

    await expect(
      loadMobileCatalog({ cache: emptyCache, fetcher: hungNetwork, now: NOW, timeoutMs: 5 }),
    ).rejects.toThrow(/pricing is unavailable/i);
  });
});
