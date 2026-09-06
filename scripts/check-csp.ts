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
const PAGES = [
  { name: 'calculator', path: resolve(ROOT, 'dist/index.html'), strictStyle: false },
  { name: 'receipt', path: resolve(ROOT, 'dist/receipt/index.html'), strictStyle: true },
] as const;

/** Directives that must be present and non-empty, whatever else changes. */
const REQUIRED = ['default-src', 'script-src', 'connect-src', 'base-uri', 'object-src'] as const;

async function main(): Promise<void> {
  const problems: string[] = [];

  for (const page of PAGES) {
    if (!existsSync(page.path)) {
      problems.push(`${page.name}: ${page.path} does not exist — run \`npm run build\` first`);
      continue;
    }

    const html = await readFile(page.path, 'utf8');
    if (html.includes('%CSP%')) {
      problems.push(`${page.name}: the %CSP% placeholder survived the build`);
    }

    const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1];
    if (policy === undefined) {
      problems.push(`${page.name}: no Content-Security-Policy meta tag in the built page`);
      continue;
    }
    if (/(^|;)\s*frame-ancestors\b/.test(policy)) {
      console.log(
        `  note: ${page.name} meta-delivered frame-ancestors is ignored by browsers; no protection is claimed`,
      );
    }
    for (const directive of REQUIRED) {
      const found = new RegExp(`(^|;)\\s*${directive}\\s+\\S`).test(policy);
      if (!found) problems.push(`${page.name}: policy is missing a non-empty \`${directive}\``);
    }
    if (/connect-src[^;]*[\s"]\*/.test(policy)) {
      problems.push(`${page.name}: connect-src contains a wildcard`);
    }
    if (/script-src[^;]*'unsafe-eval'/.test(policy)) {
      problems.push(`${page.name}: script-src allows 'unsafe-eval'`);
    }
    if (page.strictStyle && /style-src[^;]*'unsafe-inline'/.test(policy)) {
      problems.push(`${page.name}: style-src unnecessarily allows 'unsafe-inline'`);
    }

    console.log(
      `✓ ${page.name} Content Security Policy — ${policy.split(';').filter(Boolean).length} directives`,
    );
    console.log(`  connect-src ${/connect-src ([^;]*)/.exec(policy)?.[1]?.trim() ?? '(none)'}`);
  }

  for (const problem of problems) console.error(`✗ ${problem}`);
  if (problems.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
