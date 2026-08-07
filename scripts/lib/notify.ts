/**
 * Turning a catalog diff into the change set the alerts worker publishes.
 *
 * The internal diff reports every field, which is right for a changelog and
 * wrong for a notification: nobody wants an email because a tokenizer ratio was
 * refined or a review note was reworded. This is the filter that decides what
 * is worth interrupting somebody for.
 */

import { diffCatalogs } from './diff';
import type { PricingCatalog } from '../../src/lib/pricing/types';

export type ChangeKind = 'added' | 'removed' | 'price';

export interface Rates {
  input: number;
  output: number;
}

export interface OutboundChange {
  modelId: string;
  displayName: string;
  provider: string;
  kind: ChangeKind;
  before?: Rates;
  after?: Rates;
}

function providerName(catalog: PricingCatalog | undefined, providerId: string | undefined): string {
  if (!catalog || !providerId) return 'unknown';
  return catalog.providers.find((provider) => provider.id === providerId)?.name ?? providerId;
}

/**
 * Only the three kinds that change what somebody pays, or whether they can buy
 * the model at all.
 *
 * Two reductions matter. Per-field price changes are folded back into one entry
 * per model, so a model whose input and output both moved is one line rather
 * than two. And routing aliases are dropped: announcing `gpt-5.6` and
 * `gpt-5.6-sol` separately is telling the same news twice.
 */
export function buildOutboundChanges(
  previous: PricingCatalog | undefined,
  next: PricingCatalog,
): OutboundChange[] {
  const diff = diffCatalogs(previous, next);
  const priorById = new Map((previous?.models ?? []).map((model) => [model.id, model]));
  const nextById = new Map(next.models.map((model) => [model.id, model]));
  const changes: OutboundChange[] = [];

  for (const model of diff.added) {
    const full = nextById.get(model.id);
    if (!full || full.aliasOf) continue;
    changes.push({
      modelId: model.id,
      displayName: model.displayName,
      provider: providerName(next, full.providerId),
      kind: 'added',
      after: { input: model.input, output: model.output },
    });
  }

  for (const modelId of new Set(diff.priceMoves.map((change) => change.id))) {
    const before = priorById.get(modelId);
    const after = nextById.get(modelId);
    if (!before || !after || after.aliasOf) continue;

    // Only the headline rates go out. A cache-write rate moving is real, but it
    // is not what somebody signed up to be interrupted about.
    if (before.pricing.input === after.pricing.input && before.pricing.output === after.pricing.output) {
      continue;
    }

    changes.push({
      modelId,
      displayName: after.displayName,
      provider: providerName(next, after.providerId),
      kind: 'price',
      before: { input: before.pricing.input, output: before.pricing.output },
      after: { input: after.pricing.input, output: after.pricing.output },
    });
  }

  for (const model of diff.removed) {
    const full = priorById.get(model.id);
    if (full?.aliasOf) continue;
    changes.push({
      modelId: model.id,
      displayName: model.displayName,
      provider: providerName(previous, full?.providerId),
      kind: 'removed',
    });
  }

  return changes;
}
