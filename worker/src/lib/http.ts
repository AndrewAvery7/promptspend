/**
 * HTTP plumbing: CORS, JSON responses, and errors that never leak internals.
 */

import { allowedOrigins, type Env } from '../env';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Detail for the log only — never sent to the client. */
    readonly detail?: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, detail?: string) => new HttpError(400, message, detail);
export const unauthorized = (detail?: string) => new HttpError(401, 'Not authorised.', detail);
export const notFound = () => new HttpError(404, 'Not found.');
export const tooManyRequests = () =>
  new HttpError(429, 'Too many requests from this address. Try again in a few minutes.');

/**
 * Echo the caller's origin only when it is on the allowlist.
 *
 * Returning `*` would be simpler and is what most examples do, but these
 * endpoints accept an email address, so an unrestricted policy would let any
 * page on the web submit one on a visitor's behalf.
 */
export function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const permitted = allowedOrigins(env);
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && permitted.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function json(body: unknown, request: Request, env: Env, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env),
    },
  });
}

export function noContent(request: Request, env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

/**
 * Parse a JSON body with a hard size ceiling.
 *
 * Workers will happily buffer a large body before the handler sees it; the
 * limit is here so a subscribe endpoint cannot be used to burn CPU on parsing
 * megabytes of nothing.
 */
export async function readJson<T>(request: Request, maxBytes = 16 * 1024): Promise<T> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > maxBytes) throw badRequest('Request body is too large.');

  const text = await request.text();
  if (text.length > maxBytes) throw badRequest('Request body is too large.');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw badRequest('Request body is not valid JSON.');
  }
}

/**
 * A stable pseudonymous identifier for a caller.
 *
 * Rate limiting needs to tell callers apart, and consent records need to show a
 * signup was not fabricated — neither needs the address itself. Hashing with
 * the token secret means the table cannot be turned back into a list of IPs
 * even by someone holding a copy of it.
 */
export async function hashClientIp(request: Request, secret: string): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const data = new TextEncoder().encode(`${secret}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest).subarray(0, 12)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
