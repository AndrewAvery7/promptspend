import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_REQUIRES_CONSENT,
  GA_MEASUREMENT_ID,
  GOOGLE_ANALYTICS_ENABLED,
} from '../../src/lib/analytics/config';

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
 * Google Analytics belongs to the website and, since 2026-10-29 (owner
 * decision), the iOS and Android apps, which report through Firebase from one
 * module only. The extension's listing and the API's docs say they carry no
 * analytics, and the apps' store labels promise no advertising ID and no
 * tracking, so a Google tag reaching anything else, or the app module loosening
 * its settings, would make a published declaration false without anyone
 * editing it.
 */
describe("Google Analytics stays on the website and the apps' one module", () => {
  const GOOGLE_TAG =
    /googletagmanager|google-analytics|analytics\.google|gtag\(|firebase\/analytics|@react-native-firebase\/analytics/i;

  it.each(['api/src', 'mcp/src', 'vscode/src', 'worker/src', 'updates/src'])('is not in %s', (directory) => {
    expect(sources(directory).filter((file) => GOOGLE_TAG.test(read(file)))).toEqual([]);
  });

  it('is loaded in the apps only by src/lib/usageStats.ts', () => {
    const holders = sources('apps/mobile/src').filter(
      (file) => !file.includes('/__tests__/') && GOOGLE_TAG.test(read(file)),
    );
    expect(holders).toEqual(['apps/mobile/src/lib/usageStats.ts']);
  });

  it("adds no other analytics or advertising library to the apps' dependencies", () => {
    const { dependencies } = JSON.parse(read('apps/mobile/package.json')) as {
      dependencies: Record<string, string>;
    };
    const tracking = Object.keys(dependencies).filter((name) =>
      /analytics|firebase|segment|amplitude|mixpanel|adjust|appsflyer|branch|admob|ads/i.test(name),
    );
    expect(tracking.sort()).toEqual(['@react-native-firebase/analytics', '@react-native-firebase/app']);
  });

  it('keeps advertising identifiers and ad features off in the apps', () => {
    const settings = (
      JSON.parse(read('apps/mobile/firebase.json')) as { 'react-native': Record<string, boolean> }
    )['react-native'];
    expect(settings).toMatchObject({
      analytics_auto_collection_enabled: false,
      google_analytics_adid_collection_enabled: false,
      google_analytics_ssaid_collection_enabled: false,
      analytics_idfv_collection_enabled: false,
      google_analytics_registration_with_ad_network_enabled: false,
      analytics_default_allow_ad_storage: false,
      analytics_default_allow_ad_user_data: false,
      analytics_default_allow_ad_personalization_signals: false,
    });
    const app = read('apps/mobile/app.json');
    expect(app).toContain('"withoutAdIdSupport": true');
    expect(app).toContain('"blockedPermissions": ["com.google.android.gms.permission.AD_ID"]');
  });

  it('names every screen and event the apps report on the privacy page', () => {
    const policy = read('src/content/information/privacy.md');
    const module = read('apps/mobile/src/lib/usageStats.ts');
    const screens = /USAGE_SCREENS = \[([^\]]+)\]/.exec(module)?.[1]?.match(/'([a-z_]+)'/g) ?? [];
    expect(screens.map((name) => name.replaceAll("'", ''))).toEqual([
      'home',
      'estimate',
      'compare',
      'data',
      'learn',
      'receipt',
    ]);
    expect(policy).toContain('Home, Estimate, Compare, Data & Alerts, Learn, or Receipt');
    const events = [...module.matchAll(/\| \{ name: '([a-z_]+)'/g)].map((match) => match[1]);
    expect(events).toEqual([
      'share',
      'tutorial_complete',
      'alert_signup_sent',
      'link_open',
      'opened_from_link',
    ]);
    for (const wording of [
      'that you opened a share sheet',
      'finished the guided tour',
      'sent an alert sign-up',
      "opened one of the app's links",
      'opened the app from a promptspend.com link',
      'Share usage statistics',
      'collects no advertising identifier',
    ])
      expect(policy).toContain(wording);
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

  it('sends key events through a module that cannot load Google Analytics itself', () => {
    const events = read('src/lib/analytics/events.ts');
    expect(events).not.toMatch(/createElement|googletagmanager|from '\.\/(ga|notice)'/);
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
  // No notice in this mode since 2026-10-30: the footer's link and Europe's
  // denied-by-default consent replace it.
  const NOTICE_MODE = [
    'Google Analytics loads when a page opens; there is no pop-up',
    'Your privacy choices, at the foot of every page',
    'In the European Economic Area, the United Kingdom and Switzerland, PromptSpend tells Google that you have not agreed',
    'If your browser sends Global Privacy Control, Google Analytics does not load at all.',
  ];
  const CONSENT_MODE = ['Google Analytics loads only after you click Accept', 'choose Decline on the notice'];

  // `GOOGLE_ANALYTICS_ENABLED` has two positions and each has sentences only it
  // makes true: running (the next two tests) or paused (the test after them).
  it.runIf(GOOGLE_ANALYTICS_ENABLED)(
    'says when Google Analytics loads, and how to refuse it, for the way the switch is set',
    () => {
      const [required, forbidden] = ANALYTICS_REQUIRES_CONSENT
        ? [CONSENT_MODE, NOTICE_MODE]
        : [NOTICE_MODE, CONSENT_MODE];
      for (const sentence of required) expect(policy).toContain(sentence);
      for (const sentence of forbidden) expect(policy).not.toContain(sentence);
      // The notice's old buttons are gone in both modes.
      expect(policy).not.toContain('OK or Turn off');
      expect(policy).not.toContain('Turn off on the notice');
    },
  );

  it.runIf(GOOGLE_ANALYTICS_ENABLED)(
    'names the cookies, what Google receives, and how to turn it off',
    () => {
      expect(policy).toContain('`_ga` and `_ga_' + GA_MEASUREMENT_ID.replace(/^G-/, '') + '`');
      expect(policy).toContain('except the private key a price-alert link carries');
      expect(policy).toContain('Google never receives text you paste');
      expect(policy).toContain('Google signals and ad personalization are switched on');
      expect(policy).toContain('tools.google.com/dlpage/gaoptout');
      expect(policy).toContain('Global Privacy Control');
      expect(policy).toContain('[[analytics-choice]]');
    },
  );

  it.skipIf(GOOGLE_ANALYTICS_ENABLED)(
    'says the website does not use Google Analytics, and describes nothing that is not running',
    () => {
      expect(policy).toContain('does not currently use Google Analytics');
      for (const sentence of [...NOTICE_MODE, ...CONSENT_MODE]) expect(policy).not.toContain(sentence);
      expect(policy).not.toContain('[[analytics-choice]]');
      expect(policy).not.toContain('`_ga_' + GA_MEASUREMENT_ID.replace(/^G-/, '') + '`');
      expect(policy).not.toContain('tools.google.com/dlpage/gaoptout');
      // The README and SECURITY.md describe the same state.
      expect(read('README.md')).toContain('Google Analytics is paused');
      expect(read('SECURITY.md')).toContain('is paused');
    },
  );

  // The other half of the pause test above: when the switch goes back to true, the
  // documents that say "paused" must be rewritten, not left behind.
  it.runIf(GOOGLE_ANALYTICS_ENABLED)('no longer says Google Analytics is paused anywhere', () => {
    for (const file of ['README.md', 'SECURITY.md', 'docs/ARCHITECTURE.md', 'docs/PAGES.md']) {
      expect(read(file), file).not.toMatch(/Google Analytics (4 )?is paused/i);
    }
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
