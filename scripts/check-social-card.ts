/**
 * Assert the social card still tells the truth.
 *
 * `assets/social-card.png` is the image every share renders — on X, LinkedIn,
 * Slack, Discord, Reddit, Bluesky, Mastodon, Telegram and WhatsApp — and it
 * carries three live figures. They are drawn by `tools/make-assets.py` as
 * string literals, because that script draws from primitives and must stay
 * dependency-free, so nothing in the image itself knows what the catalog says.
 *
 * That is the same shape of risk `make-promo.py --check` exists to cover, and
 * it failed here first: the card shipped 2026-08-02 claiming a mid tier of
 * $3,240/mo and a frontier tier of $9,110/mo, and by 2026-08-07 the product
 * computed $2,417 and $11,081 for the same slots. The screenshots in the promo
 * repair themselves because they are captured; a hand-drawn figure does not.
 *
 * So this recomputes the card's three chips the way the site computes its own
 * default estimate — same catalog, same default selection, same default
 * scenario, same engine, promotional rates honoured — and fails when the image
 * or the `og:image:alt` text has drifted away from them.
 *
 *   npm run check:social-card
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertCatalog } from '@/lib/pricing/types';
import { Catalog } from '@/lib/pricing/catalog';
import { compareModels, type Workload } from '@/lib/engine/cost';
import { DEFAULT_SCENARIO } from '@/lib/url/scenario';
import { defaultSelection, scenarioScale } from '@/state/useEstimator';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = resolve(ROOT, 'public/data/pricing.json');
const ARTWORK = resolve(ROOT, 'tools/make-assets.py');
const INDEX = resolve(ROOT, 'index.html');
const CARD = resolve(ROOT, 'public/social-card.png');
const RENDER = resolve(ROOT, 'src/lib/seo/render.ts');

/** The card's chips, cheapest first — the three slots the artwork draws. */
const SLOTS = ['BUDGET', 'MID', 'FRONTIER'] as const;

/** `$9,110/mo`, the way both the artwork and the alt text spell a figure. */
function chip(dollars: number): string {
  return `$${Math.round(dollars).toLocaleString('en-US')}/mo`;
}

/**
 * What the three chips should say today.
 *
 * The card shows the spread, not a ranking of four models, so it takes the
 * cheapest, the dearest and the one nearest the middle of the site's own
 * default selection. `compareModels` returns them already sorted by monthly
 * cost, which is the order the chips are drawn in.
 */
function truth(catalog: Catalog): string[] {
  const models = catalog.getAll(defaultSelection(catalog));
  const workload: Workload = {
    systemTokens: DEFAULT_SCENARIO.systemTokens,
    userTokens: DEFAULT_SCENARIO.userTokens,
    outputTokens: DEFAULT_SCENARIO.outputTokens,
    turns: DEFAULT_SCENARIO.turns,
  };
  const rows = compareModels(models, workload, scenarioScale(DEFAULT_SCENARIO), {
    cachedInputShare: DEFAULT_SCENARIO.cachedInputShare,
    reasoningMultiplier: DEFAULT_SCENARIO.reasoningMultiplier,
    useBatchApi: DEFAULT_SCENARIO.useBatchApi,
  });

  if (rows.length < 3) {
    throw new Error(`the default selection priced ${rows.length} models; the card needs three tiers`);
  }

  const cheapest = rows[0]!;
  const dearest = rows[rows.length - 1]!;
  const middle = rows[Math.floor((rows.length - 1) / 2)]!;
  return [cheapest, middle, dearest].map((row) => chip(row.scaled.perMonth));
}

async function main(): Promise<void> {
  const raw: unknown = JSON.parse(await readFile(CATALOG, 'utf8'));
  assertCatalog(raw);
  const catalog = new Catalog(raw);
  const expected = truth(catalog);

  const problems: string[] = [];

  // The artwork: three ("LABEL", "$n/mo", colour) tuples, in slot order.
  const artwork = await readFile(ARTWORK, 'utf8');
  SLOTS.forEach((slot, index) => {
    const drawn = new RegExp(`\\("${slot}",\\s*"([^"]+)"`).exec(artwork)?.[1];
    if (drawn === undefined) {
      problems.push(`tools/make-assets.py no longer draws a ${slot} chip`);
    } else if (drawn !== expected[index]) {
      problems.push(`${slot} chip is drawn as ${drawn}; the catalog now says ${expected[index]}`);
    }
  });

  // The alt text, which repeats all three for anyone who cannot see the image.
  const index = await readFile(INDEX, 'utf8');
  const alt = /property="og:image:alt"\s+content="([^"]*)"/s.exec(index)?.[1];
  if (alt === undefined) {
    problems.push('index.html has no og:image:alt — the card is unreadable to a screen reader');
  } else {
    SLOTS.forEach((slot, index_) => {
      const figure = expected[index_]!;
      if (!alt.includes(figure)) {
        problems.push(`og:image:alt does not carry the ${slot} figure ${figure}`);
      }
    });
  }

  // The cache key. Every platform stores og:image under its URL, so re-drawing
  // the card at the same address changes nothing for anyone who has already
  // ingested it. LinkedIn proved this on 2026-08-07: Post Inspector re-scraped
  // the page on demand, reported "last scraped a few seconds ago", and still
  // rendered the previous card, because only the metadata was refetched and the
  // image URL it named had not moved. Keying the URL on the file's own hash
  // makes a redrawn card a new URL by construction.
  const version = createHash('sha256')
    .update(await readFile(CARD))
    .digest('hex')
    .slice(0, 8);
  for (const [label, file] of [
    ['index.html', INDEX],
    ['src/lib/seo/render.ts', RENDER],
  ] as const) {
    const source = await readFile(file, 'utf8');
    const used = [...source.matchAll(/social-card\.png(\?v=([0-9a-f]{8}))?/g)];
    if (used.length === 0) continue;
    for (const match of used) {
      if (match[2] !== version) {
        problems.push(
          `${label} points at social-card.png?v=${match[2] ?? '(none)'}; the card's hash is now ${version}`,
        );
        break;
      }
    }
  }

  if (problems.length === 0) {
    console.log(`✓ Social card is true of the catalog — ${expected.join('  ·  ')}`);
    console.log(`  catalog generated ${catalog.generatedAt.toISOString().slice(0, 10)}`);
    console.log(`  cache key         ?v=${version}`);
    return;
  }
  for (const problem of problems) console.error(`✗ ${problem}`);
  console.error('\n  Fix: update the three chips in tools/make-assets.py and the og:image:alt');
  console.error('  in index.html, then re-run `python tools/make-assets.py` and commit');
  console.error('  assets/social-card.png and public/social-card.png.');
  console.error('  If the hash moved, put the new ?v= on both og:image and twitter:image in');
  console.error('  index.html and src/lib/seo/render.ts — a redrawn card at the old URL is');
  console.error('  invisible to every platform that already cached it.');
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
