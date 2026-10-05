/**
 * Free-tier facts: the shape of `data/free-tiers.json`, and the gate it passes.
 *
 * A pricing catalog can be cross-checked against two feeds; a free tier cannot.
 * There is no aggregator for "does a new account need a card", and the vendors
 * phrase these terms loosely and move them often. So the only defensible record
 * is the vendor's own sentence, where it was read, and when — and the gate below
 * refuses any fact that arrives without all three.
 *
 * Two rules carry most of the weight:
 *
 * - **Nothing inferred.** A thing the vendor does not publish goes in
 *   `unpublished`, in words, rather than being guessed into a field.
 * - **Disagreement is shown, not resolved.** When two of a vendor's own pages
 *   contradict each other, both facts stay and name each other in
 *   `conflictsWith`. Picking one would be a claim the vendor never made.
 *
 * The headline fields (`verdict`, `card`, `training`) are summaries, so each
 * must name the facts it rests on in `basis`. A summary with no basis is an
 * opinion, and the gate rejects it.
 */

export const FREE_TIER_SCHEMA_VERSION = 1;

/** Can a new account use the API without paying? */
export type FreeTierVerdict = 'ongoing' | 'one-time' | 'none' | 'unclear';
/** Does starting need a payment method? */
export type CardRequirement = 'yes' | 'no' | 'unclear';
/** Is free usage used to train the vendor's models? `opt-out` means yes by default. */
export type TrainingUse = 'yes' | 'no' | 'opt-out' | 'unclear';
export type FactTopic = 'free' | 'models' | 'credits' | 'card' | 'limits' | 'data' | 'regions' | 'upgrade';

export const FACT_TOPICS: readonly FactTopic[] = [
  'free',
  'models',
  'credits',
  'card',
  'limits',
  'data',
  'regions',
  'upgrade',
];

export interface FreeTierFact {
  /** Stable, unique across the file. The daily check reports against it. */
  id: string;
  topic: FactTopic;
  /** What the fact means, in our words. */
  statement: string;
  /** The vendor's words, verbatim apart from markup (see the file's $comment). */
  quote: string;
  /** The page a reader should open. */
  url: string;
  /** The copy actually read, when it is a machine-readable twin of `url`. */
  readUrl?: string;
  /** YYYY-MM-DD. */
  readOn: string;
  /** Another fact of the same provider that this one contradicts. */
  conflictsWith?: string;
}

export interface FreeTierRecord {
  verdict: FreeTierVerdict;
  /** One or two sentences: the answer a reader came for. */
  answer: string;
  card: CardRequirement;
  training: TrainingUse;
  /** A qualifier on `training`, e.g. a region where it does not apply. */
  trainingNote?: string;
  /** Short, for a table cell. */
  whatsFree: string;
  /** YYYY-MM-DD: when this record's content last changed. Not when it was checked. */
  updated: string;
  basis: { verdict: string[]; card: string[]; training: string[] };
  facts: FreeTierFact[];
  unpublished: string[];
}

export interface FreeTierFile {
  schemaVersion: number;
  providers: Record<string, FreeTierRecord>;
}

const VERDICTS: readonly FreeTierVerdict[] = ['ongoing', 'one-time', 'none', 'unclear'];
const CARDS: readonly CardRequirement[] = ['yes', 'no', 'unclear'];
const TRAINING: readonly TrainingUse[] = ['yes', 'no', 'opt-out', 'unclear'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const RECORD_KEYS = new Set([
  'verdict',
  'answer',
  'card',
  'training',
  'trainingNote',
  'whatsFree',
  'updated',
  'basis',
  'facts',
  'unpublished',
]);
const FACT_KEYS = new Set(['id', 'topic', 'statement', 'quote', 'url', 'readUrl', 'readOn', 'conflictsWith']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isHttps(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Every problem with the file, or an empty list.
 *
 * Reports all of them rather than stopping at the first: the file is edited by
 * hand, and fixing one typo per build is how an afternoon disappears.
 *
 * `providerIds`, when given, must be exactly the catalog's providers — a record
 * for a provider with no pages would publish nothing, and a provider with no
 * record would leave a hole in the comparison table.
 */
export function freeTierProblems(raw: unknown, providerIds?: readonly string[]): string[] {
  const problems: string[] = [];
  if (!isRecord(raw)) return ['free-tiers: the file is not a JSON object'];
  if (raw.schemaVersion !== FREE_TIER_SCHEMA_VERSION) {
    problems.push(`free-tiers: schemaVersion must be ${FREE_TIER_SCHEMA_VERSION}`);
  }
  if (!isRecord(raw.providers)) return [...problems, 'free-tiers: "providers" must be an object'];

  const seenIds = new Set<string>();
  for (const [providerId, record] of Object.entries(raw.providers)) {
    const at = `free-tiers.${providerId}`;
    if (!isRecord(record)) {
      problems.push(`${at}: must be an object`);
      continue;
    }
    for (const key of Object.keys(record)) {
      if (!RECORD_KEYS.has(key)) problems.push(`${at}: unknown field "${key}"`);
    }
    if (!VERDICTS.includes(record.verdict as FreeTierVerdict))
      problems.push(`${at}.verdict: not one of ${VERDICTS.join(', ')}`);
    if (!CARDS.includes(record.card as CardRequirement))
      problems.push(`${at}.card: not one of ${CARDS.join(', ')}`);
    if (!TRAINING.includes(record.training as TrainingUse)) {
      problems.push(`${at}.training: not one of ${TRAINING.join(', ')}`);
    }
    for (const field of ['answer', 'whatsFree'] as const) {
      if (!nonEmpty(record[field])) problems.push(`${at}.${field}: must be a non-empty string`);
    }
    if (record.trainingNote !== undefined && !nonEmpty(record.trainingNote)) {
      problems.push(`${at}.trainingNote: must be a non-empty string when present`);
    }
    if (!isDate(record.updated)) problems.push(`${at}.updated: must be a YYYY-MM-DD date`);
    if (!Array.isArray(record.unpublished) || !record.unpublished.every(nonEmpty)) {
      problems.push(`${at}.unpublished: must be a list of non-empty strings`);
    }

    const facts = Array.isArray(record.facts) ? record.facts : [];
    if (facts.length === 0) problems.push(`${at}.facts: at least one fact is required`);
    const local = new Map<string, Record<string, unknown>>();
    facts.forEach((fact, index) => {
      const where = `${at}.facts[${index}]`;
      if (!isRecord(fact)) {
        problems.push(`${where}: must be an object`);
        return;
      }
      for (const key of Object.keys(fact)) {
        if (!FACT_KEYS.has(key)) problems.push(`${where}: unknown field "${key}"`);
      }
      const id = fact.id;
      if (typeof id !== 'string' || !ID.test(id)) {
        problems.push(`${where}.id: must be lowercase words joined by hyphens`);
      } else if (seenIds.has(id)) {
        problems.push(`${where}.id: "${id}" is used twice`);
      } else {
        seenIds.add(id);
        local.set(id, fact);
      }
      if (!FACT_TOPICS.includes(fact.topic as FactTopic)) problems.push(`${where}.topic: not a known topic`);
      if (!nonEmpty(fact.statement)) problems.push(`${where}.statement: must be a non-empty string`);
      if (!nonEmpty(fact.quote)) {
        problems.push(`${where}.quote: every fact needs the vendor's own words`);
      } else if (/\]\(|\|/.test(fact.quote)) {
        // Markdown link syntax and table pipes are markup; the file's rule is
        // that only markup is edited, so they must not survive into a quote.
        problems.push(`${where}.quote: contains markdown markup ("](" or "|")`);
      }
      if (!isHttps(fact.url)) problems.push(`${where}.url: must be an https URL`);
      if (fact.readUrl !== undefined && !isHttps(fact.readUrl)) {
        problems.push(`${where}.readUrl: must be an https URL when present`);
      }
      if (!isDate(fact.readOn)) problems.push(`${where}.readOn: must be a YYYY-MM-DD date`);
      else if (isDate(record.updated) && fact.readOn > record.updated) {
        problems.push(`${where}.readOn: is after the record's "updated" date`);
      }
    });

    for (const [id, fact] of local) {
      const other = fact.conflictsWith;
      if (other === undefined) continue;
      if (typeof other !== 'string' || !local.has(other)) {
        problems.push(
          `${at}: "${id}" conflicts with "${String(other)}", which is not a fact of this provider`,
        );
      } else if (other === id) {
        problems.push(`${at}: "${id}" conflicts with itself`);
      } else if (local.get(other)!.conflictsWith !== id) {
        problems.push(`${at}: "${id}" names "${other}" in conflictsWith, but not the other way round`);
      }
    }

    if (!isRecord(record.basis)) {
      problems.push(`${at}.basis: must name the facts behind verdict, card and training`);
    } else {
      for (const key of ['verdict', 'card', 'training'] as const) {
        const ids = record.basis[key];
        if (!Array.isArray(ids) || ids.length === 0) {
          problems.push(`${at}.basis.${key}: must list at least one fact id`);
          continue;
        }
        for (const id of ids) {
          if (typeof id !== 'string' || !local.has(id)) {
            problems.push(`${at}.basis.${key}: "${String(id)}" is not a fact of this provider`);
          }
        }
      }
      for (const key of Object.keys(record.basis)) {
        if (!['verdict', 'card', 'training'].includes(key))
          problems.push(`${at}.basis: unknown field "${key}"`);
      }
    }
  }

  if (providerIds) {
    const listed = new Set(Object.keys(raw.providers));
    for (const id of providerIds) {
      if (!listed.has(id)) problems.push(`free-tiers: no record for catalog provider "${id}"`);
    }
    for (const id of listed) {
      if (!providerIds.includes(id)) problems.push(`free-tiers: "${id}" is not a catalog provider`);
    }
  }
  return problems;
}

export function assertFreeTiers(raw: unknown, providerIds?: readonly string[]): asserts raw is FreeTierFile {
  const problems = freeTierProblems(raw, providerIds);
  if (problems.length > 0) {
    throw new Error(`data/free-tiers.json failed validation:\n  ${problems.join('\n  ')}`);
  }
}

/** The facts behind one headline field, in file order. */
export function basisFacts(record: FreeTierRecord, key: keyof FreeTierRecord['basis']): FreeTierFact[] {
  const wanted = new Set(record.basis[key]);
  return record.facts.filter((fact) => wanted.has(fact.id));
}
