/**
 * Configuration for the public pricing API.
 *
 * Every field is a plain var in `wrangler.jsonc`. There are no secrets, because
 * there is nothing here to authenticate: the API serves one public file in
 * several shapes, to anyone, without a key. A key would create an account
 * system, a support burden and a database — for data that is already published
 * at a URL anybody can read.
 */
export interface Env {
  CATALOG_URL: string;
  SYNC_STATUS_URL: string;
  SITE_ORIGIN: string;
  FRESH_SECONDS: string;
  /** The one image `mcptry.ts` relays. Fixed here so the relay cannot fetch anything else. */
  MCPTRY_BADGE_URL: string;
}
