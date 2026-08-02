export const REPO_URL = 'https://github.com/AndrewAvery7/promptspend';

/**
 * Contact routes. Both are Cloudflare Email Routing aliases, so either can be
 * retired without touching a real inbox address.
 */
export const CONTACT_EMAIL = 'info@promptspend.com';
export const SECURITY_EMAIL = 'security@promptspend.com';

/**
 * Origin of the price-alerts API (the `worker/` project in this repository).
 *
 * Set at build time by `VITE_ALERTS_API`. Empty is a legitimate configuration
 * and the one this site ships with until the API has a domain: the alerts UI
 * detects it and says the feature is not live yet, rather than rendering a form
 * that cannot submit.
 *
 * This is also the value the Content Security Policy opens `connect-src` for —
 * see the `csp` plugin in `vite.config.ts`. Changing it here changes both, and
 * nothing else needs editing.
 */
export const ALERTS_API = (import.meta.env.VITE_ALERTS_API ?? '').replace(/\/+$/, '');

/** Where the published catalog lives, relative to the deployed base path. */
export const PRICING_URL = `${import.meta.env.BASE_URL}data/pricing.json`;

/** The sync health manifest: proof the pipeline ran, separate from its output. */
export const HEALTH_URL = `${import.meta.env.BASE_URL}data/sync-status.json`;

/**
 * The generated, crawlable pages — one per model, provider and comparison.
 *
 * They are built by `scripts/build-pages.ts` after Vite finishes, and they are
 * not part of this bundle. Linking to them from the app matters for two
 * separate reasons: a visitor who wants a permanent URL for one model has one,
 * and a crawler that arrives here can reach all ~160 of them without the
 * sitemap being the only path in.
 */
export const MODELS_INDEX_URL = `${import.meta.env.BASE_URL}models/`;
export const PROVIDERS_INDEX_URL = `${import.meta.env.BASE_URL}providers/`;
export const COMPARE_INDEX_URL = `${import.meta.env.BASE_URL}compare/`;

/** The public pricing API, served from the .dev developer hub. */
export const DEVELOPER_HUB_URL = 'https://promptspend.dev';

/**
 * What these numbers cover, stated once and reused wherever the boundary
 * matters. Being specific about the edge of the model is the difference
 * between an estimate and a guess wearing an estimate's clothes.
 */
export const PRICING_SCOPE =
  'Standard-tier, global-endpoint list prices in USD. Regional/data-residency premiums, fast and priority tiers, server-side tool fees and negotiated discounts are not included.';
