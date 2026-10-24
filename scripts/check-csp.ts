/**
 * Assert the built page actually carries the Content Security Policy.
 *
 * This check exists because of a real bug. The policy is generated at build
 * time and substituted into a placeholder in `index.html`; the substitution used
 * `String.replace` with a string pattern, which replaces only the *first*
 * occurrence — and the first occurrence was inside the explanatory comment above
 * the meta tag. The comment received the policy and the tag shipped the literal
 * placeholder. Everything looked right: the build passed, the page rendered, the
 * tag was present.
 *
 * A security header that silently fails to apply is worse than one that is
 * missing, because nothing about the output invites you to look. So the built
 * artifact is checked rather than the source that produces it.
 *
 *   npm run build && npm run check:csp
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = [
  { name: 'calculator', path: resolve(ROOT, 'dist/index.html'), strictStyle: false, generated: false },
  { name: 'receipt', path: resolve(ROOT, 'dist/receipt/index.html'), strictStyle: true, generated: false },
  // One generated page stands for all of them: they share one layout() and one
  // policy (src/lib/seo/render.ts), which render.test.ts pins page by page.
  {
    name: 'privacy page',
    path: resolve(ROOT, 'dist/privacy/index.html'),
    strictStyle: true,
    generated: true,
  },
] as const;

/** Directives that must be present and non-empty, whatever else changes. The
 *  generated pages start from `default-src 'none'`, which already covers
 *  `object-src`. */
const REQUIRED = ['default-src', 'script-src', 'connect-src', 'base-uri', 'object-src'] as const;

/**
 * Google Analytics 4 (owner decision 2026-10-06): gtag.js's host, and the hosts
 * it reports to. Written out here rather than imported from
 * src/lib/analytics/config.ts, so that adding a host there fails this check
 * until somebody adds it here on purpose.
 */
const GOOGLE_SCRIPT = 'https://www.googletagmanager.com';
const GOOGLE_COLLECT = [
  'https://www.google-analytics.com',
  'https://region1.google-analytics.com',
  'https://region1.analytics.google.com',
];

/**
 * Every remote origin each directive may admit. Anything else is a mistake.
 *
 * - script-src: Turnstile (only when the alerts API is configured), Cloudflare
 *   Web Analytics' beacon (2026-10-05), and gtag.js (2026-10-06).
 * - connect-src: Turnstile, the alerts API, and Google Analytics' reports. The
 *   alerts API's origin is whatever the build was given, so it is read from
 *   the same variable the build reads.
 * - img-src: the LaunchNest badge (2026-10-05) and Google Analytics' image
 *   fallback.
 */
const ALLOWED: Record<string, Set<string>> = {
  'script-src': new Set([
    'https://challenges.cloudflare.com',
    'https://static.cloudflareinsights.com',
    GOOGLE_SCRIPT,
  ]),
  'connect-src': new Set([
    'https://challenges.cloudflare.com',
    // The build reads it the same way (vite.config.ts), .env files included.
    ...[(loadEnv('production', ROOT, 'VITE_').VITE_ALERTS_API ?? '').replace(/\/+$/, '')].filter(Boolean),
    GOOGLE_SCRIPT,
    ...GOOGLE_COLLECT,
  ]),
  'img-src': new Set(['https://launchnest.io', GOOGLE_SCRIPT, ...GOOGLE_COLLECT]),
  'frame-src': new Set(['https://challenges.cloudflare.com']),
};

/** Origins every page must admit, so Google Analytics can actually report. */
const MUST_ADMIT: Record<string, string[]> = {
  'script-src': [GOOGLE_SCRIPT],
  'connect-src': GOOGLE_COLLECT,
};

/** The remote origins one directive of a policy admits. */
function remoteSources(policy: string, directive: string): string[] {
  const value = new RegExp(`(?:^|;)\\s*${directive}\\s+([^;]*)`).exec(policy)?.[1] ?? '';
  return value
    .trim()
    .split(/\s+/)
    .filter((source) => source.startsWith('http') || source.includes('*'));
}

async function main(): Promise<void> {
  const problems: string[] = [];

  for (const page of PAGES) {
    if (!existsSync(page.path)) {
      problems.push(`${page.name}: ${page.path} does not exist — run \`npm run build\` first`);
      continue;
    }

    const html = await readFile(page.path, 'utf8');
    if (html.includes('%CSP%')) {
      problems.push(`${page.name}: the %CSP% placeholder survived the build`);
    }

    // The generated pages escape their quotes; the browser reads them unescaped.
    const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/
      .exec(html)?.[1]
      ?.replaceAll('&#39;', "'");
    if (policy === undefined) {
      problems.push(`${page.name}: no Content-Security-Policy meta tag in the built page`);
      continue;
    }
    if (/(^|;)\s*frame-ancestors\b/.test(policy)) {
      console.log(
        `  note: ${page.name} meta-delivered frame-ancestors is ignored by browsers; no protection is claimed`,
      );
    }
    for (const directive of REQUIRED) {
      if (page.generated && directive === 'object-src') continue;
      const found = new RegExp(`(^|;)\\s*${directive}\\s+\\S`).test(policy);
      if (!found) problems.push(`${page.name}: policy is missing a non-empty \`${directive}\``);
    }
    if (/connect-src[^;]*[\s"]\*/.test(policy)) {
      problems.push(`${page.name}: connect-src contains a wildcard`);
    }
    if (/script-src[^;]*'unsafe-eval'/.test(policy)) {
      problems.push(`${page.name}: script-src allows 'unsafe-eval'`);
    }
    // Remote origins are an allowlist, directive by directive.
    for (const directive of [
      'default-src',
      'script-src',
      'connect-src',
      'img-src',
      'frame-src',
      'style-src',
      'font-src',
    ]) {
      for (const origin of remoteSources(policy, directive)) {
        if (!ALLOWED[directive]?.has(origin)) {
          problems.push(`${page.name}: ${directive} admits unapproved ${origin}`);
        }
      }
    }
    for (const [directive, origins] of Object.entries(MUST_ADMIT)) {
      const admitted = remoteSources(policy, directive);
      for (const origin of origins) {
        if (!admitted.includes(origin)) {
          problems.push(
            `${page.name}: ${directive} does not admit ${origin}; Google Analytics could not report`,
          );
        }
      }
    }
    // The beacon posts to the site's own /cdn-cgi/rum. Admitting Cloudflare's
    // shared collector instead would let any injected script post data to an
    // analytics account its author controls.
    if (/connect-src[^;]*cloudflareinsights/.test(policy)) {
      problems.push(
        `${page.name}: connect-src admits cloudflareinsights.com; the beacon must report to 'self'`,
      );
    }
    if (page.strictStyle && /style-src[^;]*'unsafe-inline'/.test(policy)) {
      problems.push(`${page.name}: style-src unnecessarily allows 'unsafe-inline'`);
    }

    console.log(
      `✓ ${page.name} Content Security Policy — ${policy.split(';').filter(Boolean).length} directives`,
    );
    console.log(`  connect-src ${/connect-src ([^;]*)/.exec(policy)?.[1]?.trim() ?? '(none)'}`);
  }

  for (const problem of problems) console.error(`✗ ${problem}`);
  if (problems.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
