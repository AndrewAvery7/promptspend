import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PUBLIC_WELL_KNOWN = resolve(ROOT, '../..', 'public/.well-known');
const LINKING = resolve(ROOT, 'store/linking');

const appleTeamId = process.env.APPLE_TEAM_ID?.trim() ?? '';
const androidFingerprint = process.env.ANDROID_SHA256_CERT_FINGERPRINT?.trim().toUpperCase() ?? '';

if (!/^[A-Z0-9]{10}$/.test(appleTeamId)) {
  throw new Error('APPLE_TEAM_ID must be the exact 10-character Apple Team ID.');
}
if (!/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(androidFingerprint)) {
  throw new Error(
    'ANDROID_SHA256_CERT_FINGERPRINT must be the final Google Play App Signing SHA-256 fingerprint.',
  );
}

const apple = readFileSync(resolve(LINKING, 'apple-app-site-association.template.json'), 'utf8').replace(
  'APPLE_TEAM_ID',
  appleTeamId,
);
const android = readFileSync(resolve(LINKING, 'assetlinks.template.json'), 'utf8').replace(
  'PLAY_APP_SIGNING_SHA256_CERT_FINGERPRINT',
  androidFingerprint,
);

mkdirSync(PUBLIC_WELL_KNOWN, { recursive: true });
writeFileSync(resolve(PUBLIC_WELL_KNOWN, 'apple-app-site-association'), `${apple.trim()}\n`, 'utf8');
writeFileSync(resolve(PUBLIC_WELL_KNOWN, 'assetlinks.json'), `${android.trim()}\n`, 'utf8');

console.log('Prepared public/.well-known association files for review. No deployment was performed.');
