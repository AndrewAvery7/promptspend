import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LEDGER_PATH, ledgerFromText, readLedger, writeLedger } from './page-ledger';

const dirs: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'page-ledger-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const LEDGER = {
  '/models/gpt-5/': { published: '2026-08-02', lastmod: '2026-08-16', fingerprint: 'aaa' },
};

describe('the page ledger file', () => {
  it('lives in data/, beside the other hand-off files the sync commits', () => {
    expect(LEDGER_PATH.replace(/\\/g, '/')).toMatch(/\/data\/published-pages\.json$/);
  });

  it('reads as empty when it does not exist yet, so a first build still works', async () => {
    expect(await readLedger(join(scratch(), 'missing.json'))).toEqual({});
  });

  it('round-trips through the file, with a comment saying what it is', async () => {
    const path = join(scratch(), 'ledger.json');
    await writeLedger(LEDGER, path);

    expect(await readLedger(path)).toEqual(LEDGER);
    const text = readFileSync(path, 'utf8');
    expect(JSON.parse(text).$comment).toMatch(/never edit by hand/);
    expect(ledgerFromText(text)).toEqual(LEDGER);
  });

  it('refuses a malformed file instead of building without it', async () => {
    const path = join(scratch(), 'broken.json');
    writeFileSync(path, '{"pages": {"/x/": {"published": "soon"}}}');
    await expect(readLedger(path)).rejects.toThrow(/malformed date/);
  });
});
