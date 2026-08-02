/**
 * Web Push payload encryption — RFC 8291 (`aes128gcm`).
 *
 * A push service is an untrusted relay: Google, Mozilla and Apple carry the
 * message but must not be able to read it. RFC 8291 arranges that by deriving
 * the content key from an ECDH exchange between an ephemeral server key and the
 * public key the browser handed out at subscribe time, salted with a secret
 * (`auth`) that only the browser and this server know.
 *
 * This is written out rather than pulled from a package for two reasons: the
 * mainstream `web-push` library targets Node's crypto module and does not run
 * unmodified on Workers, and a dependency that can read every notification body
 * is exactly the dependency worth not having. It is about a hundred lines of
 * WebCrypto.
 *
 * Correctness is not taken on trust — `encrypt.test.ts` runs the worked example
 * from RFC 8291 section 5 and checks the output byte for byte against the
 * ciphertext the RFC prints, with the random inputs (salt, ephemeral key) pinned
 * to the values the RFC used.
 */

import { b64urlToBytes, bytesToB64url, concat, randomBytes, utf8 } from '../lib/bytes';

/** Single-record encoding: everything we send fits in one 4096-byte record. */
const RECORD_SIZE = 4096;
const TAG_LENGTH = 16;
const HEADER_LENGTH = 16 + 4 + 1 + 65; // salt + rs + idlen + keyid
const PADDING_DELIMITER = 0x02; // "last record" per RFC 8188

/**
 * The most plaintext that fits one record. Push services also cap the whole
 * body at 4096 bytes, so this is the real ceiling, not a soft target.
 */
export const MAX_PAYLOAD_BYTES = RECORD_SIZE - HEADER_LENGTH - TAG_LENGTH - 1;

export interface PushSubscriptionKeys {
  /** The browser's public key, base64url, 65-byte uncompressed P-256 point. */
  p256dh: string;
  /** The browser's 16-byte shared auth secret, base64url. */
  auth: string;
}

/** Test-only seam: lets the RFC's fixed salt and ephemeral key be injected. */
export interface EncryptOverrides {
  salt?: Uint8Array;
  serverKeys?: { publicKey: Uint8Array; privateKey: CryptoKey };
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, data));
}

/**
 * HKDF extract-then-expand, for outputs of at most one hash block.
 *
 * Every derivation in RFC 8291 asks for 32 bytes or fewer, so the expand step
 * never needs a second round and the counter is always a literal 0x01.
 */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  if (length > 32) throw new Error('hkdf: this single-block implementation caps at 32 bytes');
  const prk = await hmacSha256(salt, ikm);
  const okm = await hmacSha256(prk, concat(info, Uint8Array.of(0x01)));
  return okm.subarray(0, length);
}

/** Import a raw 65-byte uncompressed P-256 point as an ECDH public key. */
async function importPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== 65 || raw[0] !== 0x04) {
    throw new Error(`expected a 65-byte uncompressed P-256 point, got ${raw.length} bytes`);
  }
  return crypto.subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

/**
 * Import a raw P-256 scalar as an ECDH private key.
 *
 * WebCrypto will not take a bare private scalar in `raw` form, so the scalar and
 * the matching public point are assembled into a JWK. The public point is split
 * into its X and Y halves, skipping the 0x04 uncompressed-form prefix.
 */
export async function importPrivateKey(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  algorithm: 'ECDH' | 'ECDSA',
): Promise<CryptoKey> {
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: bytesToB64url(privateKey),
    x: bytesToB64url(publicKey.subarray(1, 33)),
    y: bytesToB64url(publicKey.subarray(33, 65)),
    ext: true,
  };
  const params = { name: algorithm, namedCurve: 'P-256' } as const;
  return crypto.subtle.importKey('jwk', jwk, params, false, [algorithm === 'ECDH' ? 'deriveBits' : 'sign']);
}

/**
 * Encrypt a payload for one subscription.
 *
 * Returns the complete `aes128gcm` body: the header carries the salt and the
 * ephemeral public key, so the browser needs nothing but its own private key to
 * open it.
 */
export async function encryptPayload(
  payload: string,
  keys: PushSubscriptionKeys,
  overrides: EncryptOverrides = {},
): Promise<Uint8Array> {
  const plaintext = utf8(payload);
  if (plaintext.length > MAX_PAYLOAD_BYTES) {
    throw new RangeError(`payload is ${plaintext.length} bytes; the limit is ${MAX_PAYLOAD_BYTES}`);
  }

  const uaPublic = b64urlToBytes(keys.p256dh);
  const authSecret = b64urlToBytes(keys.auth);
  const salt = overrides.salt ?? randomBytes(16);

  // A fresh ephemeral key pair per message: this is what makes each push
  // independently sealed rather than everything sharing one long-lived secret.
  let asPublic: Uint8Array;
  let asPrivate: CryptoKey;
  if (overrides.serverKeys) {
    asPublic = overrides.serverKeys.publicKey;
    asPrivate = overrides.serverKeys.privateKey;
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
    asPrivate = pair.privateKey;
  }

  // workers-types spells the peer-key field `$public`; workerd itself reads
  // `public`, as the RFC 8291 vector test confirms. The cast keeps the runtime
  // correct without pretending the published types are.
  const deriveParams = { name: 'ECDH', public: await importPublicKey(uaPublic) };
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(deriveParams as unknown as SubtleCryptoDeriveKeyAlgorithm, asPrivate, 256),
  );

  // RFC 8291 section 3.4. The key_info string binds the derived key to *both*
  // public keys, so a shared secret captured from one subscription cannot be
  // replayed against another.
  const keyInfo = concat(utf8('WebPush: info'), Uint8Array.of(0x00), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, tagLength: TAG_LENGTH * 8 },
      aesKey,
      concat(plaintext, Uint8Array.of(PADDING_DELIMITER)),
    ),
  );

  // Header: salt(16) ‖ record size(4, big-endian) ‖ key id length(1) ‖ key id.
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE, false);

  return concat(salt, recordSize, Uint8Array.of(asPublic.length), asPublic, ciphertext);
}
