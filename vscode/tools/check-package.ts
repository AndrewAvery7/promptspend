/**
 * Prove the tokenizer the runtime asks for is the tokenizer the package ships.
 *
 * This exists because 0.1.4 reached the Marketplace with exact token
 * counting silently broken, past every other gate in this repository. The chain
 * of near-misses is worth writing out, because each link looked reasonable:
 *
 *   - esbuild leaves a dynamic `import()` of an *external* module as a real
 *     `import()`, even when the output format is CommonJS.
 *   - `import()` goes through Node's ESM resolver, which applies the `default`
 *     condition of the package's `exports` map — `dist/lite.js`.
 *   - `.vscodeignore` shipped `dist/lite.cjs`, which is what the *`require`*
 *     condition selects. Both files exist upstream; only one was packaged.
 *   - `check-footprint.ts` proved the externals resolved with
 *     `createRequire().resolve` — CJS resolution — so it found the .cjs trio
 *     and passed.
 *   - `loadEncoder` catches a failed import and falls back to a calibrated
 *     ratio, correctly labelled "estimate". Nothing threw. Nothing logged.
 *
 * The result installed, activated and annotated correctly, and reported every
 * token count as an estimate — including for OpenAI models, where running the
 * real tokenizer is the entire claim. A human reading a quick-pick found it.
 *
 * The bug lived in the gap between *what resolution picks* and *what packaging
 * ships*, so checking either alone cannot catch it. This asks both questions
 * and compares the answers.
 */
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, relative, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every specifier `tools/build.ts` marks external, except `vscode` itself. */
const SPECIFIERS = ['js-tiktoken/lite', 'js-tiktoken/ranks/o200k_base', 'js-tiktoken/ranks/cl100k_base'];

/**
 * What ESM resolution picks, asked in a child process.
 *
 * A separate process because `import.meta.resolve` only accepts a parent
 * argument under a flag, and because this must be the plain single-argument
 * form evaluated from inside `vscode/` — the same question the bundle asks.
 */
function esmTarget(specifier: string): string {
  const out = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', `process.stdout.write(import.meta.resolve(${JSON.stringify(specifier)}))`],
    { cwd: ROOT, stdio: 'pipe' },
  )
    .toString()
    .trim();
  return fileURLToPath(out);
}

/** The files `vsce` would put in the .vsix, as paths relative to `vscode/`. */
function packagedFiles(): Set<string> {
  // `execSync` with one command string, rather than `execFileSync`: on Windows
  // `npx` is a `.cmd`, which Node 20+ refuses to spawn without a shell, and
  // passing an argument array *through* a shell is what Node deprecates. A
  // fixed command string with no interpolation avoids both.
  const out = execSync('npx --yes @vscode/vsce@^3 ls', { cwd: ROOT, stdio: 'pipe' }).toString();
  return new Set(
    out
      .split('\n')
      .map((line) => line.trim().split(sep).join('/'))
      .filter(Boolean),
  );
}

/**
 * Rebuild the package's file tree in a temp directory and load the tokenizer
 * from inside it.
 *
 * The first version of this gate compared what ESM resolution picked against
 * the `vsce ls` list, and passed a package that was still broken:
 * `dist/lite.js` is a 70-byte stub that re-exports from a content-hashed
 * `chunk-*.js`, and that chunk was not shipped. Checking the entry points alone
 * cannot see a transitive import, and hard-coding the chunk's name would break
 * on the next js-tiktoken release when the hash changes.
 *
 * Copying exactly the files `vsce` would package and then *running* them is the
 * only version of this check that cannot be fooled by an import one level
 * further down. It is also the cheapest to keep honest: nothing here knows what
 * js-tiktoken's internals look like.
 */
function stageAndProbe(): { ok: true; tokens: number } | { ok: false; detail: string } {
  const stage = mkdtempSync(join(tmpdir(), 'promptspend-pkg-'));
  try {
    for (const file of packagedFiles()) {
      const source = join(ROOT, file);
      if (!existsSync(source)) continue;
      const target = join(stage, file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }

    // Written into dist/ so the imports resolve exactly where the bundle sits.
    const probe = join(stage, 'dist', 'probe.mjs');
    mkdirSync(dirname(probe), { recursive: true });
    writeFileSync(
      probe,
      [
        "const { Tiktoken } = await import('js-tiktoken/lite');",
        "const ranks = (await import('js-tiktoken/ranks/o200k_base')).default;",
        "await import('js-tiktoken/ranks/cl100k_base');",
        "const text = 'Summarise the following support ticket in three bullet points.';",
        'process.stdout.write(String(new Tiktoken(ranks).encode(text).length));',
      ].join('\n'),
    );

    try {
      const out = execFileSync(process.execPath, [probe], { stdio: 'pipe' }).toString().trim();
      return { ok: true, tokens: Number(out) };
    } catch (cause) {
      const stderr = cause instanceof Error && 'stderr' in cause ? String(cause.stderr) : String(cause);
      return {
        ok: false,
        detail: stderr.split('\n').find((l) => l.includes('Error')) ?? stderr.split('\n')[0] ?? '',
      };
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

const problems: string[] = [];
const report: string[] = [];

for (const specifier of SPECIFIERS) {
  try {
    report.push(`    ${specifier} -> ${relative(ROOT, esmTarget(specifier)).split(sep).join('/')}`);
  } catch (cause) {
    problems.push(`"${specifier}" cannot be resolved at all — is js-tiktoken installed? (${String(cause)})`);
  }
}

const probed = stageAndProbe();
if (!probed.ok) {
  problems.push(
    `The tokenizer will not load from the files the .vsix actually contains.\n\n` +
      `      This is the 0.1.4 failure: the import throws at runtime, loadEncoder's catch swallows\n` +
      `      it, and every token count silently becomes a calibrated estimate — including for\n` +
      `      OpenAI models, where running the real tokenizer is the entire claim.\n\n` +
      `      Whatever the message below names is missing from the package. Add a negation line\n` +
      `      for it in .vscodeignore. Note the entry points are ESM stubs that re-export from a\n` +
      `      content-hashed chunk, so a glob is safer than a filename.\n\n      ${probed.detail}`,
  );
} else if (!Number.isFinite(probed.tokens) || probed.tokens < 5 || probed.tokens > 40) {
  problems.push(
    `The packaged tokenizer returned ${probed.tokens} tokens for a ten-word sentence, which is not plausible.`,
  );
} else {
  report.push(`    packaged encoder loaded and counted ${probed.tokens} tokens`);
}

if (problems.length > 0) {
  console.error(`\n  Package check failed:\n\n${problems.map((p) => `  - ${p}`).join('\n\n')}\n`);
  process.exit(1);
}

console.log(`  package OK — the tokenizer runs from the packaged file set alone\n${report.join('\n')}`);
