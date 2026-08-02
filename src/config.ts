export const REPO_URL = 'https://github.com/AndrewAvery7/promptspend';

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
 * What these numbers cover, stated once and reused wherever the boundary
 * matters. Being specific about the edge of the model is the difference
 * between an estimate and a guess wearing an estimate's clothes.
 */
export const PRICING_SCOPE =
  'Standard-tier, global-endpoint list prices in USD. Regional/data-residency premiums, fast and priority tiers, server-side tool fees and negotiated discounts are not included.';
