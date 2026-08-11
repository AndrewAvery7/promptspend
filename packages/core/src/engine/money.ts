/**
 * Money handling.
 *
 * Rates are published as "USD per 1,000,000 tokens", so a naive
 * `tokens * rate / 1e6` accumulates binary-float noise that shows up as
 * `$0.30000000000000004` in the UI and as drifting sums when the parts are
 * added back together.
 *
 * The fix is to do the per-request multiplication in integers:
 *   - a rate is stored as an integer number of micro-dollars per 1M tokens
 *     (`$0.435/M` -> `435000`), and
 *   - a cost is an integer number of pico-dollars (1e-12 USD).
 *
 * `tokens * microsPerMillion` is exact for every realistic request: a
 * 1M-token call against the priciest model in the catalog is ~5e13, against a
 * 9e15 ceiling. Above that ceiling the product is finished in `BigInt` and
 * converted back, which is lossy only in the last few pico-dollars of a figure
 * already past $9,000 *per request* — twelve orders of magnitude below a cent,
 * and reached only by deliberately extreme URL parameters.
 *
 * Throwing instead, as an earlier version did, turned those parameters into a
 * blank page: `costPico` is called during render, and nothing caught it.
 *
 * Scaling to per-day/month/year multiplies the dollar value by plain integers;
 * that is ordinary floating point but with ~15 significant digits of headroom
 * against values that need at most 9, so it cannot move a displayed cent.
 */

export const PICO_PER_DOLLAR = 1e12;
const MICROS_PER_DOLLAR = 1e6;

/** Convert a published "$ per 1M tokens" rate into integer micro-dollars. */
export function rateToMicros(dollarsPerMillion: number): number {
  if (!Number.isFinite(dollarsPerMillion) || dollarsPerMillion < 0) {
    throw new RangeError(`rate must be a non-negative finite number, got ${dollarsPerMillion}`);
  }
  return Math.round(dollarsPerMillion * MICROS_PER_DOLLAR);
}

/**
 * Exact cost of `tokens` tokens at `dollarsPerMillion`, in pico-dollars.
 * Token counts are rounded to integers first — a fractional token is always an
 * estimation artefact, never a real billable quantity.
 */
export function costPico(tokens: number, dollarsPerMillion: number): number {
  if (!Number.isFinite(tokens) || tokens < 0) {
    throw new RangeError(`tokens must be a non-negative finite number, got ${tokens}`);
  }
  const whole = Math.round(tokens);
  const micros = rateToMicros(dollarsPerMillion);
  const pico = whole * micros;
  if (Number.isSafeInteger(pico)) return pico;
  // Past the exact range. Finish in BigInt so the answer stays right to ~15
  // significant figures instead of throwing mid-render.
  return Number(BigInt(whole) * BigInt(micros));
}

/** True while `costPico` is still exact to the pico-dollar. */
export function isExactCost(tokens: number, dollarsPerMillion: number): boolean {
  return Number.isSafeInteger(Math.round(tokens) * rateToMicros(dollarsPerMillion));
}

export function picoToDollars(pico: number): number {
  return pico / PICO_PER_DOLLAR;
}

export function dollarsToPico(dollars: number): number {
  return Math.round(dollars * PICO_PER_DOLLAR);
}

/** Round a dollar amount to whole cents (used for exports, never mid-calculation). */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100) / 100;
}
