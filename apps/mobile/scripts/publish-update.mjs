#!/usr/bin/env node
/**
 * Publish (or roll back) an over-the-air update to PromptSpend's own update
 * server, https://updates.promptspend.dev (the Worker in /updates).
 *
 *   node scripts/publish-update.mjs --message "Fix the Compare empty state"
 *   node scripts/publish-update.mjs --message "..." --platform ios
 *   node scripts/publish-update.mjs --dry-run            build, sign, verify; upload nothing
 *   node scripts/publish-update.mjs --rollback --message "Back to the store build"
 *   node scripts/publish-update.mjs --verify             re-check what is live, change nothing
 *   node scripts/publish-update.mjs --smoke-test         publish to a throwaway version no
 *                                                        build has, verify it live, delete it
 *
 * What it does, in order:
 *   1. Resolves the runtime version. The app uses the `appVersion` policy, so
 *      it is the `version` in app.json, and an update only ever reaches store
 *      builds of exactly that version.
 *   2. `expo export`s the JavaScript bundle and assets for each platform.
 *   3. Uploads every file to R2 under its own SHA-256, so an asset URL can
 *      never change underneath a phone that is part-way through downloading.
 *   4. Builds the manifest, signs it with the private key, and checks the
 *      signature against certs/certificate.pem, the certificate compiled into
 *      the app, before anything is published.
 *   5. Publishes the signed manifest as releases/<runtime>/<platform>.json.
 *   6. Fetches it back from the live server the way the app does and verifies
 *      the signature and every asset hash.
 *
 * Needs: a logged-in `wrangler` with R2 access to the promptspend-updates
 * bucket, and the private key at %USERPROFILE%\.promptspend\updates-signing\
 * private-key.pem (or PROMPTSPEND_UPDATES_KEY). The key is read, never printed
 * or copied. See docs/MOBILE_OTA_UPDATES.md.
 */
import { spawnSync } from 'node:child_process';
import { createHash, createPublicKey, randomUUID, sign, verify } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = 'https://updates.promptspend.dev';
const BUCKET = 'promptspend-updates';
const KEY_ID = 'main';
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(APP, '../..');
const WRANGLER_DIR = join(REPO, 'updates');
const CERTIFICATE = join(APP, 'certs/certificate.pem');
const PRIVATE_KEY =
  process.env.PROMPTSPEND_UPDATES_KEY ??
  join(homedir(), '.promptspend', 'updates-signing', 'private-key.pem');

/**
 * The command-line tools this script drives, run by path with this Node.
 *
 * Not `npx`: on Windows that means `npx.cmd`, which Node will only start
 * through a shell, and a shell re-parses every argument. Running the installed
 * entry file directly passes each argument through untouched and can only run
 * the version `npm ci` put on disk.
 */
const TOOLS = {
  expo: join(APP, 'node_modules/expo/bin/cli'),
  'expo-updates': join(APP, 'node_modules/expo-updates/bin/cli.js'),
  wrangler: join(WRANGLER_DIR, 'node_modules/wrangler/bin/wrangler.js'),
};

const CONTENT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  json: 'application/json',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
};

// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const platforms = args.platform === 'all' ? ['ios', 'android'] : [args.platform];
const certificate = createPublicKey(readFileSync(CERTIFICATE));

if (args.verify) {
  const runtimeVersion = resolveRuntimeVersion('ios');
  let ok = true;
  for (const platform of platforms) ok = (await verifyLive(platform, runtimeVersion, null)) && ok;
  process.exit(ok ? 0 : 1);
}

if (args.smokeTest) args.message ||= 'smoke test';
if (!args.message) fail('--message "<what changed>" is required (it is kept with the published record)');
if (!existsSync(PRIVATE_KEY)) fail(`signing key not found at ${PRIVATE_KEY}; see docs/MOBILE_OTA_UPDATES.md`);
const privateKey = readFileSync(PRIVATE_KEY);
const commit = git(['rev-parse', 'HEAD']);
if (
  !args.dryRun &&
  !args.smokeTest &&
  !args.allowDirty &&
  git(['status', '--porcelain', '--', '.', '../../packages/core'])
) {
  fail('the app has uncommitted changes; publish from a clean checkout of main (or pass --allow-dirty)');
}

const runtimeVersions = Object.fromEntries(platforms.map((p) => [p, resolveRuntimeVersion(p)]));
log(`runtime version: ${JSON.stringify(runtimeVersions)}  commit: ${commit.slice(0, 7)}`);

if (args.rollback) {
  for (const platform of platforms) {
    const directive = JSON.stringify({
      type: 'rollBackToEmbedded',
      parameters: { commitTime: new Date().toISOString() },
    });
    const record = { kind: 'rollback', directive, signature: signAndCheck(directive) };
    publishRecord(platform, runtimeVersions[platform], record, { directive: JSON.parse(directive) });
  }
  log('rollback published: phones on these builds return to the code they shipped with on next launch');
  process.exit(0);
}

const out = mkdtempSync(join(tmpdir(), 'promptspend-update-'));
try {
  run('npx', ['expo', 'export', ...platforms.flatMap((p) => ['--platform', p]), '--output-dir', out], APP);
  const metadata = JSON.parse(readFileSync(join(out, 'metadata.json'), 'utf8'));
  const expoClient = JSON.parse(run('npx', ['expo', 'config', '--type', 'public', '--json'], APP, true));

  for (const platform of platforms) {
    const files = metadata.fileMetadata?.[platform];
    if (!files?.bundle) fail(`expo export produced no ${platform} bundle`);
    const runtimeVersion = runtimeVersions[platform];

    const launchAsset = describe(out, files.bundle, null, true);
    const assets = files.assets.map((entry) => describe(out, entry.path, entry.ext, false));

    const manifest = JSON.stringify({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      runtimeVersion,
      launchAsset: strip(launchAsset),
      assets: assets.map(strip),
      metadata: {},
      // expo-constants reads the app config from here once an update is
      // running (expo-linking's scheme, for one), exactly as EAS does.
      extra: { expoClient },
    });
    const record = { kind: 'update', manifest, signature: signAndCheck(manifest) };

    log(`${platform}: ${1 + assets.length} files, ${kb([launchAsset, ...assets])} KB`);
    if (args.dryRun) continue;
    for (const file of [launchAsset, ...assets]) {
      r2Put(`assets/${file.hash}`, file.source, file.contentType);
    }
    publishRecord(platform, runtimeVersion, record, { id: JSON.parse(manifest).id });
    if (!(await verifyLive(platform, runtimeVersion, JSON.parse(manifest).id))) {
      fail(`${platform}: the live server does not return what was just published`);
    }
  }
  if (args.smokeTest) {
    for (const platform of platforms) r2Delete(`releases/smoke-test/${platform}.json`);
    log('smoke test passed; its release records are deleted (content-addressed assets stay, unreferenced)');
  } else {
    log(args.dryRun ? 'dry run complete: built, signed and verified locally; nothing uploaded' : 'published');
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------

/** Everything a manifest says about one file, plus where it lives locally. */
function describe(root, path, ext, isLaunchAsset) {
  const source = join(root, path);
  const bytes = readFileSync(source);
  const hash = createHash('sha256').update(bytes).digest('base64url');
  return {
    source,
    size: bytes.length,
    hash,
    key: createHash('md5').update(bytes).digest('hex'),
    contentType: isLaunchAsset
      ? 'application/javascript'
      : (CONTENT_TYPES[ext] ?? 'application/octet-stream'),
    ...(isLaunchAsset ? {} : { fileExtension: `.${ext}` }),
    url: `${ORIGIN}/assets/${hash}`,
  };
}

function strip({ source: _source, size: _size, ...asset }) {
  return asset;
}

/** Sign with the private key, then prove the app's certificate accepts it. */
function signAndCheck(body) {
  const signature = sign('sha256', Buffer.from(body), privateKey).toString('base64');
  if (!verify('sha256', Buffer.from(body), certificate, Buffer.from(signature, 'base64'))) {
    fail('the private key does not match certs/certificate.pem; the app would reject this update');
  }
  return signature;
}

function publishRecord(platform, runtimeVersion, record, summary) {
  const at = new Date().toISOString();
  const body = JSON.stringify(record);
  const history = JSON.stringify({ ...record, publishedAt: at, commit, message: args.message });
  if (args.dryRun) return;
  const stamp = at.replace(/[:.]/g, '-');
  if (!args.smokeTest) r2PutText(`history/${runtimeVersion}/${platform}/${stamp}.json`, history);
  // Last, so a failure part-way leaves phones on the previous release.
  r2PutText(`releases/${runtimeVersion}/${platform}.json`, body);
  log(`${platform} ${runtimeVersion}: ${JSON.stringify(summary)}`);
}

/**
 * Ask the live server exactly what a phone asks, and check the answer the way
 * expo-updates does: signature against the app's certificate, then every
 * asset against the hash the manifest promises.
 */
async function verifyLive(platform, runtimeVersion, expectedId) {
  const response = await fetch(`${ORIGIN}/manifest`, {
    headers: {
      'expo-protocol-version': '1',
      'expo-platform': platform,
      'expo-runtime-version': runtimeVersion,
      accept: 'application/expo+json;q=0.9, application/json;q=0.8, multipart/mixed',
      'expo-expect-signature': `sig, keyid="${KEY_ID}", alg="rsa-v1_5-sha256"`,
    },
  });
  if (response.status === 204) {
    log(`${platform} ${runtimeVersion}: nothing published (phones run the code they shipped with)`);
    return expectedId === null;
  }
  const boundary = /boundary=([^;]+)/.exec(response.headers.get('content-type') ?? '')?.[1];
  if (response.status !== 200 || !boundary) {
    console.error(`${platform}: unexpected reply ${response.status} ${response.headers.get('content-type')}`);
    return false;
  }
  const raw = Buffer.from(await response.arrayBuffer()).toString('utf8');
  for (const chunk of raw.split(`--${boundary}`).slice(1, -1)) {
    const [head, ...rest] = chunk.replace(/^\r\n/, '').split('\r\n\r\n');
    const body = rest.join('\r\n\r\n').replace(/\r\n$/, '');
    const name = /name="([^"]+)"/.exec(head)?.[1];
    if (name !== 'manifest' && name !== 'directive') continue;
    const signature = /expo-signature:.*sig="([^"]+)"/i.exec(head)?.[1] ?? '';
    if (!verify('sha256', Buffer.from(body), certificate, Buffer.from(signature, 'base64'))) {
      console.error(`${platform}: the ${name} signature does not verify against certs/certificate.pem`);
      return false;
    }
    if (name === 'directive') {
      log(`${platform} ${runtimeVersion}: rollback directive live and signed (${JSON.parse(body).type})`);
      return expectedId === null;
    }
    const manifest = JSON.parse(body);
    if (expectedId && manifest.id !== expectedId) {
      console.error(`${platform}: live manifest is ${manifest.id}, expected ${expectedId}`);
      return false;
    }
    for (const asset of [manifest.launchAsset, ...manifest.assets]) {
      const bytes = Buffer.from(await (await fetch(asset.url)).arrayBuffer());
      if (createHash('sha256').update(bytes).digest('base64url') !== asset.hash) {
        console.error(`${platform}: asset ${asset.key} does not match its hash`);
        return false;
      }
    }
    log(
      `${platform} ${runtimeVersion}: live update ${manifest.id} verified (signature + ${1 + manifest.assets.length} files)`,
    );
    return true;
  }
  console.error(`${platform}: reply had no manifest or directive part`);
  return false;
}

function resolveRuntimeVersion(platform) {
  // A version string no store build will ever carry: the whole pipeline runs
  // for real against the live server, and no phone can receive the result.
  if (args.smokeTest) return 'smoke-test';
  const out = run('npx', ['expo-updates', 'runtimeversion:resolve', '--platform', platform], APP, true);
  const runtimeVersion = JSON.parse(out.slice(out.indexOf('{'))).runtimeVersion;
  if (typeof runtimeVersion !== 'string' || !runtimeVersion)
    fail(`could not resolve the ${platform} runtime version`);
  return runtimeVersion;
}

function r2Put(key, file, contentType) {
  run(
    'npx',
    [
      'wrangler',
      'r2',
      'object',
      'put',
      `${BUCKET}/${key}`,
      '--file',
      file,
      '--content-type',
      contentType,
      '--remote',
    ],
    WRANGLER_DIR,
    true,
  );
}

function r2Delete(key) {
  run('npx', ['wrangler', 'r2', 'object', 'delete', `${BUCKET}/${key}`, '--remote'], WRANGLER_DIR, true);
}

function r2PutText(key, text) {
  const file = join(mkdtempSync(join(tmpdir(), 'promptspend-record-')), 'record.json');
  writeFileSync(file, text);
  try {
    r2Put(key, file, 'application/json');
  } finally {
    rmSync(dirname(file), { recursive: true, force: true });
  }
}

function run(command, commandArgs, cwd, quiet = false) {
  const [file, argv] =
    command === 'npx'
      ? [process.execPath, [tool(commandArgs[0]), ...commandArgs.slice(1)]]
      : [command, commandArgs];
  const result = spawnSync(file, argv, {
    cwd,
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    fail(`${command} ${commandArgs.slice(0, 3).join(' ')} failed
${(result.stderr ?? result.error?.message ?? '').trim()}`);
  }
  return result.stdout;
}

function tool(name) {
  const path = TOOLS[name];
  if (!path || !existsSync(path)) {
    fail(`${name} is not installed; run npm ci in ${name === 'wrangler' ? 'updates/' : 'apps/mobile/'}`);
  }
  return path;
}

function git(gitArgs) {
  return run('git', gitArgs, APP, true).trim();
}

function kb(files) {
  return Math.round(files.reduce((total, file) => total + file.size, 0) / 1024);
}

function parseArgs(argv) {
  const parsed = {
    platform: 'all',
    dryRun: false,
    rollback: false,
    verify: false,
    allowDirty: false,
    smokeTest: false,
    message: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--rollback') parsed.rollback = true;
    else if (arg === '--verify') parsed.verify = true;
    else if (arg === '--allow-dirty') parsed.allowDirty = true;
    else if (arg === '--smoke-test') parsed.smokeTest = true;
    else if (arg === '--message') parsed.message = argv[++i] ?? '';
    else if (arg === '--platform') parsed.platform = argv[++i] ?? '';
    else fail(`unknown argument ${arg}`);
  }
  if (!['ios', 'android', 'all'].includes(parsed.platform)) fail('--platform must be ios, android or all');
  return parsed;
}

function log(message) {
  console.log(`• ${message}`);
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}
