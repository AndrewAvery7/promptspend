/**
 * Context-footprint budget.
 *
 * MCP tool definitions are loaded into the model's context on EVERY turn, for as
 * long as the server is connected. A heavy server can add thousands of tokens to
 * every message, and the ecosystem has noticed — the emerging advice is to
 * prefer a CLI over MCP for read-only data precisely because of this tax.
 *
 * A pricing server that quietly costs you tokens on every turn, in order to tell
 * you about token costs, would be an easy and deserved joke. So the footprint is
 * measured, budgeted and published in the README. Nothing else in this ecosystem
 * appears to publish its own overhead, which makes doing so both honest and a
 * differentiator.
 *
 * The count is deliberately conservative: it measures the JSON exactly as it
 * goes on the wire, and converts with the pessimistic end of the usual
 * characters-per-token range so the published figure is never flattering.
 *
 *   npm run check:footprint
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTRUCTIONS, SERVER_INFO, TOOLS } from '../src/schema';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Tokens. Raise only with a note explaining what the extra surface buys.
 *
 * 900 is roughly a fifth of a page of text — small enough that a user who
 * connects this alongside four other servers will not notice it, which is the
 * whole point.
 */
const BUDGET = 900;

/** Conservative characters-per-token for dense JSON with many short keys. */
const CHARS_PER_TOKEN = 3.3;

const payload = JSON.stringify({ serverInfo: SERVER_INFO, instructions: INSTRUCTIONS, tools: TOOLS });
const chars = payload.length;
const tokens = Math.ceil(chars / CHARS_PER_TOKEN);

let failed = false;
console.log(`  tools           ${TOOLS.length}`);
console.log(`  manifest        ${chars} chars`);
console.log(`  estimated       ~${tokens} tokens per turn (at ${CHARS_PER_TOKEN} chars/token)`);

if (tokens > BUDGET) {
  console.error(
    `\n✗ context footprint ${tokens} tokens exceeds the ${BUDGET} budget.\n` +
      `  Shorten a tool description or drop a tool. Every word here is paid for on\n` +
      `  every turn, by every user, for as long as the server is connected.`,
  );
  failed = true;
} else {
  console.log(`✓ within the ${BUDGET}-token budget (${BUDGET - tokens} to spare)`);
}

/**
 * The README publishes this number, so it has to be the number.
 *
 * Same class of guard as the site's badge checks: a figure a human typed once
 * and nothing re-checks is a figure that silently stops being true.
 */
const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
const claimed = /adds\s+~?(\d+)\s+tokens/i.exec(readme);
if (!claimed) {
  console.error('✗ the README does not state the context footprint — it must, that is the point');
  failed = true;
} else if (Number(claimed[1]) !== tokens) {
  console.error(`✗ README says ~${claimed[1]} tokens, the manifest measures ${tokens} — update the README`);
  failed = true;
} else {
  console.log(`✓ README states ~${tokens} tokens, matching the manifest`);
}

if (failed) process.exitCode = 1;
