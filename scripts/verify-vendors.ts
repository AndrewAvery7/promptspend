/**
 * Daily vendor-page check — rung 1 upkeep.
 *
 *   overrides -> group by page -> read each page -> extract the listed prices
 *   -> compare with the record -> refresh `lastVerified` where the page agrees
 *   -> write the report the sync consumes
 *
 * Run by .github/workflows/sync-pricing.yml every morning, before the sync,
 * so the catalog it publishes carries today's confirmations and today's
 * disagreements.
 *
 * The check never writes a price and never fails the morning: a page that
 * cannot be read leaves its rows exactly as they were, and the 30-day
 * staleness rule in merge.ts remains the backstop for a page that stays
 * unreadable. What it does do is make the vendor's own page the thing that
 * moves a hand-verified date — every day, for every row, instead of whenever
 * somebody remembered.
 *
 *   npm run verify:vendors              # read pages, refresh dates, write report
 *   npm run verify:vendors -- --dry-run # read and compare, write nothing
 *   npm run verify:vendors -- --only kimi   # pages/ids containing "kimi"
 *
 * Environment:
 *   ANTHROPIC_API_KEY   required; without it the check is skipped, not failed
 *   FIRECRAWL_API_KEY   optional; renders JavaScript-heavy pages. Without it a
 *                       plain fetch is used, which only serves server-rendered
 *                       pages faithfully.
 *   VENDOR_CHECK_MODEL  the reading model; defaults to claude-opus-5
 */
import Anthropic from '@anthropic-ai/sdk';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Model, PricingCatalog } from '../src/lib/pricing/types';
import type { Override } from './lib/normalize';
import {
  buildExtractionPrompt,
  buildReport,
  checkableRows,
  compareGroup,
  DEFAULT_EXTRACTION_MODEL,
  EXTRACTION_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
  groupByPage,
  htmlToText,
  parsePageExtraction,
  unreadPage,
  applyConfirmations,
  type Checkable,
  type PageExtraction,
  type VendorCheckItem,
  type VendorPageReport,
} from './lib/vendor-check';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OVERRIDES_PATH = resolve(ROOT, 'data/pricing-overrides.json');
const CATALOG_PATH = resolve(ROOT, 'public/data/pricing.json');
const REPORT_PATH = resolve(ROOT, 'public/data/vendor-check.json');

const FIRECRAWL_URL = 'https://api.firecrawl.dev/v2/scrape';
const FETCH_TIMEOUT_MS = 60_000;
/** Above this a page is not a pricing page; refuse rather than read a fragment. */
const MAX_PAGE_CHARS = 600_000;

interface Args {
  dryRun: boolean;
  only?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--only') args.only = argv[++i];
  }
  return args;
}

async function readJson<T>(path: string): Promise<T | undefined> {
  if (!existsSync(path)) return undefined;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** The page as text: rendered by Firecrawl when a key is present, else fetched plain. */
async function readPage(url: string): Promise<{ text: string; via: 'firecrawl' | 'fetch' }> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (firecrawlKey) {
    const response = await fetchWithTimeout(FIRECRAWL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, waitFor: 2000 }),
    });
    if (!response.ok) throw new Error(`Firecrawl responded ${response.status}`);
    const payload = (await response.json()) as {
      success?: boolean;
      data?: { markdown?: string };
      error?: string;
    };
    const markdown = payload.data?.markdown;
    if (!payload.success || typeof markdown !== 'string' || markdown.trim() === '') {
      throw new Error(`Firecrawl returned no markdown${payload.error ? ` (${payload.error})` : ''}`);
    }
    return { text: markdown, via: 'firecrawl' };
  }

  const response = await fetchWithTimeout(url, {
    headers: { 'user-agent': 'promptspend-vendor-check', accept: 'text/html,application/xhtml+xml' },
  });
  if (!response.ok) throw new Error(`page responded ${response.status}`);
  const text = htmlToText(await response.text());
  if (text.length < 200) throw new Error('page returned almost no text — probably rendered by JavaScript');
  return { text, via: 'fetch' };
}

/** One structured reading of one page. Nothing about the record goes in. */
async function extractPrices(
  client: Anthropic,
  model: string,
  url: string,
  rows: Checkable[],
  pageText: string,
): Promise<PageExtraction> {
  const stream = client.messages.stream({
    model,
    max_tokens: 16_000,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildExtractionPrompt(url, rows, pageText) }],
    output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new Error(
      `the reading was refused${message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : ''}`,
    );
  }
  if (message.stop_reason === 'max_tokens') throw new Error('the reading was cut off at max_tokens');
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return parsePageExtraction(JSON.parse(text));
}

async function writeOutputs(lines: string[]): Promise<void> {
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) await appendFile(githubOutput, `${lines.join('\n')}\n`, 'utf8');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const checkedAt = new Date();
  const isoDate = checkedAt.toISOString().slice(0, 10);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY is not set — skipping the vendor-page check. Nothing changes.');
    await writeOutputs(['vendor_check=skipped']);
    return;
  }
  const model = process.env.VENDOR_CHECK_MODEL || DEFAULT_EXTRACTION_MODEL;
  const client = new Anthropic();

  const overridesFile = (await readJson<{ models: Override[]; [key: string]: unknown }>(OVERRIDES_PATH))!;
  const catalog = await readJson<PricingCatalog>(CATALOG_PATH);
  const published = new Map<string, Model['pricing']>((catalog?.models ?? []).map((m) => [m.id, m.pricing]));

  let rows = checkableRows(overridesFile.models, published);
  if (args.only) {
    const needle = args.only.toLowerCase();
    rows = rows.filter(
      (row) => row.url.toLowerCase().includes(needle) || row.override.id.toLowerCase().includes(needle),
    );
  }
  const pages = groupByPage(rows);
  console.log(`→ ${rows.length} hand-verified row(s) across ${pages.size} vendor page(s), read by ${model}`);
  console.log(
    `  pages via ${process.env.FIRECRAWL_API_KEY ? 'Firecrawl' : 'plain fetch (set FIRECRAWL_API_KEY for rendered pages)'}`,
  );

  const pageReports: VendorPageReport[] = [];
  const items: VendorCheckItem[] = [];

  for (const [url, group] of pages) {
    const modelIds = group.map((row) => row.override.id);
    process.stdout.write(`\n${url}\n`);
    try {
      const page = await readPage(url);
      if (page.text.length > MAX_PAGE_CHARS) {
        throw new Error(`page is ${page.text.length} characters — too large to be a pricing page`);
      }
      const extraction = await extractPrices(client, model, url, group, page.text);
      const compared = compareGroup(group, extraction, checkedAt);
      items.push(...compared);
      pageReports.push({ url, ok: true, note: `${page.text.length} chars via ${page.via}`, modelIds });
      for (const item of compared) console.log(`  ${label(item.status)} ${item.id}: ${item.detail}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`  ! could not check this page: ${reason}`);
      items.push(...unreadPage(group, reason));
      pageReports.push({ url, ok: false, note: reason, modelIds });
    }
  }

  const report = buildReport(checkedAt, model, pageReports, items);
  const { overrides, bumped } = applyConfirmations(overridesFile.models, items, isoDate);

  console.log(
    `\n→ ${report.confirmed} confirmed, ${report.mismatched} mismatched, ${report.unconfirmed} unconfirmed; ` +
      `${bumped.length} date(s) move to ${isoDate}`,
  );
  const mismatches = items.filter((item) => item.status === 'mismatch');
  if (mismatches.length > 0) {
    console.log('\n⚠ the vendor page disagrees with the record — a human decides which is right:');
    for (const item of mismatches) console.log(`   ${item.id}: ${item.detail}`);
  }

  if (args.dryRun) {
    console.log('\n(dry run — nothing written)');
    return;
  }

  if (bumped.length > 0) {
    await writeFile(
      OVERRIDES_PATH,
      `${JSON.stringify({ ...overridesFile, models: overrides }, null, 2)}\n`,
      'utf8',
    );
  }
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(
    `✓ wrote ${REPORT_PATH}${bumped.length > 0 ? ` and refreshed ${bumped.length} date(s) in ${OVERRIDES_PATH}` : ''}`,
  );

  const unreadable = pageReports.filter((page) => !page.ok).length;
  await writeOutputs([
    `vendor_check=${unreadable === pageReports.length && pageReports.length > 0 ? 'failed' : 'ok'}`,
    `vendor_confirmed=${report.confirmed}`,
    `vendor_mismatched=${report.mismatched}`,
    `vendor_unconfirmed=${report.unconfirmed}`,
    `vendor_mismatch_list=${
      mismatches
        .map((item) => `${item.id} (${item.detail})`)
        .join('; ')
        .replace(/\s+/g, ' ')
        .slice(0, 900) || 'none'
    }`,
  ]);
  if (unreadable > 0) {
    console.log(
      `::warning::${unreadable} of ${pageReports.length} vendor page(s) could not be read; their rows keep their dates.`,
    );
  }
}

function label(status: VendorCheckItem['status']): string {
  return status === 'confirmed' ? '✓' : status === 'mismatch' ? '✗' : '·';
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
