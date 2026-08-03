/**
 * Bundle the server to a single file.
 *
 * `tsc` alone does not work here, and the way it fails is worth recording
 * because everything upstream of running the artifact said it was fine.
 *
 * Two problems, both invisible until the built file is actually executed:
 *
 *   1. TypeScript does not rewrite `paths`. The server imports the site's cost
 *      engine as `@/lib/engine/cost`, and that string survives compilation
 *      verbatim into the emitted JavaScript, where Node cannot resolve it.
 *   2. Node's ESM loader requires explicit file extensions. `./catalog` has to
 *      become `./catalog.js`. `moduleResolution: bundler` lets the source omit
 *      them, which is correct for a bundled package and fatal for an unbundled
 *      one.
 *
 * The test suite could not catch either: vitest applies the same alias and
 * resolves extensionless imports itself. The typecheck could not catch them
 * either. Only starting the built server did — which is why `verify` now does.
 *
 * The SDK stays external. It is a declared dependency, npm installs it, and
 * bundling somebody else's package into yours makes their bug reports your
 * problem.
 */
import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const result = await build({
  entryPoints: [resolve(ROOT, 'src/index.ts')],
  outfile: resolve(ROOT, 'dist/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // The site's engine, imported rather than reimplemented. This alias is the
  // single line that makes "cannot disagree with the website" true at runtime.
  alias: { '@': resolve(ROOT, '../src') },
  external: ['@modelcontextprotocol/sdk'],
  // No shebang banner here. src/index.ts already carries one and esbuild
  // preserves it, so adding another put a second `#!` on line 2 — which is not
  // a comment anywhere except line 1, and made the bundle a syntax error. The
  // startup gate caught it; nothing before that could have.
  legalComments: 'none',
  metafile: true,
});

const out = Object.values(result.metafile.outputs)[0];
console.log(`  bundled dist/index.js — ${((out?.bytes ?? 0) / 1024).toFixed(1)} KB`);
