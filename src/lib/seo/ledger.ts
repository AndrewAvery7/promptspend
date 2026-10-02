/**
 * The record of every generated page the site has ever published.
 *
 * Two things went wrong with the generated pages, and both came from the build
 * having no memory:
 *
 * 1. **`lastmod` was the build date on every URL, every day.** The sitemap told
 *    Google that 170 pages changed each morning when, on most mornings, none of
 *    them had. A crawler that is told "everything changed" every day learns to
 *    ignore `lastmod` altogether — Google says plainly that it only uses the
 *    value when it is "consistently and verifiably accurate".
 * 2. **Comparison URLs came and went.** The head-to-head pairs are re-picked
 *    from the catalog on every build, so a model arriving could push a pair out
 *    and its URL — with whatever it had earned in search — turned into a bare
 *    GitHub Pages 404.
 *
 * The ledger fixes both by remembering, per path: when it was first published,
 * a fingerprint of its *material* content (the rates and facts a reader came
 * for, not the footer's build date), and the date that fingerprint last moved.
 * `lastmod` is then the date the content actually changed, and a comparison
 * that has ever been published keeps being built.
 *
 * It lives in `data/published-pages.json` and is written by
 * `scripts/check-pages.ts --fix`, which the daily sync already runs before it
 * commits. Without `--fix` that script fails when the ledger and the build
 * disagree, so a page can never be published without being recorded.
 *
 * Everything here is pure, like `pages.ts`: no filesystem, no clock. The date a
 * change is recorded on is the catalog's own `generatedAt`, so two runs over the
 * same catalog and ledger produce the same file.
 */

export interface LedgerEntry {
  /** The catalog date (YYYY-MM-DD) the page first appeared on. */
  published: string;
  /** The catalog date its material content last changed. What the sitemap says. */
  lastmod: string;
  /** A short hash of that material content; see `fingerprint`. */
  fingerprint: string;
  /** Comparison pages only: the two model slugs, in URL order. Kept so a pair
   *  can be rebuilt — or retired gracefully — without parsing its slug, which
   *  is ambiguous when a model slug itself contains `-vs-`. */
  left?: string;
  right?: string;
}

/** Path (`/models/gpt-5/`) to its entry. */
export type PageLedger = Record<string, LedgerEntry>;

/** The minimum a page must carry to be recorded. */
export interface LedgerPage {
  path: string;
  fingerprint: string;
  /** Comparison pages: the pair, so the entry can rebuild it. */
  leftSlug?: string;
  rightSlug?: string;
}

/**
 * A short, stable hash of a string — cyrb53, as 14 hex digits.
 *
 * Not cryptographic and does not need to be: it only has to change when the
 * content does. Pure JavaScript rather than `node:crypto` so this module runs in
 * the same browser-shaped test environment as the rest of `src/lib`.
 */
export function hashString(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0');
}

/** JSON with object keys sorted at every depth, so the same content always
 *  serialises the same way — the sync rewriting a row with its keys in a
 *  different order must not read as the page changing. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return inner;
    const record = inner as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) sorted[key] = record[key];
    return sorted;
  });
}

/** Fingerprint any JSON-able value, independent of key order. */
export function fingerprint(value: unknown): string {
  return hashString(canonicalJson(value));
}

/**
 * The `lastmod` a page should carry.
 *
 * The recorded date while the content still matches what was recorded;
 * otherwise `today` — the page is new, or has changed since the ledger was last
 * written. Either way the answer depends only on the catalog and the ledger,
 * so building twice gives the same sitemap, and building before or after
 * `--fix` gives the same dates.
 */
export function resolveLastmod(
  ledger: PageLedger | undefined,
  path: string,
  print: string,
  today: string,
): string {
  const entry = ledger?.[path];
  return entry && entry.fingerprint === print ? entry.lastmod : today;
}

/** The comparison pairs the ledger remembers, in slug order. */
export function recordedPairs(
  ledger: PageLedger | undefined,
  root = '/compare/',
): { path: string; slug: string; left: string; right: string }[] {
  if (!ledger) return [];
  return Object.entries(ledger)
    .filter(([path, entry]) => path.startsWith(root) && path !== root && entry.left && entry.right)
    .map(([path, entry]) => ({
      path,
      slug: path.slice(root.length).replace(/\/$/, ''),
      left: entry.left!,
      right: entry.right!,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * The ledger after a build: new pages recorded, changed pages re-dated, and
 * nothing ever removed — a page that stops being built is exactly the case the
 * ledger exists to remember.
 */
export function updateLedger(
  ledger: PageLedger | undefined,
  pages: readonly LedgerPage[],
  today: string,
): PageLedger {
  const next: PageLedger = { ...(ledger ?? {}) };
  for (const page of pages) {
    const entry = next[page.path];
    const pair = page.leftSlug && page.rightSlug ? { left: page.leftSlug, right: page.rightSlug } : {};
    if (!entry) {
      next[page.path] = { published: today, lastmod: today, fingerprint: page.fingerprint, ...pair };
    } else if (entry.fingerprint !== page.fingerprint) {
      next[page.path] = { ...entry, lastmod: today, fingerprint: page.fingerprint, ...pair };
    }
  }
  return sortLedger(next);
}

/** Paths whose ledger entry is missing or out of date for this build. */
export function ledgerDrift(ledger: PageLedger | undefined, pages: readonly LedgerPage[]): string[] {
  return pages
    .filter((page) => ledger?.[page.path]?.fingerprint !== page.fingerprint)
    .map((page) => page.path)
    .sort();
}

/** Paths whose `lastmod` differs between two ledgers, or that only `next` has. */
export function changedPaths(previous: PageLedger, next: PageLedger): string[] {
  return Object.keys(next)
    .filter((path) => previous[path]?.lastmod !== next[path]!.lastmod)
    .sort();
}

/** Keys in path order, so the file diffs one line per changed page. */
export function sortLedger(ledger: PageLedger): PageLedger {
  const sorted: PageLedger = {};
  for (const path of Object.keys(ledger).sort((a, b) => a.localeCompare(b))) {
    const entry = ledger[path]!;
    sorted[path] = {
      published: entry.published,
      lastmod: entry.lastmod,
      fingerprint: entry.fingerprint,
      ...(entry.left && entry.right ? { left: entry.left, right: entry.right } : {}),
    };
  }
  return sorted;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Narrow the parsed file. A malformed ledger fails loudly: a build that quietly
 * ignored it would go back to stamping today's date on everything and dropping
 * comparisons, which is the failure this file exists to prevent.
 */
export function parseLedger(raw: unknown): PageLedger {
  if (typeof raw !== 'object' || raw === null) throw new Error('page ledger: not an object');
  const pages = (raw as { pages?: unknown }).pages;
  if (typeof pages !== 'object' || pages === null) throw new Error('page ledger: no "pages" object');
  const out: PageLedger = {};
  for (const [path, value] of Object.entries(pages)) {
    const entry = value as Partial<LedgerEntry>;
    if (!path.startsWith('/') || !path.endsWith('/')) throw new Error(`page ledger: bad path ${path}`);
    if (!DATE.test(entry.published ?? '') || !DATE.test(entry.lastmod ?? '')) {
      throw new Error(`page ledger: ${path} has a malformed date`);
    }
    if (typeof entry.fingerprint !== 'string' || entry.fingerprint.length === 0) {
      throw new Error(`page ledger: ${path} has no fingerprint`);
    }
    if ((entry.left === undefined) !== (entry.right === undefined)) {
      throw new Error(`page ledger: ${path} names only one side of its pair`);
    }
    out[path] = {
      published: entry.published!,
      lastmod: entry.lastmod!,
      fingerprint: entry.fingerprint,
      ...(entry.left && entry.right ? { left: entry.left, right: entry.right } : {}),
    };
  }
  return out;
}

export const LEDGER_COMMENT =
  'Every generated page the site has published: when it first appeared, a fingerprint of its material content, and the date that content last changed (what sitemap.xml reports as lastmod). Comparison entries also name their two model slugs, so a published pair keeps being built and never 404s. Written by `npx tsx scripts/check-pages.ts --fix` (the daily sync runs it); never edit by hand, never delete an entry. See src/lib/seo/ledger.ts.';

/** The file as written: a comment, then the pages in path order. */
export function serializeLedger(ledger: PageLedger): string {
  return `${JSON.stringify({ $comment: LEDGER_COMMENT, pages: sortLedger(ledger) }, null, 2)}\n`;
}
