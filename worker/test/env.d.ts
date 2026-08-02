/// <reference types="@cloudflare/vitest-pool-workers/types" />

/**
 * What the tests see in `env`.
 *
 * `wrangler types` generates `Cloudflare.Env` from wrangler.jsonc, which covers
 * the bindings and the plain vars but by definition cannot know about secrets —
 * they are not in the config file, which is the point of them. These are the
 * ones the test harness injects through `vitest.config.ts`.
 */
import type { D1Migration } from '@cloudflare/vitest-pool-workers';

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      VAPID_PUBLIC_KEY?: string;
      VAPID_PRIVATE_KEY?: string;
      TOKEN_SECRET?: string;
      NOTIFY_SECRET?: string;
      EMAIL_API_TOKEN?: string;
      TURNSTILE_SECRET_KEY?: string;
    }
  }
}

export {};
