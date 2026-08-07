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

/**
 * A rate that moved, versus a rate we simply started tracking.
 *
 * `move`     — both readings exist and differ. A vendor repriced something.
 * `coverage` — one side is absent. We gained (or lost) a field we were not
 *              recording before. Nobody's bill changed; our coverage did.
 *
 * The distinction is the whole point. Of the 43 **Price** lines in the
 * changelog before this existed, all 43 were `— → value`: coverage, every one,
 * announced as a price change on the busiest panel of the site.
 */
export type ChangeKind = 'move' | 'coverage';

export interface PriceChange {
  id: string;
  displayName: string;
  /** Dotted path within `pricing`, e.g. `input` or `longContext.output`. */
  field: string;
  from: unknown;
  to: unknown;
  kind: ChangeKind;
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
  /** Rates that genuinely moved, excluding fields we merely started tracking. */
  get priceMoves(): PriceChange[];
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

/** Absent counts as absent whichever way it is spelled. */
function missing(value: unknown): boolean {
  return value === undefined || value === null;
}

/**
 * How a single field differs: not at all, because we started (or stopped)
 * tracking it, or because the number itself moved.
 */
export function changeKind(from: unknown, to: unknown): ChangeKind | 'none' {
  if (Object.is(from, to)) return 'none';
  return missing(from) || missing(to) ? 'coverage' : 'move';
}

/**
 * Did a published rate actually move? This is the same comparison the changelog
 * makes, exported so `mergeCatalog` can stamp `provenance.lastChanged` from it
 * rather than keeping a second opinion about what "changed" means. A narrower
 * copy in the merge (it compared `input` and `output` only) meant a cache rate
 * or a long-context tier could move, be reported as a **Price** change in the
 * changelog, and still leave `lastChanged` sitting on an older date.
 *
 * Coverage is deliberately not a change. Reading a vendor page that lists a
 * long-context tier we never recorded gains us a field; it does not mean the
 * vendor introduced the tier that morning, and stamping `lastChanged` for it
 * put `PRICES CHANGED <today>` on the results panel with no vendor having
 * touched a price. Absent → value is coverage. Value → different value is a
 * price change. Only the second is news.
 */
export function pricingChanged(before: Model['pricing'], after: Model['pricing']): boolean {
  return PRICING_FIELDS.some((path) => changeKind(at(before, path), at(after, path)) === 'move');
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
    collectPricing(prior, model, changed);
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
    get priceMoves() {
      return changed.filter((change) => change.kind === 'move');
    },
    get hasPriceChange() {
      // Coverage is excluded on purpose: a field we merely started tracking
      // must not open a price-change pull request or set `price_changed=true`.
      return added.length > 0 || removed.length > 0 || this.priceMoves.length > 0;
    },
  };
}

/**
 * Pricing fields, tagged with whether the number moved or our coverage did.
 * Separate from `collect` because only this dimension carries a kind — the
 * others have nothing to distinguish.
 */
function collectPricing(prior: Model, model: Model, out: PriceChange[]): void {
  for (const path of PRICING_FIELDS) {
    const from = at(prior.pricing, path);
    const to = at(model.pricing, path);
    const kind = changeKind(from, to);
    if (kind === 'none') continue;
    out.push({ id: model.id, displayName: model.displayName, field: path, from, to, kind });
  }
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
    if (change.kind === 'coverage') {
      const verb = missing(change.from) ? 'now tracked' : 'no longer published';
      lines.push(
        `- **Coverage** \`${change.id}\` — ${change.field} ${verb}: ${show(change.from)} → ${show(change.to)}`,
      );
      continue;
    }
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
  const moves = diff.priceMoves.length;
  const coverage = diff.changed.length - moves;
  if (diff.added.length) parts.push(`${diff.added.length} added`);
  if (moves) parts.push(`${moves} price change${moves === 1 ? '' : 's'}`);
  if (coverage) parts.push(`${coverage} coverage`);
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
  // Coverage is left out: "we now record Grok's long-context tier" is a note
  // for the changelog, not an item for somebody's feed reader.
  for (const change of diff.priceMoves) {
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
