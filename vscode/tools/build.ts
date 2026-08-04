/**
 * Bundle the extension to a single file the VS Code extension host can load.
 *
 * Three settings here are not stylistic, and getting any of them wrong produces
 * an extension that builds, typechecks, tests green — and then fails at
 * activation, which is the only place it could have been caught.
 *
 *   1. `format: 'cjs'`. The extension host loads CommonJS. The MCP server in
 *      this repository builds ESM and that is correct for it; copying that line
 *      here is not.
 *   2. The output is `.cjs`, not `.js`. This package is `"type": "module"` like
 *      the rest of the repository, which would make a `dist/extension.js` ESM
 *      no matter what esbuild emitted into it. The explicit extension settles
 *      it at the file level, so the package can stay ESM for its own tooling.
 *   3. `external: ['vscode']`. That module is injected by the host at runtime
 *      and does not exist on disk. Bundling it does not fail the build; it
 *      fails the activation, with an error that points at the bundle rather
 *      than at this line.
 *
 * The `@` alias is the one that matters for correctness rather than mechanics:
 * TypeScript does not rewrite `paths`, so `@/lib/pricing/catalog` would survive
 * compilation verbatim and be unresolvable at runtime. It is also the single
 * line that makes "this extension cannot disagree with the website" true.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The version, stamped into the bundle at build time.
 *
 * Read from the manifest rather than taken from `context.extension.packageJSON`
 * so it is a property of the artifact itself: what the log reports is what was
 * built, not what some manifest on disk claims. A session went by unable to tell
 * two builds apart because every one of them was 0.1.0 and the running extension
 * host was serving a cached copy of neither.
 */
const VERSION: string = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version;

/**
 * The tokenizer is required at runtime, not bundled — and the difference is 3.3 MB.
 *
 * `src/lib/tokenize` loads encoders through `await import()` precisely so the
 * cost is paid by whoever asks for an exact count. Bundling flattens that: esbuild
 * inlines both rank tables into the output, and the measured result was a bundle
 * going from 19.7 KB to 3,368 KB — every editor window carrying two megabytes of
 * o200k ranks whether or not anyone ever runs the estimate command.
 *
 * Marking them external keeps the dynamic import a real runtime `require`, so the
 * tables are read from disk on first use and never otherwise. The four files this
 * needs are shipped by the negation rules in `.vscodeignore`; the rest of
 * `node_modules` is excluded, which is what keeps the package at ~3.4 MB rather
 * than the 22 MB the full install weighs.
 *
 * If a rank file is ever missing at runtime, `loadEncoder` catches the failure and
 * falls back to a clearly labelled estimate. That is a degraded answer, not a
 * wrong one.
 */
const TOKENIZER_EXTERNALS = [
  'js-tiktoken/lite',
  'js-tiktoken/ranks/o200k_base',
  'js-tiktoken/ranks/cl100k_base',
];

const result = await build({
  entryPoints: [resolve(ROOT, 'src/extension.ts')],
  outfile: resolve(ROOT, 'dist/extension.cjs'),
  bundle: true,
  platform: 'node',
  // VS Code 1.85 ships Node 18. Targeting the floor the manifest advertises
  // rather than whatever Node built the bundle.
  target: 'node18',
  format: 'cjs',
  alias: { '@': resolve(ROOT, '../src') },
  external: ['vscode', ...TOKENIZER_EXTERNALS],
  define: { __EXTENSION_VERSION__: JSON.stringify(VERSION) },
  legalComments: 'none',
  minify: true,
  sourcemap: true,
  metafile: true,
});

// Two outputs now that sourcemaps are on; the bundle is the one whose path is
// not the map. Reporting the map's size instead would understate the artifact.
const bundle = Object.entries(result.metafile.outputs).find(([path]) => !path.endsWith('.map'));
console.log(`  bundled dist/extension.cjs — ${((bundle?.[1].bytes ?? 0) / 1024).toFixed(1)} KB`);
