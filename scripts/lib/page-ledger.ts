/**
 * Reading and writing `data/published-pages.json`, the page ledger.
 *
 * The logic is in `src/lib/seo/ledger.ts`, where it is pure and tested; this is
 * only the file. Every script that builds or counts the real page set reads it
 * through here — the build, `check-pages.ts` and `ping-indexnow.ts` — so they
 * cannot disagree about which comparisons exist.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseLedger, serializeLedger, type PageLedger } from '@/lib/seo/ledger';

export const LEDGER_FILE = 'data/published-pages.json';
export const LEDGER_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../..', LEDGER_FILE);

/**
 * The ledger, or an empty one when the file does not exist yet.
 *
 * Missing is survivable — every page is then simply new, dated today, and
 * `check-pages.ts` fails until `--fix` records it. Malformed is not, and throws:
 * a ledger read wrongly would silently drop every published comparison.
 */
export async function readLedger(path = LEDGER_PATH): Promise<PageLedger> {
  if (!existsSync(path)) return {};
  return parseLedger(JSON.parse(await readFile(path, 'utf8')));
}

/** Parse a ledger from raw text, e.g. `git show <rev>:data/published-pages.json`. */
export function ledgerFromText(text: string): PageLedger {
  return parseLedger(JSON.parse(text));
}

export async function writeLedger(ledger: PageLedger, path = LEDGER_PATH): Promise<void> {
  await writeFile(path, serializeLedger(ledger), 'utf8');
}
