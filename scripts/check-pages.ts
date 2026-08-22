/**
 * The generated-page counts.
 *
 * `159` is the last counted figure in this repository with nothing holding it
 * to anything — the same shape of gap `check-test-badge.ts` was written to
 * close for `tests-`, and the same one `validate-catalog.ts` closes for
 * `models-` and `check-bundle-budget.ts` for the payload badge.
 *
 * It is worse than the test badge in one respect: it is written down in six
 * places, in three different forms. A prose total and its four parts in
 * `docs/PAGES.md`, six rows of a table in the same file, an illustration of the
 * combinatorial alternative (`69 × 68 ÷ 2 = 2,346`) that quietly depends on the
 * model count, the same illustration again in a doc comment in
 * `src/lib/seo/pages.ts`, and two mentions in `README.md`. A catalogue change
 * moves all of them at once.
 *
 * **`--fix` writes them.** They used to move only by hand, which meant the one
 * event that changes them — a model arriving or leaving — was also the event
 * that blocked its own publication: on 2026-08-22 the sync discovered
 * `moonshot-kimi-k3`, published a correct catalogue, and then failed its deploy
 * here. The daily sync now runs this with `--fix`, the way it already rewrites
 * the README's model and provider badges. See the note above `FIX` below.
 *
 * **Derived, not executed.** `buildPages` is pure — it takes the catalogue and
 * returns the page set — so the counts come from calling it, not from building
 * to disk and counting files. That keeps this fast enough to sit in `verify`
 * ahead of the build rather than after it, and means a wrong number fails
 * before eleven minutes of page rendering, not after.
 *
 * **The total is checked against the sum of its own parts, separately from
 * being checked against reality.** `docs/TESTING.md` twice published a total
 * that was not the sum of the list printed directly beneath it, which is a
 * different defect from being out of date and reads as more authoritative.
 * Both are failures here, and they report differently.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PricingCatalog } from '@/lib/pricing/types';
import { assertCatalog } from '@/lib/pricing/types';
import { buildPages } from '@/lib/seo/pages';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = resolve(ROOT, 'public/data/pricing.json');
const PAGES_DOC = resolve(ROOT, 'docs/PAGES.md');
const README = resolve(ROOT, 'README.md');
const PAGES_SRC = resolve(ROOT, 'src/lib/seo/pages.ts');
const MANIFEST = resolve(ROOT, 'public/manifest.webmanifest');

const problems: string[] = [];
const fail = (msg: string): void => void problems.push(msg);

/** A capture group as a number, with the thousands separator removed.
 *
 *  Throws rather than returning a nullable, because a missing group means the
 *  pattern and the code reading it disagree — a fault in this file, not in the
 *  documents it checks. Those get reported through `fail`; this would be noise
 *  in the same channel. */
function capture(m: RegExpMatchArray, index: number): number {
  const raw = m[index];
  if (raw === undefined) {
    throw new Error(`check-pages: pattern ${String(m[0]).slice(0, 40)} has no group ${index}`);
  }
  return Number(raw.replace(/,/g, ''));
}

/** Reports every occurrence, not just the first: a figure written down six
 *  times fails in more than one place, and fixing them one run at a time is
 *  how the third one gets missed. */
function expectAll(label: string, haystack: string, pattern: RegExp, expected: number): void {
  const matches = [...haystack.matchAll(pattern)];
  if (matches.length === 0) {
    fail(`${label}: no longer matches its pattern — was the wording changed? Update this check with it.`);
    return;
  }
  for (const m of matches) {
    const found = capture(m, 1);
    if (found !== expected) fail(`${label}: says ${found}, the build produces ${expected}`);
  }
}

const raw: unknown = JSON.parse(await readFile(CATALOG, 'utf8'));
assertCatalog(raw);
const catalog: PricingCatalog = raw;
const set = buildPages(catalog, { asOf: new Date(catalog.generatedAt) });

const models = set.models.length;
const providers = set.providers.length;
const comparisons = set.comparisons.length;
const INDEXES = 3; // /models/, /providers/, /compare/
const total = set.all.length;

/* The page set's own arithmetic. If `all` ever stops being the four parts, the
   documented breakdown is describing something that no longer exists. */
if (models + providers + comparisons + INDEXES !== total) {
  fail(
    `the page set does not add up: ${models} + ${providers} + ${comparisons} + ${INDEXES} ` +
      `= ${models + providers + comparisons + INDEXES}, but set.all holds ${total}`,
  );
}

let pagesDoc = await readFile(PAGES_DOC, 'utf8');
let readme = await readFile(README, 'utf8');
let pagesSrc = await readFile(PAGES_SRC, 'utf8');

/**
 * `--fix`: write the figures instead of only complaining about them.
 *
 * Adding a model moves all nine of these at once, so before this existed a
 * sync that discovered one published a correct catalogue and then failed its
 * own deploy on the documentation describing it. That happened on 2026-08-22
 * with `moonshot-kimi-k3`: the prices were right, current and unpublishable.
 * `sync-pricing.ts` already rewrites the README's model and provider badges
 * from the catalogue it just built; these are the same kind of derived figure
 * and had simply never been given the same treatment.
 *
 * It lives here rather than in a writer of its own so that the patterns have
 * exactly one definition. A separate module would need its own copy of every
 * regex below, and the first reflow that moved a line break would leave the
 * two disagreeing about what to match — with the checker reporting "wording
 * changed" and the writer silently doing nothing.
 *
 * The rewrite runs *before* the checks, deliberately, and the checks then run
 * against the rewritten text. So `--fix` cannot claim success on a figure it
 * failed to move: anything it missed still fails the run.
 */
const FIX = process.argv.includes('--fix');

/** Thousands separators, matching how these figures are already written:
 *  `2,556` but `162`. */
const num = (n: number): string => n.toLocaleString('en-US');

/**
 * Replace capture group `index` of every match with `value`, by byte offset.
 *
 * By offset rather than by string replacement because the text around the
 * number must survive untouched — the `\s+` in these patterns spans line
 * breaks that Prettier put there, and a markdown cell's padding is load-bearing
 * for the column width. Right to left so that earlier offsets stay valid as
 * the replacements change length.
 *
 * Needs the `d` flag on the pattern; a pattern without it silently matches
 * nothing here, which the checks below would then catch.
 */
function rewriteGroup(text: string, pattern: RegExp, index: number, value: number): string {
  const flags = pattern.flags.includes('d') ? pattern.flags : `${pattern.flags}d`;
  const withIndices = new RegExp(pattern.source, flags.includes('g') ? flags : `${flags}g`);
  let out = text;
  for (const m of [...text.matchAll(withIndices)].reverse()) {
    const at = m.indices?.[index];
    if (!at) continue;
    out = `${out.slice(0, at[0])}${num(value)}${out.slice(at[1])}`;
  }
  return out;
}

/**
 * Rewrite a markdown table cell, keeping the column exactly as wide as it was.
 *
 * `rewriteGroup` alone is wrong here. It substitutes the digits and leaves the
 * padding, so 7 → 72 widens the cell by one and Prettier then re-lays every
 * row of the table — turning a one-digit correction into a whole-table diff,
 * and failing `format:check` in the middle of a sync that has already
 * published. Whatever the number gains, the spaces after it give up.
 *
 * If the number outgrows its column there is nothing to give up, and the cell
 * falls back to a single trailing space. Prettier will then legitimately widen
 * the column, `format:check` will say so, and a human runs `npm run format` —
 * which is the right outcome, because at that point the table really has
 * changed shape.
 */
function rewriteCell(text: string, pattern: RegExp, value: number): string {
  const withIndices = new RegExp(
    pattern.source,
    pattern.flags.includes('d') ? pattern.flags : `${pattern.flags}d`,
  );
  const m = text.match(withIndices);
  const at = m?.indices?.[1];
  if (!at) return text;

  const [start, end] = at;
  const replacement = num(value);
  let after = end;
  while (text[after] === ' ') after += 1;
  const padding = after - end;
  const keep = Math.max(1, padding - (replacement.length - (end - start)));
  return `${text.slice(0, start)}${replacement}${' '.repeat(keep)}${text.slice(after)}`;
}

/* The patterns, named once and used by both the rewrite and the checks below.
   `\s+` throughout, not a literal space: these files are hard-wrapped prose, so
   any of these phrases can be split across a line break by a later reflow. A
   pattern that only matches unwrapped text would report "wording changed" the
   first time someone ran Prettier over the paragraph. */
const PROSE =
  /([\d,]+)\s+of\s+them\s+today:\s+([\d,]+)\s+models,\s+([\d,]+)\s+providers,\s+([\d,]+)\s+comparisons,\s+([\d,]+)\s+indexes/d;

const ROWS: [string, RegExp, number][] = [
  ['/models/ index', /\|\s*`\/models\/`\s*\|\s*(\d+)\s*\|/d, 1],
  ['/models/<slug>/', /\|\s*`\/models\/<slug>\/`\s*\|\s*(\d+)\s*\|/d, models],
  ['/providers/ index', /\|\s*`\/providers\/`\s*\|\s*(\d+)\s*\|/d, 1],
  ['/providers/<slug>/', /\|\s*`\/providers\/<slug>\/`\s*\|\s*(\d+)\s*\|/d, providers],
  ['/compare/ index', /\|\s*`\/compare\/`\s*\|\s*(\d+)\s*\|/d, 1],
  ['/compare/<a>-vs-<b>/', /\|\s*`\/compare\/<a>-vs-<b>\/`\s*\|\s*(\d+)\s*\|/d, comparisons],
];

/* "69 × 68 ÷ 2 = 2,346" silently depends on the model count. It is the
   argument for curating the comparison set, so it being wrong undercuts the
   reasoning, not just a number. */
const COMBO = /([\d,]+)\s+×\s+([\d,]+)\s+÷\s+2\s+=\s+([\d,]+)/dg;
const CRAWLABLE = /([\d,]+)\s+crawlable\s+pages/dg;
const GENERATED = /The\s+([\d,]+)\s+generated\s+pages/dg;

const expectedPairs = (models * (models - 1)) / 2;

if (FIX) {
  const before = [pagesDoc, readme, pagesSrc];

  for (const [index, value] of [
    [1, total],
    [2, models],
    [3, providers],
    [4, comparisons],
    [5, INDEXES],
  ] as const) {
    pagesDoc = rewriteGroup(pagesDoc, PROSE, index, value);
  }
  for (const [, pattern, expected] of ROWS) {
    pagesDoc = rewriteCell(pagesDoc, pattern, expected);
  }
  // Both terms and the product, so the illustration stays arithmetic a reader
  // can check rather than three numbers that merely look plausible together.
  for (const [index, value] of [
    [1, models],
    [2, models - 1],
    [3, expectedPairs],
  ] as const) {
    pagesDoc = rewriteGroup(pagesDoc, COMBO, index, value);
    pagesSrc = rewriteGroup(pagesSrc, COMBO, index, value);
  }
  readme = rewriteGroup(readme, CRAWLABLE, 1, total);
  readme = rewriteGroup(readme, GENERATED, 1, total);

  const after = [pagesDoc, readme, pagesSrc];
  const paths = [PAGES_DOC, README, PAGES_SRC];
  let written = 0;
  for (const [i, path] of paths.entries()) {
    if (before[i] === after[i]) continue;
    await writeFile(path, after[i]!, 'utf8');
    written += 1;
    console.log(`  rewrote ${path.slice(ROOT.length + 1)}`);
  }
  console.log(
    written === 0
      ? '  --fix: every figure already agreed with the build'
      : `  --fix: ${written} file(s) updated — run Prettier if a table column changed width`,
  );
}

/* ── PWA install identity and adaptive icon safety ──
   A maskable icon is a different rendering contract from a regular icon: the
   platform may crop it into a circle, squircle or other device shape. Keep a
   stable app id and a dedicated asset so a later manifest cleanup cannot
   accidentally send the edge-to-edge icon through that crop path. */
const manifest = JSON.parse(await readFile(MANIFEST, 'utf8')) as {
  id?: unknown;
  icons?: Array<{ src?: unknown; purpose?: unknown }>;
};
if (manifest.id !== '/') fail('public/manifest.webmanifest: id must remain "/" for stable install identity');
const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
const anyIcon = icons.find((icon) =>
  String(icon.purpose ?? '')
    .split(/\s+/)
    .includes('any'),
);
const maskableIcon = icons.find((icon) =>
  String(icon.purpose ?? '')
    .split(/\s+/)
    .includes('maskable'),
);
if (!anyIcon) fail('public/manifest.webmanifest: no icon declares purpose "any"');
if (!maskableIcon) fail('public/manifest.webmanifest: no icon declares purpose "maskable"');
if (anyIcon?.src === maskableIcon?.src) {
  fail('public/manifest.webmanifest: regular and maskable purposes must use distinct asset paths');
}

/* ── docs/PAGES.md: the prose total and its four parts ──
   "159 of them today: 69 models, 12 providers, 75 comparisons, 3 indexes" */
const prose = pagesDoc.match(PROSE);
if (!prose) {
  fail('docs/PAGES.md: the "N of them today: ..." sentence no longer matches its pattern.');
} else {
  const tot = capture(prose, 1);
  const mo = capture(prose, 2);
  const pr = capture(prose, 3);
  const co = capture(prose, 4);
  const ix = capture(prose, 5);
  const sum = mo + pr + co + ix;
  // Checked before reality, and reported differently: a total that is not the
  // sum of the list beneath it is wrong even on the day it is written.
  if (tot !== sum) {
    fail(
      `docs/PAGES.md: the prose total ${tot} is not the sum of its own list (${mo}+${pr}+${co}+${ix}=${sum})`,
    );
  }
  if (tot !== total) fail(`docs/PAGES.md prose total: says ${tot}, the build produces ${total}`);
  if (mo !== models) fail(`docs/PAGES.md prose: says ${mo} models, the build produces ${models}`);
  if (pr !== providers) fail(`docs/PAGES.md prose: says ${pr} providers, the build produces ${providers}`);
  if (co !== comparisons)
    fail(`docs/PAGES.md prose: says ${co} comparisons, the build produces ${comparisons}`);
  if (ix !== INDEXES) fail(`docs/PAGES.md prose: says ${ix} indexes, the build produces ${INDEXES}`);
}

/* ── docs/PAGES.md: the six table rows ── */
for (const [label, pattern, expected] of ROWS) {
  const m = pagesDoc.match(pattern);
  if (!m) fail(`docs/PAGES.md table: no row for ${label}`);
  else if (Number(m[1]) !== expected) {
    fail(`docs/PAGES.md table: ${label} says ${m[1]}, the build produces ${expected}`);
  }
}

/* ── The combinatorial illustration, in both files that carry it ── */
for (const [label, text] of [
  ['docs/PAGES.md', pagesDoc],
  ['src/lib/seo/pages.ts', pagesSrc],
] as const) {
  const found = [...text.matchAll(COMBO)];
  if (found.length === 0) {
    fail(`${label}: the "N × N-1 ÷ 2 = ..." illustration no longer matches its pattern.`);
    continue;
  }
  for (const m of found) {
    const n = capture(m, 1);
    const nMinus = capture(m, 2);
    const product = capture(m, 3);
    if (n !== models) fail(`${label}: illustration opens with ${n}, the catalogue has ${models} models`);
    if (nMinus !== n - 1)
      fail(`${label}: illustration says ${n} × ${nMinus}; the second term must be ${n - 1}`);
    if (product !== expectedPairs) {
      fail(`${label}: illustration totals ${product}, but ${models} × ${models - 1} ÷ 2 = ${expectedPairs}`);
    }
  }
}

/* ── README.md, both mentions ── */
expectAll('README.md "N crawlable pages"', readme, CRAWLABLE, total);
expectAll('README.md "The N generated pages"', readme, GENERATED, total);

if (problems.length > 0) {
  console.error(`✗ generated-page counts disagree with the build (${total} pages):\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\n  The build produces ${models} models, ${providers} providers, ${comparisons} comparisons, ` +
      `${INDEXES} indexes = ${total}.\n  Update docs/PAGES.md, README.md and the doc comment in ` +
      `src/lib/seo/pages.ts to match.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `✓ ${total} generated pages — ${models} models, ${providers} providers, ` +
      `${comparisons} comparisons, ${INDEXES} indexes`,
  );
  console.log(
    '✓ docs/PAGES.md, README.md and the pages.ts doc comment all agree, and the total is the sum of its parts',
  );
  if (set.droppedComparisons > 0) {
    console.log(`  note: ${set.droppedComparisons} qualifying comparison(s) dropped by the page ceiling`);
  }
}
