import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

/**
 * Tests run inside workerd, not Node, against a local R2 bucket that miniflare
 * provides from the binding in wrangler.jsonc. The protocol is headers,
 * multipart framing and byte-exact bodies, which is runtime behaviour: a
 * mocked Response in Node would prove only that the mock is right.
 */
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
});
