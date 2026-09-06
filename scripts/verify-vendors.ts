/**
 * Daily vendor-page check — rung 1 upkeep.
 *
 *   overrides -> group by page -> read each page -> transcribe the listed prices
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
 * Environment — the reader is whichever key is present, in this order:
 *   DEEPSEEK_API_KEY    DeepSeek, OpenAI-style chat completions in JSON mode.
 *                       The default: this is a transcription job, and DeepSeek
 *                       does it for a fraction of the cost.
 *   ANTHROPIC_API_KEY   Anthropic, structured output (schema-enforced JSON).
 *                       The fallback: used when no DeepSeek key is set, or
 *                       for the rest of the morning once DeepSeek refuses its.
 *   Neither             the check is skipped, not failed.
 *   VENDOR_CHECK_MODEL  overrides the reader's model id (deepseek-v4-flash /
 *                       claude-opus-5 by default).
 *   FIRECRAWL_API_KEY   optional; renders JavaScript-heavy pages. Without it a
 *                       plain fetch is used, which only serves server-rendered
 *                       pages faithfully.
 */
import Anthropic from '@anthropic-ai/sdk';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Model, PricingCatalog } from '../src/lib/pricing/types';
import type { Override } from './lib/normalize';
import {
  applyConfirmations,
  buildChatCompletionRequest,
  buildExtractionPrompt,
  buildReport,
  chatCompletionText,
  checkableRows,
  compareGroup,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_DEEPSEEK_MODEL,
  EXTRACTION_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
  groupByPage,
  htmlToText,
  parseJsonReply,
  parsePageExtraction,
  unreadPage,
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
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const PAGE_FETCH_TIMEOUT_MS = 60_000;
/** A long pricing page is a long prompt; give the reader room. */
const READER_TIMEOUT_MS = 180_000;
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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Set once Firecrawl has refused the key, so a bad secret is reported once
 *  and the rest of the morning reads the pages the other way. */
let firecrawlRejected: string | undefined;

/** The page as text: rendered by Firecrawl when a key works, else the page's
 *  markdown variant, else fetched plain. A Firecrawl failure is a reason to
 *  read the page another way, not a reason to leave its rows unread — the
 *  first live run with a stale key turned every page into "unconfirmed". */
async function readPage(url: string): Promise<{ text: string; via: 'firecrawl' | 'markdown' | 'fetch' }> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (firecrawlKey && !firecrawlRejected) {
    try {
      return { text: await renderWithFirecrawl(url, firecrawlKey), via: 'firecrawl' };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (/responded (401|403)/.test(reason)) {
        firecrawlRejected = reason;
        console.warn(
          `::warning::Firecrawl rejected the key (${reason}) — check FIRECRAWL_API_KEY. Reading every page without it.`,
        );
      } else {
        console.warn(`  · Firecrawl could not render this page (${reason}) — reading it another way`);
      }
    }
  }

  // Several vendors' docs (OpenAI, Anthropic among them) serve the page as
  // markdown at `<url>.md` — the whole table, including rows the rendered
  // page hides behind an expander that a plain fetch never opens. Worth one
  // extra request before settling for HTML.
  const markdown = await fetchMarkdownVariant(url);
  if (markdown) return { text: markdown, via: 'markdown' };

  const response = await fetchWithTimeout(
    url,
    { headers: { 'user-agent': 'promptspend-vendor-check', accept: 'text/html,application/xhtml+xml' } },
    PAGE_FETCH_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(`page responded ${response.status}`);
  const text = htmlToText(await response.text());
  if (text.length < 200) throw new Error('page returned almost no text — probably rendered by JavaScript');
  return { text, via: 'fetch' };
}

async function renderWithFirecrawl(url: string, apiKey: string): Promise<string> {
  const response = await fetchWithTimeout(
    FIRECRAWL_URL,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, waitFor: 2000 }),
    },
    PAGE_FETCH_TIMEOUT_MS,
  );
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
  return markdown;
}

async function fetchMarkdownVariant(url: string): Promise<string | undefined> {
  try {
    const response = await fetchWithTimeout(
      `${url}.md`,
      { headers: { 'user-agent': 'promptspend-vendor-check', accept: 'text/markdown, text/plain' } },
      PAGE_FETCH_TIMEOUT_MS,
    );
    if (!response.ok) return undefined;
    const body = await response.text();
    const type = response.headers.get('content-type') ?? '';
    // Some hosts answer the `.md` path with the ordinary HTML page.
    if (!type.includes('markdown') || /^\s*<(!doctype|html)/i.test(body)) return undefined;
    return body.trim().length >= 200 ? body : undefined;
  } catch {
    return undefined;
  }
}

/** One reading of one page. Nothing about the record goes in. */
interface Reader {
  /** Recorded in the report, so a reading can be traced to what produced it. */
  label: string;
  read(url: string, rows: Checkable[], pageText: string): Promise<PageExtraction>;
}

/** DeepSeek: JSON mode promises an object, not our shape, so the reply is
 *  validated and a failure earns one retry that quotes the problem back. */
function deepseekReader(apiKey: string, model: string): Reader {
  return {
    label: `deepseek/${model}`,
    async read(url, rows, pageText) {
      const userPrompt = buildExtractionPrompt(url, rows, pageText);
      let previousError: string | undefined;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetchWithTimeout(
          DEEPSEEK_URL,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(buildChatCompletionRequest(model, userPrompt, previousError)),
          },
          READER_TIMEOUT_MS,
        );
        if (!response.ok) {
          const body = (await response.text()).slice(0, 200).replace(/\s+/g, ' ');
          throw new Error(`DeepSeek responded ${response.status}${body ? ` (${body})` : ''}`);
        }
        try {
          return parsePageExtraction(parseJsonReply(chatCompletionText(await response.json())));
        } catch (error) {
          previousError = error instanceof Error ? error.message : String(error);
          if (attempt === 1) throw new Error(`the reading could not be used after a retry: ${previousError}`);
          console.warn(`  · reply could not be used (${previousError}) — asking once more`);
        }
      }
      // The loop above always returns or throws; this satisfies the type checker.
      throw new Error('unreachable');
    },
  };
}

/** Anthropic: the schema is enforced server-side, so the reply always parses. */
function anthropicReader(model: string): Reader {
  const client = new Anthropic();
  return {
    label: `anthropic/${model}`,
    async read(url, rows, pageText) {
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
    },
  };
}

/** Every reader with a key, in order of preference. `VENDOR_CHECK_MODEL`
 *  names a model for the first of them only — a model id is provider-specific. */
function chooseReaders(): Reader[] {
  const override = process.env.VENDOR_CHECK_MODEL;
  const readers: Reader[] = [];
  if (process.env.DEEPSEEK_API_KEY) {
    readers.push(deepseekReader(process.env.DEEPSEEK_API_KEY, override || DEFAULT_DEEPSEEK_MODEL));
  }
  if (process.env.ANTHROPIC_API_KEY) {
    readers.push(anthropicReader(readers.length === 0 && override ? override : DEFAULT_ANTHROPIC_MODEL));
  }
  return readers;
}

/** A reader whose key is refused is refused for the whole morning. */
function isKeyRejected(error: unknown): boolean {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError)
    return true;
  return error instanceof Error && /responded (401|403)\b/.test(error.message);
}

/** Read with the preferred reader; when it refuses the key, hand the rest of
 *  the morning to the next one rather than leave the pages unread. On the
 *  first live run a mistyped DeepSeek key produced 58 unconfirmed rows with a
 *  working Anthropic key sitting unused beside it. */
function readerChain(readers: Reader[]): { read: Reader['read']; active(): Reader } {
  let index = 0;
  return {
    active: () => readers[index]!,
    async read(url, rows, pageText) {
      for (;;) {
        const reader = readers[index]!;
        try {
          return await reader.read(url, rows, pageText);
        } catch (error) {
          if (!isKeyRejected(error) || index + 1 >= readers.length) throw error;
          const reason = error instanceof Error ? error.message : String(error);
          index += 1;
          console.warn(
            `::warning::${reader.label} rejected its key (${reason.slice(0, 160)}) — check the secret. Continuing with ${readers[index]!.label}.`,
          );
        }
      }
    },
  };
}

async function writeOutputs(lines: string[]): Promise<void> {
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) await appendFile(githubOutput, `${lines.join('\n')}\n`, 'utf8');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const checkedAt = new Date();
  const isoDate = checkedAt.toISOString().slice(0, 10);

  const readers = chooseReaders();
  if (readers.length === 0) {
    console.log(
      'Neither DEEPSEEK_API_KEY nor ANTHROPIC_API_KEY is set — skipping the vendor-page check. Nothing changes.',
    );
    await writeOutputs(['vendor_check=skipped']);
    return;
  }

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
  const chain = readerChain(readers);
  console.log(
    `→ ${rows.length} hand-verified row(s) across ${pages.size} vendor page(s), read by ${readers
      .map((reader) => reader.label)
      .join(', then ')}`,
  );
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
      const extraction = await chain.read(url, group, page.text);
      const compared = compareGroup(group, extraction, checkedAt);
      items.push(...compared);
      pageReports.push({
        url,
        ok: true,
        note: `${page.text.length} chars via ${page.via}, read by ${chain.active().label}`,
        modelIds,
      });
      for (const item of compared) console.log(`  ${label(item.status)} ${item.id}: ${item.detail}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`  ! could not check this page: ${reason}`);
      items.push(...unreadPage(group, reason));
      pageReports.push({ url, ok: false, note: reason, modelIds });
    }
  }

  const report = buildReport(checkedAt, chain.active().label, pageReports, items);
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
