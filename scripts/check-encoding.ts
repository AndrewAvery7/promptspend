/**
 * Every tracked text file must be UTF-8, with no BOM, and must not be
 * double-encoded.
 *
 * This exists because all three faults reached `main` unnoticed.
 *
 * README.md was rewritten on Windows by reading it with `Get-Content` and
 * writing it back with `Out-File` (`>` does the same). The two halves disagree
 * about encoding: Windows PowerShell 5.1 *reads* an un-BOMed file as the system
 * ANSI codepage and *writes* as UTF-8 with a BOM. So `·` (C2 B7) was read as
 * two Windows-1252 characters and written back as four bytes, C3 82 C2 B7 —
 * `Â·`. Every non-ASCII character in the file, plus a BOM on the front, and the
 * ASCII-art pipeline diagram reduced to noise.
 *
 * Note it is the *mismatch* that does the damage. `Get-Content` piped to
 * `Set-Content` is ANSI at both ends and round-trips cleanly, which is why the
 * obvious suspect turned out to be innocent when this was tested.
 *
 * Nothing failed at the time: the result is valid UTF-8, valid markdown, and
 * Prettier happily reformatted the tables around the now-wider cells. It was
 * visible only to a human looking at the rendered page, and it sat on a public
 * repository until one did.
 *
 * Detection is a round-trip, not a list of suspicious characters. A file is
 * double-encoded if its text re-encodes cleanly to Windows-1252 and those
 * bytes are themselves valid UTF-8 that differs from the original. Pattern
 * lists both miss real cases and flag innocent ones; the round-trip is the
 * actual property.
 *
 *   npm run check:encoding
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Files whose bytes are not text and must never be decoded. */
const BINARY = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.mp4',
  '.webm',
  '.mp3',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.pdf',
  '.docx',
  '.zip',
]);

/**
 * Windows-1252 differs from Latin-1 only in 0x80–0x9F. This is that range;
 * every other byte maps to the code point of the same value.
 */
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d,
  0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x9d, 0x017e, 0x0178,
];

/** Code point → cp1252 byte, or null if the character has no encoding. */
const TO_CP1252 = new Map<number, number>();
for (let byte = 0; byte < 0x80; byte++) TO_CP1252.set(byte, byte);
for (let byte = 0xa0; byte <= 0xff; byte++) TO_CP1252.set(byte, byte);
CP1252_HIGH.forEach((cp, i) => TO_CP1252.set(cp, 0x80 + i));

function toCp1252(text: string): Uint8Array | null {
  const out = new Uint8Array(text.length);
  let n = 0;
  for (const ch of text) {
    const byte = TO_CP1252.get(ch.codePointAt(0)!);
    if (byte === undefined) return null;
    out[n++] = byte;
  }
  return out.subarray(0, n);
}

/** How many layers of mis-decoding this text carries. */
function mojibakeLayers(text: string): number {
  const strict = new TextDecoder('utf-8', { fatal: true });
  let layers = 0;
  for (;;) {
    const bytes = toCp1252(text);
    if (bytes === null) return layers;
    let candidate: string;
    try {
      candidate = strict.decode(bytes);
    } catch {
      return layers;
    }
    if (candidate === text) return layers;
    text = candidate;
    layers += 1;
  }
}

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((rel) => !BINARY.has(extname(rel).toLowerCase()));

const problems: string[] = [];
let scanned = 0;

for (const rel of tracked) {
  const path = resolve(ROOT, rel);
  // `git ls-files` lists submodules and files staged for deletion too.
  try {
    if (!statSync(path).isFile()) continue;
  } catch {
    continue;
  }
  scanned += 1;

  let bytes = readFileSync(path);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    problems.push(`${rel}: starts with a UTF-8 BOM`);
    bytes = bytes.subarray(3);
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    problems.push(`${rel}: is not valid UTF-8`);
    continue;
  }

  const layers = mojibakeLayers(text);
  if (layers > 0) {
    problems.push(
      `${rel}: double-encoded (${layers} layer${layers > 1 ? 's' : ''}) — ` +
        'UTF-8 read as Windows-1252 and written back as UTF-8',
    );
  }
}

if (problems.length > 0) {
  console.error('✗ encoding problems:');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    '\n  Usually a Windows PowerShell read/write pair that disagree about encoding:\n' +
      '  5.1 reads an un-BOMed file as the system ANSI codepage but `Out-File`/`>`\n' +
      '  write UTF-8 with a BOM. Pass -Encoding on BOTH ends, or round-trip bytes:\n' +
      '    [System.IO.File]::ReadAllText($p, [Text.UTF8Encoding]::new($false))\n' +
      '    [System.IO.File]::WriteAllText($p, $t, [Text.UTF8Encoding]::new($false))',
  );
  process.exit(1);
}

console.log(`✓ encoding — ${scanned} tracked text files are UTF-8, no BOM, not double-encoded`);
