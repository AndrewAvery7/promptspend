/**
 * What a developer actually types, versus what the catalog calls it.
 *
 * The catalog's ids are not uniformly the ids that appear in source code. Some
 * are exactly the vendor's own name — `gpt-5.6`, `claude-sonnet-5`, `o3`,
 * `amazon.nova-2-lite-v1-0` — and some carry the upstream feed's routing prefix:
 *
 *     catalog id                    what is written in code
 *     gemini-gemini-2.5-flash   →   gemini-2.5-flash
 *     deepseek-deepseek-v3.2    →   deepseek-v3.2
 *     xai-grok-4.5              →   grok-4.5
 *     zai-glm-5                 →   glm-5
 *     moonshot-kimi-k2.6        →   kimi-k2.6
 *
 * Scanning for catalog ids alone would therefore have found OpenAI and Anthropic
 * models and silently missed every other provider — the failure would have
 * looked like the extension working fine.
 *
 * The fix is a prefix list rather than a hand-written alias table, because a
 * table goes stale invisibly. `prefixesInCatalog` plus the test that asserts
 * every first segment is classified means a new provider family cannot slip
 * through unnoticed: CI fails and someone adds one line, which is the loud
 * version of this problem rather than the quiet one.
 *
 * The proper home for this is the catalog itself — a `vendorId` field written by
 * the sync pipeline. That is a schema change touching the pipeline, the
 * validators and every consumer, so it is deliberately not done here. See
 * docs/DEFERRED.md.
 */

/**
 * First segments that are the upstream feed's routing prefix and are not part of
 * the id anyone writes. Stripping one yields the vendor-facing id.
 */
export const ROUTE_PREFIXES: ReadonlySet<string> = new Set([
  'dashscope',
  'deepseek',
  'gemini',
  'minimax',
  'mistral',
  'moonshot',
  'xai',
  'zai',
]);

/**
 * First segments that ARE the vendor's own id and must be left alone. Listed
 * explicitly rather than inferred, so that an unclassified new one fails the
 * test in vendor-ids.test.ts instead of being guessed at.
 */
export const NATIVE_PREFIXES: ReadonlySet<string> = new Set([
  'amazon.nova',
  'claude',
  'command',
  'gpt',
  'o1',
  'o3',
  'o4',
]);

/** The part of an id before its first hyphen. `gpt-5.6` → `gpt`, `o3` → `o3`. */
export function firstSegment(id: string): string {
  const hyphen = id.indexOf('-');
  return hyphen === -1 ? id : id.slice(0, hyphen);
}

/**
 * Every literal string that should resolve to this catalog id: the id itself,
 * plus the route-prefix-stripped form where there is one.
 *
 * Both are returned, never just the stripped form — someone reading a LiteLLM
 * config or this project's own API output will have the prefixed id in front of
 * them, and it should light up too.
 */
export function writtenFormsOf(id: string): string[] {
  const prefix = firstSegment(id);
  if (!ROUTE_PREFIXES.has(prefix)) return [id];
  const stripped = id.slice(prefix.length + 1);
  // A prefix with nothing after it is not a prefix. Defensive: no current id
  // looks like this, and if one ever does, the id itself is still returned.
  return stripped.length > 0 ? [id, stripped] : [id];
}

/** Every distinct first segment present in a set of ids, for the coverage test. */
export function prefixesInCatalog(ids: readonly string[]): Set<string> {
  return new Set(ids.map(firstSegment));
}
