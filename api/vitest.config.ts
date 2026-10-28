import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

/**
 * Tests run inside workerd, not Node.
 *
 * This Worker's whole job is HTTP semantics — caching, ETags, CORS, content
 * types — and those are runtime behaviour, not logic. Testing them against a
 * mocked `fetch` in Node would prove that the mock behaves as expected.
 *
 * `CATALOG_URL` points at a hostname that does not resolve, and every test
 * stubs `fetch` explicitly. A test run must never depend on promptspend.com
 * being up, and must never quietly pass because it did.
 */
export default defineConfig({
  resolve: {
    // `/mcp` imports the MCP package's tool code, which reaches the site's engine
    // through this alias. The Worker bundle resolves it from tsconfig `paths`;
    // vitest needs it spelled out, as `mcp/vitest.config.ts` does.
    alias: { '@': resolve(import.meta.dirname, '../src') },
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          CATALOG_URL: 'https://catalog.test/data/pricing.json',
          SYNC_STATUS_URL: 'https://catalog.test/data/sync-status.json',
          SITE_ORIGIN: 'https://promptspend.com',
          FRESH_SECONDS: '300',
        },
      },
    }),
  ],
});
