/**
 * Assert the built page actually carries the Content Security Policy.
 *
 * This check exists because of a real bug. The policy is generated at build
 * time and substituted into a placeholder in `index.html`; the substitution used
 * `String.replace` with a string pattern, which replaces only the *first*
 * occurrence — and the first occurrence was inside the explanatory comment above
 * the meta tag. The comment received the policy and the tag shipped the literal
 * placeholder. Everything looked right: the build passed, the page rendered, the
 * tag was present.
 *
 * A security header that silently fails to apply is worse than one that is
 * missing, because nothing about the output invites you to look. So the built
 * artifact is checked rather than the source that produces it.
 *
 *   npm run build && npm run check:csp
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = resolve(ROOT, 'dist/index.html');

/** Directives that must be present and non-empty, whatever else changes. */
const REQUIRED = [
  'default-src',
  'script-src',
  'connect-src',
  'frame-ancestors',
  'base-uri',
  'object-src',
] as const;

async function main(): Promise<void> {
  if (!existsSync(INDEX)) {
    console.error(`✗ ${INDEX} does not exist — run \`npm run build\` first.`);
    process.exitCode = 1;
    return;
  }

  const html = await readFile(INDEX, 'utf8');
  const problems: string[] = [];

  if (html.includes('%CSP%')) {
    problems.push('the %CSP% placeholder survived the build — the policy was never substituted');
  }

  const match = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
  const policy = match?.[1];
  if (policy === undefined) {
    problems.push('no Content-Security-Policy meta tag in the built page');
  } else {
    for (const directive of REQUIRED) {
      const found = new RegExp(`(^|;)\\s*${directive}\\s+\\S`).test(policy);
      if (!found) problems.push(`policy is missing a non-empty \`${directive}\``);
    }

    // The one directive whose whole purpose is to stop a compromised dependency
    // posting a pasted prompt somewhere. A wildcard here would defeat it.
    if (/connect-src[^;]*[\s"]\*/.test(policy)) {
      problems.push('connect-src contains a wildcard, which defeats the point of having it');
    }
    if (/script-src[^;]*'unsafe-eval'/.test(policy)) {
      problems.push("script-src allows 'unsafe-eval'");
    }

    if (problems.length === 0) {
      const directives = policy.split(';').filter(Boolean).length;
      console.log(`✓ Content Security Policy applied — ${directives} directives`);
      console.log(`  connect-src ${/connect-src ([^;]*)/.exec(policy)?.[1]?.trim() ?? '(none)'}`);
    }
  }

  for (const problem of problems) console.error(`✗ ${problem}`);
  if (problems.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
