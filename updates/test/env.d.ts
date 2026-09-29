/// <reference types="@cloudflare/vitest-pool-workers/types" />

/**
 * What the tests see in `env`.
 *
 * `wrangler types` generates `Cloudflare.Env` from wrangler.jsonc, which covers
 * the one binding this Worker has: the `UPDATES` R2 bucket. The reference above
 * is what makes `SELF` and `env` exist; declaring the module here instead would
 * *replace* the package's own types rather than add to them.
 */
export {};
