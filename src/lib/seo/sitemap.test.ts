import { describe, expect, it } from 'vitest';
import { exceptHeld, latestLastmod, sitemapIndex, urlset } from './sitemap';

const entries = [
  { loc: 'https://promptspend.com/models/a/', lastmod: '2026-10-01' },
  { loc: 'https://promptspend.com/models/b/', lastmod: '2026-10-20' },
  { loc: 'https://promptspend.com/models/c/', lastmod: '2026-09-15' },
];

describe('the sitemap files', () => {
  it('lists each address with the date its content changed, and no priority', () => {
    const xml = urlset(entries);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.match(/<url>/g)).toHaveLength(3);
    expect(xml).toContain('<loc>https://promptspend.com/models/b/</loc>\n    <lastmod>2026-10-20</lastmod>');
    expect(xml).not.toContain('priority');
  });

  it('escapes anything that would break the XML', () => {
    const xml = urlset([{ loc: 'https://promptspend.com/?a=1&b="2"', lastmod: '2026-10-01' }]);
    expect(xml).toContain('https://promptspend.com/?a=1&amp;b=&quot;2&quot;');
    expect(xml).not.toContain('&b=');
  });

  it('dates a file by its newest page', () => {
    expect(latestLastmod(entries)).toBe('2026-10-20');
    expect(latestLastmod([])).toBe('');
  });

  it('indexes each non-empty file at the site root with that file’s newest date', () => {
    const xml = sitemapIndex('https://promptspend.com', [
      { name: 'sitemap-models.xml', entries },
      { name: 'sitemap-empty.xml', entries: [] },
      {
        name: 'sitemap-writing.xml',
        entries: [{ loc: 'https://promptspend.com/writing/x/', lastmod: '2026-08-01' }],
      },
    ]);
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(
      '<loc>https://promptspend.com/sitemap-models.xml</loc>\n    <lastmod>2026-10-20</lastmod>',
    );
    expect(xml).toContain(
      '<loc>https://promptspend.com/sitemap-writing.xml</loc>\n    <lastmod>2026-08-01</lastmod>',
    );
    expect(xml).not.toContain('sitemap-empty.xml');
    expect(xml.match(/<sitemap>/g)).toHaveLength(2);
  });
});

describe('pages held out of the sitemap', () => {
  const pages = [{ path: '/compare/a-vs-b/' }, { path: '/compare/a-vs-c/' }, { path: '/compare/b-vs-c/' }];

  it('drops only the held pages and keeps the order of the rest', () => {
    expect(exceptHeld(pages, new Set(['/compare/a-vs-c/']))).toEqual([
      { path: '/compare/a-vs-b/' },
      { path: '/compare/b-vs-c/' },
    ]);
  });

  it('keeps every page when nothing is held', () => {
    expect(exceptHeld(pages, new Set())).toEqual(pages);
  });
});
