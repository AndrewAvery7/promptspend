/**
 * Authenticating the pricing pipeline.
 *
 * `/v1/notify` is the one endpoint that can cause mail to be sent to everybody,
 * so it is not protected by a bearer token that would sit in a CI log the first
 * time someone turns on debug output. Instead the caller signs the exact bytes
 * it is sending, together with a timestamp, and the signature is useless for
 * any other body.
 *
 * The timestamp is what stops replay: a captured request stays valid for five
 * minutes, not forever.
 */

import { timingSafeEqual, utf8 } from './bytes';

const MAX_SKEW_SECONDS = 300;

export async function signPayload(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, utf8(`${timestamp}.${body}`));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type SignatureCheck =
  { ok: true } | { ok: false; reason: 'missing' | 'stale' | 'mismatch' | 'malformed' };

export async function verifySignature(
  secret: string,
  timestamp: string | null,
  signature: string | null,
  body: string,
  now: number = Date.now(),
): Promise<SignatureCheck> {
  if (!timestamp || !signature) return { ok: false, reason: 'missing' };

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: 'malformed' };
  if (Math.abs(now / 1000 - sent) > MAX_SKEW_SECONDS) return { ok: false, reason: 'stale' };

  const expected = await signPayload(secret, timestamp, body);
  const provided = signature.startsWith('v1=') ? signature.slice(3) : signature;
  if (provided.length !== expected.length) return { ok: false, reason: 'mismatch' };

  return timingSafeEqual(utf8(provided), utf8(expected)) ? { ok: true } : { ok: false, reason: 'mismatch' };
}
