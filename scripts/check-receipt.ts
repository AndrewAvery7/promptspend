/** Verify the built Receipt is transparent, current-source-only and internally consistent. */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRICING_API_URL,
  PRICING_HEALTH_URL,
  RECEIPT_SPEC_URL,
  renderReceiptInstructions,
  renderReceiptSpecJson,
} from '@/receipt/receiptSpec';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECEIPT = resolve(ROOT, 'dist/receipt');

async function main(): Promise<void> {
  const files = {
    page: resolve(RECEIPT, 'index.html'),
    instructions: resolve(RECEIPT, 'instructions.txt'),
    spec: resolve(RECEIPT, 'spec.json'),
  };
  const problems: string[] = [];

  for (const [name, path] of Object.entries(files)) {
    if (!existsSync(path)) problems.push(`${name} artifact is missing: ${path}`);
  }
  if (problems.length > 0) return fail(problems);

  const [page, instructions, spec] = await Promise.all([
    readFile(files.page, 'utf8'),
    readFile(files.instructions, 'utf8'),
    readFile(files.spec, 'utf8'),
  ]);
  const expectedInstructions = `${renderReceiptInstructions()}\n`;
  if (instructions !== expectedInstructions)
    problems.push('plain-text instructions drifted from the UI source');
  if (spec !== renderReceiptSpecJson()) problems.push('JSON specification drifted from the UI source');

  let parsed: { instructions?: string; pricing?: { models?: string; health?: string } } = {};
  try {
    parsed = JSON.parse(spec) as typeof parsed;
  } catch {
    problems.push('spec.json is not valid JSON');
  }
  if (`${parsed.instructions ?? ''}\n` !== expectedInstructions) {
    problems.push('spec.json does not carry the exact visible clipboard text');
  }
  if (parsed.pricing?.models !== PRICING_API_URL || parsed.pricing.health !== PRICING_HEALTH_URL) {
    problems.push('spec.json does not point at the canonical pricing and health endpoints');
  }

  for (const required of [
    RECEIPT_SPEC_URL,
    'Current pricing unavailable',
    'never claim equivalent quality',
  ]) {
    if (!instructions.includes(required)) problems.push(`instructions are missing: ${required}`);
  }
  if (/ignore (all|any|the) previous/i.test(instructions)) {
    problems.push('instructions contain an authority-escalation phrase');
  }
  if (page.includes('%SITE_URL%') || page.includes('%CSP%')) {
    problems.push('a build placeholder survived in receipt/index.html');
  }
  if (!page.includes('/receipt/')) problems.push('receipt page has no canonical receipt URL');

  if (problems.length > 0) return fail(problems);
  console.log('✓ Receipt contract — page, visible instructions and JSON specification agree');
  console.log(`  pricing      ${PRICING_API_URL}`);
  console.log(`  specification ${RECEIPT_SPEC_URL}`);
}

function fail(problems: string[]): void {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exitCode = 1;
}

main().catch((cause: unknown) => {
  console.error(cause);
  process.exitCode = 1;
});
