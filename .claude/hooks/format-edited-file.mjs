#!/usr/bin/env node
/**
 * PostToolUse hook for Edit and Write: format the file that was just changed.
 *
 * Why this exists. `npm run verify` fails on a file Prettier would rewrite, and
 * the gate that runs it is the one every pull request and every deploy passes.
 * Before this hook the formatter was run by hand after nearly every change, and
 * forgetting it cost a full gate run. Now the file is formatted the moment it
 * is saved.
 *
 * It never blocks and never fails: a formatter that cannot run must not stop
 * the work, so every path ends in exit 0. `--ignore-unknown` makes Prettier
 * skip file types it does not handle and anything named in `.prettierignore`
 * (the generated catalog files, the lockfiles), which is exactly the set that
 * must not be rewritten.
 *
 * Input: the hook's JSON on stdin, `tool_input.file_path` being the file.
 * Runs with Node and no shell, so it works the same on Windows and elsewhere.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// `${CLAUDE_PROJECT_DIR}` stays on the main checkout even inside a worktree,
// and a worktree sits below the main checkout, so Node resolves Prettier from
// here in both cases.
const PROJECT = process.env.CLAUDE_PROJECT_DIR ?? resolve(HERE, '..', '..');
const PRETTIER = resolve(PROJECT, 'node_modules', 'prettier', 'bin', 'prettier.cjs');

/** Folders whose contents are never ours to format, whatever their extension. */
const SKIP = ['node_modules', 'dist', 'coverage', '.wrangler', '.expo', 'test-results', '.playwright-mcp'];

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function main(input) {
  let file;
  try {
    file = JSON.parse(input)?.tool_input?.file_path;
  } catch {
    return;
  }
  if (typeof file !== 'string' || file === '' || !existsSync(file)) return;
  const parts = resolve(file).split(sep);
  if (SKIP.some((folder) => parts.includes(folder))) return;
  if (!existsSync(PRETTIER)) return;

  const run = spawnSync(
    process.execPath,
    [PRETTIER, '--write', '--ignore-unknown', '--log-level', 'warn', file],
    {
      cwd: PROJECT,
      encoding: 'utf8',
      timeout: 25_000,
    },
  );
  // A syntax error in the file just written is worth hearing about now, rather
  // than at the gate: Prettier names the line.
  if (run.status !== 0 && run.stderr)
    process.stderr.write(`prettier could not format ${file}:\n${run.stderr}`);
}

try {
  main(await readStdin());
} catch (error) {
  process.stderr.write(`format hook skipped: ${error instanceof Error ? error.message : String(error)}\n`);
}
process.exit(0);
