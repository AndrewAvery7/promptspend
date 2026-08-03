/**
 * Start the built server and speak MCP to it.
 *
 * This gate exists because of a real failure. The unit tests passed, the
 * typecheck passed, the bundle was produced without a warning — and the server
 * could not start at all. Two runtime-only faults: TypeScript does not rewrite
 * `paths`, so `@/lib/engine/cost` reached Node verbatim, and Node's ESM loader
 * requires the `.js` extensions that `moduleResolution: bundler` lets the source
 * omit.
 *
 * Neither is visible to vitest, which resolves both itself. The only thing that
 * catches this class of fault is running the artifact you are about to publish,
 * so that is what this does: spawn `dist/index.js`, complete the handshake, list
 * the tools, and call one for real.
 *
 * It deliberately does NOT stub the network. A pricing server that cannot reach
 * its catalog is broken, and finding that out here is much better than finding
 * out from somebody's Cursor session.
 *
 *   npm run check:startup
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'dist/index.js');

if (!existsSync(ENTRY)) {
  console.error(`✗ ${ENTRY} does not exist — run \`npm run build\` first.`);
  process.exit(1);
}

interface Rpc {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

const REQUESTS = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'check-startup', version: '1' },
    },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'get_price', arguments: { model_name: 'gpt-5' } },
  },
] as const;

const child = spawn(process.execPath, [ENTRY], { stdio: ['pipe', 'pipe', 'pipe'] });
const responses = new Map<number, Rpc>();
let stderr = '';
let buffer = '';

child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
child.stdout.on('data', (chunk: Buffer) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line) as Rpc;
      if (typeof message.id === 'number') responses.set(message.id, message);
    } catch {
      /* not a complete JSON line yet */
    }
  }
});

for (const request of REQUESTS) child.stdin.write(JSON.stringify(request) + '\n');

const deadline = Date.now() + 30_000;
while (Date.now() < deadline && responses.size < 3 && child.exitCode === null) {
  await new Promise((r) => setTimeout(r, 100));
}
child.kill();

const problems: string[] = [];

if (child.exitCode !== null && child.exitCode !== 0 && responses.size === 0) {
  problems.push(`the server exited with code ${child.exitCode} before answering`);
}

const init = responses.get(1);
if (!init?.result) problems.push('no initialize response');
else {
  const info = init.result.serverInfo as { name?: string } | undefined;
  if (info?.name !== 'promptspend') problems.push(`serverInfo.name was ${String(info?.name)}`);
  console.log(`  initialize      ok — ${info?.name} v${String((info as { version?: string })?.version)}`);
}

const list = responses.get(2);
const tools = (list?.result?.tools ?? []) as { name: string }[];
if (tools.length !== 3) problems.push(`expected 3 tools, got ${tools.length}`);
else console.log(`  tools/list      ok — ${tools.map((t) => t.name).join(', ')}`);

const call = responses.get(3);
const content = (call?.result?.content ?? []) as { text?: string }[];
const text = content[0]?.text ?? '';
if (call?.result?.isError) {
  problems.push(`get_price returned an error: ${text.slice(0, 200)}`);
} else {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    // The whole point of the product: a price without provenance is a failure,
    // even when the call "succeeded".
    if (typeof parsed.input_per_million_usd !== 'number') problems.push('no price in the response');
    const p = parsed.provenance as Record<string, unknown> | undefined;
    if (!p) problems.push('a live call returned a price with NO provenance');
    else
      console.log(
        `  tools/call      ok — gpt-5 priced, source=${String(p.source)}, verified ${String(p.last_verified)}`,
      );
  } catch {
    problems.push(`get_price did not return JSON: ${text.slice(0, 200)}`);
  }
}

if (problems.length > 0) {
  console.error('\n✗ the built server does not work:');
  for (const problem of problems) console.error(`  - ${problem}`);
  if (stderr.trim())
    console.error(
      `\n  stderr:\n${stderr
        .split('\n')
        .slice(0, 12)
        .map((l) => '    ' + l)
        .join('\n')}`,
    );
  process.exit(1);
}

console.log('✓ the built server starts, lists 3 tools, and returns a priced response with provenance');
