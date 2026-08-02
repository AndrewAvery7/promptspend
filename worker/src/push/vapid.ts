/**
 * Voluntary Application Server Identification — RFC 8292.
 *
 * VAPID is how a push service knows which application server a message came
 * from. We sign a short-lived JWT with a long-lived ECDSA key; the browser
 * pinned the matching public key at subscribe time, so a message signed by
 * anyone else is rejected before it reaches the user.
 *
 * The `aud` claim is the *origin* of the push endpoint, not the full URL —
 * getting that wrong is the classic cause of a 401 from Firebase that looks
 * like a key problem and is not.
 */

import { b64urlToBytes, bytesToB64url, utf8 } from '../lib/bytes';
import { importPrivateKey } from './encrypt';

/** Twelve hours. RFC 8292 caps `exp` at 24h from now; half that leaves room for clock skew. */
const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * Build the `Authorization` header for one push request.
 *
 * Returns the header value only; the caller adds `Crypto-Key` if it is talking
 * to a legacy push service (none of the current ones need it).
 */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys): Promise<string> {
  const audience = new URL(endpoint).origin;

  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS,
    sub: keys.subject,
  };

  const signingInput = `${bytesToB64url(utf8(JSON.stringify(header)))}.${bytesToB64url(
    utf8(JSON.stringify(payload)),
  )}`;

  const privateKey = await importPrivateKey(
    b64urlToBytes(keys.privateKey),
    b64urlToBytes(keys.publicKey),
    'ECDSA',
  );

  // WebCrypto emits the IEEE P1363 fixed-width r‖s form, which is exactly what
  // JWS ES256 wants. Node's crypto returns DER instead, which is the usual
  // source of "signature invalid" when porting code between the two.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    utf8(signingInput),
  );

  return `vapid t=${signingInput}.${bytesToB64url(signature)}, k=${keys.publicKey}`;
}

/** Generate a fresh application-server key pair, base64url encoded. */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;

  const publicKey = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  if (!jwk.d) throw new Error('generated key has no private component');

  return { publicKey: bytesToB64url(publicKey), privateKey: jwk.d };
}

/**
 * Check that a configured key pair actually belongs together.
 *
 * A mismatched pair produces valid-looking JWTs that every push service
 * rejects, and the failure surfaces hours later as silent non-delivery. One
 * sign-and-verify at boot turns that into an immediate, obvious error.
 */
export async function assertKeyPairMatches(publicKey: string, privateKey: string): Promise<void> {
  const publicBytes = b64urlToBytes(publicKey);
  const signingKey = await importPrivateKey(b64urlToBytes(privateKey), publicBytes, 'ECDSA');
  const probe = utf8('vapid-key-pair-check');
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, probe);

  const verifyKey = await crypto.subtle.importKey(
    'raw',
    publicBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifyKey, signature, probe);
  if (!ok) throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not a matching pair');
}
