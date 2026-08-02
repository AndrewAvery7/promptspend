/// <reference types="@cloudflare/vitest-pool-workers/types" />

/**
 * What the tests see in `env`.
 *
 * `wrangler types` generates `Cloudflare.Env` from wrangler.jsonc, which already
 * covers every var this Worker has — there are no secrets and no bindings. The
 * reference above is what makes `SELF`, `env` and `fetchMock` exist; declaring
 * the module here instead would *replace* the package's own types rather than
 * add to them, and the imports would stop resolving.
 */
export {};
