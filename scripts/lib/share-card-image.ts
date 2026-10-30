/**
 * Draw a page's share image (1200x630 PNG) from its `ShareCard` spec, and write
 * the whole set into `dist/og/` with a content-keyed cache.
 *
 * The look is the site-wide social card's (`tools/make-assets.py`): cool paper
 * behind a white rounded card, the mark and wordmark top left, a bold two-line
 * headline, muted supporting lines, three figure chips down the right and a
 * muted footer. It is drawn in the site's own faces — Space Grotesk, IBM Plex
 * Sans and JetBrains Mono, read from the `@fontsource` packages the site
 * already ships — with the colors of `src/styles/tokens.css`.
 *
 * Each image's file name carries no hash, but its URL does (`?v=`): every
 * platform caches an `og:image` by URL, so a card redrawn at the same address
 * is invisible to anyone who already fetched it. The key is a hash of exactly
 * what is drawn plus `RENDERER_VERSION`, so it moves when, and only when, the
 * pixels would.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH, type ChipTone, type ShareCard } from '@/lib/seo/share-cards';
import { Canvas, Font, measureText, roundedRect, type Polygon, type Rgb } from './raster';

/** Bump when the drawing changes, so every cached card and every URL key moves with it. */
export const RENDERER_VERSION = 1;

// Straight from src/styles/tokens.css (light theme), as tools/make-assets.py does.
const THEME = {
  accent: [0x24, 0x56, 0xe6],
  ink: [0x15, 0x18, 0x1d],
  muted: [0x5f, 0x6b, 0x78],
  bg: [0xeb, 0xef, 0xf5],
  surface: [0xff, 0xff, 0xff],
  surface2: [0xfa, 0xfb, 0xfd],
  border: [0xdc, 0xe2, 0xeb],
  save: [0x0e, 0x7b, 0x43],
  cost: [0xc6, 0x28, 0x28],
} as const satisfies Record<string, Rgb>;

const TONE: Record<ChipTone, Rgb> = {
  accent: THEME.accent,
  save: THEME.save,
  cost: THEME.cost,
  muted: THEME.muted,
};

const FONT_FILES = {
  display: '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff',
  body: '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff',
  label: '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff',
  mono: '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff',
} as const;

type Fonts = Record<keyof typeof FONT_FILES, Font>;

let loaded: Fonts | null = null;

function fonts(): Fonts {
  if (loaded) return loaded;
  const require = createRequire(import.meta.url);
  loaded = Object.fromEntries(
    Object.entries(FONT_FILES).map(([key, specifier]) => [key, Font.load(require.resolve(specifier))]),
  ) as Fonts;
  return loaded;
}

/** Characters a face may not carry, and the nearest thing it does. */
const SUBSTITUTES: Record<string, string> = { '–': '-', '—': '-', '×': 'x', '·': '|', '…': '...', '’': "'" };

function printable(font: Font, text: string): string {
  let out = '';
  for (const char of text) {
    if (char === ' ' || font.hasGlyph(char.codePointAt(0)!)) out += char;
    else out += SUBSTITUTES[char] ?? '?';
  }
  return out;
}

/** Shorten to fit `width`, ending in an ellipsis. */
function fit(font: Font, size: number, text: string, width: number): string {
  if (measureText(font, size, text) <= width) return text;
  const ellipsis = printable(font, '…');
  let cut = text;
  while (cut.length > 1 && measureText(font, size, `${cut.trimEnd()}${ellipsis}`) > width)
    cut = cut.slice(0, -1);
  return `${cut.trimEnd()}${ellipsis}`;
}

/** Greedy word wrap into at most `maxLines`; the last line is shortened if the text does not fit. */
export function wrap(font: Font, size: number, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const candidate = current ? `${current} ${word}` : word;
    if (measureText(font, size, candidate) <= width || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) {
      current = words.slice(i).join(' ');
      break;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines).map((line) => fit(font, size, line, width));
}

/** The favicon mark: a rounded square and three ledger rules, from the same 26-unit geometry. */
function markPolygons(x: number, y: number, size: number): Polygon[] {
  const u = size / 26;
  const stroke = 2 * u;
  const half = stroke / 2;
  const polygons: Polygon[] = [
    roundedRect(x + 1.5 * u - half, y + 1.5 * u - half, 23 * u + stroke, 23 * u + stroke, 6 * u + half),
    roundedRect(x + 1.5 * u + half, y + 1.5 * u + half, 23 * u - stroke, 23 * u - stroke, 6 * u - half, true),
  ];
  for (const [offset, length] of [
    [9.5, 12],
    [13.5, 8],
    [17.5, 10],
  ] as const) {
    polygons.push(roundedRect(x + 7 * u - half, y + offset * u - half, length * u + stroke, stroke, half));
  }
  return polygons;
}

const PAD = 60;
const INNER = PAD + 48;
const CHIP_W = 250;
const CHIP_H = 90;
const CHIP_GAP = 17;
const CHIP_X = SHARE_CARD_WIDTH - PAD - 48 - CHIP_W;
const TEXT_W = CHIP_X - 36 - INNER;
const FOOTER_Y = SHARE_CARD_HEIGHT - PAD - 46;

let template: Canvas | null = null;

/** Everything every card shares: paper, card, mark and wordmark. Drawn once per build. */
function base(): Canvas {
  if (template) return template;
  const f = fonts();
  const canvas = new Canvas(SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT, THEME.bg);
  const w = SHARE_CARD_WIDTH - PAD * 2;
  const h = SHARE_CARD_HEIGHT - PAD * 2;
  canvas.fill([roundedRect(PAD, PAD, w, h, 26)], THEME.border);
  canvas.fill([roundedRect(PAD + 2, PAD + 2, w - 4, h - 4, 24)], THEME.surface);

  const mark = 56;
  canvas.fill(markPolygons(INNER, INNER - 6, mark), THEME.accent);
  const size = 40;
  const x = INNER + mark + 16;
  const baseline = INNER - 6 + mark / 2 + size * 0.36;
  const prompt = canvas.text(f.display, size, x, baseline, 'Prompt', THEME.ink);
  canvas.text(f.display, size, x + prompt, baseline, 'Spend', THEME.accent);
  template = canvas;
  return canvas;
}

/** Draw one card. Pure apart from reading the fonts: the same spec gives the same bytes. */
export function renderShareCard(card: ShareCard): Buffer {
  const f = fonts();
  const canvas = base().clone();

  // Chips, top to bottom, aligned with the wordmark.
  let chipY = INNER - 6;
  for (const chip of card.chips) {
    canvas.fill([roundedRect(CHIP_X, chipY, CHIP_W, CHIP_H, 14)], THEME.border);
    canvas.fill([roundedRect(CHIP_X + 2, chipY + 2, CHIP_W - 4, CHIP_H - 4, 12)], THEME.surface2);
    const label = fit(f.label, 14, printable(f.label, chip.label), CHIP_W - 36);
    canvas.text(f.label, 14, CHIP_X + 18, chipY + 30, label, THEME.muted);
    let valueSize = 27;
    const value = printable(f.mono, chip.value);
    while (valueSize > 18 && measureText(f.mono, valueSize, value) > CHIP_W - 36) valueSize -= 1;
    canvas.text(
      f.mono,
      valueSize,
      CHIP_X + 18,
      chipY + 68,
      fit(f.mono, valueSize, value, CHIP_W - 36),
      TONE[chip.tone],
    );
    chipY += CHIP_H + CHIP_GAP;
  }

  // Eyebrow, headline, supporting lines: a column that flows down from under the mark.
  let y = INNER + 104;
  canvas.text(
    f.label,
    15,
    INNER,
    y,
    fit(f.label, 15, printable(f.label, card.eyebrow), TEXT_W),
    THEME.accent,
  );

  const headline = printable(f.display, card.headline);
  // The largest size, down to 40px, at which the whole headline fits in two lines.
  let size = 58;
  while (size > 40 && wrap(f.display, size, headline, TEXT_W, 9).length > 2) size -= 2;
  const lines = wrap(f.display, size, headline, TEXT_W, 2);
  y += 14 + size * 0.92;
  for (const line of lines) {
    canvas.text(f.display, size, INNER, y, line, THEME.ink);
    y += size * 1.08;
  }

  const subSize = 22;
  const subLines = card.lines.flatMap((line) => wrap(f.body, subSize, printable(f.body, line), TEXT_W, 2));
  y += 34 - size * 1.08 + subSize;
  for (const line of subLines) {
    if (y > FOOTER_Y - 34) break;
    canvas.text(f.body, subSize, INNER, y, line, THEME.muted);
    y += 32;
  }

  canvas.text(
    f.body,
    18,
    INNER,
    FOOTER_Y,
    fit(f.body, 18, printable(f.body, card.footer), SHARE_CARD_WIDTH - INNER * 2),
    THEME.muted,
  );
  return canvas.png();
}

/** The cache key: everything drawn, and the renderer that drew it. */
export function shareCardKey(card: ShareCard): string {
  const drawn = {
    v: RENDERER_VERSION,
    fonts: FONT_FILES,
    eyebrow: card.eyebrow,
    headline: card.headline,
    lines: card.lines,
    chips: card.chips,
    footer: card.footer,
  };
  return createHash('sha256').update(JSON.stringify(drawn)).digest('hex').slice(0, 16);
}

export interface PublishedShareImage {
  /** Site path with its cache key, e.g. `/og/models/gpt-5-5.png?v=1a2b3c4d`. */
  url: string;
  alt: string;
}

export interface ShareImageReport {
  images: Map<string, PublishedShareImage>;
  drawn: number;
  reused: number;
}

/**
 * Write every card into `dist`, drawing only those whose key is not already in
 * `cacheDir`, then drop cache entries no current page uses. A rebuild with no
 * content change draws nothing; a price change redraws exactly the cards that
 * show that price.
 */
export async function writeShareImages(
  cards: readonly ShareCard[],
  dist: string,
  cacheDir: string,
): Promise<ShareImageReport> {
  await mkdir(cacheDir, { recursive: true });
  const images = new Map<string, PublishedShareImage>();
  const used = new Set<string>();
  let drawn = 0;
  let reused = 0;
  for (const card of cards) {
    const key = shareCardKey(card);
    const cached = join(cacheDir, `${key}.png`);
    if (existsSync(cached)) reused++;
    else {
      await writeFile(cached, renderShareCard(card));
      drawn++;
    }
    used.add(`${key}.png`);
    const target = resolve(dist, card.imagePath.replace(/^\//, ''));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(cached, target);
    images.set(card.pagePath, { url: `${card.imagePath}?v=${key.slice(0, 8)}`, alt: card.alt });
  }
  for (const name of await readdir(cacheDir)) {
    if (name.endsWith('.png') && !used.has(name)) await rm(join(cacheDir, name), { force: true });
  }
  return { images, drawn, reused };
}
