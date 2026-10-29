/**
 * `feed.xml` — an Atom feed of price news, built from the published price
 * history (`/data/price-history.json`, the same table as the CC0 dataset).
 *
 * It used to be filtered from `docs/pricing-changelog.md`, and that is the
 * reason it is not any more. The changelog's "Price" lines include rates
 * PromptSpend merely started recording ("cacheWrite — → 12.5"), so a feed of
 * them overstated how often vendors reprice. The history classifies every
 * move: a `price` is the vendor's number changing, a `correction` is
 * PromptSpend reading a better page in the same commit, and `coverage` is a
 * rate we began or stopped recording. Only the first is a change to anyone's
 * bill, and the feed says which is which instead of counting them together.
 *
 * Coverage rows are left out: nobody's invoice moved. One entry per UTC day
 * with at least one remaining change. Entry ids are tag URIs keyed on the date,
 * so a rebuild yields the same feed and a reader never sees an old day twice.
 */
import type { HistoryRow, PriceHistory } from '../pricing/history';
import { escapeHtml } from './render';

interface Model {
  id: string;
  name: string;
}

export interface FeedDay {
  date: string;
  added: (Model & { input?: string; output?: string })[];
  removed: Model[];
  /** The vendor's rate moved. */
  repriced: HistoryRow[];
  /** PromptSpend had been reading the wrong page; the rate did not move. */
  corrected: HistoryRow[];
}

/** Days with news, oldest first. */
export function newsworthyDays(history: PriceHistory): FeedDay[] {
  const days = new Map<string, FeedDay>();
  const day = (date: string): FeedDay => {
    let d = days.get(date);
    if (!d) {
      d = { date, added: [], removed: [], repriced: [], corrected: [] };
      days.set(date, d);
    }
    return d;
  };

  for (const row of history.rows) {
    if (row.change === 'price') day(row.date).repriced.push(row);
    else if (row.change === 'correction') day(row.date).corrected.push(row);
    else if (row.change === 'listed' || row.change === 'delisted') {
      const d = day(row.date);
      const list = row.change === 'listed' ? d.added : d.removed;
      let entry = list.find((m) => m.id === row.model_id) as
        (Model & { input?: string; output?: string }) | undefined;
      if (!entry) {
        entry = { id: row.model_id, name: row.model_name };
        list.push(entry);
      }
      if (row.change === 'listed' && row.field === 'input') entry.input = row.new_value;
      if (row.change === 'listed' && row.field === 'output') entry.output = row.new_value;
    }
  }

  return [...days.values()]
    .filter((d) => d.added.length + d.removed.length + d.repriced.length + d.corrected.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function title(d: FeedDay): string {
  const parts: string[] = [];
  if (d.repriced.length) parts.push(plural(d.repriced.length, 'price change', 'price changes'));
  if (d.corrected.length) parts.push(plural(d.corrected.length, 'correction', 'corrections'));
  if (d.added.length) parts.push(plural(d.added.length, 'model added', 'models added'));
  if (d.removed.length) parts.push(plural(d.removed.length, 'model removed', 'models removed'));
  return `LLM pricing, ${d.date}: ${parts.join(', ')}`;
}

function value(raw: string, unit: string): string {
  if (raw === '') return 'not recorded';
  return unit.startsWith('USD') ? `$${raw}` : raw;
}

function move(row: HistoryRow): string {
  return (
    `<li><code>${escapeHtml(row.model_id)}</code> ${escapeHtml(row.field)}: ` +
    `${escapeHtml(value(row.old_value, row.unit))} → ${escapeHtml(value(row.new_value, row.unit))}</li>`
  );
}

function section(heading: string, items: string[]): string {
  return items.length ? `<p><strong>${heading}</strong></p><ul>${items.join('')}</ul>` : '';
}

function body(d: FeedDay, siteUrl: string): string {
  return (
    section('Price changes — the vendor’s rate moved', d.repriced.map(move)) +
    section(
      'Corrections — PromptSpend had been reading the wrong page; the vendor’s rate did not move',
      d.corrected.map(move),
    ) +
    section(
      'Models added',
      d.added.map(
        (m) =>
          `<li><code>${escapeHtml(m.id)}</code> ${escapeHtml(m.name)}` +
          (m.input && m.output ? ` ($${escapeHtml(m.input)} in / $${escapeHtml(m.output)} out per 1M)` : '') +
          '</li>',
      ),
    ) +
    section(
      'Models removed',
      d.removed.map((m) => `<li><code>${escapeHtml(m.id)}</code> ${escapeHtml(m.name)}</li>`),
    ) +
    `<p>Rates are USD per 1M tokens. Current prices, with their sources: <a href="${siteUrl}/models/">${siteUrl}/models/</a>. ` +
    `Every row, with the commit that published it: <a href="${siteUrl}/data/price-history.csv">${siteUrl}/data/price-history.csv</a></p>`
  );
}

export function renderFeed(history: PriceHistory, siteUrl: string, limit = 50): string {
  const days = newsworthyDays(history).slice(-limit).reverse();
  const updated = days[0] ? `${days[0].date}T12:00:00Z` : `${history.firstDate}T12:00:00Z`;
  const entries = days
    .map(
      (d) => `  <entry>
    <id>tag:promptspend.com,${d.date}:pricing-changes</id>
    <title>${escapeHtml(title(d))}</title>
    <updated>${d.date}T12:00:00Z</updated>
    <link rel="alternate" type="text/html" href="${escapeHtml(`${siteUrl}/changes/#${d.date}`)}" />
    <content type="html">${escapeHtml(body(d, siteUrl))}</content>
  </entry>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${escapeHtml(`${siteUrl}/feed.xml`)}</id>
  <title>PromptSpend — LLM API price changes</title>
  <subtitle>New models and price changes, as the daily check publishes them, with corrections labeled apart from real repricing.</subtitle>
  <link rel="self" type="application/atom+xml" href="${escapeHtml(`${siteUrl}/feed.xml`)}" />
  <link rel="alternate" type="text/html" href="${escapeHtml(`${siteUrl}/`)}" />
  <updated>${updated}</updated>
  <author><name>PromptSpend</name><uri>${escapeHtml(`${siteUrl}/`)}</uri></author>
${entries}
</feed>
`;
}
