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
export function siteUrl(env: Env, path = ''): string {
  const origin = env.SITE_ORIGIN.replace(/\/+$/, '');
  const base = env.SITE_BASE_PATH.replace(/^\/+|\/+$/g, '');
  const root = base ? `${origin}/${base}` : origin;
  return path ? `${root}/${path.replace(/^\/+/, '')}` : `${root}/`;
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
