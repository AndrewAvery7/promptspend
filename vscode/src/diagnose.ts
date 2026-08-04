/**
 * The part that makes this a linter rather than a lookup.
 *
 * A price in the gutter tells you what you are paying. A diagnostic tells you
 * something you did not know to ask: that this model is deprecated, that its
 * price is disputed, that a sibling clears the same capability bar for a third
 * of the money.
 *
 * All of it is `Information` severity, never Warning or Error. None of these are
 * mistakes — a model can be the right choice at any price, and this extension is
 * in no position to know the requirements. A squiggle that says "you are wrong"
 * about a defensible engineering decision is how a linter gets uninstalled.
 *
 * Pure: no `vscode` import. Severity and range are the caller's to apply.
 */
import type { Catalog } from '@/lib/pricing/catalog';
import { findCheaperModels } from '@/lib/select/cheaper';
import { formatMoney } from '@/lib/engine/format';
import type { ModelMatch } from './scan';

export type FindingKind = 'disputed' | 'deprecated' | 'legacy' | 'stale' | 'cheaper-available';

export interface Finding {
  kind: FindingKind;
  /** Shown in the Problems panel, so it has to stand alone without the hover. */
  message: string;
  /** The match it belongs to, for turning into a range. */
  match: ModelMatch;
  /** A page backing the claim, where one exists. */
  url?: string;
}

/**
 * How much cheaper a sibling has to be before it is worth interrupting someone.
 *
 * Set at 40% because the alternative is noise. Nearly every model has *something*
 * marginally cheaper than it, and a diagnostic on all of them would be a file
 * full of squiggles saying nothing. Forty per cent of a real bill is a
 * conversation worth having; four per cent is not.
 */
const MATERIAL_SAVING = 0.4;

export function diagnose(matches: readonly ModelMatch[], catalog: Catalog): Finding[] {
  const findings: Finding[] = [];

  // One finding per distinct model, not per occurrence. A file listing eight
  // models in an array should not produce eight copies of the same advice.
  const seen = new Set<string>();

  for (const match of matches) {
    const model = match.model;
    if (seen.has(model.id)) continue;
    seen.add(model.id);

    const { provenance } = model;

    if (provenance.needsReview) {
      findings.push({
        kind: 'disputed',
        match,
        url: provenance.verifiedUrl,
        message:
          provenance.reviewNote ??
          `The price for ${model.displayName} is disputed — two sources disagree and no human has ` +
            `adjudicated it. Treat it as indicative rather than as a figure to plan against.`,
      });
    }

    if (provenance.stale) {
      findings.push({
        kind: 'stale',
        match,
        url: provenance.verifiedUrl,
        message:
          `Upstream has stopped listing ${model.displayName}, but no retirement has been confirmed. ` +
          `The price is being kept and marked rather than deleted; check the provider before relying on it.`,
      });
    }

    if (model.status === 'deprecated') {
      findings.push({
        kind: 'deprecated',
        match,
        url: provenance.verifiedUrl,
        message: `${model.displayName} is deprecated. Check the provider for a migration path.`,
      });
    } else if (model.status === 'legacy') {
      findings.push({
        kind: 'legacy',
        match,
        url: provenance.verifiedUrl,
        message: `${model.displayName} is a legacy model. A current sibling is likely to be both better and cheaper.`,
      });
    }

    const saving = materiallyCheaper(match, catalog);
    if (saving) findings.push(saving);
  }

  return findings;
}

/**
 * A cheaper alternative, but only when the gap is big enough to be worth saying.
 *
 * The wording matters as much as the threshold. `capabilityIndex` is an
 * illustrative estimate and not a benchmark, so the message says "worth testing"
 * and never "use this instead" — the extension does not know what the code needs,
 * and a diagnostic that pretends otherwise is giving advice it cannot support.
 */
function materiallyCheaper(match: ModelMatch, catalog: Catalog): Finding | undefined {
  const { targetRow, cheaper, capabilityBar } = findCheaperModels(catalog, match.model);

  // No bar means the target is unscored, which means every candidate is a guess
  // about quality. Saying nothing is better than recommending blind.
  if (capabilityBar === undefined || !targetRow) return undefined;

  const best = cheaper[0];
  if (!best) return undefined;

  const saved = targetRow.scaled.perMonth - best.scaled.perMonth;
  if (targetRow.scaled.perMonth <= 0 || saved / targetRow.scaled.perMonth < MATERIAL_SAVING) return undefined;

  return {
    kind: 'cheaper-available',
    match,
    message:
      `${best.model.displayName} scores at or above ${match.model.displayName} on the capability ` +
      `estimate and costs ${formatMoney(best.scaled.perMonth)} a month against ` +
      `${formatMoney(targetRow.scaled.perMonth)} on a standard workload — ` +
      `${formatMoney(saved * 12)} a year. That estimate is illustrative, not a benchmark, so this is ` +
      `worth testing rather than worth switching to blind.`,
  };
}
