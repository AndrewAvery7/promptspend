/** A sitemap file: an index of other sitemaps, a list of pages, or neither. */
import { decodeEntities } from './html';

export interface ParsedSitemap {
  kind: 'index' | 'urlset' | 'invalid';
  locs: string[];
}

export function parseSitemap(xml: string): ParsedSitemap {
  const isIndex = /<sitemapindex[\s>]/i.test(xml) && /<\/sitemapindex>/i.test(xml);
  const isUrlset = /<urlset[\s>]/i.test(xml) && /<\/urlset>/i.test(xml);
  if (!isIndex && !isUrlset) return { kind: 'invalid', locs: [] };
  const locs = [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]!.trim()));
  return { kind: isIndex ? 'index' : 'urlset', locs };
}

/** Up to `count` addresses spread evenly through the list, so a sample is not just the first section. */
export function spreadSample<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * step)]!);
}
