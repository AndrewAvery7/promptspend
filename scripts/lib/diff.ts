/**
 * What changed between the published catalog and the one this run produced.
 *
 * The rule that matters: *every* field is compared. An earlier version diffed
 * only `input` and `output`, which meant a run that changed nothing but a cache
 * rate, a context window or a review flag reported "no changes" — and the
 * workflow then threw that work away without committing it.
 *
 * Two fields are deliberately excluded from the comparison because they move on
 * every run by construction and would make every diff non-empty:
 * `generatedAt` and `provenance.lastVerified`. Their movement is recorded in
 * the health manifest instead (see `scripts/sync-pricing.ts`).
 */
import type { Model, PricingCatalog, Provider } from '../../src/lib/pricing/types';

export interface PriceChange {
  id: string;
  displayName: string;
  /** Dotted path within `pricing`, e.g. `input` or `longContext.output`. */
  field: string;
  from: unknown;
  to: unknown;
}

export interface FieldChange {
  id: string;
  displayName: string;
  field: string;
  from: unknown;
  to: unknown;
}

export interface CatalogDiff {
  added: { id: string; displayName: string; input: number; output: number }[];
  removed: { id: string; displayName: string }[];
  /** Anything under `pricing` — the changes that move a bill. */
  changed: PriceChange[];
  /** Everything else about a model: names, windows, tokenizers, capabilities. */
  metadata: FieldChange[];
  /** Review state: flags raised, flags cleared, rows gone stale. */
  reviewState: FieldChange[];
  /** The providers block. */
  providers: FieldChange[];
  get isEmpty(): boolean;
  /** True when a published rate moved — the only kind of change users feel. */
  get hasPriceChange(): boolean;
}

/** Rates and discounts. A change here changes what somebody pays. */
const PRICING_FIELDS = [
  'input',
  'output',
  'cachedInput',
  'cacheWrite',
  'batchDiscount',
  'intro.input',
  'intro.output',
  'intro.until',
  'longContext.thresholdTokens',
  'longContext.input',
  'longContext.output',
  'longContext.cachedInput',
  'longContext.cacheWrite',
] as const;

/** Descriptive fields. Worth recording, but nobody's invoice moves. */
const METADATA_FIELDS = [
  'providerId',
  'displayName',
  'status',
  'aliasOf',
  'releaseDate',
  'contextWindow',
  'maxOutput',
  'capabilityIndex',
  'capabilities.reasoning',
  'capabilities.vision',
  'tokenizer.kind',
  'tokenizer.encoding',
  'tokenizer.charsPerToken',
  'tokenizer.cjkCharsPerToken',
] as const;

/** Trust state. A new flag here must always reach a human. */
const REVIEW_FIELDS = [
  'provenance.source',
  'provenance.needsReview',
  'provenance.reviewNote',
  'provenance.stale',
  'provenance.verifiedUrl',
  'provenance.lastChanged',
] as const;

const PROVIDER_FIELDS = ['name', 'country', 'pricingUrl'] as const;

function at(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (typeof node !== 'object' || node === null) return undefined;
    return (node as Record<string, unknown>)[key];
  }, value);
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
  const metadata: FieldChange[] = [];
  const reviewState: FieldChange[] = [];

  for (const model of next.models) {
    const prior = before.get(model.id);
    if (!prior) continue;
    collect(prior, model, PRICING_FIELDS, (f) => at(f.pricing, f.path), changed);
    collect(prior, model, METADATA_FIELDS, (f) => at(f.model, f.path), metadata);
    collect(prior, model, REVIEW_FIELDS, (f) => at(f.model, f.path), reviewState);
  }

  const providers = diffProviders(previous?.providers ?? [], next.providers);

  return {
    added,
    removed,
    changed,
    metadata,
    reviewState,
    providers,
    get isEmpty() {
      return (
        added.length === 0 &&
        removed.length === 0 &&
        changed.length === 0 &&
        metadata.length === 0 &&
        reviewState.length === 0 &&
        providers.length === 0
      );
    },
    get hasPriceChange() {
      return added.length > 0 || removed.length > 0 || changed.length > 0;
    },
  };
}

function collect(
  prior: Model,
  model: Model,
  fields: readonly string[],
  read: (arg: { model: Model; pricing: Model['pricing']; path: string }) => unknown,
  out: FieldChange[],
): void {
  for (const path of fields) {
    const from = read({ model: prior, pricing: prior.pricing, path });
    const to = read({ model, pricing: model.pricing, path });
    if (!Object.is(from, to)) {
      out.push({ id: model.id, displayName: model.displayName, field: path, from, to });
    }
  }
}

function diffProviders(previous: Provider[], next: Provider[]): FieldChange[] {
  const before = new Map(previous.map((p) => [p.id, p]));
  const after = new Map(next.map((p) => [p.id, p]));
  const out: FieldChange[] = [];

  for (const provider of next) {
    const prior = before.get(provider.id);
    if (!prior) {
      out.push({
        id: provider.id,
        displayName: provider.name,
        field: 'provider',
        from: undefined,
        to: 'added',
      });
      continue;
    }
    for (const field of PROVIDER_FIELDS) {
      if (!Object.is(prior[field], provider[field])) {
        out.push({
          id: provider.id,
          displayName: provider.name,
          field,
          from: prior[field],
          to: provider[field],
        });
      }
    }
  }
  for (const provider of previous) {
    if (!after.has(provider.id)) {
      out.push({
        id: provider.id,
        displayName: provider.name,
        field: 'provider',
        from: 'present',
        to: 'removed',
      });
    }
  }
  return out;
}

/**
 * A stable fingerprint of everything the app actually reads, with the two
 * always-moving fields removed. Published in the health manifest so a reader
 * can tell "today's data is byte-identical to yesterday's" from "the job did
 * not run".
 */
export function catalogHash(catalog: PricingCatalog): string {
  const canonical = JSON.stringify({
    schemaVersion: catalog.schemaVersion,
    providers: [...catalog.providers]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => [p.id, p.name, p.country, p.pricingUrl ?? null]),
    models: [...catalog.models]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => [
        m.id,
        ...METADATA_FIELDS.map((f) => at(m, f) ?? null),
        ...PRICING_FIELDS.map((f) => at(m.pricing, f) ?? null),
        ...REVIEW_FIELDS.filter((f) => f !== 'provenance.lastChanged').map((f) => at(m, f) ?? null),
      ]),
  });
  return fnv1a(canonical);
}

/**
 * FNV-1a, 64-bit, as 16 hex characters. Not a security primitive — it exists so
 * two catalogs can be compared at a glance, and a dependency-free hash keeps
 * the pipeline honest about having no runtime dependencies.
 */
function fnv1a(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash ^ BigInt(text.charCodeAt(i))) * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

function show(value: unknown): string {
  if (value === undefined || value === null) return '—';
  return String(value);
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
    const numeric = typeof change.from === 'number' && typeof change.to === 'number';
    const direction = numeric ? (Number(change.to) > Number(change.from) ? 'up' : 'down') : 'to';
    lines.push(
      `- **Price** \`${change.id}\` — ${change.field} ${direction} ${show(change.from)} → ${show(change.to)}`,
    );
  }
  for (const change of diff.metadata) {
    lines.push(
      `- **Metadata** \`${change.id}\` — ${change.field}: ${show(change.from)} → ${show(change.to)}`,
    );
  }
  for (const change of diff.reviewState) {
    lines.push(`- **Review** \`${change.id}\` — ${change.field}: ${show(change.from)} → ${show(change.to)}`);
  }
  for (const change of diff.providers) {
    lines.push(
      `- **Provider** \`${change.id}\` — ${change.field}: ${show(change.from)} → ${show(change.to)}`,
    );
  }
  for (const model of diff.removed) {
    lines.push(`- **Removed** \`${model.id}\` — ${model.displayName} (no longer listed upstream)`);
  }
  return `${lines.join('\n')}\n`;
}

/** Compact summary for a commit message or a PR title. */
export function summarizeDiff(diff: CatalogDiff): string {
  if (diff.isEmpty) return 'no catalog changes';
  const parts: string[] = [];
  if (diff.added.length) parts.push(`${diff.added.length} added`);
  if (diff.changed.length)
    parts.push(`${diff.changed.length} price change${diff.changed.length === 1 ? '' : 's'}`);
  if (diff.removed.length) parts.push(`${diff.removed.length} removed`);
  if (diff.metadata.length) parts.push(`${diff.metadata.length} metadata`);
  if (diff.reviewState.length) parts.push(`${diff.reviewState.length} review-state`);
  if (diff.providers.length) parts.push(`${diff.providers.length} provider`);
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
    const numeric = typeof change.from === 'number' && typeof change.to === 'number';
    const verb = numeric ? (Number(change.to) > Number(change.from) ? 'increase' : 'cut') : 'change';
    items.push({
      title: `${change.displayName}: ${change.field} ${verb}`,
      body: `${change.displayName} ${change.field} pricing moved from ${show(change.from)} to ${show(change.to)} per 1M tokens (${date}).`,
    });
  }
  for (const model of diff.removed) {
    items.push({
      title: `Removed: ${model.displayName}`,
      body: `${model.displayName} is no longer listed by any tracked source (${date}).`,
    });
  }
  return items;
}
