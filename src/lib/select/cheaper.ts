/**
 * "Is there a cheaper model that would still do this job?"
 *
 * The decision a price lookup is usually being made in service of, extracted so
 * that everything answering it answers it identically. Written for the MCP
 * server first, then needed verbatim by the VS Code extension's diagnostics —
 * at which point living inside a tool-response builder was the wrong home for
 * it, since that function's return value is presentation: snake_case keys,
 * figures rounded to two decimal places, a caveat string.
 *
 * This module returns the comparison rows. Formatting them is the caller's job.
 *
 * The capability bar is the load-bearing constraint and the softest number here.
 * `capabilityIndex` is an illustrative estimate, not a benchmark, and models
 * without one are excluded from candidacy rather than being given a default —
 * a model that might be worse is not an answer to "what is cheaper and as good".
 */
import { compareModels, type ComparisonRow, type Workload, type Scale } from '../engine/cost';
import type { Catalog } from '../pricing/catalog';
import type { Model } from '../pricing/types';

/**
 * A mid-sized assistant turn with history, at a thousand conversations a day.
 *
 * Chosen so the comparison exercises the things this project documents everyone
 * getting wrong: output priced separately from input, and history compounding
 * across turns.
 */
export const DEFAULT_WORKLOAD: Workload = {
  systemTokens: 800,
  userTokens: 150,
  outputTokens: 350,
  turns: 4,
};

export const DEFAULT_SCALE: Scale = {
  conversationsPerDay: 1000,
  monthlyActiveUsers: 1000,
  revenuePerUserPerMonth: 0,
};

export interface CheaperOptions {
  workload?: Workload;
  scale?: Scale;
  /**
   * Capability floor a candidate must clear. Defaults to the target's own
   * index; when the target has none, no bar is applied and every current model
   * is a candidate.
   */
  minCapability?: number;
}

export interface CheaperResult {
  target: Model;
  /** The target's own costed row, absent only if it could not be priced. */
  targetRow: ComparisonRow | undefined;
  /** The floor actually applied, or undefined when none was. */
  capabilityBar: number | undefined;
  /** Cheaper candidates, cheapest first. Empty is a real and common answer. */
  cheaper: ComparisonRow[];
  /** Set when nothing could be compared, explaining why rather than returning bare emptiness. */
  note?: string;
}

/**
 * Current, non-alias, non-stale models that clear the bar and cost less than
 * `target` on the same workload.
 *
 * Aliases are excluded because a routing alias and its target are one
 * purchasable model, and offering someone `gpt-5.6` as a saving over
 * `gpt-5.6-sol` would be offering them the thing they already have.
 */
export function findCheaperModels(
  catalog: Catalog,
  target: Model,
  options: CheaperOptions = {},
): CheaperResult {
  const bar = options.minCapability ?? target.capabilityIndex;

  const candidates = catalog.models.filter(
    (m) =>
      !m.aliasOf &&
      m.status === 'current' &&
      m.id !== target.id &&
      m.provenance.stale !== true &&
      (bar === undefined || (m.capabilityIndex !== undefined && m.capabilityIndex >= bar)),
  );

  if (candidates.length === 0) {
    return {
      target,
      targetRow: undefined,
      capabilityBar: bar,
      cheaper: [],
      note:
        bar === undefined
          ? 'No comparable current models found.'
          : `No current model scores at or above ${bar} on the capability estimate. ` +
            `That estimate is illustrative, not a benchmark — lower the bar to widen the search.`,
    };
  }

  const rows = compareModels(
    [target, ...candidates],
    options.workload ?? DEFAULT_WORKLOAD,
    options.scale ?? DEFAULT_SCALE,
  );
  const targetRow = rows.find((r) => r.model.id === target.id);

  return {
    target,
    targetRow,
    capabilityBar: bar,
    cheaper: rows.filter(
      (r) =>
        r.model.id !== target.id && targetRow !== undefined && r.scaled.perMonth < targetRow.scaled.perMonth,
    ),
  };
}
