import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const APP = JSON.parse(readFileSync(resolve(ROOT, 'app.json'), 'utf8')).expo;
const EAS = JSON.parse(readFileSync(resolve(ROOT, 'eas.json'), 'utf8'));
const PACKAGE = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const STORE = JSON.parse(readFileSync(resolve(ROOT, 'store/metadata.en-US.json'), 'utf8'));
const problems = [];

// Host/CI preflight only. This script deliberately reads store/privacy/QA
// evidence outside apps/mobile; .easignore then removes those non-build inputs
// from the upload. It must run before archive creation, not as an EAS hook.

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

function sourceFiles(directory) {
  return readdirSync(resolve(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
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
if (!APP.plugins?.includes('./plugins/with-android-data-protection')) {
  fail('Android cloud-backup and device-transfer protection plugin is missing');
}
if (APP.android?.usesCleartextTraffic === true) fail('Android cleartext network traffic must not be enabled');
if (PACKAGE.dependencies?.['react-native-webview'] !== '13.16.1') {
  fail('react-native-webview must stay on the Expo SDK 57 supported version');
}
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
if (EAS.cli?.appVersionSource !== 'remote') fail('EAS appVersionSource must remain remote');
if (EAS.build?.production?.autoIncrement !== true)
  fail('production build auto-increment must remain enabled');
for (const profile of ['development', 'preview', 'production']) {
  if (EAS.build?.[profile]?.env?.EXPO_PUBLIC_ALERTS_API !== 'https://api.promptspend.dev') {
    fail(`${profile} alerts API must be pinned to https://api.promptspend.dev`);
  }
}

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

for (const path of sourceFiles('src')) {
  if (!/\.[cm]?[jt]sx?$/.test(path) || /\.web\.[cm]?[jt]sx?$/.test(path)) continue;
  const source = requireFile(path)?.toString('utf8') ?? '';
  if (source.includes('expo-router/head')) {
    fail(`${path} imports Expo Head on native; keep web document metadata in a .web module`);
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
  '../../worker/src/turnstile-page.ts',
  '../../src/content/information/privacy.md',
  '../../src/content/information/support.md',
  '../../docs/STORE_RELEASE_PACKAGE.md',
  '../../docs/STORE_SCREENSHOTS.md',
  '../../docs/MOBILE_BETA_QA.md',
  '../../docs/MOBILE_RELEASE_RUNBOOK.md',
  'assets/images/favicon.png',
  'plugins/with-android-data-protection.js',
  'store/build-history.json',
]) {
  requireFile(path);
}

const privacy = requireFile('../../src/content/information/privacy.md')?.toString('utf8') ?? '';
const releasePackage = requireFile('../../docs/STORE_RELEASE_PACKAGE.md')?.toString('utf8') ?? '';
const security = requireFile('SECURITY.md')?.toString('utf8') ?? '';
const metadataText = JSON.stringify(STORE);
for (const [label, source] of [
  ['privacy policy', privacy],
  ['store release package', releasePackage],
  ['store metadata', metadataText],
]) {
  if (!/email address/i.test(source) || !/alert/i.test(source)) {
    fail(`${label} must disclose optional email alerts and email-address processing`);
  }
}
for (const staleClaim of ['we do not collect data from this app', 'No account exists']) {
  if (releasePackage.includes(staleClaim)) fail(`store release package contains stale claim: ${staleClaim}`);
}
if (!/Email Address[\s\S]{0,220}App Functionality/i.test(releasePackage)) {
  fail('Apple privacy draft must classify Email Address for App Functionality');
}
if (
  !/device-transfer|device transfer/i.test(
    requireFile('plugins/with-android-data-protection.js')?.toString('utf8') ?? '',
  )
) {
  fail('Android data-protection plugin must explicitly exclude device transfer');
}
const securityReviewed = security.match(/Last reviewed:\s+([A-Za-z]+ \d{1,2}, \d{4})/i)?.[1];
if (!securityReviewed || Date.now() - new Date(securityReviewed).getTime() > 14 * 24 * 60 * 60 * 1000) {
  fail('SECURITY.md dependency triage must be re-derived within 14 days of a release check');
}

if (problems.length) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exitCode = 1;
} else {
  console.log('✓ Source-controlled mobile release contract checks passed');
  console.log(
    '  Device QA, screenshots, live dependency audit, credentials, and store answers still require release-time verification.',
  );
}
