import { SELF, env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PricingCatalog } from '../../src/lib/pricing/types';

const API = 'https://promptspend.dev';

const CATALOG: PricingCatalog = {
  schemaVersion: 2,
  generatedAt: '2026-08-02T02:00:00.000Z',
  providers: [
    { id: 'openai', name: 'OpenAI', country: 'US', pricingUrl: 'https://openai.com/api/pricing/' },
    { id: 'anthropic', name: 'Anthropic', country: 'US' },
  ],
  models: [
    {
      id: 'gpt-5',
      providerId: 'openai',
      displayName: 'GPT-5',
      status: 'current',
      contextWindow: 400_000,
      maxOutput: 128_000,
      pricing: { input: 1.25, output: 10, cachedInput: 0.125 },
      tokenizer: { kind: 'tiktoken', encoding: 'o200k_base' },
      capabilities: { reasoning: true, vision: true },
      provenance: { source: 'vendor', lastVerified: '2026-08-01', lastChanged: '2026-07-20' },
    },
    {
      id: 'gpt-5-alias',
      providerId: 'openai',
      displayName: 'GPT-5 (alias)',
      status: 'current',
      aliasOf: 'gpt-5',
      contextWindow: 400_000,
      pricing: { input: 1.25, output: 10 },
      tokenizer: { kind: 'tiktoken', encoding: 'o200k_base' },
      capabilities: { reasoning: true, vision: true },
      provenance: { source: 'vendor', lastVerified: '2026-08-01' },
    },
    {
      id: 'claude-opus-5',
      providerId: 'anthropic',
      displayName: 'Claude, "the Opus" 5',
      status: 'legacy',
      contextWindow: 1_000_000,
      pricing: { input: 5, output: 25, cachedInput: 0.5, cacheWrite: 6.25 },
      tokenizer: { kind: 'approx', charsPerToken: 3.6, cjkCharsPerToken: 1.7 },
      capabilities: { reasoning: true, vision: true },
      provenance: { source: 'litellm', lastVerified: '2026-08-01', needsReview: true, reviewNote: 'x' },
    },
  ],
};

/** How many times the origin was asked for the catalog in this test. */
let originHits = 0;

/**
 * What the origin answers.
 *
 * Throws by default. A test that needs the catalog has to say so, and a test
 * that does not thereby proves it never asked.
 */
let origin: () => Response;

function serveCatalog(body: unknown = CATALOG, status = 200): void {
  origin = () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
}

function originUnreachable(): void {
  origin = () => {
    throw new Error('origin unreachable');
  };
}

beforeEach(async () => {
  originHits = 0;
  originUnreachable();
  // The Cache API is shared across a test file, and caching is most of what
  // this Worker does. Clearing it makes every test start from the same place.
  await caches.default.delete(new Request(env.CATALOG_URL));

  // The Worker runs in this isolate, so replacing the global reaches it.
  // Nothing here may touch the real network: a test that quietly passed
  // because promptspend.com happened to be up would be worse than no test.
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url !== env.CATALOG_URL) throw new Error(`unexpected outbound fetch to ${url}`);
    originHits += 1;
    return Promise.resolve(origin());
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const get = (path: string, headers: Record<string, string> = {}) => SELF.fetch(`${API}${path}`, { headers });

describe('documents that do not need the catalog', () => {
  it('serves the hub with a policy header and no scripts at all', async () => {
    const response = await get('/');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'none'");
    expect(body).not.toContain('<script');
    expect(body).toContain('<link rel="canonical" href="https://promptspend.dev/" />');
  });

  it('answers even when the origin is unreachable', async () => {
    expect((await get('/')).status).toBe(200);
    expect((await get('/openapi.json')).status).toBe(200);
    expect((await get('/llms.txt')).status).toBe(200);
    expect((await get('/style.css')).status).toBe(200);
    expect(originHits).toBe(0);
  });

  it('describes itself at the origin the request arrived on', async () => {
    const document = (await (await get('/openapi.json')).json()) as { servers: { url: string }[] };
    expect(document.servers[0]!.url).toBe(API);
  });

  it('keeps crawlers out of the JSON but not the hub', async () => {
    const robots = await (await get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /v1/');
  });

  it('names its own sitemap, not the other host’s', async () => {
    // A cross-host sitemap reference is only honoured when both hosts are
    // verified in the same search-console account, and it tells a crawler of
    // .dev about pages that are not on .dev.
    const robots = await (await get('/robots.txt')).text();
    expect(robots).toContain(`Sitemap: ${API}/sitemap.xml`);
    expect(robots).not.toContain('promptspend.com');

    const sitemap = await (await get('/sitemap.xml')).text();
    expect(sitemap).toContain(`<loc>${API}/</loc>`);
    // One page. Everything else here is data, and /v1/ is disallowed above so
    // it is not crawled as content.
    expect(sitemap.match(/<loc>/g)).toHaveLength(1);
  });
});

describe('catalog endpoints', () => {
  beforeEach(() => serveCatalog());

  it('excludes routing aliases by default and includes them on request', async () => {
    const plain = (await (await get('/v1/models')).json()) as { count: number; models: { id: string }[] };
    expect(plain.models.map((model) => model.id)).toEqual(['gpt-5', 'claude-opus-5']);
    expect(plain.count).toBe(2);

    const all = (await (await get('/v1/models?aliases=include')).json()) as { models: { id: string }[] };
    expect(all.models.map((model) => model.id)).toContain('gpt-5-alias');
  });

  it('filters by provider and by status', async () => {
    const byProvider = (await (await get('/v1/models?provider=anthropic')).json()) as {
      models: { id: string }[];
    };
    expect(byProvider.models.map((model) => model.id)).toEqual(['claude-opus-5']);

    const byStatus = (await (await get('/v1/models?status=current')).json()) as { models: { id: string }[] };
    expect(byStatus.models.map((model) => model.id)).toEqual(['gpt-5']);
  });

  it('returns an empty list, not an error, for a provider with no models', async () => {
    // A caller enumerating providers would otherwise look like it had a bug.
    const response = await get('/v1/models?provider=nobody');
    expect(response.status).toBe(200);
    expect(((await response.json()) as { count: number }).count).toBe(0);
  });

  it('rejects a status value that cannot mean anything', async () => {
    const response = await get('/v1/models?status=retired');
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/status must be one of/);
  });

  it('returns one model, and 404 for an id it does not have', async () => {
    const model = (await (await get('/v1/models/gpt-5')).json()) as { id: string; pricing: unknown };
    expect(model.id).toBe('gpt-5');
    expect(model.pricing).toEqual({ input: 1.25, output: 10, cachedInput: 0.125 });

    expect((await get('/v1/models/does-not-exist')).status).toBe(404);
  });

  it('counts models per provider', async () => {
    const body = (await (await get('/v1/providers')).json()) as {
      providers: { id: string; models: number }[];
    };
    expect(body.providers.find((provider) => provider.id === 'openai')!.models).toBe(2);
    expect(body.providers.find((provider) => provider.id === 'anthropic')!.models).toBe(1);
  });

  it('states the unit on the flat price rows, so a bare number cannot be misread', async () => {
    const body = (await (await get('/v1/prices')).json()) as {
      unit: string;
      prices: { id: string; input: number; cacheWrite: number | null }[];
    };
    expect(body.unit).toBe('USD per 1M tokens');
    const opus = body.prices.find((row) => row.id === 'claude-opus-5')!;
    expect(opus.input).toBe(5);
    expect(opus.cacheWrite).toBe(6.25);
    // Absent rates are null rather than missing, so a CSV column never shifts.
    expect(body.prices.find((row) => row.id === 'gpt-5')!.cacheWrite).toBeNull();
  });

  it('quotes a display name containing a comma and a quote, per RFC 4180', async () => {
    const csv = await (await get('/v1/prices.csv')).text();
    expect(csv.split('\r\n')[0]).toBe(
      'id,provider,displayName,input,output,cachedInput,cacheWrite,contextWindow,maxOutput,status,lastVerified',
    );
    expect(csv).toContain('"Claude, ""the Opus"" 5"');
  });

  it('reports freshness in headers as well as the body', async () => {
    const response = await get('/v1/models');
    expect(response.headers.get('X-PromptSpend-Generated-At')).toBe(CATALOG.generatedAt);
    // Absent, not "false" — a header on every response is a header nobody reads.
    expect(response.headers.get('X-PromptSpend-Stale')).toBeNull();
  });

  it('counts flagged rows in health, where a monitor can see them', async () => {
    const body = (await (await get('/v1/health')).json()) as { ok: boolean; needsReview: number };
    expect(body.ok).toBe(true);
    expect(body.needsReview).toBe(1);
  });

  it('answers 304 when the caller already has this version', async () => {
    const first = await get('/v1/models');
    const etag = first.headers.get('ETag')!;
    expect(etag).toMatch(/^W\//);

    const second = await get('/v1/models', { 'If-None-Match': etag });
    expect(second.status).toBe(304);
  });

  it('gives different paths different ETags', async () => {
    const models = (await get('/v1/models')).headers.get('ETag');
    const prices = (await get('/v1/prices')).headers.get('ETag');
    expect(models).not.toBe(prices);
  });

  it('is callable from any origin, because everything it serves is public', async () => {
    for (const path of ['/v1/models', '/v1/prices', '/openapi.json']) {
      expect((await get(path)).headers.get('Access-Control-Allow-Origin')).toBe('*');
    }
  });

  it('reads the origin once and serves the rest from cache', async () => {
    await get('/v1/models');
    await get('/v1/prices');
    await get('/v1/providers');
    expect(originHits).toBe(1);
  });
});

describe('when the catalog cannot be trusted', () => {
  it('returns 503 rather than an empty answer when the origin is down', async () => {
    serveCatalog('nope', 500);

    const response = await get('/v1/models');
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: string }).error).toMatch(/could not be read/);
  });

  it('refuses to serve a catalog that fails the site own validation rules', async () => {
    // Output priced below a tenth of input has always meant a parsing error
    // upstream. Passing it through would launder somebody else's bug into an
    // authoritative-looking API.
    serveCatalog({
      ...CATALOG,
      models: [{ ...CATALOG.models[0]!, pricing: { input: 100, output: 0.5 } }],
    });

    expect((await get('/v1/models')).status).toBe(503);
  });

  it('serves a retained copy, labelled, rather than nothing at all', async () => {
    // Zero seconds of freshness means every request revalidates, which is the
    // same code path a cached copy takes once its window has passed — and it is
    // reachable from a test, where reaching into `caches.default` is not: the
    // Cache API only works inside a request context, and this is not one.
    //
    // `wrangler types` narrows each var to the literal string in
    // wrangler.jsonc, which is right for source and unhelpful for a test whose
    // whole point is to change one — hence the widening cast.
    const vars = env as unknown as Record<string, string>;
    const configured = vars.FRESH_SECONDS!;
    vars.FRESH_SECONDS = '0';
    try {
      serveCatalog();
      expect((await get('/v1/models')).status).toBe(200);

      originUnreachable();
      const response = await get('/v1/models');

      expect(response.status).toBe(200);
      expect(response.headers.get('X-PromptSpend-Stale')).toBe('true');
      expect(((await response.json()) as { count: number }).count).toBe(2);
    } finally {
      vars.FRESH_SECONDS = configured;
    }
  });
});

describe('method handling', () => {
  it('says plainly that it is read-only', async () => {
    const response = await SELF.fetch(`${API}/v1/models`, { method: 'POST' });
    expect(response.status).toBe(405);
  });

  it('answers a preflight without touching the catalog', async () => {
    const response = await SELF.fetch(`${API}/v1/models`, { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(originHits).toBe(0);
  });

  it('404s an endpoint that does not exist', async () => {
    expect((await get('/v2/models')).status).toBe(404);
    expect((await get('/v1/nonsense')).status).toBe(404);
  });
});
