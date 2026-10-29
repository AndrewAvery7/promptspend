/**
 * The sitemap, written as one file per kind of page and an index over them.
 *
 * Search Console reports indexing per sitemap file, so a single file of every
 * address can say "372 pages were submitted, 90 are indexed" and nothing about
 * which kind is being left out. One file each for the models, the providers,
 * the comparisons, the free-tier pages, the articles and the rest turns that
 * into a question it can answer: are the comparisons the ones Google is
 * skipping? `sitemap.xml` stays the address everything already submits; it is
 * now the index.
 *
 * No `<priority>`: Google ignores it, and a number every crawler ignores is a
 * number nobody keeps true. `<lastmod>` is the one hint that is read, and the
 * callers feed it from the page ledger so it is the date the content changed.
 */

export interface SitemapEntry {
  /** Absolute address. */
  loc: string;
  /** ISO date (`YYYY-MM-DD`) the page's content last changed. */
  lastmod: string;
}

export interface SitemapFile {
  /** The file's name at the site root, such as `sitemap-models.xml`. */
  name: string;
  entries: readonly SitemapEntry[];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** The most recent date among the entries. ISO dates sort as text. */
export function latestLastmod(entries: readonly SitemapEntry[]): string {
  return entries.reduce((latest, entry) => (entry.lastmod > latest ? entry.lastmod : latest), '');
}

/** One sitemap file: a plain list of addresses and the dates their content changed. */
export function urlset(entries: readonly SitemapEntry[]): string {
  const urls = entries
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${escapeXml(entry.lastmod)}</lastmod>
  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * The index over the files. A file with no entries is left out rather than
 * listed empty, and each one carries the newest date among its own pages.
 */
export function sitemapIndex(siteUrl: string, files: readonly SitemapFile[]): string {
  const listed = files
    .filter((file) => file.entries.length > 0)
    .map(
      (file) => `  <sitemap>
    <loc>${escapeXml(`${siteUrl}/${file.name}`)}</loc>
    <lastmod>${escapeXml(latestLastmod(file.entries))}</lastmod>
  </sitemap>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${listed}
</sitemapindex>
`;
}
