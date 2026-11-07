/**
 * A relay for the mcptry status badge shown in the promptspend.com footer.
 *
 * Why this exists: the badge is live (it says whether the MCP server answered
 * on mcptry's last check), so a frozen copy would be wrong. But loading it
 * straight from mcptry.com would make every visitor's browser contact a third
 * party, telling it their address and browser. Here this Worker fetches the
 * badge itself, a few minutes at a time, and the visitor's browser only ever
 * talks to promptspend.dev — the same operator as the site.
 *
 * The id is fixed in `wrangler.jsonc`, never taken from the request, so this is
 * a relay for one image and cannot be used to fetch anything else.
 *
 * The relayed text is another company's, served from our domain, so it is
 * checked before it is passed on: it must be a small SVG with nothing
 * executable in it, or the visitor gets the grey fallback instead. The response
 * also carries a policy that forbids scripts even if someone opened it directly.
 */

import type { Env } from './env';
import { corsHeaders } from './http';

/** A status badge is a couple of kilobytes. Anything bigger is not one. */
const MAX_BYTES = 20_000;

/** Seconds a fetched badge is reused. Short enough to read as live, long enough that
 *  site traffic cannot turn into request traffic for mcptry. */
const FRESH_SECONDS = 300;

/** Shown when mcptry cannot be reached or sends something unexpected. */
export const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="126" height="20" role="img" aria-label="mcptry: status unavailable"><title>mcptry: status unavailable</title><rect width="50" height="20" rx="3" fill="#555"/><rect x="50" width="76" height="20" rx="3" fill="#9f9f9f"/><rect x="50" width="6" height="20" fill="#9f9f9f"/><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="25" y="14">mcptry</text><text x="88" y="14">unavailable</text></g></svg>`;

/** True when `svg` is a small, plain, non-executable SVG document. */
export function isSafeBadge(svg: string): boolean {
  if (svg.length === 0 || svg.length > MAX_BYTES) return false;
  if (!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) return false;
  return !/<script|<foreignObject|<iframe|<object|<embed|<!ENTITY|<!DOCTYPE|javascript:|\son[a-z]+\s*=|href\s*=\s*["']?(?!#)/i.test(
    svg,
  );
}

export async function mcptryBadgeResponse(env: Env): Promise<Response> {
  let svg = FALLBACK_SVG;
  let relayed = false;
  try {
    const upstream = await fetch(env.MCPTRY_BADGE_URL, {
      headers: {
        Accept: 'image/svg+xml',
        'User-Agent': 'promptspend-status-relay (+https://promptspend.com)',
      },
      cf: { cacheTtl: FRESH_SECONDS, cacheEverything: true },
      signal: AbortSignal.timeout(4000),
    });
    const type = upstream.headers.get('Content-Type') ?? '';
    if (upstream.ok && type.includes('image/svg+xml')) {
      const body = await upstream.text();
      if (isSafeBadge(body)) {
        svg = body;
        relayed = true;
      }
    }
  } catch {
    // Fall through to the grey badge: an <img> that errors shows a broken-image
    // icon, which says less than "unavailable".
  }
  return new Response(svg, {
    headers: {
      ...corsHeaders(),
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // A fallback is cached only briefly so a recovered server shows up quickly.
      'Cache-Control': `public, max-age=${relayed ? FRESH_SECONDS : 60}`,
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-PromptSpend-Relay': relayed ? 'mcptry' : 'fallback',
    },
  });
}
