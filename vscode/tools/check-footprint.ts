/**
 * What the extension costs to load, and whether the parts it does not bundle can
 * actually be found.
 *
 * Two failures this exists to catch, both of which pass every other check:
 *
 *   1. **The tokenizer silently getting inlined again.** `js-tiktoken` is marked
 *      external so the rank tables stay a lazy runtime require. Delete that line
 *      and everything still builds, still tests green, still activates — the
 *      bundle just quietly grows from 25 KB to 3.3 MB and every editor window
 *      pays for it. The size budget below is what notices.
 *   2. **An external that is not in the package.** The inverse mistake: marked
 *      external, then excluded by `.vscodeignore`, so `require` throws at the
 *      moment someone runs the estimate command. The site's loader catches that
 *      and falls back to a labelled estimate, which means the failure is not an
 *      error anyone sees — exact counting just stops happening. Resolving each
 *      specifier here is what turns that into a red build.
 */
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = resolve(ROOT, 'dist/extension.cjs');

/**
 * The bundle is loaded on every window that activates the extension. Anything
 * approaching a megabyte here means something large stopped being lazy.
 */
const MAX_BUNDLE_KB = 100;

/** Every specifier `tools/build.ts` marks external, except `vscode` itself. */
const EXTERNALS = ['js-tiktoken/lite', 'js-tiktoken/ranks/o200k_base', 'js-tiktoken/ranks/cl100k_base'];

const problems: string[] = [];

const sizeKb = statSync(BUNDLE).size / 1024;
if (sizeKb > MAX_BUNDLE_KB) {
  problems.push(
    `dist/extension.cjs is ${sizeKb.toFixed(1)} KB, over the ${MAX_BUNDLE_KB} KB budget.\n` +
      `  The usual cause is something that should be external being bundled — check ` +
      `TOKENIZER_EXTERNALS in tools/build.ts.`,
  );
}

const source = readFileSync(BUNDLE, 'utf8');
const require_ = createRequire(resolve(ROOT, 'noop.cjs'));

for (const specifier of EXTERNALS) {
  // Present in the output means esbuild left it alone rather than inlining it.
  if (!source.includes(specifier)) {
    problems.push(
      `"${specifier}" does not appear in the bundle. It has been inlined instead of ` +
        `left external, which is the 3.3 MB regression.`,
    );
  }
  try {
    require_.resolve(specifier);
  } catch {
    problems.push(
      `"${specifier}" is marked external but cannot be resolved. Exact token counting ` +
        `would degrade to a calibrated estimate with no visible error.`,
    );
  }
}

if (problems.length > 0) {
  console.error(`\n  Footprint check failed:\n\n${problems.map((p) => `  - ${p}`).join('\n\n')}\n`);
  process.exit(1);
}

console.log(
  `  footprint OK — bundle ${sizeKb.toFixed(1)} KB (budget ${MAX_BUNDLE_KB} KB), ` +
    `${EXTERNALS.length} externals resolve`,
);
