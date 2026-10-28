import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newsworthyDays, renderFeed } from './feed';

const CHANGELOG = `# Pricing changelog

## 2026-10-01

- **Review** \`gpt-5\` — provenance.source: litellm → vendor
- **Metadata** \`gpt-5\` — displayName: GPT 5 → GPT-5

## 2026-10-02

- **Added** \`gpt-6\` — GPT-6 ($2 in / $8 out per 1M)
- **Price** \`gpt-5\` — input 1.25 → 1

## 2026-10-02

- **Price** \`gpt-5\` — output 10 → 8
- **Coverage** \`gpt-6\` — cachedInput now tracked: — → 0.2
`;

describe('the price-change feed', () => {
  it('keeps price news, drops bookkeeping, and merges a date that appears twice', () => {
    const days = newsworthyDays(CHANGELOG);
    expect(days.map((d) => d.date)).toEqual(['2026-10-02']);
    expect(days[0]!.lines.map((l) => l.kind)).toEqual(['Added', 'Price', 'Price']);
  });

  it('writes valid-looking Atom, newest first, with stable ids and a counted title', () => {
    const xml = renderFeed(CHANGELOG, 'https://promptspend.com');
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(xml).toContain('<id>tag:promptspend.com,2026-10-02:pricing-changes</id>');
    expect(xml).toContain('LLM pricing, 2026-10-02: 1 model added, 2 price changes');
    expect(xml).toContain('<updated>2026-10-02T12:00:00Z</updated>');
    expect(xml).not.toContain('provenance.source');
    // Entry HTML is escaped once inside <content type="html">, never raw.
    expect(xml).toContain('&lt;code&gt;gpt-6&lt;/code&gt;');
    expect(xml).not.toMatch(/<content type="html"><ul>/);
  });

  it('is identical on a rebuild of the same changelog', () => {
    expect(renderFeed(CHANGELOG, 'https://promptspend.com')).toBe(
      renderFeed(CHANGELOG, 'https://promptspend.com'),
    );
  });

  it('parses the real changelog into at least one day of news', () => {
    const real = readFileSync(resolve(import.meta.dirname, '../../../docs/pricing-changelog.md'), 'utf8');
    const days = newsworthyDays(real);
    expect(days.length).toBeGreaterThan(0);
    expect(days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);
  });
});
