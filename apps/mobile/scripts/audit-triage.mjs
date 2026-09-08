/**
 * Keep SECURITY.md's dependency triage current with no hand on the wheel.
 *
 * The release check requires the triage to have been re-derived within 14
 * days. Before this script, "re-derived" meant somebody remembered to run the
 * audit, compare it with the prose by eye, and edit "Last reviewed". Nobody
 * remembered on time (the August 22 record lapsed on September 5 and turned
 * the mobile job red on every pull request), and a date edited without the
 * audit being re-run would have satisfied the check while meaning nothing.
 *
 * So the audit itself is the record. `npm audit --package-lock-only` is
 * reduced to a fingerprint of what it found — package, severity, vulnerable
 * range, advisory ids — and SECURITY.md carries that fingerprint beside the
 * date, plus a generated section between `audit:begin` / `audit:end` markers
 * that this script rewrites in full. The text outside the markers (exposure
 * notes, the standing policy) is written by people and left alone.
 *
 *   --auto      the weekly path (mobile-audit.yml), hands-off:
 *                 1. try `npm audit fix` without --force; keep it only if the
 *                    mobile tests, typecheck and expo-doctor still pass,
 *                    otherwise put package.json and the lockfile back;
 *                 2. re-run the audit, regenerate the section, stamp the
 *                    fingerprint and today's date;
 *                 3. verdict: no high or critical advisory → accepted under
 *                    the standing policy, exit 0. Otherwise ESCALATED: the
 *                    record is still written, the exit code is 3, and the
 *                    workflow opens an issue. That one case is the only one a
 *                    person is asked to look at.
 *   --refresh   re-run the audit and regenerate its factual section when the
 *               findings match the recorded fingerprint (exit 2 otherwise).
 *               No fixes.
 *   --check     compare only; exit 2 on drift. For local use before a release.
 *   --stamp     record the current fingerprint and date after a person has
 *               edited the notes by hand.
 *
 * Nothing here judges whether a finding is *reachable*; the generated table
 * says so in as many words. That judgement, when it matters, is the escalated
 * case above.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SECURITY = resolve(ROOT, 'SECURITY.md');
const MARKER = /<!-- audit-fingerprint: ([0-9a-f]{12}) \(([^)]*)\) -->/;
const REVIEWED = /^Last reviewed: ([A-Za-z]+ \d{1,2}, \d{4})$/m;
const BEGIN = '<!-- audit:begin';
const END = '<!-- audit:end -->';
const WINDOWS = process.platform === 'win32';

const mode = process.argv[2];
const noFix = process.argv.includes('--no-fix');
if (!['--auto', '--refresh', '--stamp', '--check'].includes(mode ?? '')) {
  console.error('usage: node scripts/audit-triage.mjs --auto [--no-fix] | --refresh | --check | --stamp');
  process.exit(64);
}

function run(cmd, args, opts = {}) {
  if (WINDOWS && (cmd === 'npm' || cmd === 'npx')) {
    const tokens = [cmd, ...args];
    if (tokens.some((token) => !/^[a-zA-Z0-9@./:_-]+$/.test(token))) {
      throw new Error(`Refusing to pass an unsafe token to cmd.exe: ${tokens.join(' ')}`);
    }
    return spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', tokens.join(' ')], {
      cwd: ROOT,
      encoding: 'utf8',
      shell: false,
      ...opts,
    });
  }
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: false, ...opts });
}

/** Every finding npm reports, in a form that changes only when the finding does. */
function audit() {
  const result = run('npm', ['audit', '--package-lock-only', '--json'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const raw = result.stdout ?? '';
  if (!raw.trim().startsWith('{')) {
    console.error('npm audit produced no report:', result.stderr);
    process.exit(1);
  }
  const report = JSON.parse(raw);
  const entries = report.vulnerabilities ?? {};
  const findings = Object.entries(entries)
    .map(([name, entry]) => {
      const advisories = (entry.via ?? [])
        .filter((via) => typeof via === 'object' && via !== null)
        .map((via) => ({ url: via.url ?? String(via.source), title: via.title ?? '' }))
        .sort((a, b) => a.url.localeCompare(b.url));
      // Walk the dependents up to the package this project actually declares.
      const chain = [name];
      let cursor = entry;
      for (let i = 0; i < 12 && cursor?.effects?.length; i += 1) {
        const parent = cursor.effects[0];
        if (chain.includes(parent)) break;
        chain.unshift(parent);
        cursor = entries[parent];
      }
      let fix;
      if (entry.fixAvailable === true) fix = 'non-major fix available';
      else if (entry.fixAvailable && typeof entry.fixAvailable === 'object') {
        fix = `${entry.fixAvailable.isSemVerMajor ? 'only by a major change' : 'by moving'} to ${entry.fixAvailable.name}@${entry.fixAvailable.version}`;
      } else fix = 'none';
      return {
        name,
        severity: entry.severity,
        range: entry.range,
        direct: entry.isDirect === true,
        advisories,
        chain,
        fix,
        line: `${name}|${entry.severity}|${entry.range}|${advisories.map((a) => a.url).join(',')}`,
      };
    })
    .sort((a, b) => a.line.localeCompare(b.line));
  const c = report.metadata?.vulnerabilities ?? {};
  const counts = {
    total: c.total ?? findings.length,
    low: c.low ?? 0,
    moderate: c.moderate ?? 0,
    high: c.high ?? 0,
    critical: c.critical ?? 0,
  };
  const summary = `${counts.total} findings: ${counts.moderate} moderate, ${counts.high} high, ${counts.critical} critical`;
  const fingerprint = createHash('sha256')
    .update(findings.map((f) => f.line).join('\n'))
    .digest('hex')
    .slice(0, 12);
  return { findings, counts, summary, fingerprint };
}

function today() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function lockVersion(pkg) {
  const lock = JSON.parse(readFileSync(resolve(ROOT, 'package-lock.json'), 'utf8'));
  return lock.packages?.[`node_modules/${pkg}`]?.version ?? '?';
}

function lockId() {
  // The lockfile's own content hash. A commit id looked better but the weekly
  // runner checks out one commit deep, so `git log -- package-lock.json` named
  // whatever HEAD was rather than the change that last touched the file.
  return createHash('sha256')
    .update(readFileSync(resolve(ROOT, 'package-lock.json')))
    .digest('hex')
    .slice(0, 8);
}

/** The safe fix path: non-forced `npm audit fix`, kept only if the app still checks out. */
function tryFix(before) {
  const clean = run('git', ['diff', '--quiet', '--', 'package.json', 'package-lock.json']).status === 0;
  if (!clean) return 'Working tree already had dependency changes; no automatic fix attempted.';
  run('npm', ['audit', 'fix', '--package-lock-only'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const changed = run('git', ['diff', '--quiet', '--', 'package.json', 'package-lock.json']).status !== 0;
  if (!changed) return 'No non-major fix was available; package.json and the lockfile are unchanged.';
  // `npm audit fix` also takes whatever patch releases are newer — on
  // 2026-09-06 it moved expo 57.0.19 → 57.0.20 and fixed nothing. A lockfile
  // change that removes no finding is Expo patch drift, which expo-drift.yml
  // owns; it is reverted here rather than smuggled in under a security label.
  const after = audit();
  if (after.fingerprint === before.fingerprint) {
    run('git', ['checkout', '--', 'package.json', 'package-lock.json']);
    return 'The non-forced `npm audit fix` changed the lockfile without removing a finding (patch drift, not a fix); reverted.';
  }
  const gates = [
    ['npm', ['ci', '--ignore-scripts']],
    ['npm', ['rebuild', 'unrs-resolver']],
    ['npm', ['test', '--', '--ci']],
    ['npm', ['run', 'typecheck']],
    ['npx', ['expo-doctor']],
  ];
  for (const [cmd, args] of gates) {
    const r = run(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.status !== 0) {
      run('git', ['checkout', '--', 'package.json', 'package-lock.json']);
      const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-3).join(' ');
      return `A non-major fix was available but reverted: \`${cmd} ${args.join(' ')}\` failed afterwards (${tail.slice(0, 200)}).`;
    }
  }
  return 'Applied `npm audit fix` (non-forced); the mobile tests, typecheck and expo-doctor passed afterwards, so the change is kept.';
}

function section(a, fixNote, verdict) {
  const rows = a.findings.length
    ? a.findings
        .map((f) => {
          const adv = f.advisories.map((x) => `[${x.url.split('/').pop()}](${x.url})`).join(', ') || '—';
          // A vulnerable range can contain `||`, which a markdown table reads as
          // two cell boundaries; every cell is escaped, not just the one seen.
          const cell = (s) => String(s).replaceAll('|', '\\|');
          return `| \`${cell(f.name)}\` | ${f.severity} | \`${cell(f.range)}\` | ${adv} | \`${cell(f.chain.join(' > '))}\` | ${cell(f.fix)} |`;
        })
        .join('\n')
    : '| _none_ | | | | | |';
  return `${BEGIN} — generated by scripts/audit-triage.mjs on ${today()}; edit the text outside these markers, not this section -->

## Current audit (generated)

Re-derived ${today()} from \`npm audit --package-lock-only\` against lockfile \`${lockId()}\`: **${a.summary}**. Expo ${lockVersion('expo')}, expo-router ${lockVersion('expo-router')}, react-native-webview ${lockVersion('react-native-webview')}.

| Package | Severity | Vulnerable range | Advisory | Reached through | Fix |
| --- | --- | --- | --- | --- | --- |
${rows}

"Reached through" is the dependency chain from the package this project declares down to the vulnerable one; it says where a finding lives, not whether shipped code exercises it. Reachability is assessed in the exposure notes below only when a finding is escalated.

**Automatic handling this run.** ${fixNote}

**Verdict.** ${verdict}

${END}`;
}

// Read as LF regardless of how the file was last written: `.` does not match
// `\r` in a JavaScript regex, so a CRLF file silently failed the first-run
// insertion below. Git stores this file with LF and prettier enforces it.
const text = readFileSync(SECURITY, 'utf8').replace(/\r\n/g, '\n');
const recorded = MARKER.exec(text);
const reviewed = REVIEWED.exec(text)?.[1];
if (!reviewed) {
  console.error('SECURITY.md has no "Last reviewed: <Month D, YYYY>" line');
  process.exit(1);
}

function stamp(source, a) {
  let next = source.replace(REVIEWED, `Last reviewed: ${today()}`);
  const marker = `<!-- audit-fingerprint: ${a.fingerprint} (${a.summary}) -->`;
  next = MARKER.test(next)
    ? next.replace(MARKER, marker)
    : next.replace(/^(Last reviewed: .*)$/m, `$1\n${marker}`);
  return next;
}

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

if (mode === '--auto') {
  const fixNote = noFix ? 'Fix attempts disabled for this run (--no-fix).' : tryFix(audit());
  const a = audit();
  const escalate = a.counts.high + a.counts.critical > 0;
  const reverted = fixNote.includes('reverted');
  const verdict = escalate
    ? `ESCALATED — ${a.counts.high} high and ${a.counts.critical} critical advisories. The standing policy does not accept these automatically; a person must assess reachability in the exposure notes and, if the finding stands, block the release until it is fixed.`
    : `Accepted under the standing policy below: no high or critical advisory${reverted ? ', and the only automatic change on offer was reverted for the reason above' : ''}. Moderate and low findings with no compatible fix are recorded here, not waived — the policy names the conditions that reopen them.`;
  const begin = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  let next;
  if (begin >= 0 && end > begin) {
    next = text.slice(0, begin) + section(a, fixNote, verdict) + text.slice(end + END.length);
  } else {
    // First run: the generated section goes right after the stamp lines.
    next = text.replace(
      /^(Last reviewed: .*\n(?:<!-- audit-fingerprint:.*-->\n)?)/m,
      `$1\n${section(a, fixNote, verdict)}\n`,
    );
  }
  next = stamp(next, a);
  writeFileSync(SECURITY, next);
  output('verdict', escalate ? 'escalate' : 'accepted');
  output('summary', a.summary);
  output('fingerprint', a.fingerprint);
  console.log(`audit now:      ${a.fingerprint} (${a.summary})`);
  console.log(`fix:            ${fixNote}`);
  console.log(
    escalate
      ? `✗ ESCALATED: ${a.summary}`
      : `✓ accepted: ${a.summary}; SECURITY.md regenerated and stamped ${today()}`,
  );
  process.exit(escalate ? 3 : 0);
}

const a = audit();
console.log(`audit now:      ${a.fingerprint} (${a.summary})`);
console.log(
  `SECURITY.md:    ${recorded ? `${recorded[1]} (${recorded[2]})` : 'no fingerprint recorded yet'}, reviewed ${reviewed}`,
);

if (mode === '--stamp') {
  writeFileSync(SECURITY, stamp(text, a));
  console.log(`✓ stamped ${a.fingerprint}, reviewed ${today()}`);
  process.exit(0);
}
if (!recorded) {
  console.error('✗ SECURITY.md carries no fingerprint. Run --auto (or --stamp after editing the notes).');
  process.exit(2);
}
if (recorded[1] !== a.fingerprint) {
  console.error('✗ the audit no longer matches the record SECURITY.md was written against:');
  for (const f of a.findings) console.error(`    now  ${f.line}`);
  console.error('  Run --auto to regenerate the record (or --stamp after editing the notes by hand).');
  process.exit(2);
}
if (mode === '--check') {
  console.log('✓ the record still describes the dependency state');
  process.exit(0);
}

// A patch-only dependency update may leave the advisory fingerprint unchanged
// while changing the lock hash and the installed Expo versions printed in the
// generated section. Refresh that entire factual section instead of moving
// only the date and leaving the evidence stale.
const begin = text.indexOf(BEGIN);
const end = text.indexOf(END);
const verdict =
  'Accepted under the standing policy below: no high or critical advisory. Moderate and low findings with no compatible fix are recorded here, not waived — the policy names the conditions that reopen them.';
const refreshedSection = section(a, 'Fix attempts disabled for this run (--refresh).', verdict);
let next =
  begin >= 0 && end > begin
    ? text.slice(0, begin) + refreshedSection + text.slice(end + END.length)
    : text.replace(/^(Last reviewed: .*\n(?:<!-- audit-fingerprint:.*-->\n)?)/m, `$1\n${refreshedSection}\n`);
next = stamp(next, a);
writeFileSync(SECURITY, next);
console.log(
  reviewed === today()
    ? '✓ re-derived and refreshed the dependency evidence'
    : `✓ re-derived, no change in findings — reviewed date moved from ${reviewed} to ${today()}`,
);
