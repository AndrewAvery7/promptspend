/**
 * `feed.xml` — an Atom feed of price changes, built from the changelog the
 * daily sync already writes (`docs/pricing-changelog.md`).
 *
 * Built from that file rather than by diffing catalogs again, so the feed and
 * the changelog cannot disagree: one is the other, filtered. The filter keeps
 * what a subscriber is asking about — a model appearing, a rate moving, a
 * correction, a provider change — and leaves out the provenance and metadata
 * bookkeeping that makes up most of the changelog by volume.
 *
 * One entry per UTC day with at least one such change. Entry ids are tag URIs
 * keyed on the date, so a rebuild of the same changelog yields the same feed
 * and a reader never sees an old day twice.
 */
import { escapeHtml } from './render';

/** The changelog kinds a subscriber wants; everything else is bookkeeping. */
const NEWSWORTHY = ['Added', 'Price', 'Corrected', 'Removed', 'Provider'] as const;
type Kind = (typeof NEWSWORTHY)[number];

const CHANGELOG_URL = 'https://github.com/AndrewAvery7/promptspend/blob/main/docs/pricing-changelog.md';

export interface FeedDay {
  date: string;
  lines: { kind: Kind; text: string }[];
}

/** Parse the changelog into days, oldest first, keeping only newsworthy lines. Repeated date headings merge. */
export function newsworthyDays(markdown: string): FeedDay[] {
  const days = new Map<string, FeedDay>();
  let current: FeedDay | null = null;
  for (const raw of markdown.split('\n')) {
    const heading = /^## (\d{4}-\d{2}-\d{2})\s*$/.exec(raw);
    if (heading) {
      const date = heading[1]!;
      current = days.get(date) ?? { date, lines: [] };
      days.set(date, current);
      continue;
    }
    const line = /^- \*\*([A-Za-z]+)\*\* (.+)$/.exec(raw);
    if (!line || !current) continue;
    const kind = line[1] as Kind;
    if (NEWSWORTHY.includes(kind)) current.lines.push({ kind, text: line[2]! });
  }
  return [...days.values()].filter((day) => day.lines.length > 0);
}

/** `code` spans to <code>, everything escaped first. The changelog uses nothing else inline. */
function inline(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function title(day: FeedDay): string {
  const counts = new Map<Kind, number>();
  for (const { kind } of day.lines) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  const words: Record<Kind, [string, string]> = {
    Added: ['model added', 'models added'],
    Price: ['price change', 'price changes'],
    Corrected: ['correction', 'corrections'],
    Removed: ['model removed', 'models removed'],
    Provider: ['provider change', 'provider changes'],
  };
  const parts = NEWSWORTHY.filter((k) => counts.has(k)).map((k) => {
    const n = counts.get(k)!;
    return `${n} ${words[k][n === 1 ? 0 : 1]}`;
  });
  return `LLM pricing, ${day.date}: ${parts.join(', ')}`;
}

export function renderFeed(markdown: string, siteUrl: string, limit = 50): string {
  const days = newsworthyDays(markdown).slice(-limit).reverse();
  const updated = days[0] ? `${days[0].date}T12:00:00Z` : '2026-08-01T12:00:00Z';
  const entries = days
    .map((day) => {
      const items = day.lines
        .map(({ kind, text }) => `<li><strong>${kind}</strong> ${inline(text)}</li>`)
        .join('');
      return `  <entry>
    <id>tag:promptspend.com,${day.date}:pricing-changes</id>
    <title>${escapeHtml(title(day))}</title>
    <updated>${day.date}T12:00:00Z</updated>
    <link rel="alternate" type="text/html" href="${escapeHtml(`${CHANGELOG_URL}#${day.date}`)}" />
    <content type="html">${escapeHtml(`<ul>${items}</ul><p>Rates are USD per 1M tokens. Current prices, with their sources: <a href="${siteUrl}/models/">${siteUrl}/models/</a></p>`)}</content>
  </entry>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${escapeHtml(`${siteUrl}/feed.xml`)}</id>
  <title>PromptSpend — LLM API price changes</title>
  <subtitle>New models and price changes, as the daily check publishes them. Every rate is checked against its source.</subtitle>
  <link rel="self" type="application/atom+xml" href="${escapeHtml(`${siteUrl}/feed.xml`)}" />
  <link rel="alternate" type="text/html" href="${escapeHtml(`${siteUrl}/`)}" />
  <updated>${updated}</updated>
  <author><name>PromptSpend</name><uri>${escapeHtml(`${siteUrl}/`)}</uri></author>
${entries}
</feed>
`;
}
