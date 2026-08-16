/**
 * Response plumbing.
 *
 * `Access-Control-Allow-Origin: *` here, where the alerts API allowlists
 * origins. The difference is what is at stake: that API accepts an email
 * address, so a page anywhere on the web must not be able to submit one on a
 * visitor's behalf. This one is read-only, unauthenticated, and serves data
 * that is already public at a URL. Being callable from any page is not a
 * weakness of the design, it *is* the design — a browser-side cost calculator
 * somebody else builds should be able to use it.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** For the log only. Never sent. */
    readonly detail?: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError(404, `${what} not found.`);
export const badRequest = (message: string) => new ApiError(400, message);

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    // Callers reading freshness from headers rather than the body need these
    // to survive a cross-origin fetch.
    'Access-Control-Expose-Headers': 'ETag, X-PromptSpend-Generated-At, X-PromptSpend-Stale',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

export interface Freshness {
  generatedAt: string;
  stale: boolean;
}

/**
 * A weak ETag over the catalog's own timestamp.
 *
 * Weak, not strong: two responses with the same catalog are semantically
 * identical but not necessarily byte-identical (key order in a filtered
 * projection, say). Claiming strong equivalence you have not verified is how
 * caches start serving the wrong body.
 */
export function etagFor(path: string, generatedAt: string): string {
  return `W/"${generatedAt}-${path}"`;
}

interface JsonOptions {
  status?: number;
  freshness?: Freshness;
  /** Seconds a shared cache may serve this without revalidating. */
  maxAge?: number;
  etag?: string;
}

export function json(body: unknown, options: JsonOptions = {}): Response {
  const { status = 200, freshness, maxAge = 300, etag } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': freshness?.stale
      ? 'public, max-age=0, must-revalidate'
      : `public, max-age=${maxAge}, stale-while-revalidate=3600`,
    ...corsHeaders(),
  };
  if (etag) headers.ETag = etag;
  if (freshness) {
    headers['X-PromptSpend-Generated-At'] = freshness.generatedAt;
    // Only present when it is true. A header that says `false` on every
    // response trains readers to ignore it.
    if (freshness.stale) headers['X-PromptSpend-Stale'] = 'true';
  }
  return new Response(`${JSON.stringify(body, null, 2)}\n`, { status, headers });
}

export function text(body: string, contentType: string, options: JsonOptions = {}): Response {
  const { status = 200, freshness, maxAge = 300, etag } = options;
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': freshness?.stale
      ? 'public, max-age=0, must-revalidate'
      : `public, max-age=${maxAge}, stale-while-revalidate=3600`,
    ...corsHeaders(),
  };
  if (etag) headers.ETag = etag;
  if (freshness) {
    headers['X-PromptSpend-Generated-At'] = freshness.generatedAt;
    if (freshness.stale) headers['X-PromptSpend-Stale'] = 'true';
  }
  return new Response(body, { status, headers });
}

/**
 * The developer hub, with a real policy header.
 *
 * A Worker can set response headers, which the GitHub Pages side of this
 * project cannot — so the policy goes in a header rather than a meta tag, and
 * picks up `frame-ancestors`, which meta tags are not permitted to set.
 */
export function html(body: string, maxAge = 3600): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}`,
      // The page has no scripts at all — not even a data block — so `script-src`
      // can be 'none' outright.
      'Content-Security-Policy': [
        "default-src 'none'",
        "style-src 'self'",
        "img-src 'self' data:",
        "script-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(),
    },
  });
}

/** 304 when the caller already has this exact version. */
export function notModified(etag: string, freshness: Freshness): Response {
  const headers: Record<string, string> = {
    ETag: etag,
    'Cache-Control': freshness.stale ? 'public, max-age=0, must-revalidate' : 'public, max-age=300',
    'X-PromptSpend-Generated-At': freshness.generatedAt,
    ...corsHeaders(),
  };
  if (freshness.stale) headers['X-PromptSpend-Stale'] = 'true';
  return new Response(null, {
    status: 304,
    headers,
  });
}
