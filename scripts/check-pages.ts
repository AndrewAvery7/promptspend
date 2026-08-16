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
 * moves all of them at once and none of them automatically.
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
import { readFile } from 'node:fs/promises';
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

const pagesDoc = await readFile(PAGES_DOC, 'utf8');
const readme = await readFile(README, 'utf8');
const pagesSrc = await readFile(PAGES_SRC, 'utf8');

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
/* `\s+` throughout, not a literal space: these files are hard-wrapped prose, so
   any of these phrases can be split across a line break by a later reflow. A
   pattern that only matches unwrapped text would report "wording changed" the
   first time someone ran Prettier over the paragraph. */
const prose = pagesDoc.match(
  /([\d,]+)\s+of\s+them\s+today:\s+([\d,]+)\s+models,\s+([\d,]+)\s+providers,\s+([\d,]+)\s+comparisons,\s+([\d,]+)\s+indexes/,
);
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
const rows: [string, RegExp, number][] = [
  ['/models/ index', /\|\s*`\/models\/`\s*\|\s*(\d+)\s*\|/, 1],
  ['/models/<slug>/', /\|\s*`\/models\/<slug>\/`\s*\|\s*(\d+)\s*\|/, models],
  ['/providers/ index', /\|\s*`\/providers\/`\s*\|\s*(\d+)\s*\|/, 1],
  ['/providers/<slug>/', /\|\s*`\/providers\/<slug>\/`\s*\|\s*(\d+)\s*\|/, providers],
  ['/compare/ index', /\|\s*`\/compare\/`\s*\|\s*(\d+)\s*\|/, 1],
  ['/compare/<a>-vs-<b>/', /\|\s*`\/compare\/<a>-vs-<b>\/`\s*\|\s*(\d+)\s*\|/, comparisons],
];
for (const [label, pattern, expected] of rows) {
  const m = pagesDoc.match(pattern);
  if (!m) fail(`docs/PAGES.md table: no row for ${label}`);
  else if (Number(m[1]) !== expected) {
    fail(`docs/PAGES.md table: ${label} says ${m[1]}, the build produces ${expected}`);
  }
}

/* ── The combinatorial illustration, in both files that carry it ──
   "69 × 68 ÷ 2 = 2,346" silently depends on the model count. It is the
   argument for curating the comparison set, so it being wrong undercuts the
   reasoning, not just a number. */
const combo = /([\d,]+)\s+×\s+([\d,]+)\s+÷\s+2\s+=\s+([\d,]+)/g;
const expectedPairs = (models * (models - 1)) / 2;
for (const [label, text] of [
  ['docs/PAGES.md', pagesDoc],
  ['src/lib/seo/pages.ts', pagesSrc],
] as const) {
  const found = [...text.matchAll(combo)];
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
expectAll('README.md "N crawlable pages"', readme, /([\d,]+)\s+crawlable\s+pages/g, total);
expectAll('README.md "The N generated pages"', readme, /The\s+([\d,]+)\s+generated\s+pages/g, total);

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
