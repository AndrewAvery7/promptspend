/**
 * The PromptSpend price check: the GitHub Actions entry point.
 *
 * No dependencies, so there is nothing to install or bundle: Node's own fetch,
 * file system and child_process, and the workflow-command protocol GitHub
 * documents (`::error::`, `$GITHUB_OUTPUT`, `$GITHUB_STEP_SUMMARY`).
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluate, findModelIds, parseList, renderSummary } from './check.mjs';

/** Source files worth scanning for a model id. Docs are left out: they mention models they do not call. */
const SCANNED = /\.(py|ts|tsx|js|jsx|mjs|cjs|go|rb|java|kt|cs|rs|php|swift|json|ya?ml|toml|env|ini|cfg)$/i;
const MAX_FILE_BYTES = 1_000_000;
const MAX_FILES = 20_000;

function input(name, fallback = '') {
  const value = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`];
  return value === undefined || value === '' ? fallback : value.trim();
}

/** Workflow commands carry their message on one line; GitHub's escaping rules. */
function escape(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function scan(root, ids, lockfile) {
  let files;
  try {
    files = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\0')
      .filter(Boolean);
  } catch {
    throw new Error(
      'Could not list the repository files. Run actions/checkout first, or set the models input.',
    );
  }
  const found = new Set();
  for (const file of files
    .filter((f) => SCANNED.test(f) && f !== lockfile && !/(^|\/)node_modules\//.test(f))
    .slice(0, MAX_FILES)) {
    const path = join(root, file);
    try {
      if (statSync(path).size > MAX_FILE_BYTES) continue;
      for (const id of findModelIds(readFileSync(path, 'utf8'), ids)) found.add(id);
    } catch {
      // A file listed by git but absent from the working tree (sparse checkout) is skipped.
    }
  }
  return found;
}

async function main() {
  const root = process.env.GITHUB_WORKSPACE || process.cwd();
  const api = input('api', 'https://promptspend.dev').replace(/\/+$/, '');
  const lockfile = input('lockfile', 'promptspend.lock.json');
  const failOn = parseList(input('fail-on', 'change,retired')).filter((v) => v !== 'none');
  const update = input('update', 'false') === 'true';
  const today = new Date().toISOString().slice(0, 10);

  const response = await fetch(`${api}/v1/models?aliases=include`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`${api}/v1/models answered HTTP ${response.status}.`);
  const catalog = await response.json();
  if (!Array.isArray(catalog?.models)) throw new Error(`${api}/v1/models did not return a model list.`);
  const ids = new Set(catalog.models.map((m) => m.id));

  const lockPath = join(root, lockfile);
  const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : null;

  let watched = parseList(input('models'));
  if (watched.length === 0) watched = [...scan(root, ids, lockfile)];
  // A model the project stopped using drops out of the lockfile on update; until
  // then it is still checked, because the lockfile says the project depends on it.
  if (!update && lock?.models) watched = [...new Set([...watched, ...Object.keys(lock.models)])];
  if (watched.length === 0) {
    console.log('::warning::No model ids found. Set the models input to the ids your code calls.');
    return;
  }

  const result = evaluate({ lock: update ? null : lock, models: catalog.models, watched, failOn, today });
  const wrote = update || lock === null;
  if (wrote) writeFileSync(lockPath, `${JSON.stringify(result.lock, null, 2)}\n`);

  for (const message of result.warnings) console.log(`::warning title=PromptSpend::${escape(message)}`);
  for (const message of result.failures) console.log(`::error title=PromptSpend::${escape(message)}`);
  if (lock === null && !update)
    console.log(`::notice title=PromptSpend::${escape(`No ${lockfile} yet; wrote one. Commit it.`)}`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderSummary(result, { lockfile, wrote }));

  output('models', result.rows.map((r) => r.id).join(','));
  output(
    'changed',
    result.rows
      .filter((r) => r.state === 'changed')
      .map((r) => r.id)
      .join(','),
  );
  output(
    'retired',
    result.rows
      .filter((r) => r.state === 'retired')
      .map((r) => r.id)
      .join(','),
  );
  output('lockfile-written', String(wrote));

  console.log(`Checked ${result.rows.length} model(s) against ${api}: ${result.failures.length} failing.`);
  if (result.failures.length > 0 && !update) process.exitCode = 1;
}

main().catch((error) => {
  console.log(`::error title=PromptSpend::${escape(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 1;
});
