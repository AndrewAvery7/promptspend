/**
 * Signed, expiring, purpose-scoped links.
 *
 * Every link we put in an email — confirm, unsubscribe, manage preferences —
 * has to authenticate its bearer without a password and without a session. The
 * token carries its own claims and an HMAC over them, so the worker can verify
 * it with no database round-trip and no server-side token table to clean up.
 *
 * `purpose` is not decoration. Without it, the unsubscribe link in a footer
 * would also be a valid credential for editing that subscriber's preferences,
 * and unsubscribe links get forwarded, logged by mail scanners and prefetched
 * by clients. Each token opens exactly one door.
 */

import { b64urlToBytes, bytesToB64url, timingSafeEqual, utf8 } from './bytes';

export type TokenPurpose = 'confirm' | 'unsubscribe' | 'preferences' | 'mobile-preferences';

/**
 * Confirmation has to happen soon or not at all. Unsubscribe and preference
 * links live in mail the reader may come back to months later, so they last a
 * year — an expired unsubscribe link is a compliance problem, not a nicety.
 */
const LIFETIMES: Record<TokenPurpose, number> = {
  confirm: 48 * 60 * 60,
  unsubscribe: 365 * 24 * 60 * 60,
  preferences: 365 * 24 * 60 * 60,
  'mobile-preferences': 30 * 60,
};

interface TokenClaims {
  /** purpose */
  p: TokenPurpose;
  /** subject — the subscriber id */
  s: string;
  /** expiry, seconds since epoch */
  e: number;
}

async function sign(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8(message)));
}

export async function issueToken(
  secret: string,
  purpose: TokenPurpose,
  subjectId: string,
  now: number = Date.now(),
): Promise<string> {
  const claims: TokenClaims = {
    p: purpose,
    s: subjectId,
    e: Math.floor(now / 1000) + LIFETIMES[purpose],
  };
  const body = `1.${bytesToB64url(utf8(JSON.stringify(claims)))}`;
  return `${body}.${bytesToB64url(await sign(secret, body))}`;
}

export type TokenResult =
  | { ok: true; subjectId: string }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' | 'wrong-purpose' };

/**
 * Verify a token for one specific purpose.
 *
 * The signature is checked before the claims are trusted for anything, and the
 * comparison is constant-time. Failure reasons are returned for logging but are
 * deliberately collapsed to a single generic message at the HTTP boundary.
 */
export async function verifyToken(
  secret: string,
  purpose: TokenPurpose,
  token: string,
  now: number = Date.now(),
): Promise<TokenResult> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== '1') return { ok: false, reason: 'malformed' };

  const body = `${parts[0]}.${parts[1]}`;
  let provided: Uint8Array;
  try {
    provided = b64urlToBytes(parts[2]);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const expected = await sign(secret, body);
  if (!timingSafeEqual(provided, expected)) return { ok: false, reason: 'bad-signature' };

  let claims: TokenClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))) as TokenClaims;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (typeof claims.s !== 'string' || !claims.s) return { ok: false, reason: 'malformed' };
  if (claims.p !== purpose) return { ok: false, reason: 'wrong-purpose' };
  if (typeof claims.e !== 'number' || claims.e * 1000 < now) return { ok: false, reason: 'expired' };

  return { ok: true, subjectId: claims.s };
}
