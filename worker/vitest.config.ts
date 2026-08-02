import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

/**
 * Tests run inside workerd, not Node.
 *
 * The alternative — Node with mocked bindings — would let a test pass against a
 * D1 stub that behaves differently from the real thing, and would run the push
 * crypto on Node's WebCrypto rather than the runtime that will actually execute
 * it. Miniflare gives a real D1 and a real KV per test file, so the query layer
 * is exercised against genuine SQLite and the migrations are proved to apply.
 *
 * `cloudflareTest` is a Vite plugin as of pool version 0.20 (it was
 * `defineWorkersConfig` before Vitest 4 reworked how pools are registered).
 */
const migrations = await readD1Migrations('./migrations');

/**
 * The RFC 8291 example key pair, reused here as a VAPID pair.
 *
 * It is a valid P-256 pair, it is published in an RFC, and it is therefore the
 * safest possible thing to commit: nobody can mistake it for a real secret.
 */
const TEST_VAPID_PUBLIC =
  'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const TEST_VAPID_PRIVATE = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          TOKEN_SECRET: 'test-token-secret-not-used-anywhere-real',
          NOTIFY_SECRET: 'test-notify-secret-not-used-anywhere-real',
          VAPID_PUBLIC_KEY: TEST_VAPID_PUBLIC,
          VAPID_PRIVATE_KEY: TEST_VAPID_PRIVATE,
        },
      },
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
