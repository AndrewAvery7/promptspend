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

import { filterModels, priceCsv, priceRows, readCatalog, readSyncStatus, type ModelFilter } from './catalog';
import { DOCS_CSS, docsPage, llmsTxt } from './docs';
import type { Env } from './env';
import { ApiError, badRequest, corsHeaders, etagFor, html, json, notFound, notModified, text } from './http';
import { openApiDocument } from './openapi';

const STATUSES = new Set(['current', 'legacy', 'deprecated']);

/**
 * Crawl policy, stated deliberately rather than left to a default.
 *
 * This file used to carry `Disallow: /v1/`. The intent was reasonable — thin
 * JSON has no business in a search result — but the mechanism was wrong, and
 * wrong in a way that defeated the point of the whole service. `robots.txt`
 * governs **fetching**, and assistants routinely apply it to user-initiated
 * requests as well as to crawls. An API built to be called by agents was
 * telling those agents not to call it.
 *
 * Keeping JSON out of a search index is what `X-Robots-Tag: noindex` is for:
 * fetch it freely, just do not list it. That header is applied to every `/v1/`
 * response (see the wrapper in `fetch`), and this file now says yes.
 *
 * The content signals are equally deliberate. These are the vendors' own
 * published list prices, republished under MIT. There is nothing here to
 * reserve: search it, ground on it, train on it. Saying so explicitly is worth
 * more than silence, because silence is what makes a crawler guess.
 */
function robotsTxt(origin: string): string {
  return `# PromptSpend developer hub.
#
# Public, MIT-licensed pricing data that exists to be used. Crawl it, retrieve
# it, ground on it, train on it — the licence already permits all four, and this
# file says so rather than leaving a crawler to infer it.
#
# Machine-readable index of what is here: ${origin}/llms.txt

User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=yes
Allow: /

# The JSON endpoints are data, not documents. They are yours to fetch; every
# one of them answers with X-Robots-Tag: noindex so it stays out of search
# results without being made unfetchable.

Sitemap: ${origin}/sitemap.xml
`;
}

/**
 * Data endpoints are fetchable but not listable.
 *
 * Applied here, once, rather than at each of the six places a `/v1/` response
 * is constructed — a header that has to be remembered is a header that will be
 * forgotten the next time an endpoint is added.
 */
function markUnindexable(response: Response): Response {
  const copy = new Response(response.body, response);
  copy.headers.set('X-Robots-Tag', 'noindex');
  return copy;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const isData = new URL(request.url).pathname.startsWith('/v1/');
    try {
      const response = await route(request, env, ctx);
      return isData ? markUnindexable(response) : response;
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
      return text(robotsTxt(url.origin), 'text/plain; charset=utf-8', { maxAge: 86_400 });
    case '/sitemap.xml':
      // One URL, and that is the honest answer: the hub is the only page here.
      // Everything else this Worker serves is data. `/v1/` is omitted from the
      // sitemap and marked noindex while remaining fetchable by agents.
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

  const [read, sync] = await Promise.all([
    readCatalog(env, ctx).catch((cause: unknown) => {
      throw new ApiError(
        503,
        'The pricing catalog could not be read right now. Try again shortly.',
        cause instanceof Error ? cause.message : String(cause),
      );
    }),
    readSyncStatus(env, ctx),
  ]);
  const catalogAgeHours = Math.max(0, (Date.now() - Date.parse(read.catalog.generatedAt)) / 3.6e6);
  const syncSucceededAgeHours = sync?.succeededAt
    ? Math.max(0, (Date.now() - Date.parse(sync.succeededAt)) / 3.6e6)
    : null;
  const stale =
    read.stale ||
    catalogAgeHours > 48 ||
    sync?.outcome === 'degraded' ||
    (syncSucceededAgeHours !== null && syncSucceededAgeHours > 48);
  const freshness = { generatedAt: read.catalog.generatedAt, stale };
  const etag = etagFor(`${url.pathname}${url.search}-${stale ? 'stale' : 'fresh'}`, read.catalog.generatedAt);
  if (request.headers.get('If-None-Match') === etag) return notModified(etag, freshness);

  if (path === '/v1/health') {
    return json(
      {
        ok: !stale,
        generatedAt: read.catalog.generatedAt,
        fetchedAt: read.fetchedAt.toISOString(),
        stale,
        catalogAgeHours: Number(catalogAgeHours.toFixed(2)),
        syncOutcome: sync?.outcome ?? 'unknown',
        syncSucceededAt: sync?.succeededAt ?? null,
        reason: stale ? 'catalog_or_sync_freshness' : null,
        models: read.catalog.models.length,
        providers: read.catalog.providers.length,
        // Flagged rows are the ones a caller should not present as settled, so
        // the count belongs where a monitor can see it.
        needsReview: read.catalog.models.filter((model) => model.provenance.needsReview === true).length,
      },
      { freshness, etag, maxAge: 60, status: stale ? 503 : 200 },
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

  const filter = parseFilter(url);

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

  let id: string;
  try {
    id = decodeURIComponent(single![1]!);
  } catch {
    throw badRequest('That model id is not a valid URL-encoded string.');
  }
  const model = read.catalog.models.find((entry) => entry.id === id);
  if (!model) {
    const shown = id.length > 120 ? `${id.slice(0, 117)}…` : id;
    throw notFound(`Model "${shown}"`);
  }
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
