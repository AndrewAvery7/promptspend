import { defineConfig, type Plugin } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages serves the site from /<repo>/ unless a custom domain is configured;
// set BASE_PATH=/ in the workflow when deploying to one. The dev server always
// serves from the root so local URLs stay simple.
//
// `??` is not enough here: an unset GitHub Actions variable arrives as an empty
// string, not as undefined, which would silently build every asset path
// relative to nothing and produce a site that 404s its own JavaScript.
const base =
  (process.env.BASE_PATH ?? '').trim() || (process.env.NODE_ENV === 'production' ? '/promptspend/' : '/');

/** Turnstile's widget. The only third-party origin the site can ever load. */
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

const CSP_PLACEHOLDER = '%CSP%';
const SITE_URL_PLACEHOLDER = '%SITE_URL%';

/**
 * Where this build will actually be served from, with no trailing slash.
 *
 * Everything a search engine or a social card reads has to be an *absolute*
 * URL, and there is no way to derive one at runtime from a static page. So it
 * is declared once here and substituted into the canonical link, the Open Graph
 * tags, the structured data, `robots.txt`, `sitemap.xml` and the Pages `CNAME`.
 *
 * Default is the GitHub Pages project URL. Set the repository variable
 * `SITE_URL` to `https://promptspend.com` at the domain cutover and every one of
 * those follows — see docs/DOMAINS.md.
 */
const siteUrl = ((process.env.SITE_URL ?? '').trim() || 'https://andrewavery7.github.io/promptspend').replace(
  /\/+$/,
  '',
);

/**
 * Crawl and hosting files, generated rather than committed.
 *
 * A committed `robots.txt` carrying the old domain is worse than none at all —
 * it points crawlers at a sitemap that is not there. Generating it from
 * `siteUrl` makes that failure impossible.
 *
 * `sitemap.xml` is **not** emitted here. It has to list the ~160 model,
 * provider and comparison pages, and those are written after this build by
 * `scripts/build-pages.ts`, which is also where the sitemap is produced.
 */
function seoAssets(url: string): Plugin {
  const host = new URL(url).hostname;
  // GitHub Pages takes the custom domain from a CNAME file in the artifact.
  // Emitting one while still deploying to github.io would break the live site,
  // so it appears only once SITE_URL names a domain of our own.
  // Matched as a domain, not a suffix. `endsWith('github.io')` is also true of
  // `notgithub.io`, which is a different owner entirely — the check has to be
  // the host itself or something below it.
  const isCustomDomain = !(host === 'github.io' || host.endsWith('.github.io'));

  return {
    name: 'promptspend-seo-assets',
    apply: 'build',
    generateBundle() {
      // `llms.txt` has no robots.txt directive of its own, so it is named in a
      // comment. Costs nothing, and it is where somebody looks first.
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `# ${host}\n# Machine-readable index for assistants: ${url}/llms.txt\n\nUser-agent: *\nAllow: /\n\nSitemap: ${url}/sitemap.xml\n`,
      });

      if (isCustomDomain) {
        this.emitFile({ type: 'asset', fileName: 'CNAME', source: `${host}\n` });
      }
    },
  };
}

/**
 * Build the Content Security Policy from the same configuration the app reads.
 *
 * GitHub Pages cannot set response headers, so the policy lives in a meta tag —
 * and a hand-maintained meta tag would drift from `VITE_ALERTS_API` the first
 * time the API moved, producing a site that silently cannot reach its own
 * backend. Generating it here means the origin is declared once.
 *
 * `connect-src` is the line that matters. It is what stops a compromised
 * dependency posting a pasted prompt somewhere, so it opens for the alerts API
 * and nothing else. When no API is configured the policy stays strictly
 * self-only, which is what the site ships with today.
 */
function contentSecurityPolicy(alertsApi: string): Plugin {
  return {
    name: 'promptspend-csp',
    transformIndexHtml(html) {
      const api = alertsApi;
      const connect = ["'self'", api].filter(Boolean);
      const script = ["'self'"];
      const frame = ["'none'"];

      if (api) {
        // Turnstile is permitted whenever an API exists, because whether it is
        // *required* is a runtime answer from GET /v1/config that the build
        // cannot know. Permitting a script is not loading it: a deployment
        // with Turnstile switched off never fetches this origin.
        script.push(TURNSTILE_ORIGIN);
        connect.push(TURNSTILE_ORIGIN);
        frame[0] = TURNSTILE_ORIGIN;
      }

      const policy = [
        "default-src 'self'",
        `script-src ${script.join(' ')}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        `connect-src ${connect.join(' ')}`,
        `frame-src ${frame.join(' ')}`,
        "worker-src 'self'",
        "manifest-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        // The alerts form submits with fetch, never a native form POST, so
        // nothing legitimate needs this — which makes it a clean way to stop a
        // compromised script exfiltrating by building a form.
        "form-action 'none'",
        "object-src 'none'",
      ].join('; ');

      // `replaceAll`, not `replace`. With a string pattern `replace` substitutes
      // only the first match, and the first one used to be inside the comment
      // above the meta tag in index.html — so the comment received the policy
      // and the tag shipped the literal placeholder. A CSP that silently fails
      // to apply is worse than no CSP, because everything still looks right.
      if (!html.includes(CSP_PLACEHOLDER)) {
        throw new Error(
          `index.html has no ${CSP_PLACEHOLDER} placeholder — the Content Security Policy would ship empty.`,
        );
      }
      if (!html.includes(SITE_URL_PLACEHOLDER)) {
        throw new Error(
          `index.html has no ${SITE_URL_PLACEHOLDER} placeholder — canonical and Open Graph URLs would ship relative.`,
        );
      }
      return html.replaceAll(CSP_PLACEHOLDER, policy).replaceAll(SITE_URL_PLACEHOLDER, siteUrl);
    },
  };
}

/**
 * This file's own directory.
 *
 * Not `process.cwd()`: the dev server is often launched from somewhere else
 * with the project passed as an argument, and then `.env.local` is looked for
 * in the wrong place and silently not found. The config's location is the one
 * thing that is always right.
 */
const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  // `loadEnv` rather than `process.env` directly, because the client reads
  // `import.meta.env.VITE_ALERTS_API` — which Vite resolves from .env files as
  // well as the environment. Reading only `process.env` here would mean a
  // `.env.local` configured the client and not the policy, producing a dev
  // build whose own API calls its CSP blocks. One source, both consumers.
  const env = loadEnv(mode, projectRoot, 'VITE_');
  const alertsApi = (env.VITE_ALERTS_API ?? '').replace(/\/+$/, '');

  return {
    base,
    // Pin both to this file's directory for the same reason.
    root: projectRoot,
    envDir: projectRoot,
    plugins: [react(), contentSecurityPolicy(alertsApi), seoAssets(siteUrl)],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      target: 'es2022',
      // Source maps are ~4 MB and publishing them ships the whole codebase twice
      // over — once minified, once not — to every visitor's browser tools. The
      // source is on GitHub for anyone who wants to read it. Set
      // SOURCEMAP=1 locally when you actually need to debug a production build.
      sourcemap: process.env.SOURCEMAP === '1',
      // The tokenizer chunk is deliberately large and deliberately lazy, so the
      // generic warning is noise. `npm run check:budget` enforces the limit that
      // actually matters — the size of the initial payload.
      chunkSizeWarningLimit: 4096,
      rollupOptions: {
        output: {
          // Keep the tokenizer out of the initial bundle — it is only fetched
          // when a visitor pastes text for an OpenAI-family model.
          manualChunks(id) {
            if (id.includes('js-tiktoken')) return 'tokenizer';
            return undefined;
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        // Components and state orchestration were excluded, which meant the
        // coverage number described only the code that was already the most
        // carefully tested. Thresholds are set at roughly today's level so the
        // number can only go up; the engine and pipeline are held much higher
        // because that is where a silent error costs the most.
        include: ['src/lib/**/*.ts', 'src/state/**/*.ts', 'src/components/**/*.tsx', 'scripts/lib/**/*.ts'],
        exclude: ['**/*.test.ts', '**/*.test.tsx'],
        thresholds: {
          lines: 70,
          statements: 70,
          functions: 75,
          branches: 70,
          'src/lib/engine/**': { lines: 90, statements: 90, functions: 90, branches: 80 },
          'scripts/lib/**': { lines: 90, statements: 90, functions: 90, branches: 80 },
        },
      },
    },
  };
});
