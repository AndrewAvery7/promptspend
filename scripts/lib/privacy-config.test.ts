import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_REQUIRES_CONSENT, GA_MEASUREMENT_ID } from '../../src/lib/analytics/config';

/**
 * The logging settings the privacy policy describes, held to what the
 * deployment configuration actually says.
 *
 * The policy tells visitors which services keep request logs and which do not.
 * Those are one-line settings in three wrangler files, and nothing else would
 * notice if somebody turned one back on while debugging: the Worker would
 * start recording alert links, private tokens included, and the policy would
 * keep saying it did not. If a test here fails, change the setting back, or
 * change the privacy page and the README in the same commit.
 */
const read = (relative: string): string => readFileSync(resolve(__dirname, '../..', relative), 'utf8');

describe('the logging settings the privacy policy describes', () => {
  it('keeps per-request logs off on the alerts Worker, whose links carry private tokens', () => {
    expect(read('worker/wrangler.jsonc')).toMatch(/"invocation_logs":\s*false/);
  });

  it('keeps all logging off on the update server', () => {
    const config = read('updates/wrangler.jsonc');
    expect(config).toMatch(/"observability":\s*\{\s*"enabled":\s*false/);
    expect(config).toMatch(/"logpush":\s*false/);
  });

  it('leaves request logs on for the pricing API, which has no secrets in its addresses', () => {
    expect(read('api/wrangler.jsonc')).toMatch(/"observability":\s*\{\s*"enabled":\s*true\s*\}/);
  });

  it('says so on the privacy page', () => {
    const policy = read('src/content/information/privacy.md');
    expect(policy).toContain("alert service's per-request logging is switched off");
    expect(policy).toContain("has Cloudflare's request logging switched on");
    expect(policy).toContain("the update server's logging is switched off");
  });
});

/** Every source file under a directory, skipping dependencies and build output. */
function sources(directory: string): string[] {
  const root = resolve(__dirname, '../..');
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (['node_modules', 'dist', 'coverage', '.expo', 'out'].includes(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(m?[jt]sx?|html|json|jsonc)$/.test(name))
        out.push(relative(root, path).split('\\').join('/'));
    }
  };
  walk(resolve(root, directory));
  return out;
}

/**
 * Google Analytics belongs to the website only (owner decision 2026-10-06).
 * The apps' store privacy labels, the extension's listing and the API's docs
 * all say they carry no analytics, so a Google tag reaching any of them would
 * make a published declaration false without anyone editing it.
 */
describe('Google Analytics stays on the website', () => {
  const GOOGLE_TAG =
    /googletagmanager|google-analytics|analytics\.google|gtag\(|firebase\/analytics|@react-native-firebase\/analytics/i;

  it.each(['apps/mobile/src', 'api/src', 'mcp/src', 'vscode/src', 'worker/src', 'updates/src'])(
    'is not in %s',
    (directory) => {
      expect(sources(directory).filter((file) => GOOGLE_TAG.test(read(file)))).toEqual([]);
    },
  );

  it("is not in the apps' own dependencies", () => {
    const manifest = read('apps/mobile/package.json');
    expect(manifest).not.toMatch(/analytics|firebase|segment|amplitude|mixpanel/i);
  });

  it('is not on the bot-check page the apps open inside their own web view', () => {
    expect(read('public/mobile-turnstile.html')).not.toMatch(GOOGLE_TAG);
  });

  it('is started only by the three website entry points, so the extension and MCP server, which share src/, never pull it in', () => {
    const importers = sources('src').filter(
      (file) =>
        !/\.test\.tsx?$/.test(file) &&
        !file.startsWith('src/lib/analytics/') &&
        /from '[^']*analytics\/(notice|ga)'/.test(read(file)),
    );
    expect(importers.sort()).toEqual(['src/chrome/site-header.tsx', 'src/main.tsx', 'src/receipt/main.tsx']);
  });

  it('keeps the Measurement ID in one place', () => {
    const holders = [
      ...sources('src'),
      ...sources('scripts'),
      'vite.config.ts',
      'index.html',
      'receipt/index.html',
    ]
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => read(file).includes(GA_MEASUREMENT_ID));
    expect(holders).toEqual(['src/lib/analytics/config.ts']);
  });
});

describe('the privacy page describes the analytics switch as it is set', () => {
  const policy = read('src/content/information/privacy.md');

  // Each position of the switch has sentences only it makes true. Flipping the
  // switch fails this test until the privacy page is rewritten to match.
  const NOTICE_MODE = [
    'Google Analytics loads when a page opens',
    'until you choose OK or Turn off',
    'choose Turn off on the notice',
    'If your browser sends Global Privacy Control, Google Analytics does not load at all.',
  ];
  const CONSENT_MODE = ['Google Analytics loads only after you click Accept', 'choose Decline on the notice'];

  it('says when Google Analytics loads, and how to refuse it, for the way the switch is set', () => {
    const [required, forbidden] = ANALYTICS_REQUIRES_CONSENT
      ? [CONSENT_MODE, NOTICE_MODE]
      : [NOTICE_MODE, CONSENT_MODE];
    for (const sentence of required) expect(policy).toContain(sentence);
    for (const sentence of forbidden) expect(policy).not.toContain(sentence);
  });

  it('names the cookies, what Google receives, and how to turn it off', () => {
    expect(policy).toContain('`_ga` and `_ga_' + GA_MEASUREMENT_ID.replace(/^G-/, '') + '`');
    expect(policy).toContain('without anything after a question mark or a hash sign');
    expect(policy).toContain('Google never receives text you paste or type');
    expect(policy).toContain('tools.google.com/dlpage/gaoptout');
    expect(policy).toContain('Global Privacy Control');
    expect(policy).toContain('[[analytics-choice]]');
  });

  it('no longer promises what the website stopped doing', () => {
    for (const file of [
      'README.md',
      'SECURITY.md',
      'src/components/SiteFooter.tsx',
      'src/components/Provenance.tsx',
      'src/lib/seo/render.ts',
      'tools/make-assets.py',
      'index.html',
    ]) {
      expect(read(file), file).not.toMatch(/no cookies|there is no cookie|accounts, ads or cookies/i);
    }
    expect(read('tools/make-promo.py')).not.toContain('"NO COOKIES"');
  });
});
