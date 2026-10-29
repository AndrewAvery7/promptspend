/**
 * The weekly coverage-gap check: models another tracker lists that the price
 * feed already carries under their maker's own key, but that no capture rule
 * in data/models-allowlist.json picks up.
 *
 * The other tracker is a hint and nothing more. Its prices are never read: a
 * gap is only reported when the feed itself has a first-party row with a real
 * per-token price, so anything that reaches the catalog still arrives through
 * the daily sync, flagged for review and checked against the vendor's page like
 * every other row. The check exists because the capture rules are patterns, and
 * a pattern that is too narrow fails silently — on 2026-10-29 one comparison
 * found OpenAI's GPT-5.x Pro tiers, Codestral and Kimi K3.1 Pro all missing for
 * that reason alone.
 *
 * Pure so it can be tested against fixtures. scripts/watch-coverage-gaps.ts
 * owns the network calls and the report.
 */
import { matchFamily, slugify, type Allowlist } from './normalize';

/** The fields of a hint row this check uses. Anything else in it is ignored. */
export interface HintModel {
  provider: string;
  model: string;
  status?: string | null;
  modality?: string[] | null;
  detail_url?: string | null;
}

/** A model deliberately left uncaptured, so the check stops naming it. */
export interface IgnoreRule {
  /** A regular expression (as a string) over the feed's own keys. */
  feedKey: string;
  reason: string;
}

export interface Gap {
  key: string;
  inputPerMillion: number;
  outputPerMillion: number;
  /** The hint rows that pointed at this key. */
  hints: { provider: string; model: string; url?: string }[];
}

const RETIRED = /^(retired|deprecated)$/i;

/** One spelling for a model name, whatever the catalog: lower case, dots and spaces as hyphens. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-(preview|latest|instruct|chat)$/, '');
}

/**
 * The names a feed key may be listed under elsewhere: the part after any `x/`
 * prefix, and the same without a leading vendor segment or a trailing API
 * version — `amazon.nova-pro-v1:0` is "Nova Pro" on a price page.
 */
export function keyNames(key: string): Set<string> {
  const rest = key.slice(key.indexOf('/') + 1);
  const names = new Set([nameKey(rest)]);
  // Letters only before the dot, so a vendor segment (`amazon.`) goes and a
  // version (`qwen3.8-flash`) stays.
  const bare = rest.replace(/^[a-z]+\./, '').replace(/-v\d+(:\d+)?$/, '');
  names.add(nameKey(bare));
  return names;
}

/**
 * Whose platform each feed row is sold on, learned from the rows the capture
 * rules already take: `gpt-5` is sold on `openai`, `dashscope/qwen3.8-max` on
 * `dashscope`, `amazon.nova-2-pro` on `bedrock_converse`. A row counts as a
 * vendor's own only when its platform is one the catalog already trusts for
 * that vendor AND the other list names the same vendor — so Amazon's Bedrock
 * copy of Claude, or Alibaba hosting DeepSeek, is somebody's copy, not a gap.
 */
export function platformOwners(feed: Record<string, unknown>, allowlist: Allowlist): Map<string, string> {
  const owners = new Map<string, string>();
  for (const [key, value] of Object.entries(feed)) {
    const family = matchFamily(key, allowlist);
    const platform = platformOf(value);
    if (family && platform && !owners.has(platform)) owners.set(platform, family.providerId);
  }
  return owners;
}

function platformOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const platform = (value as Record<string, unknown>).litellm_provider;
  return typeof platform === 'string' ? platform : undefined;
}

/** "Mistral" and "Mistral AI", "Z.AI" and "Z.ai": the same vendor by its first word. */
function sameVendor(a: string, b: string): boolean {
  const first = (s: string) => nameKey(s).split('-')[0];
  return first(a) !== '' && first(a) === first(b);
}

/** Token-priced chat rows only, with a real price: what the daily sync could capture. */
function priced(value: unknown): { input: number; output: number } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const entry = value as Record<string, unknown>;
  if (entry.mode !== 'chat' && entry.mode !== 'responses') return undefined;
  const input = entry.input_cost_per_token;
  const output = entry.output_cost_per_token;
  if (typeof input !== 'number' || typeof output !== 'number') return undefined;
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return undefined;
  if (input === 0 && output === 0) return undefined;
  return { input, output };
}

export function findCoverageGaps(args: {
  hints: readonly HintModel[];
  feed: Record<string, unknown>;
  allowlist: Allowlist;
  published: readonly { id: string; displayName: string }[];
  ignore: readonly IgnoreRule[];
}): Gap[] {
  const { hints, feed, allowlist, published, ignore } = args;
  const publishedIds = new Set(published.map((m) => m.id));
  // A model already published under another feed key (DeepSeek's own
  // `deepseek/deepseek-v4-pro` and the bare `deepseek-v4-pro`) is not a gap.
  const publishedNames = new Set(published.map((m) => nameKey(m.displayName)));
  const owners = platformOwners(feed, allowlist);
  const vendorName = new Map(allowlist.providers.map((p) => [p.id, p.name]));
  const ignored = ignore.map((rule) => new RegExp(rule.feedKey));

  // Every priced, uncaptured row on a platform the catalog trusts, indexed by its name.
  const candidates = new Map<string, { key: string; input: number; output: number; vendor: string }[]>();
  for (const [key, value] of Object.entries(feed)) {
    const owner = owners.get(platformOf(value) ?? '');
    if (!owner) continue;
    if (key.split('/').length > 2) continue; // a regional or hosted copy
    if (matchFamily(key, allowlist)) continue; // captured: the daily sync has it
    if (allowlist.globalExclude.some((pattern) => new RegExp(pattern).test(key))) continue;
    if (ignored.some((pattern) => pattern.test(key))) continue;
    if (publishedIds.has(slugify(key))) continue;
    const price = priced(value);
    if (!price) continue;
    const names = keyNames(key);
    if ([...names].some((name) => publishedNames.has(name))) continue;
    for (const name of names) {
      const list = candidates.get(name) ?? [];
      list.push({ key, ...price, vendor: vendorName.get(owner) ?? owner });
      candidates.set(name, list);
    }
  }

  const gaps = new Map<string, Gap>();
  for (const hint of hints) {
    if (hint.status && RETIRED.test(hint.status)) continue;
    if (hint.modality && hint.modality.length > 0 && !hint.modality.includes('text')) continue;
    for (const row of candidates.get(nameKey(hint.model)) ?? []) {
      if (!sameVendor(hint.provider, row.vendor)) continue;
      const gap = gaps.get(row.key) ?? {
        key: row.key,
        inputPerMillion: Math.round(row.input * 1e12) / 1e6,
        outputPerMillion: Math.round(row.output * 1e12) / 1e6,
        hints: [],
      };
      gap.hints.push({
        provider: hint.provider,
        model: hint.model,
        ...(hint.detail_url ? { url: hint.detail_url } : {}),
      });
      gaps.set(row.key, gap);
    }
  }
  return [...gaps.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** The body of the issue: what is uncaptured, what the feed says, what to do. */
export function renderGapReport(gaps: readonly Gap[], date: string, hintSource: string): string {
  const lines = [
    `${gaps.length === 1 ? 'One model' : `${gaps.length} models`} that the price feed carries under ` +
      `${gaps.length === 1 ? 'its' : 'their'} maker's own key ${gaps.length === 1 ? 'is' : 'are'} not ` +
      `captured by any rule in \`data/models-allowlist.json\` (checked ${date}).`,
    '',
    `Found by comparing the catalog with the model list at ${hintSource}. Only the names were used; ` +
      'the prices below are the feed’s own, and nothing has been added.',
    '',
    '| Feed key | Feed price (in / out per 1M) | Listed elsewhere as |',
    '| --- | --- | --- |',
  ];
  for (const gap of gaps) {
    const named = gap.hints.map((h) =>
      h.url ? `[${h.provider} ${h.model}](${h.url})` : `${h.provider} ${h.model}`,
    );
    lines.push(
      `| \`${gap.key}\` | $${gap.inputPerMillion} / $${gap.outputPerMillion} | ${named.join(', ')} |`,
    );
  }
  lines.push(
    '',
    'To capture one, widen its family in `data/models-allowlist.json`; the next daily sync then adds it, flagged ' +
      'for review. To leave one out on purpose, add it with a reason to `data/coverage-ignore.json`. ' +
      'This issue closes itself once nothing is left.',
  );
  return `${lines.join('\n')}\n`;
}
