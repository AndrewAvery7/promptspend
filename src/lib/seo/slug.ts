/**
 * URL slugs for catalog entities.
 *
 * A model id is not a URL. `gpt-5.6-sol`, `amazon.nova-2-lite-v1-0` and
 * `dashscope-qwen3.7-max` all contain characters that are legal in a path but
 * awful in one — dots in particular read as file extensions to humans and to a
 * surprising number of tools.
 *
 * The rule that matters more than the transformation: **a slug is a permanent
 * identifier**. Once a page is indexed, changing its URL throws away everything
 * it has earned. So the function is deliberately boring, and
 * `assertUniqueSlugs` fails the build rather than letting two models quietly
 * land on the same address — the second would overwrite the first and neither
 * failure would be visible on the site.
 */

/** Lowercase, alphanumeric, single hyphens, no leading or trailing hyphen. */
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length === 0) {
    throw new Error(`"${value}" has no slug-safe characters — it cannot have a page.`);
  }
  return slug;
}

/**
 * A model id as a URL segment, with a doubled leading token collapsed.
 *
 * Several upstream ids carry their family name twice — `gemini-gemini-3.1-pro`,
 * `deepseek-deepseek-r1`, `minimax-minimax-m2` — because the source prefixes a
 * vendor namespace onto a name that already contains it. Left alone that
 * produces `/models/gemini-gemini-3-1-pro/`, which looks like a bug to anyone
 * reading the URL.
 *
 * The collapse is a pure function of the id and nothing else. Deriving these
 * slugs from `displayName` instead would read better still, and would be a
 * mistake: display names get tidied up (the changelog is full of it) and a slug
 * that moves throws away everything the page has earned. Ids are the stable
 * thing, so ids are what the URLs are built from.
 */
export function modelSlug(id: string): string {
  return slugify(id).replace(/^([a-z0-9]+)-\1-/, '$1-');
}

/**
 * Throw if two different ids produce the same slug.
 *
 * Called by the page builder before anything is written. A collision is not a
 * runtime condition to recover from — it means two pages would compete for one
 * URL, and the right response is to notice at build time and rename.
 */
export function assertUniqueSlugs(entries: readonly { id: string; slug: string }[], kind: string): void {
  const byslug = new Map<string, string[]>();
  for (const entry of entries) {
    byslug.set(entry.slug, [...(byslug.get(entry.slug) ?? []), entry.id]);
  }
  const collisions = [...byslug.entries()].filter(([, ids]) => ids.length > 1);
  if (collisions.length > 0) {
    const detail = collisions.map(([slug, ids]) => `  ${slug} <- ${ids.join(', ')}`).join('\n');
    throw new Error(`Two ${kind} ids produce the same URL slug:\n${detail}`);
  }
}

/**
 * The two halves of a comparison URL, always in the same order.
 *
 * Sorting means `a-vs-b` and `b-vs-a` cannot both exist. Two URLs holding the
 * same comparison would split whatever either of them earned, and search
 * engines would pick one arbitrarily.
 */
export function comparisonSlug(left: string, right: string): string {
  const [first, second] = [left, right].sort((a, b) => a.localeCompare(b));
  return `${first}-vs-${second}`;
}
