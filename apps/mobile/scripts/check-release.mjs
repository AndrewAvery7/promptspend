import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const APP = JSON.parse(readFileSync(resolve(ROOT, 'app.json'), 'utf8')).expo;
const EAS = JSON.parse(readFileSync(resolve(ROOT, 'eas.json'), 'utf8'));
const PACKAGE = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const STORE = JSON.parse(readFileSync(resolve(ROOT, 'store/metadata.en-US.json'), 'utf8'));
const problems = [];

function fail(message) {
  problems.push(message);
}

function requireFile(path) {
  try {
    return readFileSync(resolve(ROOT, path));
  } catch {
    fail(`${path} is missing`);
    return null;
  }
}

function png(path, width, height, alpha) {
  const bytes = requireFile(path);
  if (!bytes) return;
  if (bytes.subarray(1, 4).toString('ascii') !== 'PNG') {
    fail(`${path} is not a PNG`);
    return;
  }
  const actualWidth = bytes.readUInt32BE(16);
  const actualHeight = bytes.readUInt32BE(20);
  const colorType = bytes[25];
  const hasAlpha = colorType === 4 || colorType === 6;
  if (actualWidth !== width || actualHeight !== height) {
    fail(`${path} is ${actualWidth}x${actualHeight}; expected ${width}x${height}`);
  }
  if (alpha === false && hasAlpha) fail(`${path} has an alpha channel; store artwork must be opaque`);
  if (alpha === true && !hasAlpha) fail(`${path} has no alpha channel; transparent artwork is expected`);
}

png('assets/images/icon.png', 1024, 1024, false);
png('assets/images/android-icon-foreground.png', 1024, 1024, true);
png('assets/images/android-icon-monochrome.png', 1024, 1024, true);
png('assets/images/splash-icon.png', 512, 512, true);
png('assets/images/splash-icon-dark.png', 512, 512, true);

for (const file of [
  'assets/fonts/ibm-plex-sans-400.ttf',
  'assets/fonts/ibm-plex-sans-600.ttf',
  'assets/fonts/jetbrains-mono-400.ttf',
  'assets/fonts/jetbrains-mono-700.ttf',
  'assets/fonts/space-grotesk-500.ttf',
  'assets/fonts/space-grotesk-700.ttf',
  'assets/fonts/LICENSE-IBM-PLEX-SANS.txt',
  'assets/fonts/LICENSE-JETBRAINS-MONO.txt',
  'assets/fonts/LICENSE-SPACE-GROTESK.txt',
]) {
  requireFile(file);
}

if (APP.name !== 'PromptSpend') fail('app name must remain PromptSpend');
if (APP.version !== '0.1.0') fail(`unexpected release version ${APP.version}`);
if (APP.ios?.bundleIdentifier !== 'com.promptspend.app') fail('iOS bundle identifier drifted');
if (APP.android?.package !== 'com.promptspend.app') fail('Android package name drifted');
if (APP.ios?.supportsTablet !== true) fail('iPad support must remain enabled');
if (APP.userInterfaceStyle !== 'automatic') fail('system light/dark support must remain enabled');
if (APP.ios?.infoPlist?.ITSAppUsesNonExemptEncryption !== false) {
  fail('export-compliance declaration is missing or changed');
}
if (APP.android?.allowBackup !== false) fail('Android backup must remain disabled for local scenario data');
if (APP.android?.usesCleartextTraffic === true) fail('Android cleartext network traffic must not be enabled');
if (Array.isArray(APP.android?.permissions) && APP.android.permissions.length > 0) {
  fail('launch build must not request explicit Android runtime permissions');
}
const iosUsageDescriptions = Object.keys(APP.ios?.infoPlist ?? {}).filter((key) =>
  /^NS.*UsageDescription$/.test(key),
);
if (iosUsageDescriptions.length > 0) {
  fail(`launch build contains unexpected iOS permission descriptions: ${iosUsageDescriptions.join(', ')}`);
}
if (EAS.submit?.production?.ios?.ascAppId !== '6800386428') fail('App Store Connect app id drifted');
if (EAS.build?.production?.autoIncrement !== true)
  fail('production build auto-increment must remain enabled');

const utf8Bytes = (value) => Buffer.byteLength(value, 'utf8');
const limits = [
  ['store name', STORE.name, 30, 'characters'],
  ['Apple subtitle', STORE.apple?.subtitle, 30, 'characters'],
  ['Apple promotional text', STORE.apple?.promotionalText, 170, 'characters'],
  ['Apple keywords', STORE.apple?.keywords, 100, 'bytes'],
  ['Apple description', STORE.apple?.description, 4000, 'characters'],
  ['Google short description', STORE.google?.shortDescription, 80, 'characters'],
  ['Google full description', STORE.google?.fullDescription, 4000, 'characters'],
];
for (const [label, value, limit, unit] of limits) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} is missing`);
    continue;
  }
  const length = unit === 'bytes' ? utf8Bytes(value) : [...value].length;
  if (length > limit) fail(`${label} is ${length} ${unit}; limit is ${limit}`);
}
for (const key of ['supportUrl', 'marketingUrl', 'privacyPolicyUrl']) {
  if (!/^https:\/\//.test(STORE[key] ?? '')) fail(`${key} must be an absolute HTTPS URL`);
}
if (STORE.supportEmail !== 'info@promptspend.com') fail('support email drifted');

for (const dependency of [
  'expo-camera',
  'expo-contacts',
  'expo-location',
  'expo-media-library',
  'expo-notifications',
  'expo-tracking-transparency',
  'react-native-permissions',
]) {
  if (PACKAGE.dependencies?.[dependency]) {
    fail(`${dependency} was added, but the launch privacy contract allows no sensitive permissions`);
  }
}

const easIgnore = requireFile('../../.easignore')?.toString('utf8') ?? '';
for (const pattern of [
  '.env',
  'referrers-*.json',
  'credentials.json',
  'google-services.json',
  'GoogleService-Info.plist',
  '*.jks',
  '*.p8',
  '*.p12',
  '*.mobileprovision',
]) {
  if (!easIgnore.split(/\r?\n/).includes(pattern)) {
    fail(`.easignore must exclude ${pattern}`);
  }
}

for (const path of [
  '../../src/content/information/privacy.md',
  '../../src/content/information/support.md',
  '../../docs/STORE_RELEASE_PACKAGE.md',
  '../../docs/STORE_SCREENSHOTS.md',
  '../../docs/MOBILE_BETA_QA.md',
  '../../docs/MOBILE_RELEASE_RUNBOOK.md',
]) {
  requireFile(path);
}

if (problems.length) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exitCode = 1;
} else {
  console.log('✓ Mobile release assets, identifiers, policy pages, and runbooks are present and consistent');
}
