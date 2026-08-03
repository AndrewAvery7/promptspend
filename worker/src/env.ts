/**
 * Runtime configuration.
 *
 * Everything the worker needs arrives as a binding, a var or a secret. Nothing
 * is read from a module-level constant, so the same build runs in development
 * against a console mail transport and in production against a real one.
 */

export interface Env {
  DB: D1Database;

  // ---- vars (wrangler.jsonc, non-secret) ----
  SITE_ORIGIN: string;
  SITE_BASE_PATH: string;
  ALLOWED_ORIGINS: string;
  EMAIL_TRANSPORT: string;
  EMAIL_FROM: string;
  EMAIL_FROM_NAME: string;
  EMAIL_REPLY_TO: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  VAPID_SUBJECT: string;
  TURNSTILE_SITE_KEY: string;

  // ---- secrets (wrangler secret put) ----
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** Signs the confirm / unsubscribe / preferences links. */
  TOKEN_SECRET?: string;
  /** Shared with the GitHub Actions pipeline; authenticates POST /v1/notify. */
  NOTIFY_SECRET?: string;
  /** Cloudflare API token with Email Sending: Edit. */
  EMAIL_API_TOKEN?: string;
  TURNSTILE_SECRET_KEY?: string;
}

/**
 * The URL of the deployed app, with the base path applied.
 *
 * Has to be right for both shapes the site can take: a project page under
 * `/promptspend/`, and a custom domain serving from `/`.
 */
/**
 * Strip leading and/or trailing `/` without a regular expression.
 *
 * `/\/+$/` is a polynomial-backtracking pattern: an unanchored run of `+`
 * against a long sequence of slashes costs quadratic time when the match
 * ultimately fails. Nothing hostile reaches this — these are deployment
 * variables we set ourselves, not request input — but two index walks are
 * simpler than the regex they replace and cannot degrade at all, which is a
 * better trade than a comment explaining why the risk is theoretical.
 */
function trimSlashes(value: string, { start = false, end = false }): string {
  let from = 0;
  let to = value.length;
  if (start) while (from < to && value.charCodeAt(from) === 47) from += 1;
  if (end) while (to > from && value.charCodeAt(to - 1) === 47) to -= 1;
  return value.slice(from, to);
}

export function siteUrl(env: Env, path = ''): string {
  const origin = trimSlashes(env.SITE_ORIGIN, { end: true });
  const base = trimSlashes(env.SITE_BASE_PATH, { start: true, end: true });
  const root = base ? `${origin}/${base}` : origin;
  return path ? `${root}/${trimSlashes(path, { start: true })}` : `${root}/`;
}

export function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** True once a sending domain is onboarded and the transport is switched over. */
export function emailEnabled(env: Env): boolean {
  return env.EMAIL_TRANSPORT === 'cloudflare' ? Boolean(env.EMAIL_API_TOKEN) : true;
}

export function pushEnabled(env: Env): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

/**
 * Fail loudly at the edge rather than halfway through a fan-out.
 *
 * A missing TOKEN_SECRET would otherwise produce tokens signed with the string
 * "undefined", which verify perfectly against each other and are trivially
 * forgeable by anyone who notices.
 */
export function requireSecret(env: Env, name: 'TOKEN_SECRET' | 'NOTIFY_SECRET'): string {
  const value = env[name];
  if (!value || value.length < 16) {
    throw new Error(`${name} is not configured (needs at least 16 characters)`);
  }
  return value;
}
