/**
 * Keep SECURITY.md's dependency triage honest without a human re-typing a date.
 *
 * The release check requires the triage to have been re-derived within 14
 * days. Before this script, "re-derived" meant somebody remembered to run the
 * audit, compare it with the prose by eye, and edit "Last reviewed". Nobody
 * remembered on time (the August 22 record lapsed on September 5 and turned
 * the mobile job red on every pull request), and a date edited without the
 * audit being re-run would have satisfied the check while meaning nothing.
 *
 * So the audit itself is the evidence. `npm audit --package-lock-only` is
 * reduced to a fingerprint of what it found — package, severity, vulnerable
 * range, advisory ids — and SECURITY.md carries the fingerprint the prose
 * was written against, in a comment beside the date:
 *
 *   --refresh   re-run the audit. Same fingerprint: the prose still describes
 *               the dependency state, so "Last reviewed" moves to today.
 *               Different: nothing is touched; the differences are printed and
 *               the exit code is 2, because now a person has to re-read the
 *               findings and rewrite the triage. mobile-audit.yml runs this
 *               weekly and commits the date when it moved.
 *   --stamp     after a person has rewritten the triage: record the current
 *               fingerprint and today's date. This is the only way a changed
 *               fingerprint gets into the file, on purpose.
 *   --check     compare only; exit 2 on drift. For local use before a release.
 *
 * Nothing here decides whether a finding is acceptable. That judgement stays
 * in the prose, where it can be read and argued with.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SECURITY = resolve(ROOT, 'SECURITY.md');
const MARKER = /<!-- audit-fingerprint: ([0-9a-f]{12}) \(([^)]*)\) -->/;
const REVIEWED = /^Last reviewed: ([A-Za-z]+ \d{1,2}, \d{4})$/m;

const mode = process.argv[2];
if (!['--refresh', '--stamp', '--check'].includes(mode ?? '')) {
  console.error('usage: node scripts/audit-triage.mjs --refresh | --stamp | --check');
  process.exit(64);
}

/** Every finding npm reports, in a form that changes only when the finding does. */
function currentFindings() {
  let raw;
  try {
    raw = execFileSync('npm', ['audit', '--package-lock-only', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // npm audit exits non-zero whenever it finds anything; the JSON is still on stdout.
    raw = error.stdout?.toString('utf8') ?? '';
    if (!raw.trim().startsWith('{')) {
      console.error('npm audit produced no report:', error.stderr?.toString('utf8') ?? error.message);
      process.exit(1);
    }
  }
  const report = JSON.parse(raw);
  const lines = Object.entries(report.vulnerabilities ?? {})
    .map(([name, entry]) => {
      const advisories = (entry.via ?? [])
        .filter((via) => typeof via === 'object' && via !== null)
        .map((via) => via.url ?? String(via.source))
        .sort();
      return `${name}|${entry.severity}|${entry.range}|${advisories.join(',')}`;
    })
    .sort();
  const counts = report.metadata?.vulnerabilities ?? {};
  const summary = `${counts.total ?? lines.length} findings: ${counts.moderate ?? 0} moderate, ${counts.high ?? 0} high, ${counts.critical ?? 0} critical`;
  const fingerprint = createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 12);
  return { lines, summary, fingerprint };
}

function today() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const text = readFileSync(SECURITY, 'utf8');
const recorded = MARKER.exec(text);
const reviewed = REVIEWED.exec(text)?.[1];
if (!reviewed) {
  console.error('SECURITY.md has no "Last reviewed: <Month D, YYYY>" line');
  process.exit(1);
}
const current = currentFindings();

console.log(`audit now:      ${current.fingerprint} (${current.summary})`);
console.log(
  `SECURITY.md:    ${recorded ? `${recorded[1]} (${recorded[2]})` : 'no fingerprint recorded yet'}, reviewed ${reviewed}`,
);

const stampedLine = `Last reviewed: ${today()}\n<!-- audit-fingerprint: ${current.fingerprint} (${current.summary}) -->`;

if (mode === '--stamp') {
  let next = text.replace(REVIEWED, stampedLine.split('\n')[0]);
  next = recorded
    ? next.replace(MARKER, stampedLine.split('\n')[1])
    : next.replace(/^(Last reviewed: .*)$/m, stampedLine);
  writeFileSync(SECURITY, next);
  console.log(`✓ stamped ${current.fingerprint}, reviewed ${today()}`);
  process.exit(0);
}

if (!recorded) {
  console.error(
    '✗ SECURITY.md carries no fingerprint. Read the findings, make sure the prose describes them, then run --stamp.',
  );
  process.exit(2);
}

if (recorded[1] !== current.fingerprint) {
  console.error('✗ the audit no longer matches the triage SECURITY.md was written against:');
  for (const line of current.lines) console.error(`    now  ${line}`);
  console.error(
    '  Re-read the findings, rewrite the triage, then run: node scripts/audit-triage.mjs --stamp',
  );
  process.exit(2);
}

if (mode === '--check') {
  console.log('✓ the triage still describes the dependency state');
  process.exit(0);
}

// --refresh: the audit re-derived the same picture, so the review date is honest to move.
if (reviewed === today()) {
  console.log('✓ already reviewed today — nothing to change');
  process.exit(0);
}
writeFileSync(SECURITY, text.replace(REVIEWED, `Last reviewed: ${today()}`));
console.log(`✓ re-derived, no change in findings — reviewed date moved from ${reviewed} to ${today()}`);
