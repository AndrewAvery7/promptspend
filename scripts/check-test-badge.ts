/**
 * The test-count badge.
 *
 * `tests-580-blue` is the last of the README's four counted badges with nothing
 * holding it to anything, and it is the one that has actually rotted. It has
 * been corrected by hand four times — 533, then 559, then 580, then 715 — every
 * one of them after somebody noticed, never before. docs/TESTING.md went
 * further and twice published a total that was not the sum of its own list: 533
 * was neither the sum nor inclusive of `mcp/` at all, and 580 was correct when
 * written and stopped being so the morning the VS Code extension landed with
 * 124 tests of its own.
 *
 * It rots because no single command produces it. The figure spans six suites
 * with their own runners, lockfiles and CI jobs, so the only way to know it is
 * to ask every one of them and add up the answers — which is what this does,
 * for the same reason `validate-catalog.ts` holds the models badge to the
 * catalog and `check-bundle-budget.ts` holds the payload badge to the build.
 *
 * **Collection, not execution.** `vitest list` and `playwright test --list`
 * report what a suite contains without running it. That is not an
 * approximation: in both runners every test is declared while its file is being
 * loaded, so a suite cannot hold a test that collection does not see. It counts
 * skipped tests too, which is already what the browser figure meant — 112 is
 * 108 that run plus four by-design viewport skips. The saving is the point:
 * `verify` runs the root suite once for real, and this adds seconds to it
 * rather than a second full pass.
 *
 * **Which suites exist is discovered, not listed.** It differed by branch while
 * `vscode/` was unmerged — the honest total was 715 on the extension branch and
 * 580 on `main` at the same moment — and it will differ again the next time a
 * workspace is built somewhere before it lands. A hard-coded list, or a
 * hard-coded number, is wrong on one branch or the other by construction.
 *
 *   npm run check:test-badge
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** How the root package and the browser run are named in the output. */
const THIS_PACKAGE = 'this package';
const BROWSER = 'the browser';

/** A counted suite. */
interface Suite {
  name: string;
  count: number;
}

/**
 * Run a locally installed CLI with this Node, and hand back its stdout.
 *
 * `process.execPath` plus the package's own entry file, rather than `npx`:
 * `npx` will cheerfully *download* a vitest when a workspace has not been
 * installed, and counting with a version the workspace did not pin is how you
 * get a confident wrong number. On Windows it is refused outright as well —
 * Node will not spawn `npx.cmd` without a shell. This form does neither, is
 * identical on both platforms, and can only run what `npm ci` already put on
 * disk.
 */
function run(bin: string, args: string[], cwd: string): Promise<string> {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout!.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
    child.stderr!.setEncoding('utf8').on('data', (chunk: string) => (err += chunk));
    child.on('error', fail);
    child.on('close', (code) =>
      code === 0
        ? ok(out)
        : fail(
            new Error(
              `${relative(ROOT, bin)} exited ${code} in ${relative(ROOT, cwd) || '.'}\n${err.trim()}`,
            ),
          ),
    );
  });
}

/** A vitest configuration, in any of the spellings vitest accepts. */
const VITEST_CONFIG = /^vitest\.config\.[cm]?[jt]s$/;

/**
 * Every directory whose tests count toward the badge.
 *
 * The root package is always one; its vitest configuration lives inside
 * `vite.config.ts` rather than in a file of its own. Every other workspace
 * announces itself with a `vitest.config.*`, which is what lets this survive a
 * branch carrying a workspace that `main` does not have.
 */
async function workspaces(): Promise<{ name: string; dir: string }[]> {
  const found: { name: string; dir: string }[] = [];
  for (const entry of await readdir(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const dir = join(ROOT, entry.name);
    if ((await readdir(dir)).some((file) => VITEST_CONFIG.test(file)))
      found.push({ name: `${entry.name}/`, dir });
  }
  found.sort((a, b) => a.name.localeCompare(b.name));
  return [{ name: THIS_PACKAGE, dir: ROOT }, ...found];
}

/**
 * A missing install has to stop the run rather than reduce the total.
 *
 * Skipping a workspace nobody installed would produce a smaller number, a
 * matching demand to shrink the badge, and a README that is wrong in the one
 * way this whole script exists to prevent.
 */
function requireInstalled(bin: string, name: string): void {
  if (existsSync(bin)) return;
  throw new Error(
    `${relative(ROOT, bin)} is missing, so ${name} cannot be counted. The badge is the sum of every ` +
      'workspace, so this check needs each one installed — run `npm ci` there.',
  );
}

async function countVitest(dir: string, name: string): Promise<number> {
  const bin = resolve(dir, 'node_modules/vitest/vitest.mjs');
  requireInstalled(bin, name);
  return (JSON.parse(await run(bin, ['list', '--json'], dir)) as unknown[]).length;
}

interface PlaywrightSuite {
  suites?: PlaywrightSuite[];
  specs?: { tests: unknown[] }[];
}

function tally(suite: PlaywrightSuite): number {
  return (
    (suite.suites ?? []).reduce((sum, child) => sum + tally(child), 0) +
    (suite.specs ?? []).reduce((sum, spec) => sum + spec.tests.length, 0)
  );
}

/**
 * The browser suite, counted the same way.
 *
 * `--list` starts neither the web server nor a browser, so this stays honest in
 * a job that has not built the site and has not downloaded Chromium. The
 * reporter is named explicitly because the config picks the GitHub one under
 * CI, and a count must not depend on where it is taken.
 */
async function countPlaywright(): Promise<number> {
  const bin = resolve(ROOT, 'node_modules/@playwright/test/cli.js');
  requireInstalled(bin, BROWSER);
  const report = JSON.parse(await run(bin, ['test', '--list', '--reporter=json'], ROOT)) as PlaywrightSuite;
  return tally(report);
}

/** A published number, and what it has to be. */
interface Claim {
  file: string;
  what: string;
  /** One capture group, global: every occurrence is checked, and none is optional. */
  pattern: RegExp;
  expected: number;
}

function problemsWith(text: string, { file, what, pattern, expected }: Claim): string[] {
  const found = [...text.matchAll(pattern)];
  if (found.length === 0) {
    return [`${file}: ${what} is no longer stated in a form this check can read (/${pattern.source}/)`];
  }
  return found
    .map((match) => Number(match[1]))
    .filter((claimed) => claimed !== expected)
    .map((claimed) => `${file}: ${what} is ${claimed}, the suites report ${expected}`);
}

/**
 * A pattern for a figure stated in prose, where every space may be a line break.
 *
 * Markdown wraps, so a number and the words that qualify it routinely sit on
 * different lines — `84 in` ends one line of docs/TESTING.md and `` `worker/` ``
 * begins the next. A pattern insisting on a literal space reports that figure
 * as missing entirely, and would do so again the first time the paragraph is
 * reflowed. Table rows cannot wrap, so those patterns are written literally.
 */
function prose(source: string): RegExp {
  return new RegExp(source.replaceAll(' ', '\\s+'), 'g');
}

/**
 * The places docs/TESTING.md publishes one suite's figure.
 *
 * Each is stated twice — once in the prose that adds them up, once in a table —
 * and it is the prose that has twice failed to sum. Checking every occurrence
 * rather than only the total is what makes "these figures are the whole suite
 * and they sum to the total" true by construction instead of by proofreading.
 */
function claimsFor({ name, count }: Suite): Claim[] {
  const patterns =
    name === THIS_PACKAGE
      ? [prose('(\\d+) unit and integration tests in this package')]
      : name === BROWSER
        ? [prose('(\\d+) browser tests'), /\|\s*Browser\s*\|\s*(\d+)\s*\|/g]
        : [prose(`(\\d+) in \`${name}\``), new RegExp(`\\|\\s*\`${name}\`\\s*\\|\\s*(\\d+)\\s*\\|`, 'g')];
  return patterns.map((pattern) => ({
    file: 'docs/TESTING.md',
    what: `the count for ${name}`,
    pattern,
    expected: count,
  }));
}

/**
 * Every *other* figure in these documents that claims to count tests.
 *
 * The claims above hold the places a count is expected: the badge, its alt
 * text, the total, and each suite's two entries. README.md stated the figure a
 * sixth time — "What the 715 tests cover", in the documentation table, two
 * hundred lines below a badge reading 735 — and nothing above looks there. This
 * check passed on a day the README was wrong, which is precisely the failure it
 * exists to prevent.
 *
 * The fix is not a seventh pattern for the sentence that happened to rot. Every
 * `N tests` in both documents is read instead, and each one must be a figure
 * the suites actually produce — the total, or one suite's count. That admits
 * "112 browser tests" and "344 unit and integration tests" without anyone
 * having to enumerate them, and refuses 715 without anyone having predicted
 * where it would appear.
 *
 * Up to four words may sit between the number and `tests`, because that is how
 * these counts are written; `\s+` throughout because markdown wraps wherever
 * the column runs out.
 */
const ANY_COUNT = /(\d+)(?:\s+[a-z]+){0,4}\s+tests?\b/gi;

/**
 * Swept in full — as opposed to CHANGELOG.md, deliberately.
 *
 * A changelog records what was true at a release. "22 tests" in the entry that
 * shipped 22 tests is correct and must stay; holding history to today's total
 * would demand rewriting the past every time a test is added. These documents
 * describe the project as it is now, so every count in them is a present-tense
 * claim.
 *
 * ALERTS.md and ARCHITECTURE.md are here because scoping the sweep to the two
 * documents that had already rotted was the same mistake one level up.
 * `docs/ALERTS.md` said "77 tests run inside workerd against a real D1 and a
 * real KV" — a stale count *and* a binding that had been deleted, sitting 174
 * lines below the same file's own "There is no KV binding." Nothing looked at
 * it, because it was not one of the two files anybody thought to name.
 */
const SWEPT = ['README.md', 'docs/TESTING.md', 'docs/ALERTS.md', 'docs/ARCHITECTURE.md'];

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

function strayCounts(file: string, text: string, permitted: Map<number, string>): string[] {
  return [...text.matchAll(ANY_COUNT)]
    .filter((match) => !permitted.has(Number(match[1])))
    .map(
      (match) =>
        `${file}:${lineOf(text, match.index)}: "${match[0].replace(/\s+/g, ' ')}" is not a figure any ` +
        `suite reports (${[...permitted].map(([count, name]) => `${count} ${name}`).join(', ')})`,
    );
}

async function main(): Promise<void> {
  const suites: Suite[] = [];
  for (const { name, dir } of await workspaces()) {
    suites.push({ name, count: await countVitest(dir, name) });
  }
  suites.push({ name: BROWSER, count: await countPlaywright() });

  const total = suites.reduce((sum, suite) => sum + suite.count, 0);
  const breakdown = suites.map(({ name, count }) => `${count} in ${name}`).join(', ');

  // Every document either check needs, loaded once and derived from the lists
  // above rather than written out a third time. Naming a file in `SWEPT` and
  // forgetting it here is exactly how the sweep died the first time it grew:
  // `sources.get(file)!` handed back undefined and the `!` made TypeScript
  // agree that could not happen.
  const needed = new Set(['README.md', 'docs/TESTING.md', ...SWEPT]);
  const sources = new Map(
    await Promise.all(
      [...needed].map(async (file) => [file, await readFile(resolve(ROOT, file), 'utf8')] as const),
    ),
  );

  const claims: Claim[] = [
    // The badge and its alt text are two hand-written copies of one number, and
    // they rot independently — the alt text is invisible to everyone reading
    // the rendered page and is exactly the sort of thing a hand edit forgets.
    { file: 'README.md', what: 'the test badge', pattern: /badge\/tests-(\d+)-/g, expected: total },
    { file: 'README.md', what: "the test badge's alt text", pattern: /alt="(\d+) tests"/g, expected: total },
    {
      file: 'docs/TESTING.md',
      what: 'the total',
      pattern: prose('\\*\\*(\\d+) tests in all\\*\\*'),
      expected: total,
    },
    ...suites.flatMap(claimsFor),
  ];

  // Every figure a suite legitimately produces, and what to call it in the
  // failure message. The total is listed first so it reads as the headline.
  const permitted = new Map<number, string>([[total, 'in all']]);
  for (const { name, count } of suites) permitted.set(count, `in ${name}`);

  const problems = [
    ...claims.flatMap((claim) => problemsWith(sources.get(claim.file)!, claim)),
    ...SWEPT.flatMap((file) => strayCounts(file, sources.get(file)!, permitted)),
  ];

  if (problems.length > 0) {
    console.error('✗ published test counts are stale:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(`\n  The suites report ${total}: ${breakdown}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`✓ ${total} tests — ${breakdown}`);
  console.log('✓ README badge and docs/TESTING.md both agree');
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
