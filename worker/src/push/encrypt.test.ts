import { describe, expect, it } from 'vitest';
import { b64urlToBytes, bytesToB64url, utf8 } from '../lib/bytes';
import { encryptPayload, importPrivateKey, MAX_PAYLOAD_BYTES } from './encrypt';

/**
 * The worked example from RFC 8291 section 5.
 *
 * This is the only test in the project checked against an external authority
 * rather than against our own expectations. A round-trip test — encrypt, then
 * decrypt with code from the same file — passes just as happily when both
 * halves share a misreading of the spec, and the browser is the one that
 * actually has to open these messages. Reproducing the RFC's ciphertext byte
 * for byte is the only evidence that a real push service will accept it.
 */
const RFC8291 = {
  plaintext: 'When I grow up, I want to be a watermelon',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6Tlz' +
    'AC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
} as const;

async function encryptWithRfcInputs(plaintext: string = RFC8291.plaintext) {
  const publicKey = b64urlToBytes(RFC8291.asPublic);
  const privateKey = await importPrivateKey(b64urlToBytes(RFC8291.asPrivate), publicKey, 'ECDH');
  return encryptPayload(
    plaintext,
    { p256dh: RFC8291.uaPublic, auth: RFC8291.authSecret },
    { salt: b64urlToBytes(RFC8291.salt), serverKeys: { publicKey, privateKey } },
  );
}

describe('RFC 8291 aes128gcm encryption', () => {
  it('reproduces the ciphertext from the RFC worked example exactly', async () => {
    const body = await encryptWithRfcInputs();
    expect(bytesToB64url(body)).toBe(RFC8291.body);
  });

  it('lays the header out as salt ‖ record size ‖ key id length ‖ key id', async () => {
    const body = await encryptWithRfcInputs();

    expect(bytesToB64url(body.subarray(0, 16))).toBe(RFC8291.salt);
    expect(new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0, false)).toBe(4096);
    expect(body[20]).toBe(65);
    expect(bytesToB64url(body.subarray(21, 86))).toBe(RFC8291.asPublic);

    // 41 bytes of plaintext, one padding delimiter, one 16-byte GCM tag.
    expect(body.length).toBe(86 + utf8(RFC8291.plaintext).length + 1 + 16);
  });

  it('produces a different body each time when the salt and key are not pinned', async () => {
    const keys = { p256dh: RFC8291.uaPublic, auth: RFC8291.authSecret };
    const first = await encryptPayload('same message', keys);
    const second = await encryptPayload('same message', keys);
    expect(bytesToB64url(first)).not.toBe(bytesToB64url(second));
  });

  it('refuses a payload that cannot fit one record', async () => {
    await expect(encryptWithRfcInputs('x'.repeat(MAX_PAYLOAD_BYTES + 1))).rejects.toThrow(
      /payload is \d+ bytes/,
    );
  });

  it('accepts a payload exactly at the limit', async () => {
    const body = await encryptWithRfcInputs('x'.repeat(MAX_PAYLOAD_BYTES));
    expect(body.length).toBe(4096);
  });

  it('rejects a malformed subscription key', async () => {
    await expect(
      encryptPayload('hello', { p256dh: bytesToB64url(new Uint8Array(12)), auth: RFC8291.authSecret }),
    ).rejects.toThrow(/65-byte uncompressed P-256 point/);
  });
});

describe('base64url round-trips', () => {
  it('survives every byte value', () => {
    const all = new Uint8Array(256).map((_, index) => index);
    expect(b64urlToBytes(bytesToB64url(all))).toEqual(all);
  });

  it('emits no padding or non-url-safe characters', () => {
    for (let length = 1; length <= 8; length += 1) {
      const encoded = bytesToB64url(new Uint8Array(length).fill(0xff));
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});
