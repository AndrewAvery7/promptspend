/**
 * Daily free-tier check — is each vendor still saying what we quote it as saying?
 *
 *   data/free-tiers.json -> group facts by source page -> read each page once
 *   -> look for every quote -> write public/data/free-tier-check.json
 *
 * Run by .github/workflows/sync-pricing.yml every morning, beside the vendor
 * price check. The pages read the report: a quote that has gone from its source
 * is shown as "under review" on the site, with the date it disappeared.
 *
 * It never edits a fact and never fails the morning. A missing quote is a
 * reason for a person to re-read the page — the vendor may have reworded a
 * sentence, or changed the terms — and deciding which is not a job for a script.
 * A page that cannot be read changes nothing: "could not read" is recorded as
 * such, and the last confirmation stands.
 *
 *   npm run check:free-tiers               # read pages, write the report
 *   npm run check:free-tiers -- --dry-run  # read and compare, write nothing
 *   npm run check:free-tiers -- --only mistral
 *
 * Reading order per page: the copy we read by hand (`readUrl`, often a
 * Markdown twin) by plain fetch; then, for any quote not found, the human page
 * rendered by Firecrawl when FIRECRAWL_API_KEY is set — some vendor pages
 * (DeepSeek's FAQ, for one) are drawn entirely by JavaScript.
 */
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertFreeTiers, type FreeTierFact } from '../src/lib/free-tiers/types';
import { htmlText, pageContainsQuote } from '../src/lib/free-tiers/quote';
import { nextFactCheck, parseCheckReport, type FreeTierCheckReport } from '../src/lib/free-tiers/check';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FACTS_PATH = resolve(ROOT, 'data/free-tiers.json');
const REPORT_PATH = resolve(ROOT, 'public/data/free-tier-check.json');
const FIRECRAWL_URL = 'https://api.firecrawl.dev/v2/scrape';
const TIMEOUT_MS = 60_000;
const USER_AGENT = 'promptspend-free-tier-check (+https://promptspend.com/free-tiers/)';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyIndex = args.indexOf('--only');
const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** The page as text, or undefined if it could not be read. */
/**
 * Markdown first, then anything. Vendors disagree about the `Accept` header in
 * both directions: Moonshot's docs serve their rate-limit table only in the
 * Markdown they return when asked for it (the HTML builds it in a script), and
 * docs.x.ai answers a `.md` request that names its types with a 404 but serves
 * the same file to `*\/*`.
 */
const ACCEPTS = ['text/markdown, text/plain, text/html;q=0.9', '*/*'];

async function plainRead(url: string): Promise<string | undefined> {
  for (const accept of ACCEPTS) {
    try {
      const response = await fetchWithTimeout(url, { headers: { 'user-agent': USER_AGENT, accept } });
      if (!response.ok) continue;
      const body = await response.text();
      const type = response.headers.get('content-type') ?? '';
      const text = /html/.test(type) || /^\s*<(!doctype|html)/i.test(body) ? htmlText(body) : body;
      if (text.trim().length >= 200) return text;
    } catch {
      // try the next Accept, then give up: an unreadable page is "unread", never "missing"
    }
  }
  return undefined;
}

let firecrawlDisabled = !process.env.FIRECRAWL_API_KEY;

async function renderedRead(url: string): Promise<string | undefined> {
  if (firecrawlDisabled) return undefined;
  try {
    const response = await fetchWithTimeout(FIRECRAWL_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      },
      // The whole page, not "main content": terms often sit in tables, FAQs
      // and footnotes that a main-content filter throws away.
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: false, waitFor: 3000 }),
    });
    if (response.status === 401 || response.status === 403) {
      firecrawlDisabled = true;
      console.warn(
        `::warning::Firecrawl rejected the key (${response.status}); reading without it for the rest of this run.`,
      );
      return undefined;
    }
    if (!response.ok) return undefined;
    const payload = (await response.json()) as { success?: boolean; data?: { markdown?: string } };
    const markdown = payload.data?.markdown;
    return payload.success && typeof markdown === 'string' && markdown.trim() !== '' ? markdown : undefined;
  } catch {
    return undefined;
  }
}

/**
 * For each fact on one source: true found, false absent, null not established.
 *
 * Only the rendered page can prove a quote absent. A plain fetch that lacks the
 * words proves nothing on its own — several vendor pages (OpenAI's model pages,
 * Moonshot's limits in HTML) draw the very table we quote with JavaScript — so
 * a plain miss stays undecided until Firecrawl has rendered the page too. If it
 * cannot, the fact is "unread" today rather than raised as gone: a false alarm
 * would put "under review" on a page that is perfectly right.
 */
async function checkSource(readUrl: string, facts: FreeTierFact[]): Promise<Map<string, boolean | null>> {
  const results = new Map<string, boolean | null>();
  const first = await plainRead(readUrl);
  for (const fact of facts)
    results.set(fact.id, first !== undefined && pageContainsQuote(first, fact.quote) ? true : null);

  const unresolved = facts.filter((fact) => results.get(fact.id) !== true);
  if (unresolved.length === 0) return results;

  // A second reading, rendered, of the page a person would open. Different
  // facts on one `readUrl` share a `url` in practice, but group to be safe.
  const byUrl = new Map<string, FreeTierFact[]>();
  for (const fact of unresolved) byUrl.set(fact.url, [...(byUrl.get(fact.url) ?? []), fact]);
  for (const [url, group] of byUrl) {
    const second = await renderedRead(url);
    if (second === undefined) continue;
    for (const fact of group) results.set(fact.id, pageContainsQuote(second, fact.quote));
  }
  return results;
}

async function main(): Promise<void> {
  const raw: unknown = JSON.parse(await readFile(FACTS_PATH, 'utf8'));
  assertFreeTiers(raw);
  const previous: FreeTierCheckReport = existsSync(REPORT_PATH)
    ? parseCheckReport(JSON.parse(await readFile(REPORT_PATH, 'utf8')))
    : { checkedAt: null, facts: {} };
  const today = new Date().toISOString().slice(0, 10);

  const facts = Object.values(raw.providers)
    .flatMap((record) => record.facts)
    .filter((fact) => !only || fact.id.includes(only) || fact.url.includes(only));
  const bySource = new Map<string, FreeTierFact[]>();
  for (const fact of facts) {
    const source = fact.readUrl ?? fact.url;
    bySource.set(source, [...(bySource.get(source) ?? []), fact]);
  }

  const next: FreeTierCheckReport = { checkedAt: new Date().toISOString(), facts: { ...previous.facts } };
  // Drop entries for facts that no longer exist, so the report cannot grow forever.
  const allIds = new Set(
    Object.values(raw.providers).flatMap((record) => record.facts.map((fact) => fact.id)),
  );
  for (const id of Object.keys(next.facts)) if (!allIds.has(id)) delete next.facts[id];

  const counts = { confirmed: 0, missing: 0, unread: 0 };
  const missing: FreeTierFact[] = [];
  for (const [source, group] of bySource) {
    const results = await checkSource(source, group);
    for (const fact of group) {
      const found = results.get(fact.id) ?? null;
      const entry = nextFactCheck(previous.facts[fact.id], fact.readOn, found, today);
      next.facts[fact.id] = entry;
      counts[entry.status] += 1;
      if (entry.status === 'missing') missing.push(fact);
    }
    console.log(
      `  ${source}: ${group.map((fact) => `${fact.id}=${String(results.get(fact.id) ?? 'unread')}`).join(', ')}`,
    );
  }

  const sorted: FreeTierCheckReport = {
    checkedAt: next.checkedAt,
    facts: Object.fromEntries(Object.entries(next.facts).sort(([a], [b]) => a.localeCompare(b))),
  };

  const lines = [
    `Free-tier check: ${facts.length} facts on ${bySource.size} pages — ${counts.confirmed} confirmed, ${counts.missing} missing, ${counts.unread} unreadable today.`,
    ...missing.map((fact) => `- MISSING ${fact.id}: "${fact.quote}" no longer found at ${fact.url}`),
  ];
  for (const line of lines) console.log(line);
  for (const fact of missing) {
    console.log(
      `::warning title=Free-tier wording changed::${fact.id} — quote no longer found at ${fact.url}`,
    );
  }
  // Facts that went missing this morning, for the workflow to raise once.
  const newlyMissing = missing.filter((fact) => sorted.facts[fact.id]?.changedOn === today);
  if (process.env.GITHUB_OUTPUT && !dryRun && !only) {
    const list = newlyMissing.map((fact) => `- \`${fact.id}\` at ${fact.url}`).join(' ');
    await appendFile(process.env.GITHUB_OUTPUT, `newly_missing=${list}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Free-tier check\n\n${lines.join('\n')}\n`);
  }

  if (dryRun || only) {
    console.log(
      dryRun ? '(dry run: report not written)' : '(--only: report not written, it would be partial)',
    );
    return;
  }
  await writeFile(REPORT_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`✓ wrote ${REPORT_PATH}`);
}

main().catch((cause: unknown) => {
  // Never fail the morning over this check: the price sync after it matters more.
  console.log(
    `::warning::free-tier check did not complete: ${cause instanceof Error ? cause.message : String(cause)}`,
  );
});
