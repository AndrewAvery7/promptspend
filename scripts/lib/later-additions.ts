/**
 * The weekly check behind data/later-additions.json: has the automated price
 * feed started carrying something the catalogue is waiting for?
 *
 * Pure so it can be tested against fixtures. scripts/watch-later-additions.ts
 * owns the network call and the report.
 *
 * Two rules keep it from crying wolf:
 *
 *   It matches the vendor's own key only. A watch pattern is anchored on the
 *   vendor's prefix, so a copy of the same model sold by a cloud
 *   (`tencent/glm-5.3-flashx`, `novita/stepfun/...`) never counts.
 *
 *   It stops listing anything already published. Once a model reaches the
 *   catalogue the watcher has done its job, and a report that kept naming it
 *   would be one nobody reads.
 */
import { slugify } from './normalize';

export interface WatchItem {
  id: string;
  kind: 'lab' | 'model';
  label: string;
  /** A regular expression (as a string) over the feed's own keys. */
  feedKey: string;
  vendorPage: string;
  note: string;
}

export interface Available {
  item: WatchItem;
  rows: { key: string; inputPerMillion: number; outputPerMillion: number }[];
}

/** Rows a price comparison could use: chat models with a real per-token price. */
function priced(value: unknown): { input: number; output: number } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const entry = value as Record<string, unknown>;
  if (entry.mode !== 'chat') return undefined;
  const input = entry.input_cost_per_token;
  const output = entry.output_cost_per_token;
  if (typeof input !== 'number' || typeof output !== 'number') return undefined;
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return undefined;
  if (input === 0 && output === 0) return undefined;
  return { input, output };
}

export function findAvailable(
  feed: Record<string, unknown>,
  watch: readonly WatchItem[],
  publishedIds: ReadonlySet<string>,
): Available[] {
  const found: Available[] = [];
  for (const item of watch) {
    const pattern = new RegExp(item.feedKey);
    const rows: Available['rows'] = [];
    for (const [key, value] of Object.entries(feed)) {
      if (!pattern.test(key)) continue;
      if (publishedIds.has(slugify(key))) continue;
      const price = priced(value);
      if (price === undefined) continue;
      rows.push({
        key,
        inputPerMillion: Math.round(price.input * 1e12) / 1e6,
        outputPerMillion: Math.round(price.output * 1e12) / 1e6,
      });
    }
    if (rows.length > 0) found.push({ item, rows: rows.sort((a, b) => a.key.localeCompare(b.key)) });
  }
  return found;
}

/** The body of the issue: what appeared, what the feed says, where to verify. */
export function renderReport(found: readonly Available[], date: string): string {
  const lines = [
    `The price feed now carries ${found.length === 1 ? 'something' : `${found.length} things`} the catalogue has been waiting for (checked ${date}).`,
    '',
    'Nothing has been added. Each one still needs its price read from the vendor page, and the notes below say what else it needs.',
    '',
  ];
  for (const { item, rows } of found) {
    lines.push(`### ${item.label} (${item.kind})`);
    for (const row of rows) {
      lines.push(
        `- \`${row.key}\`: feed says $${row.inputPerMillion} in / $${row.outputPerMillion} out per 1M tokens`,
      );
    }
    lines.push(`- Vendor page: ${item.vendorPage}`);
    lines.push(`- ${item.note}`);
    lines.push('');
  }
  lines.push(
    'The list lives in `data/later-additions.json`. This issue closes itself once everything on it has been added.',
  );
  return `${lines.join('\n')}\n`;
}
