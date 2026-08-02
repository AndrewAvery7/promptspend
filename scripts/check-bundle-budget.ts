/**
 * Bundle budget.
 *
 * The initial payload is the one number that decides whether a phone on a bad
 * connection ever sees a cost card. It is easy to lose fifty kilobytes at a
 * time and never notice, so the limit is written down and checked in CI.
 *
 * The tokenizer is measured separately and given a much larger allowance: it is
 * dynamically imported and only fetched when someone actually pastes text for
 * an OpenAI-family model. It must never join the initial chunk — a regression
 * that inlines it would blow the initial budget, which is the point.
 *
 *   npm run build && npm run check:budget
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = resolve(ROOT, 'dist/assets');

/** Gzipped kilobytes. Raise deliberately, with a note about what bought it. */
const BUDGETS = {
  initialJs: 100,
  initialCss: 40,
  tokenizer: 2048,
};

async function gzippedKb(path: string): Promise<number> {
  return gzipSync(await readFile(path)).length / 1024;
}

async function main(): Promise<void> {
  if (!existsSync(ASSETS)) {
    console.error(`✗ ${ASSETS} does not exist — run \`npm run build\` first.`);
    process.exitCode = 1;
    return;
  }

  const files = await readdir(ASSETS);
  let initialJs = 0;
  let initialCss = 0;
  let tokenizer = 0;

  for (const file of files) {
    const path = join(ASSETS, file);
    if (!(await stat(path)).isFile()) continue;
    const kb = await gzippedKb(path);
    if (file.startsWith('tokenizer-')) tokenizer += kb;
    else if (file.endsWith('.js')) initialJs += kb;
    else if (file.endsWith('.css')) initialCss += kb;
  }

  const results = [
    { name: 'initial JS', actual: initialJs, budget: BUDGETS.initialJs },
    { name: 'initial CSS', actual: initialCss, budget: BUDGETS.initialCss },
    { name: 'tokenizer (lazy)', actual: tokenizer, budget: BUDGETS.tokenizer },
  ];

  let failed = false;
  for (const { name, actual, budget } of results) {
    const ok = actual <= budget;
    if (!ok) failed = true;
    console.log(
      `${ok ? '✓' : '✗'} ${name.padEnd(18)} ${actual.toFixed(1).padStart(7)} KB gzip / ${budget} KB budget`,
    );
  }

  if (tokenizer === 0) {
    console.error('✗ no tokenizer chunk found — it may have been inlined into the initial bundle');
    failed = true;
  }
  if (failed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
