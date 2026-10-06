#!/usr/bin/env node
/**
 * PreToolUse hook for Edit and Write: refuse a hand edit to a file a script owns.
 *
 * These files are written by the daily sync or by a script run on purpose, and a
 * hand edit is either overwritten the next morning or, worse, quietly wrong:
 *
 * - `data/published-pages.json` is the page ledger. Hand-pruning it once made
 *   dozens of comparison URLs 404 and Google impressions fell about 98%. It is
 *   only ever written by `npx tsx scripts/check-pages.ts --fix`, and entries are
 *   never removed.
 * - `public/data/pricing.json` is rebuilt from the feeds and the hand-verified
 *   overrides every morning. Change a price in `data/pricing-overrides.json`.
 * - The other `public/data/` files and the pricing changelog are the sync's
 *   own reports.
 *
 * The block is a decision, not an error: Claude is told what to do instead. For
 * the rare deliberate edit, set `PROMPTSPEND_ALLOW_GENERATED_EDIT=1` for the
 * session. Bash is not covered on purpose: the scripts that legitimately write
 * these files run through it.
 *
 * Input: the hook's JSON on stdin. Output: a `permissionDecision` of `deny`.
 */
import { resolve, sep } from 'node:path';

/** Repo-relative path (forward slashes) -> what to do instead. */
const PROTECTED = new Map([
  [
    'data/published-pages.json',
    'It is the page ledger, written only by `npx tsx scripts/check-pages.ts --fix`. Never hand-edit it and never remove entries: removing them is how comparison URLs went missing before.',
  ],
  [
    'public/data/pricing.json',
    'The daily sync overwrites it. To change a price, edit `data/pricing-overrides.json` (with its `verifiedUrl`), then run `npm run sync:pricing:dry` to see the effect.',
  ],
  ['public/data/sync-status.json', "It is the sync's health report, written by `npm run sync:pricing`."],
  [
    'public/data/vendor-check.json',
    "It is the daily vendor-page check's report, written by `npm run verify:vendors`.",
  ],
  [
    'public/data/free-tier-check.json',
    "It is the daily free-tier quote check's report, written by `npm run check:free-tiers`.",
  ],
  [
    'docs/pricing-changelog.md',
    'It is written by the pricing pipeline itself, one entry per published change.',
  ],
]);

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** The path relative to the repository root, or null when it is outside it. A
 *  worktree is a copy of the repository, so its own root counts as the root. */
function repoRelative(file) {
  const normal = resolve(file).split(sep).join('/');
  const marker = normal.match(/^(.*?)\/(?:\.claude\/worktrees\/[^/]+\/)?((?:data|public|docs)\/.+)$/);
  return marker ? marker[2] : null;
}

try {
  if (process.env.PROMPTSPEND_ALLOW_GENERATED_EDIT === '1') process.exit(0);
  const input = JSON.parse(await readStdin());
  const file = input?.tool_input?.file_path;
  if (typeof file === 'string') {
    const relative = repoRelative(file);
    const why = relative === null ? undefined : PROTECTED.get(relative);
    if (why) {
      process.stdout.write(
        `${JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `${relative} is generated; a hand edit is overwritten or quietly wrong. ${why} If Andrew explicitly asked for this edit, he can set PROMPTSPEND_ALLOW_GENERATED_EDIT=1 and retry.`,
          },
        })}\n`,
      );
    }
  }
} catch {
  // A hook that cannot read its input has no opinion; the normal permission
  // flow decides.
}
process.exit(0);
