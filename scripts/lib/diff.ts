import type { PricingCatalog } from '../../src/lib/pricing/types';

export interface PriceChange {
  id: string;
  displayName: string;
  field: 'input' | 'output';
  from: number;
  to: number;
}

export interface CatalogDiff {
  added: { id: string; displayName: string; input: number; output: number }[];
  removed: { id: string; displayName: string }[];
  changed: PriceChange[];
  get isEmpty(): boolean;
}

export function diffCatalogs(previous: PricingCatalog | undefined, next: PricingCatalog): CatalogDiff {
  const before = new Map((previous?.models ?? []).map((m) => [m.id, m]));
  const after = new Map(next.models.map((m) => [m.id, m]));

  const added = next.models
    .filter((m) => !before.has(m.id))
    .map((m) => ({
      id: m.id,
      displayName: m.displayName,
      input: m.pricing.input,
      output: m.pricing.output,
    }));

  const removed = [...before.values()]
    .filter((m) => !after.has(m.id))
    .map((m) => ({ id: m.id, displayName: m.displayName }));

  const changed: PriceChange[] = [];
  for (const model of next.models) {
    const prior = before.get(model.id);
    if (!prior) continue;
    for (const field of ['input', 'output'] as const) {
      if (prior.pricing[field] !== model.pricing[field]) {
        changed.push({
          id: model.id,
          displayName: model.displayName,
          field,
          from: prior.pricing[field],
          to: model.pricing[field],
        });
      }
    }
  }

  return {
    added,
    removed,
    changed,
    get isEmpty() {
      return added.length === 0 && removed.length === 0 && changed.length === 0;
    },
  };
}

/** One-line-per-change markdown, appended to docs/pricing-changelog.md. */
export function renderChangelogEntry(date: string, diff: CatalogDiff): string {
  if (diff.isEmpty) return `## ${date}\n\nNo changes — sources stable.\n`;

  const lines: string[] = [`## ${date}\n`];
  for (const model of diff.added) {
    lines.push(
      `- **Added** \`${model.id}\` — ${model.displayName} ($${model.input} in / $${model.output} out per 1M)`,
    );
  }
  for (const change of diff.changed) {
    const direction = change.to > change.from ? 'up' : 'down';
    lines.push(
      `- **Changed** \`${change.id}\` — ${change.field} price ${direction} $${change.from} → $${change.to} per 1M`,
    );
  }
  for (const model of diff.removed) {
    lines.push(`- **Removed** \`${model.id}\` — ${model.displayName} (no longer listed upstream)`);
  }
  return `${lines.join('\n')}\n`;
}

/** Compact summary for a commit message or a PR title. */
export function summarizeDiff(diff: CatalogDiff): string {
  if (diff.isEmpty) return 'no pricing changes';
  const parts: string[] = [];
  if (diff.added.length) parts.push(`${diff.added.length} added`);
  if (diff.changed.length)
    parts.push(`${diff.changed.length} price change${diff.changed.length === 1 ? '' : 's'}`);
  if (diff.removed.length) parts.push(`${diff.removed.length} removed`);
  return parts.join(', ');
}

/** RSS/Atom-ready items so subscribers hear about changes without visiting. */
export function diffToFeedItems(date: string, diff: CatalogDiff): { title: string; body: string }[] {
  const items: { title: string; body: string }[] = [];
  for (const model of diff.added) {
    items.push({
      title: `New model: ${model.displayName}`,
      body: `${model.displayName} entered the catalog at $${model.input} per 1M input tokens and $${model.output} per 1M output tokens (${date}).`,
    });
  }
  for (const change of diff.changed) {
    items.push({
      title: `${change.displayName}: ${change.field} price ${change.to > change.from ? 'increase' : 'cut'}`,
      body: `${change.displayName} ${change.field} pricing moved from $${change.from} to $${change.to} per 1M tokens (${date}).`,
    });
  }
  return items;
}
