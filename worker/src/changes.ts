/**
 * The change set the pricing pipeline hands us, and the vocabulary for talking
 * about it.
 *
 * This is a contract with `scripts/notify-alerts.ts` in the main repository.
 * The worker validates rather than trusts: the payload arrives over the network
 * from a CI job, and a malformed one should be a 400 with a reason, not a
 * half-sent fan-out.
 */

export type ChangeKind = 'added' | 'removed' | 'price' | 'flagged';

export interface Rates {
  input: number;
  output: number;
}

export interface PriceChange {
  modelId: string;
  displayName: string;
  provider: string;
  kind: ChangeKind;
  before?: Rates;
  after?: Rates;
  note?: string;
}

export interface ChangeSet {
  /** Deterministic in the catalog contents, so a retried notify is idempotent. */
  eventId: string;
  generatedAt: string;
  changes: PriceChange[];
}

const KINDS: ChangeKind[] = ['added', 'removed', 'price', 'flagged'];
const MAX_CHANGES = 200;

function isRates(value: unknown): value is Rates {
  if (typeof value !== 'object' || value === null) return false;
  const rates = value as Partial<Rates>;
  return (
    typeof rates.input === 'number' &&
    Number.isFinite(rates.input) &&
    rates.input >= 0 &&
    typeof rates.output === 'number' &&
    Number.isFinite(rates.output) &&
    rates.output >= 0
  );
}

/** Returns a list of problems; empty means the payload is usable. */
export function validateChangeSet(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null) return ['payload is not an object'];
  const set = value as Partial<ChangeSet>;

  if (typeof set.eventId !== 'string' || !/^[\w-]{8,128}$/.test(set.eventId)) {
    errors.push('eventId must be 8–128 characters of [A-Za-z0-9_-]');
  }
  if (typeof set.generatedAt !== 'string' || Number.isNaN(Date.parse(set.generatedAt))) {
    errors.push('generatedAt must be an ISO timestamp');
  }
  if (!Array.isArray(set.changes)) return [...errors, 'changes must be an array'];
  if (set.changes.length === 0) errors.push('changes must not be empty');
  if (set.changes.length > MAX_CHANGES) errors.push(`changes must hold at most ${MAX_CHANGES} entries`);

  set.changes.slice(0, MAX_CHANGES).forEach((change, index) => {
    const label = `changes[${index}]`;
    if (typeof change?.modelId !== 'string' || !/^[\w.:-]{1,128}$/.test(change.modelId)) {
      errors.push(`${label}.modelId must be a slug`);
    }
    if (typeof change?.displayName !== 'string' || change.displayName.length === 0) {
      errors.push(`${label}.displayName is required`);
    }
    if (typeof change?.provider !== 'string' || change.provider.length === 0) {
      errors.push(`${label}.provider is required`);
    }
    if (!KINDS.includes(change?.kind)) errors.push(`${label}.kind must be one of ${KINDS.join(', ')}`);
    if (change?.kind === 'price' && (!isRates(change.before) || !isRates(change.after))) {
      errors.push(`${label} is a price change but is missing valid before/after rates`);
    }
    if (change?.before !== undefined && !isRates(change.before)) errors.push(`${label}.before is malformed`);
    if (change?.after !== undefined && !isRates(change.after)) errors.push(`${label}.after is malformed`);
  });

  return errors;
}

export function changedModelIds(set: ChangeSet): string[] {
  return [...new Set(set.changes.map((change) => change.modelId))];
}

/**
 * Percentage move, or null when there is no meaningful base to compare against.
 *
 * A model going from free to paid is a real and important change, but it is not
 * "+∞%" — the UI says "was free" instead, and this returning null is what makes
 * it do so.
 */
export function percentChange(before: number, after: number): number | null {
  if (before === 0) return null;
  return ((after - before) / before) * 100;
}

export function formatRate(dollarsPerMillion: number): string {
  if (dollarsPerMillion === 0) return 'free';
  const decimals = dollarsPerMillion < 1 ? 3 : 2;
  return `$${dollarsPerMillion.toFixed(decimals).replace(/\.?0+$/, '')}/M`;
}

/**
 * A one-line human summary of a single change.
 *
 * Shared by the push notification body and the email so the two never drift
 * into describing the same event differently.
 */
export function describeChange(change: PriceChange): string {
  switch (change.kind) {
    case 'added':
      return change.after
        ? `${change.displayName} added at ${formatRate(change.after.input)} in / ${formatRate(change.after.output)} out`
        : `${change.displayName} added to the catalog`;
    case 'removed':
      return `${change.displayName} is no longer listed upstream`;
    case 'flagged':
      return `${change.displayName} flagged for review${change.note ? ` — ${change.note}` : ''}`;
    case 'price': {
      if (!change.before || !change.after) return `${change.displayName} pricing changed`;
      const parts: string[] = [];
      for (const field of ['input', 'output'] as const) {
        const before = change.before[field];
        const after = change.after[field];
        if (before === after) continue;
        const move = percentChange(before, after);
        const direction = after > before ? 'up' : 'down';
        const magnitude = move === null ? '' : ` ${Math.abs(move).toFixed(move >= 100 ? 0 : 1)}%`;
        parts.push(`${field}${magnitude} ${direction} to ${formatRate(after)}`);
      }
      return parts.length > 0
        ? `${change.displayName}: ${parts.join(', ')}`
        : `${change.displayName} pricing changed`;
    }
  }
}

/** Headline for a whole change set — the push title and the email subject. */
export function summariseChangeSet(set: ChangeSet): string {
  const priceMoves = set.changes.filter((change) => change.kind === 'price');
  if (set.changes.length === 1) return describeChange(set.changes[0]);

  if (priceMoves.length === set.changes.length) {
    return `${priceMoves.length} price changes across ${countProviders(set)}`;
  }
  return `${set.changes.length} pricing updates across ${countProviders(set)}`;
}

function countProviders(set: ChangeSet): string {
  const providers = new Set(set.changes.map((change) => change.provider));
  return providers.size === 1 ? [...providers][0] : `${providers.size} providers`;
}
