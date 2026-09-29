/**
 * PromptSpend's own over-the-air update server.
 *
 * It speaks the Expo Updates protocol, version 1
 * (https://docs.expo.dev/technical-specs/expo-updates-1/), which is what the
 * expo-updates library in the app asks every time it launches: "is there newer
 * JavaScript for the native build I am?" Self-hosted rather than on Expo's
 * service so that those checks go to PromptSpend's own infrastructure and to
 * no third party.
 *
 * The Worker is deliberately dumb. It never builds, signs or edits an update.
 * The publish script (apps/mobile/scripts/publish-update.mjs) does all of
 * that on the maintainer's machine and uploads finished objects to R2:
 *
 *   releases/<runtimeVersion>/<platform>.json   what that build should run now
 *   assets/<sha256>                             every file, content-addressed
 *
 * A release record holds the manifest (or a rollback directive) exactly as it
 * was signed, plus its signature. This Worker serves those bytes verbatim, so
 * the private key never exists here. A compromised Worker could withhold
 * updates, but it could not forge one: the app verifies every manifest against
 * the certificate compiled into it, and each asset against the hash that
 * manifest carries.
 *
 * Privacy: requests carry a random per-install identifier the library adds on
 * its own (`eas-client-id`). Nothing here reads, logs or stores it, and the
 * Worker's logs are switched off in wrangler.jsonc.
 */

export interface Env {
  UPDATES: R2Bucket;
}

/** What the publish script writes for one runtime version on one platform. */
export type ReleaseRecord =
  | { kind: 'update'; manifest: string; signature: string }
  | { kind: 'rollback'; directive: string; signature: string };

const PLATFORMS = new Set(['ios', 'android']);
/** Runtime versions are app versions ("0.1.2"); keep the R2 key space tame. */
const RUNTIME_VERSION = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/;
/** Base64URL SHA-256, which is exactly 43 characters. */
const ASSET_HASH = /^[A-Za-z0-9_-]{43}$/;
/** The key id the app's code-signing metadata names (app.json). */
const KEY_ID = 'main';

const PROTOCOL_HEADERS = {
  'expo-protocol-version': '1',
  'expo-sfv-version': '0',
  // The spec asks for a short period so a new update is seen promptly.
  'cache-control': 'private, max-age=0',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return text(405, 'method not allowed', { allow: 'GET, HEAD' });
    }
    if (url.pathname === '/manifest') return manifest(request, env);
    if (url.pathname.startsWith('/assets/')) return asset(url.pathname.slice('/assets/'.length), env);
    if (url.pathname === '/') {
      return text(200, 'PromptSpend app update server. See https://promptspend.com/privacy/.');
    }
    return text(404, 'not found');
  },
} satisfies ExportedHandler<Env>;

async function manifest(request: Request, env: Env): Promise<Response> {
  const protocol = request.headers.get('expo-protocol-version');
  if (protocol !== '1') {
    // Version 0 is the pre-SDK 46 protocol; nothing that talks to this server
    // speaks it, and serving it a v1 body would be worse than refusing.
    return text(400, 'expo-protocol-version must be 1');
  }

  const platform = request.headers.get('expo-platform') ?? '';
  if (!PLATFORMS.has(platform)) return text(400, 'expo-platform must be ios or android');

  const runtimeVersion = request.headers.get('expo-runtime-version') ?? '';
  if (!RUNTIME_VERSION.test(runtimeVersion)) return text(400, 'expo-runtime-version is missing or invalid');

  const format = negotiate(request.headers.get('accept'));
  if (!format) return text(406, 'accept must allow multipart/mixed or application/json');

  const stored = await env.UPDATES.get(`releases/${runtimeVersion}/${platform}.json`);
  // Nothing published for this build yet: the app keeps running what it
  // shipped with. The spec allows an empty multipart reply to say so as a 204.
  if (!stored) return new Response(null, { status: 204, headers: PROTOCOL_HEADERS });

  const record = (await stored.json()) as ReleaseRecord;
  const signatureHeader = `sig="${record.signature}", keyid="${KEY_ID}"`;

  if (record.kind === 'rollback') {
    // A directive can only travel in a multipart reply.
    if (format !== 'multipart') return text(406, 'a rollback directive requires multipart/mixed');
    return multipart([{ name: 'directive', body: record.directive, signature: signatureHeader }]);
  }

  if (format === 'json') {
    return new Response(record.manifest, {
      status: 200,
      headers: {
        ...PROTOCOL_HEADERS,
        'content-type': 'application/json; charset=utf-8',
        'expo-signature': signatureHeader,
      },
    });
  }

  return multipart([
    { name: 'manifest', body: record.manifest, signature: signatureHeader },
    // No asset needs special request headers; sent anyway because a client
    // that finds the part absent keeps whatever headers an earlier reply set.
    { name: 'extensions', body: JSON.stringify({ assetRequestHeaders: {} }) },
  ]);
}

async function asset(hash: string, env: Env): Promise<Response> {
  if (!ASSET_HASH.test(hash)) return text(404, 'not found');
  const object = await env.UPDATES.get(`assets/${hash}`);
  if (!object) return text(404, 'not found');
  return new Response(object.body, {
    status: 200,
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      // Content-addressed: the bytes at this URL can never change, which is
      // what the spec requires of an asset URL anyway.
      'cache-control': 'public, max-age=31536000, immutable',
      etag: object.httpEtag,
    },
  });
}

/**
 * Pick the reply format from the `accept` header.
 *
 * expo-updates sends `application/expo+json;q=0.9, application/json;q=0.8,
 * multipart/mixed`, so multipart wins whenever it is offered. A client that
 * sends no `accept` at all gets multipart too — the richer format, and the one
 * that can carry a rollback.
 */
export function negotiate(accept: string | null): 'multipart' | 'json' | null {
  if (!accept) return 'multipart';
  const types = accept
    .split(',')
    .map((part) => part.split(';')[0]!.trim().toLowerCase())
    .filter(Boolean);
  if (types.some((type) => type === 'multipart/mixed' || type === '*/*' || type === 'multipart/*')) {
    return 'multipart';
  }
  if (types.some((type) => type === 'application/expo+json' || type === 'application/json')) return 'json';
  return null;
}

interface Part {
  name: 'manifest' | 'directive' | 'extensions';
  body: string;
  signature?: string;
}

/** A `multipart/mixed` body as RFC 2046 and the Expo spec describe it. */
export function multipart(parts: Part[]): Response {
  const boundary = `promptspend-${crypto.randomUUID()}`;
  const chunks = parts.map((part) => {
    const headers = [
      `content-disposition: form-data; name="${part.name}"`,
      'content-type: application/json; charset=utf-8',
      ...(part.signature ? [`expo-signature: ${part.signature}`] : []),
    ];
    return `--${boundary}\r\n${headers.join('\r\n')}\r\n\r\n${part.body}\r\n`;
  });
  return new Response(`${chunks.join('')}--${boundary}--\r\n`, {
    status: 200,
    headers: { ...PROTOCOL_HEADERS, 'content-type': `multipart/mixed; boundary=${boundary}` },
  });
}

function text(status: number, body: string, extra: Record<string, string> = {}): Response {
  return new Response(`${body}\n`, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}
