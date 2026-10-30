import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import type { ShareCard } from '@/lib/seo/share-cards';
import { renderShareCard, shareCardKey, writeShareImages } from './share-card-image';

function card(overrides: Partial<ShareCard> = {}): ShareCard {
  return {
    pagePath: '/models/example/',
    imagePath: '/og/models/example.png',
    eyebrow: 'EXAMPLE  ·  MODEL PRICING',
    headline: 'Example Model',
    lines: ['$1 input  ·  $4 output per 1M tokens', '400K context window'],
    chips: [
      { label: 'SUPPORT CHATBOT', value: '$1,087/mo', tone: 'accent' },
      { label: 'DOCUMENT SUMMARIZER', value: '$310/mo', tone: 'accent' },
      { label: 'CODING AGENT', value: '$2,400/mo', tone: 'accent' },
    ],
    footer: 'Updated 2026-08-02  ·  open source  ·  no accounts, no ads',
    alt: 'Example Model: $1 input and $4 output.',
    ...overrides,
  };
}

const scratch = mkdtempSync(join(tmpdir(), 'share-cards-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('a share card image', () => {
  it('is a 1200x630 PNG, the same bytes every time it is drawn', () => {
    const png = renderShareCard(card());
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(renderShareCard(card()).equals(png)).toBe(true);
  });

  it('survives a headline far too long for two lines', () => {
    const png = renderShareCard(card({ headline: 'An Extremely Long Model Name '.repeat(6) }));
    expect(png.length).toBeGreaterThan(1000);
  });
});

describe('the cache key', () => {
  it('moves when a drawn figure does and stays put when only the alt text does', () => {
    const before = shareCardKey(card());
    expect(shareCardKey(card({ alt: 'Different words' }))).toBe(before);
    const repriced = card();
    repriced.chips[0] = { ...repriced.chips[0], value: '$1,088/mo' };
    expect(shareCardKey(repriced)).not.toBe(before);
  });
});

describe('writing the set', () => {
  it('draws a card once, reuses it afterwards, and prunes what no page uses', async () => {
    const dist = join(scratch, 'dist');
    const cache = join(scratch, 'cache');
    const first = await writeShareImages([card()], dist, cache);
    expect([first.drawn, first.reused]).toEqual([1, 0]);
    const published = first.images.get('/models/example/')!;
    expect(published.url).toMatch(/^\/og\/models\/example\.png\?v=[0-9a-f]{8}$/);
    expect(published.alt).toBe('Example Model: $1 input and $4 output.');
    expect(existsSync(join(dist, 'og/models/example.png'))).toBe(true);

    writeFileSync(join(cache, 'stale0000000000.png'), 'old');
    const second = await writeShareImages([card()], dist, cache);
    expect([second.drawn, second.reused]).toEqual([0, 1]);
    expect(readdirSync(cache)).toEqual([`${shareCardKey(card())}.png`]);
  });
});
