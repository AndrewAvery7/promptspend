import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { negotiate, type ReleaseRecord } from './index';

const ORIGIN = 'https://updates.promptspend.dev';

/** The headers expo-updates sends on every launch, as the spec gives them. */
function clientHeaders(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'expo-protocol-version': '1',
    'expo-platform': 'ios',
    'expo-runtime-version': '0.1.2',
    accept: 'application/expo+json;q=0.9, application/json;q=0.8, multipart/mixed',
    'expo-expect-signature': 'sig, keyid="main", alg="rsa-v1_5-sha256"',
    // Added by the library itself. The server must work without reading it.
    'eas-client-id': '00000000-0000-4000-8000-000000000000',
    ...overrides,
  };
}

function getManifest(overrides: Record<string, string> = {}) {
  return SELF.fetch(`${ORIGIN}/manifest`, { headers: clientHeaders(overrides) });
}

/** Split a multipart/mixed body into its named parts. */
async function parts(response: Response): Promise<Map<string, { headers: Headers; body: string }>> {
  const boundary = /boundary=([^;]+)/.exec(response.headers.get('content-type') ?? '')?.[1];
  expect(boundary, 'multipart reply names its boundary').toBeTruthy();
  const raw = new TextDecoder().decode(await response.arrayBuffer());
  expect(raw.endsWith(`--${boundary}--\r\n`), 'body ends with the closing delimiter').toBe(true);
  const found = new Map<string, { headers: Headers; body: string }>();
  for (const chunk of raw.split(`--${boundary}`).slice(1, -1)) {
    const [head, ...rest] = chunk.replace(/^\r\n/, '').split('\r\n\r\n');
    const headers = new Headers(
      head!.split('\r\n').map((line) => {
        const at = line.indexOf(':');
        return [line.slice(0, at), line.slice(at + 1).trim()] as [string, string];
      }),
    );
    const name = /name="([^"]+)"/.exec(headers.get('content-disposition') ?? '')?.[1];
    found.set(name!, { headers, body: rest.join('\r\n\r\n').replace(/\r\n$/, '') });
  }
  return found;
}

const encoder = new TextEncoder();
const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const signatureOf = (header: string | null) => /sig="([^"]+)"/.exec(header ?? '')?.[1] ?? '';

let keys: CryptoKeyPair;
async function sign(body: string): Promise<string> {
  return b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, encoder.encode(body)));
}
async function verify(body: string, signature: string): Promise<boolean> {
  const bytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', keys.publicKey, bytes, encoder.encode(body));
}

const MANIFEST = JSON.stringify({
  id: '7c5a2f0e-6b1d-4c8a-9d2e-3f4a5b6c7d8e',
  createdAt: '2026-09-29T15:00:00.000Z',
  runtimeVersion: '0.1.2',
  launchAsset: {
    hash: 'x'.repeat(43),
    key: 'bundle',
    contentType: 'application/javascript',
    url: `${ORIGIN}/assets/${'x'.repeat(43)}`,
  },
  assets: [],
  metadata: {},
  extra: {},
});

async function publish(runtime: string, platform: string, record: ReleaseRecord) {
  await env.UPDATES.put(`releases/${runtime}/${platform}.json`, JSON.stringify(record));
}

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
});

describe('manifest requests', () => {
  it('says "no update" with a 204 when nothing is published for that build', async () => {
    const response = await getManifest({ 'expo-runtime-version': '9.9.9' });
    expect(response.status).toBe(204);
    expect(response.headers.get('expo-protocol-version')).toBe('1');
    expect(response.headers.get('expo-sfv-version')).toBe('0');
    expect(response.headers.get('cache-control')).toBe('private, max-age=0');
  });

  it('serves the manifest byte-for-byte, with a signature the app can verify', async () => {
    await publish('0.1.2', 'ios', { kind: 'update', manifest: MANIFEST, signature: await sign(MANIFEST) });
    const response = await getManifest();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^multipart\/mixed; boundary=/);
    expect(response.headers.get('expo-protocol-version')).toBe('1');

    const reply = await parts(response);
    const manifest = reply.get('manifest')!;
    expect(manifest.body).toBe(MANIFEST);
    expect(manifest.headers.get('content-type')).toMatch(/^application\/json/);
    expect(manifest.headers.get('expo-signature')).toContain('keyid="main"');
    // The whole point of signing: the bytes served are the bytes signed.
    expect(await verify(manifest.body, signatureOf(manifest.headers.get('expo-signature')))).toBe(true);
    expect(JSON.parse(reply.get('extensions')!.body)).toEqual({ assetRequestHeaders: {} });
  });

  it('keeps the two platforms and every build apart', async () => {
    await publish('0.1.2', 'ios', { kind: 'update', manifest: MANIFEST, signature: await sign(MANIFEST) });
    expect((await getManifest({ 'expo-platform': 'android' })).status).toBe(204);
    expect((await getManifest({ 'expo-runtime-version': '0.1.3' })).status).toBe(204);
  });

  it('answers a JSON-only client with the bare manifest and its signature header', async () => {
    await publish('0.1.2', 'ios', { kind: 'update', manifest: MANIFEST, signature: await sign(MANIFEST) });
    const response = await getManifest({ accept: 'application/expo+json' });
    expect(response.headers.get('content-type')).toMatch(/^application\/json/);
    const body = await response.text();
    expect(body).toBe(MANIFEST);
    expect(await verify(body, signatureOf(response.headers.get('expo-signature')))).toBe(true);
  });

  it('delivers a signed rollback directive, which only multipart can carry', async () => {
    const directive = JSON.stringify({
      type: 'rollBackToEmbedded',
      parameters: { commitTime: '2026-09-29T16:00:00.000Z' },
    });
    await publish('0.1.4', 'android', { kind: 'rollback', directive, signature: await sign(directive) });

    const reply = await parts(
      await getManifest({ 'expo-platform': 'android', 'expo-runtime-version': '0.1.4' }),
    );
    expect(reply.has('manifest')).toBe(false);
    const part = reply.get('directive')!;
    expect(part.body).toBe(directive);
    expect(await verify(part.body, signatureOf(part.headers.get('expo-signature')))).toBe(true);

    const jsonOnly = await getManifest({
      'expo-platform': 'android',
      'expo-runtime-version': '0.1.4',
      accept: 'application/json',
    });
    expect(jsonOnly.status).toBe(406);
  });

  it('refuses requests that do not follow the protocol', async () => {
    expect((await getManifest({ 'expo-protocol-version': '0' })).status).toBe(400);
    expect((await getManifest({ 'expo-platform': 'web' })).status).toBe(400);
    expect((await getManifest({ 'expo-runtime-version': '../../assets/x' })).status).toBe(400);
    expect((await getManifest({ accept: 'text/html' })).status).toBe(406);
    const post = await SELF.fetch(`${ORIGIN}/manifest`, { method: 'POST', headers: clientHeaders() });
    expect(post.status).toBe(405);
  });
});

describe('asset requests', () => {
  const hash = 'A'.repeat(20) + '_-' + 'b'.repeat(21);

  it('serves a stored asset with its type and a permanent cache lifetime', async () => {
    await env.UPDATES.put(`assets/${hash}`, 'console.log(1)', {
      httpMetadata: { contentType: 'application/javascript' },
    });
    const response = await SELF.fetch(`${ORIGIN}/assets/${hash}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('console.log(1)');
    expect(response.headers.get('content-type')).toBe('application/javascript');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('404s anything that is not a stored content hash', async () => {
    expect((await SELF.fetch(`${ORIGIN}/assets/${'z'.repeat(43)}`)).status).toBe(404);
    expect((await SELF.fetch(`${ORIGIN}/assets/..%2Freleases%2F0.1.2%2Fios.json`)).status).toBe(404);
    expect((await SELF.fetch(`${ORIGIN}/nothing-here`)).status).toBe(404);
  });
});

describe('negotiate', () => {
  it('prefers multipart whenever it is offered, as expo-updates offers it', () => {
    expect(negotiate('application/expo+json;q=0.9, application/json;q=0.8, multipart/mixed')).toBe(
      'multipart',
    );
    expect(negotiate(null)).toBe('multipart');
    expect(negotiate('*/*')).toBe('multipart');
    expect(negotiate('application/json')).toBe('json');
    expect(negotiate('text/html')).toBeNull();
  });
});
