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
 * `tokens * microsPerMillion` is then exact: realistic per-request inputs stay
 * far below `Number.MAX_SAFE_INTEGER` (a 1M-token request against the priciest
 * model in the catalog is ~5e13, versus a 9e15 ceiling), so no rounding happens
 * until the value is deliberately converted for display or scaled up.
 *
 * Scaling to per-day/month/year multiplies the dollar value by plain integers;
 * that is ordinary floating-point but with ~15 significant digits of headroom
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
  if (!Number.isSafeInteger(pico)) {
    // Only reachable with inputs far outside anything a real workload produces;
    // fail loudly rather than silently returning a lossy number.
    throw new RangeError(`cost overflow: ${whole} tokens at $${dollarsPerMillion}/M exceeds exact range`);
  }
  return pico;
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
