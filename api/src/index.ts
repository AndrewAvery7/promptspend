/**
 * PromptSpend public pricing API, and the developer hub that documents it.
 *
 * Why this exists at all: the most valuable thing this project owns is not the
 * calculator, it is a machine-readable LLM pricing catalog that re-checks itself
 * every morning and shows its sources. Published as a documented, versioned,
 * keyless API, that catalog becomes something other developers depend on and
 * link to from README files and blog posts — which is the strongest organic
 * ranking signal there is, and the hardest one to fake. A redirect from this
 * domain to the calculator earned none of it.
 *
 * The routing is a switch, as in the alerts Worker. There are nine endpoints; a
 * router dependency would be larger than the thing it routes.
 */

import { filterModels, priceCsv, priceRows, readCatalog, type ModelFilter } from './catalog';
import { DOCS_CSS, docsPage, llmsTxt } from './docs';
import type { Env } from './env';
import { ApiError, badRequest, corsHeaders, etagFor, html, json, notFound, notModified, text } from './http';
import { openApiDocument } from './openapi';

const STATUSES = new Set(['current', 'legacy', 'deprecated']);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.detail) console.warn(`${cause.status} ${cause.message} — ${cause.detail}`);
        return json({ error: cause.message }, { status: cause.status, maxAge: 0 });
      }
      console.error('unhandled error', cause);
      return json({ error: 'Something went wrong on our side.' }, { status: 500, maxAge: 0 });
    }
  },
};

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (method !== 'GET' && method !== 'HEAD') {
    // Everything here is a read. Saying so is more useful than a bare 404.
    throw new ApiError(405, 'This API is read-only; use GET.');
  }

  // Documents that do not depend on the catalog, so they answer even when the
  // origin is down.
  switch (path) {
    case '/':
      return html(docsPage(url.origin, env.SITE_ORIGIN));
    case '/style.css':
      return text(DOCS_CSS, 'text/css; charset=utf-8', { maxAge: 86_400 });
    case '/openapi.json':
      return json(openApiDocument(url.origin), { maxAge: 3600 });
    case '/llms.txt':
      return text(llmsTxt(url.origin, env.SITE_ORIGIN), 'text/plain; charset=utf-8', { maxAge: 3600 });
    case '/robots.txt':
      // The hub is worth indexing; the JSON is not, and letting crawlers grind
      // through 70 model documents would put pressure on the origin for nothing.
      //
      // The sitemap named here is **this host's own**. Pointing it at
      // ${SITE_ORIGIN}/sitemap.xml was wrong: a cross-host sitemap reference is
      // only honoured when both hosts are verified in the same search-console
      // account, and it tells a crawler of .dev about pages that are not on it.
      return text(
        `User-agent: *\nAllow: /$\nAllow: /llms.txt\nDisallow: /v1/\n\nSitemap: ${url.origin}/sitemap.xml\n`,
        'text/plain; charset=utf-8',
        { maxAge: 86_400 },
      );
    case '/sitemap.xml':
      // One URL, and that is the honest answer: the hub is the only page here.
      // Everything else this Worker serves is data, and `/v1/` is disallowed
      // above precisely so it does not get crawled as content.
      return text(
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${url.origin}/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`,
        'application/xml; charset=utf-8',
        { maxAge: 86_400 },
      );
    default:
      break;
  }

  // Decide *before* reading the catalog. A request for an endpoint that does
  // not exist should cost nothing, and should not be able to report 503 because
  // the origin happened to be down — that is a confusing way to be told about a
  // typo in a URL.
  const single = /^\/v1\/models\/(.+)$/.exec(path);
  const known = ['/v1/models', '/v1/prices', '/v1/prices.csv', '/v1/providers', '/v1/health'];
  if (!single && !known.includes(path)) throw notFound('That endpoint');

  const read = await readCatalog(env, ctx).catch((cause: unknown) => {
    throw new ApiError(
      503,
      'The pricing catalog could not be read right now. Try again shortly.',
      cause instanceof Error ? cause.message : String(cause),
    );
  });
  const freshness = { generatedAt: read.catalog.generatedAt, stale: read.stale };
  const etag = etagFor(url.pathname + url.search, read.catalog.generatedAt);
  if (request.headers.get('If-None-Match') === etag) return notModified(etag);

  const filter = parseFilter(url);

  if (path === '/v1/health') {
    return json(
      {
        ok: true,
        generatedAt: read.catalog.generatedAt,
        fetchedAt: read.fetchedAt.toISOString(),
        stale: read.stale,
        models: read.catalog.models.length,
        providers: read.catalog.providers.length,
        // Flagged rows are the ones a caller should not present as settled, so
        // the count belongs where a monitor can see it.
        needsReview: read.catalog.models.filter((model) => model.provenance.needsReview === true).length,
      },
      { freshness, etag, maxAge: 60 },
    );
  }

  if (path === '/v1/providers') {
    const counts = new Map<string, number>();
    for (const model of read.catalog.models) {
      counts.set(model.providerId, (counts.get(model.providerId) ?? 0) + 1);
    }
    return json(
      {
        generatedAt: read.catalog.generatedAt,
        count: read.catalog.providers.length,
        providers: read.catalog.providers.map((provider) => ({
          ...provider,
          models: counts.get(provider.id) ?? 0,
        })),
      },
      { freshness, etag },
    );
  }

  if (path === '/v1/models') {
    const models = filterModels(read.catalog, filter);
    return json({ generatedAt: read.catalog.generatedAt, count: models.length, models }, { freshness, etag });
  }

  if (path === '/v1/prices') {
    const ids = new Set(filterModels(read.catalog, filter).map((model) => model.id));
    const rows = priceRows(read.catalog).filter((row) => ids.has(row.id));
    return json(
      { generatedAt: read.catalog.generatedAt, unit: 'USD per 1M tokens', count: rows.length, prices: rows },
      { freshness, etag },
    );
  }

  if (path === '/v1/prices.csv') {
    const ids = new Set(filterModels(read.catalog, filter).map((model) => model.id));
    const filtered = { ...read.catalog, models: read.catalog.models.filter((model) => ids.has(model.id)) };
    return text(priceCsv(filtered), 'text/csv; charset=utf-8', { freshness, etag });
  }

  const id = decodeURIComponent(single![1]!);
  const model = read.catalog.models.find((entry) => entry.id === id);
  if (!model) throw notFound(`Model "${id}"`);
  return json(model, { freshness, etag });
}

function parseFilter(url: URL): ModelFilter {
  const provider = url.searchParams.get('provider') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const aliases = url.searchParams.get('aliases') ?? 'exclude';

  if (status !== undefined && !STATUSES.has(status)) {
    throw badRequest(`status must be one of ${[...STATUSES].join(', ')}.`);
  }
  if (aliases !== 'include' && aliases !== 'exclude') {
    throw badRequest('aliases must be "include" or "exclude".');
  }
  // A provider id that matches nothing returns an empty list rather than a 400:
  // "no models from x" is a legitimate answer, and 400 would make a caller
  // enumerating providers look like it had a bug.
  return { provider, status, primaryOnly: aliases === 'exclude' };
}
