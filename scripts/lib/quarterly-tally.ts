/**
 * The quarterly tally behind the "State of LLM Pricing" report.
 *
 * Built on the monthly tally (`changelog-tally.ts`), which reproduces the
 * published Price Movement Reports, and read from the same append-only log,
 * `docs/pricing-changelog.md`. A quarter is its three months counted the same
 * way, plus the figures only a log like this one can give: changes per vendor,
 * increases against cuts, the median size of a change, retirements,
 * introductory prices that ran out, and the disputed-price flags raised and
 * cleared.
 *
 * Pure, like the monthly tally: it takes the log's text and a catalog snapshot
 * and returns numbers, so it is tested from fixtures.
 */
import {
  parseChangelog,
  parsePriceMove,
  tallyMonth,
  type MonthTally,
  type PriceMove,
} from './changelog-tally';

export interface Quarter {
  /** `2026-Q4`. */
  id: string;
  /** `Q4 2026`. */
  name: string;
  months: [string, string, string];
  /** First and last day, `YYYY-MM-DD`. */
  start: string;
  end: string;
  /** The first day of the next quarter. */
  next: string;
}

/** The fields of `public/data/pricing.json` this reads. */
export interface CatalogSnapshot {
  generatedAt: string;
  providers: { id: string; name: string }[];
  models: {
    id: string;
    providerId: string;
    pricing: { intro?: { until?: string } };
    provenance?: { needsReview?: boolean };
  }[];
}

export interface VendorTally {
  vendor: string;
  /** Price rows (one per rate that moved). */
  priceRows: number;
  /** Distinct models with a price row. */
  models: number;
  increases: number;
  cuts: number;
  added: number;
  retired: number;
}

export interface Retirement {
  date: string;
  id: string;
  vendor: string;
  from: string;
  to: string;
}

export interface IntroExpiry {
  id: string;
  vendor: string;
  until: string;
  /** `expired` once the log has passed the date, `scheduled` before. */
  state: 'expired' | 'scheduled';
  /** Where the date came from. */
  source: 'log' | 'catalog' | 'both';
}

export interface QuarterTally {
  quarter: Quarter;
  months: MonthTally[];
  byKind: Record<string, number>;
  entries: number;
  priceMoves: PriceMove[];
  increases: number;
  cuts: number;
  /** Distinct models with a rate change (a Price row that moved a figure, not one setting a field for the first time). */
  pricedModels: string[];
  /** Models whose every move in the quarter went one way, or both ways. */
  modelsUp: number;
  modelsDown: number;
  modelsMixed: number;
  /** Median size of one rate change, ignoring direction. */
  medianChange: number | null;
  medianIncrease: number | null;
  medianCut: number | null;
  vendors: VendorTally[];
  added: { date: string; id: string; vendor: string }[];
  retirements: Retirement[];
  /** Models brought back from legacy to current. */
  restored: Retirement[];
  introExpiries: IntroExpiry[];
  disputes: {
    raised: number;
    cleared: number;
    modelsRaised: string[];
    /** Flags open in the catalog snapshot, and when it was generated. */
    openNow: number;
    openModels: string[];
    snapshotAt: string;
  };
  /** Days in the quarter whose price rows carry an explanatory note in the log. */
  annotatedDays: { date: string; note: string }[];
  logThrough: string;
  quarterIsComplete: boolean;
}

export function parseQuarter(id: string): Quarter {
  const match = /^(\d{4})-Q([1-4])$/i.exec(id);
  if (!match) throw new Error(`"${id}" is not a quarter like 2026-Q4`);
  const year = Number(match[1]);
  const number = Number(match[2]);
  const first = (number - 1) * 3 + 1;
  const pad = (n: number): string => String(n).padStart(2, '0');
  const months = [0, 1, 2].map((i) => `${year}-${pad(first + i)}`) as [string, string, string];
  const lastDay = new Date(Date.UTC(year, first + 2, 0)).getUTCDate();
  return {
    id: `${year}-Q${number}`,
    name: `Q${number} ${year}`,
    months,
    start: `${months[0]}-01`,
    end: `${months[2]}-${pad(lastDay)}`,
    next: number === 4 ? `${year + 1}-01-01` : `${year}-${pad(first + 3)}-01`,
  };
}

export function previousQuarter(id: string): string {
  const { name } = parseQuarter(id);
  const [q, year] = name.slice(1).split(' ').map(Number) as [number, number];
  return q === 1 ? `${year - 1}-Q4` : `${year}-Q${q - 1}`;
}

/** Every `## YYYY-MM-DD` heading, including days the sync ran and changed nothing. */
export function logDates(text: string): string[] {
  return [...text.matchAll(/^## (\d{4}-\d{2}-\d{2})\s*$/gm)].map((match) => match[1]!);
}

/** The `> ` notes the log puts above a day's rows, one string per note. */
export function parseNotes(text: string): { date: string; note: string }[] {
  const notes: { date: string; note: string }[] = [];
  let date = '';
  let current: string[] = [];
  const flush = (): void => {
    if (current.length > 0 && date) notes.push({ date, note: current.join(' ').trim() });
    current = [];
  };
  for (const line of text.split('\n')) {
    const heading = /^## (\d{4}-\d{2}-\d{2})\s*$/.exec(line);
    if (heading) {
      flush();
      date = heading[1]!;
      continue;
    }
    if (line.startsWith('>')) current.push(line.replace(/^>\s?/, '').trim());
    else flush();
  }
  flush();
  return notes;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** A vendor's display name for a model id: the catalog's own provider, else the id's first word. */
export function vendorResolver(catalog: CatalogSnapshot): (id: string) => string {
  const names = new Map(catalog.providers.map((provider) => [provider.id, provider.name]));
  const byModel = new Map(
    catalog.models.map((model) => [model.id, names.get(model.providerId) ?? model.providerId]),
  );
  return (id) => byModel.get(id) ?? names.get(id) ?? id.split(/[-.]/)[0]!;
}

const STATUS = /^status: (\w+) → (\w+)$/;
const INTRO_UNTIL = /^intro\.until\b[^:]*: (\S+) → (\S+)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function tallyQuarter(text: string, catalog: CatalogSnapshot, quarterId: string): QuarterTally {
  const quarter = parseQuarter(quarterId);
  const entries = parseChangelog(text);
  const vendorOf = vendorResolver(catalog);
  const inQuarter = (entry: { date: string }): boolean =>
    entry.date >= quarter.start && entry.date <= quarter.end;
  const quarterEntries = entries.filter(inQuarter);
  const months = quarter.months.map((month) => tallyMonth(entries, month));

  const byKind: Record<string, number> = {};
  for (const month of months) {
    for (const [kind, count] of Object.entries(month.byKind)) byKind[kind] = (byKind[kind] ?? 0) + count;
  }

  const priceMoves = quarterEntries.map(parsePriceMove).filter((move): move is PriceMove => move !== null);
  const increases = priceMoves.filter((move) => move.change > 0);
  const cuts = priceMoves.filter((move) => move.change < 0);
  const pricedModels = [...new Set(priceMoves.map((move) => move.id))];
  const directions = new Map<string, Set<number>>();
  for (const move of priceMoves) {
    const set = directions.get(move.id) ?? new Set<number>();
    set.add(Math.sign(move.change));
    directions.set(move.id, set);
  }
  const direction = (sign: number): number =>
    [...directions.values()].filter((set) => set.size === 1 && set.has(sign)).length;

  const added = quarterEntries
    .filter((entry) => entry.kind === 'Added')
    .map((entry) => ({ date: entry.date, id: entry.id, vendor: vendorOf(entry.id) }));
  const statusChanges = quarterEntries.flatMap((entry): Retirement[] => {
    if (entry.kind !== 'Metadata') return [];
    const match = STATUS.exec(entry.detail);
    return match
      ? [{ date: entry.date, id: entry.id, vendor: vendorOf(entry.id), from: match[1]!, to: match[2]! }]
      : [];
  });
  const retirements = statusChanges.filter((change) => change.to === 'deprecated' || change.to === 'legacy');
  const restored = statusChanges.filter((change) => change.to === 'current');

  // Vendors: every vendor with a price row, an addition or a retirement this quarter.
  const vendors = new Map<string, VendorTally & { modelSet: Set<string> }>();
  const vendor = (name: string): VendorTally & { modelSet: Set<string> } => {
    let row = vendors.get(name);
    if (!row) {
      row = {
        vendor: name,
        priceRows: 0,
        models: 0,
        increases: 0,
        cuts: 0,
        added: 0,
        retired: 0,
        modelSet: new Set(),
      };
      vendors.set(name, row);
    }
    return row;
  };
  for (const move of priceMoves) {
    const row = vendor(vendorOf(move.id));
    row.priceRows += 1;
    row.modelSet.add(move.id);
    if (move.change > 0) row.increases += 1;
    if (move.change < 0) row.cuts += 1;
  }
  for (const item of added) vendor(item.vendor).added += 1;
  for (const item of retirements) vendor(item.vendor).retired += 1;
  const vendorRows = [...vendors.values()]
    .map(({ modelSet, ...row }) => ({ ...row, models: modelSet.size }))
    .sort((a, b) => b.priceRows - a.priceRows || b.added - a.added || a.vendor.localeCompare(b.vendor));

  // Introductory prices: the latest `until` the log recorded for each model, plus the catalog's own.
  const dates = logDates(text);
  const logThrough = [...dates, ...entries.map((entry) => entry.date)].reduce((a, b) => (b > a ? b : a), '');
  const introUntil = new Map<string, Set<string>>();
  const remember = (id: string, until: string): void => {
    if (!DATE.test(until) || until < quarter.start || until > quarter.end) return;
    const set = introUntil.get(id) ?? new Set<string>();
    set.add(until);
    introUntil.set(id, set);
  };
  for (const entry of entries.filter((e) => e.date <= quarter.end)) {
    const match = INTRO_UNTIL.exec(entry.detail);
    if (match) {
      remember(entry.id, match[1]!);
      remember(entry.id, match[2]!);
    }
  }
  const fromLog = new Set([...introUntil].flatMap(([id, set]) => [...set].map((until) => `${id} ${until}`)));
  const fromCatalog = new Set<string>();
  for (const model of catalog.models) {
    const until = model.pricing.intro?.until;
    if (until) {
      remember(model.id, until);
      fromCatalog.add(`${model.id} ${until}`);
    }
  }
  const introExpiries: IntroExpiry[] = [...introUntil]
    .flatMap(([id, set]) =>
      [...set].map((until): IntroExpiry => {
        const key = `${id} ${until}`;
        return {
          id,
          vendor: vendorOf(id),
          until,
          state: until < logThrough ? 'expired' : 'scheduled',
          source: fromLog.has(key) && fromCatalog.has(key) ? 'both' : fromLog.has(key) ? 'log' : 'catalog',
        };
      }),
    )
    .sort((a, b) => a.until.localeCompare(b.until) || a.id.localeCompare(b.id));

  const reviewFlags = quarterEntries.filter(
    (entry) => entry.kind === 'Review' && entry.detail.startsWith('provenance.needsReview:'),
  );
  const raisedFlags = reviewFlags.filter((entry) => /→ true$/.test(entry.detail));
  const openModels = catalog.models
    .filter((model) => model.provenance?.needsReview === true)
    .map((model) => model.id);

  const priceDays = new Set(priceMoves.map((move) => move.date));
  const annotatedDays = parseNotes(text).filter((note) => inQuarter(note) && priceDays.has(note.date));

  return {
    quarter,
    months,
    byKind,
    entries: quarterEntries.length,
    priceMoves,
    increases: increases.length,
    cuts: cuts.length,
    pricedModels,
    modelsUp: direction(1),
    modelsDown: direction(-1),
    modelsMixed: [...directions.values()].filter((set) => set.size > 1).length,
    medianChange: median(priceMoves.map((move) => Math.abs(move.change))),
    medianIncrease: median(increases.map((move) => move.change)),
    medianCut: median(cuts.map((move) => move.change)),
    vendors: vendorRows,
    added,
    retirements,
    restored,
    introExpiries,
    disputes: {
      raised: raisedFlags.length,
      cleared: reviewFlags.length - raisedFlags.length,
      modelsRaised: [...new Set(raisedFlags.map((entry) => entry.id))],
      openNow: openModels.length,
      openModels,
      snapshotAt: catalog.generatedAt,
    },
    annotatedDays,
    logThrough,
    quarterIsComplete: logThrough >= quarter.next,
  };
}

export function percent(change: number | null): string {
  if (change === null) return 'n/a';
  const rounded = Math.round(change * 100);
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)}%`;
}

function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

function status(tally: QuarterTally): string {
  return tally.quarterIsComplete
    ? `The log runs through ${tally.logThrough}, so ${tally.quarter.name} is complete.`
    : `**The log only runs through ${tally.logThrough}, so ${tally.quarter.name} is not complete and every figure below is partial.** Run this again after the sync on ${tally.quarter.next}.`;
}

/** The tally as Markdown, with the previous quarter in brackets, to read while writing the report. */
export function formatQuarterTally(current: QuarterTally, previous: QuarterTally): string {
  const lines: string[] = [
    `# Tally for ${current.quarter.name} (${current.quarter.start} to ${current.quarter.end})`,
    '',
    status(current),
    '',
  ];
  lines.push(`## Entries by kind (${previous.quarter.name} in brackets)`, '');
  for (const kind of Object.keys(current.byKind))
    lines.push(`- ${kind}: ${current.byKind[kind]} (${previous.byKind[kind] ?? 0})`);
  lines.push(`- Total: ${current.entries} (${previous.entries})`, '');
  lines.push('## By month', '');
  for (const month of current.months) {
    const total = Object.values(month.byKind).reduce((sum, n) => sum + n, 0);
    lines.push(
      `- ${month.month}: ${total} entries, ${month.byKind.Price ?? 0} price rows across ${month.pricedModels.length} models, ${month.added.length} added`,
    );
  }
  lines.push('');
  lines.push(
    `## Rate changes: ${current.priceMoves.length} across ${current.pricedModels.length} models (${previous.priceMoves.length} across ${previous.pricedModels.length})`,
    '',
    `- Of ${current.byKind.Price ?? 0} Price rows in the log (${previous.byKind.Price ?? 0}), ${current.priceMoves.length} moved a rate; the rest set a field for the first time.`,
    `- Increases: ${current.increases} (${previous.increases}); cuts: ${current.cuts} (${previous.cuts})`,
    `- Models only up: ${current.modelsUp}; only down: ${current.modelsDown}; both: ${current.modelsMixed}`,
    `- Median size of a change: ${percent(current.medianChange)} (${percent(previous.medianChange)}); median increase ${percent(current.medianIncrease)}, median cut ${percent(current.medianCut)}`,
    '',
  );
  const byMagnitude = [...current.priceMoves].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  for (const move of byMagnitude)
    lines.push(
      `- ${move.date} \`${move.id}\` ${move.field}: ${move.from} → ${move.to} (${percent(move.change)})`,
    );
  if (byMagnitude.length === 0) lines.push('- No rate moved.');
  lines.push('', '_Check each large move against the vendor’s own page before calling it a repricing._', '');
  if (current.annotatedDays.length > 0) {
    lines.push('## Days the log annotated (read before counting their rows as vendor changes)', '');
    for (const day of current.annotatedDays) lines.push(`- ${day.date}: ${day.note}`);
    lines.push('');
  }
  lines.push('## By vendor', '');
  for (const row of current.vendors) {
    lines.push(
      `- ${row.vendor}: ${plural(row.priceRows, 'price row')} on ${plural(row.models, 'model')} (${row.increases} up, ${row.cuts} down); ${row.added} added; ${row.retired} retired`,
    );
  }
  if (current.vendors.length === 0) lines.push('- No vendor activity.');
  lines.push('', `## Added: ${current.added.length} (${previous.added.length})`, '');
  for (const item of current.added) lines.push(`- ${item.date} \`${item.id}\` (${item.vendor})`);
  if (current.added.length === 0) lines.push('- None.');
  lines.push('', `## Retired: ${current.retirements.length} (${previous.retirements.length})`, '');
  for (const item of current.retirements)
    lines.push(`- ${item.date} \`${item.id}\` (${item.vendor}): ${item.from} → ${item.to}`);
  if (current.retirements.length === 0) lines.push('- None.');
  for (const item of current.restored)
    lines.push(`- Restored ${item.date}: \`${item.id}\` ${item.from} → ${item.to}`);
  lines.push(
    '',
    `## Introductory prices ending in ${current.quarter.name}: ${current.introExpiries.length}`,
    '',
  );
  for (const item of current.introExpiries)
    lines.push(
      `- ${item.until} \`${item.id}\` (${item.vendor}): ${item.state}, from the ${item.source === 'both' ? 'log and catalog' : item.source}`,
    );
  if (current.introExpiries.length === 0) lines.push('- None.');
  lines.push(
    '',
    '## Disputed prices',
    '',
    `- Flags raised: ${current.disputes.raised} on ${plural(current.disputes.modelsRaised.length, 'model')} (${previous.disputes.raised}); cleared: ${current.disputes.cleared} (${previous.disputes.cleared})`,
    `- Open in the catalog snapshot of ${current.disputes.snapshotAt}: ${current.disputes.openNow}${current.disputes.openModels.length ? ` (${current.disputes.openModels.map((id) => `\`${id}\``).join(', ')})` : ''}`,
    '- For the published figure, read the live count: `curl -s https://promptspend.dev/v1/health`',
  );
  return `${lines.join('\n')}\n`;
}

export function reportSlug(quarter: Quarter): string {
  return `${quarter.id.toLowerCase()}-state-of-llm-pricing`;
}

/**
 * A draft of the report as a writing page: the front matter
 * `scripts/build-pages.ts` requires, every figure filled in, and a **TODO**
 * wherever a person has to read the log and write the sentence. Uses only the
 * Markdown `src/lib/seo/prose.ts` renders: headings, paragraphs, one-line list
 * items, bold, code and https links.
 */
export function formatReportDraft(tally: QuarterTally, previous: QuarterTally, today: string): string {
  const { quarter } = tally;
  const topVendors = tally.vendors
    .filter((row) => row.priceRows > 0)
    .slice(0, 3)
    .map((row) => row.vendor);
  const description = `Every LLM price change PromptSpend recorded in ${quarter.name}: ${plural(tally.priceMoves.length, 'rate change')} across ${plural(tally.pricedModels.length, 'model')}, ${tally.increases} up and ${tally.cuts} down, ${tally.added.length} new models and ${tally.retirements.length} retirements.`;
  const lines: string[] = [
    '---',
    `slug: ${reportSlug(quarter)}`,
    `title: State of LLM Pricing, ${quarter.name}`,
    `description: ${description}`,
    `published: ${today}`,
    '---',
    '',
  ];
  if (!tally.quarterIsComplete) {
    lines.push(
      `**DRAFT FROM A PARTIAL QUARTER.** The log ran only through ${tally.logThrough}. Regenerate after the sync on ${quarter.next} and delete this paragraph and every TODO before publishing.`,
      '',
    );
  }
  lines.push(
    `PromptSpend's quarterly look at what LLM APIs cost, and what changed, from ${quarter.start} to ${quarter.end}. Every figure here is counted from [\`docs/pricing-changelog.md\`](https://github.com/AndrewAvery7/promptspend/blob/main/docs/pricing-changelog.md), the append-only log our daily sync writes every time it touches a price, a model, or a provenance field. The monthly [Price Movement Reports](https://promptspend.com/writing/) cover the same ground month by month; this one adds the totals only a quarter of the log can show.`,
    '',
    '**TODO:** one paragraph on what the quarter was like, in plain words. Lead with the largest confirmed move.',
    '',
    '## The quarter in numbers',
    '',
    `- Rate changes: **${tally.priceMoves.length}** across ${plural(tally.pricedModels.length, 'model')} (${previous.priceMoves.length} across ${previous.pricedModels.length} in ${previous.quarter.name})`,
    `- Increases: **${tally.increases}**; cuts: **${tally.cuts}**`,
    `- Median size of a change: **${percent(tally.medianChange)}** (median increase ${percent(tally.medianIncrease)}, median cut ${percent(tally.medianCut)})`,
    `- New models: **${tally.added.length}** (${previous.added.length} in ${previous.quarter.name})`,
    `- Retired: **${tally.retirements.length}** (${tally.retirements.filter((r) => r.to === 'deprecated').length} archived, ${tally.retirements.filter((r) => r.to === 'legacy').length} moved to legacy)`,
    `- Introductory prices ending this quarter: **${tally.introExpiries.length}**`,
    `- Disputed-price flags raised: **${tally.disputes.raised}**, cleared: **${tally.disputes.cleared}**`,
    `- Changelog entries: **${tally.entries}** (${previous.entries} in ${previous.quarter.name})`,
    '',
    '## Who changed prices',
    '',
  );
  const priced = tally.vendors.filter((row) => row.priceRows > 0);
  for (const row of priced)
    lines.push(
      `- ${row.vendor}: ${plural(row.priceRows, 'rate change')} on ${plural(row.models, 'model')}, ${row.increases} up and ${row.cuts} down`,
    );
  if (priced.length === 0) lines.push('- No vendor changed a price.');
  lines.push(
    '',
    `**TODO:** what ${topVendors.length ? topVendors.join(', ') : 'the vendors'} actually did, confirmed against each vendor's own pricing page. A row the log annotated may be a catalog correction, not a vendor repricing.`,
    '',
  );
  lines.push('## The largest moves', '');
  const top = [...tally.priceMoves].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5);
  for (const move of top)
    lines.push(
      `- ${move.date}: \`${move.id}\` ${move.field} $${move.from} → $${move.to} per million tokens (**${percent(move.change)}**)`,
    );
  if (top.length === 0) lines.push('- No rate moved.');
  lines.push(
    '',
    '**TODO:** for each, say whether the vendor changed its price or the catalog caught up with it.',
    '',
  );
  lines.push('## New models', '');
  const addedByVendor = new Map<string, number>();
  for (const item of tally.added) addedByVendor.set(item.vendor, (addedByVendor.get(item.vendor) ?? 0) + 1);
  for (const [name, count] of [...addedByVendor].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
    lines.push(`- ${name}: ${count}`);
  if (addedByVendor.size === 0) lines.push('- None.');
  lines.push('', '## Retirements', '');
  for (const item of tally.retirements)
    lines.push(
      `- ${item.date}: \`${item.id}\` (${item.vendor}) ${item.to === 'deprecated' ? 'archived as retired' : 'moved to legacy'}`,
    );
  if (tally.retirements.length === 0) lines.push('- None.');
  lines.push(
    '',
    '"Legacy" means a model is no longer offered as current upstream; "archived" means its vendor shut it down. The catalog keeps both pages and their price history.',
    '',
    '## Introductory prices that ran out',
    '',
  );
  for (const item of tally.introExpiries)
    lines.push(
      `- \`${item.id}\` (${item.vendor}): introductory rate ${item.state === 'expired' ? 'ended' : 'ends'} ${item.until}`,
    );
  if (tally.introExpiries.length === 0) lines.push('- None.');
  lines.push(
    '',
    '**TODO:** for each, say what the rate stepped up to, or whether the vendor made the introductory price permanent.',
    '',
    "## What's still disputed",
    '',
    `During the quarter the sync raised **${tally.disputes.raised}** disputed-price flags on ${plural(tally.disputes.modelsRaised.length, 'model')} and cleared **${tally.disputes.cleared}**. A flag means two sources disagree, not that either is necessarily wrong. As of this report, the open count from our own health endpoint is **TODO**:`,
    '',
    '```bash',
    'curl -s https://promptspend.dev/v1/health',
    '```',
    '',
    '## How we counted',
    '',
    `One rate change is one row in the log: a model's input, output, cached-input or cache-write rate moving from one figure to another. The median is taken over those rows, ignoring direction. New models, retirements and flags are counted the same way, by the label the sync gave each row. The counts come from \`npx tsx scripts/quarterly-report-tally.ts ${quarter.id}\`, which anyone with a checkout can run.`,
    '',
  );
  return `${lines.join('\n')}`;
}
