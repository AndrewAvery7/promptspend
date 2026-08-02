/**
 * Generate the secrets this worker needs.
 *
 * Two modes:
 *
 *   npx tsx scripts/keygen.ts
 *       Prints the values for you to paste into `wrangler secret put`.
 *
 *   npx tsx scripts/keygen.ts --out secrets.json
 *       Writes a file for `wrangler secret bulk secrets.json`, printing only
 *       the VAPID *public* key. Use this when a terminal session is being
 *       recorded or shared — the private values never reach the screen. Delete
 *       the file immediately afterwards.
 *
 * The VAPID pair is not cheaply rotatable: its public key is baked into every
 * push subscription a browser has already issued, so replacing it silently
 * invalidates every existing subscriber.
 */

import { webcrypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const crypto = webcrypto as unknown as Crypto;

function b64url(bytes: Uint8Array | ArrayBuffer): string {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
])) as CryptoKeyPair;

const publicKey = b64url((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;

const random = (bytes: number) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

const secrets = {
  VAPID_PUBLIC_KEY: publicKey,
  VAPID_PRIVATE_KEY: jwk.d!,
  TOKEN_SECRET: random(32),
  NOTIFY_SECRET: random(32),
};

const outIndex = process.argv.indexOf('--out');
if (outIndex !== -1 && process.argv[outIndex + 1]) {
  const path = process.argv[outIndex + 1];
  writeFileSync(path, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  console.log(`Wrote 4 secrets to ${path}`);
  console.log(`VAPID_PUBLIC_KEY (public by design): ${publicKey}`);
  console.log(`\n  npx wrangler secret bulk ${path}`);
  console.log(`  then delete ${path}`);
  console.log(`\nNOTIFY_SECRET must also be set as a GitHub Actions secret of the same name.`);
} else {
  console.log(`
Paste each of these into the matching prompt. Nothing here belongs in git.

  npx wrangler secret put VAPID_PUBLIC_KEY
  ${secrets.VAPID_PUBLIC_KEY}

  npx wrangler secret put VAPID_PRIVATE_KEY
  ${secrets.VAPID_PRIVATE_KEY}

  npx wrangler secret put TOKEN_SECRET
  ${secrets.TOKEN_SECRET}

  npx wrangler secret put NOTIFY_SECRET
  ${secrets.NOTIFY_SECRET}

NOTIFY_SECRET also goes into the token-tally repository as an Actions secret of
the same name, so the pricing pipeline can sign what it sends.

VAPID_PUBLIC_KEY is served publicly by GET /v1/config — that is by design, the
browser needs it to subscribe. VAPID_PRIVATE_KEY must never leave the worker,
and replacing the pair invalidates every push subscription already issued.
`);
}
