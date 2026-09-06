/**
 * Rung 1 upkeep: re-reading every vendor's own pricing page, every morning.
 *
 * A hand-verified override wins the trust ladder outright, which is exactly
 * why it must not be allowed to age in silence. Until this existed the only
 * thing that touched `lastVerified` on an override was a person editing
 * `data/pricing-overrides.json`, so a batch of rows verified on the same day
 * went stale on the same day — sixteen at once, on 2026-09-05.
 *
 * This module is the pure half: which rows can be checked, the extraction
 * contract handed to the model, and the comparison that decides what the
 * page's figures mean for each row. `scripts/verify-vendors.ts` owns the
 * network calls.
 *
 * Two properties this file is responsible for:
 *
 *   It never writes a price. A page that agrees with the record refreshes
 *   the date; a page that disagrees raises a flag carrying both figures for
 *   a human. An automated reading is evidence, never a source.
 *
 *   The extraction is blind. The model is told which rows to look for and
 *   nothing about what the record says, so it cannot "confirm" a figure by
 *   echoing it. Agreement has to come from the page.
 */
import { effectivePricing } from '../../packages/core/src/engine/cost';
import type { Model } from '../../src/lib/pricing/types';
import type { Override } from './normalize';

export const VENDOR_CHECK_SCHEMA_VERSION = 1;
/** The reader. DeepSeek when its key is present (an order of magnitude cheaper
 *  for what is a transcription job), Anthropic as the fallback. */
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5';
/** Vendor pages round; the record does not. Within this fraction is the same number. */
export const CONFIRM_TOLERANCE = 0.01;
/** A report older than this describes a different morning and must not raise flags. */
export const REPORT_MAX_AGE_MS = 36 * 60 * 60 * 1000;

/** One row the check can act on, with the figures the page has to agree with.
 *
 *  A provenance-only override (`vendorVerified` and a URL, no `pricing`)
 *  records that the *feed's* number was read off the vendor's page; the
 *  figure to re-confirm is then the one the catalog published, not something
 *  in the override. */
export interface Checkable {
  override: Override;
  url: string;
  pricing: Model['pricing'];
  /** The catalog's provider for this row, when known — it is what the id is prefixed with. */
  providerId?: string;
}

/** The name the vendor's page is likely to use: the catalog id without its
 *  provider prefix. `dashscope-qwen3.7-max` is Alibaba's `qwen3.7-max`;
 *  `claude-opus-5` carries no prefix and is left alone. */
export function listedAs(row: Checkable): string | undefined {
  const { id } = row.override;
  const prefix = row.providerId ? `${row.providerId}-` : undefined;
  return prefix && id.startsWith(prefix) && id.length > prefix.length ? id.slice(prefix.length) : undefined;
}

/** What the model reports for one row of one page. Prices are USD per 1M tokens. */
export interface PageRate {
  id: string;
  found: boolean;
  input?: number;
  output?: number;
  cachedInput?: number;
  promo?: { input: number; output: number; cachedInput?: number; until?: string };
  note?: string;
}

export interface PageExtraction {
  models: PageRate[];
}

export type VendorCheckStatus = 'confirmed' | 'mismatch' | 'unconfirmed';

export interface VendorCheckItem {
  id: string;
  url: string;
  status: VendorCheckStatus;
  /** Human-facing: what the page said, and how it compares. */
  detail: string;
}

export interface VendorPageReport {
  url: string;
  ok: boolean;
  note?: string;
  modelIds: string[];
}

export interface VendorCheckReport {
  schemaVersion: number;
  checkedAt: string;
  /** The model that read the pages; null when the run was skipped. */
  extractionModel: string | null;
  pages: VendorPageReport[];
  items: VendorCheckItem[];
  confirmed: number;
  mismatched: number;
  unconfirmed: number;
}

/** The JSON shape the extraction must return — structured output, so it always parses. */
export const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['models'],
  properties: {
    models: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'found'],
        properties: {
          id: { type: 'string', description: 'The id exactly as given in the list to look for.' },
          found: {
            type: 'boolean',
            description: 'True only when this model is priced on the page as an API model.',
          },
          input: { type: 'number', description: 'Standard-tier input price, USD per 1M tokens.' },
          output: { type: 'number', description: 'Standard-tier output price, USD per 1M tokens.' },
          cachedInput: {
            type: 'number',
            description: 'Cache-hit / cached-input read price, USD per 1M tokens, if listed.',
          },
          promo: {
            type: 'object',
            additionalProperties: false,
            required: ['input', 'output'],
            description: 'A promotional, introductory or limited-time rate the page lists for this model.',
            properties: {
              input: { type: 'number' },
              output: { type: 'number' },
              cachedInput: { type: 'number' },
              until: { type: 'string', description: 'End date as YYYY-MM-DD, if the page states one.' },
            },
          },
          note: {
            type: 'string',
            description: 'Anything a reader should know: renames, unit conversions, ambiguity.',
          },
        },
      },
    },
  },
} as const;

export const EXTRACTION_SYSTEM_PROMPT = `You read a model vendor's own pricing page and report the API prices it lists. You are a careful transcriber, not an analyst.

Rules:
- Report only figures printed on the page. Never estimate, infer from a sibling model, or fill in from memory. If a model is not priced on the page, report found=false and nothing else for it.
- Prices are USD per 1 million tokens. If the page prices per 1,000 tokens or per token, convert and say so in note.
- Use the standard pay-as-you-go tier at the global endpoint. Ignore batch, priority/fast, regional or data-residency, fine-tuning, and long-context surcharge tiers.
- input and output are the standard list prices. cachedInput is the cache-hit (cached input read) price when listed.
- If the page shows a promotional, introductory, or limited-time rate for a model, put that rate in promo (with its end date in until when stated) and keep the standard rate in input/output. If the page shows only the promotional rate and no standard rate, put it in promo and omit input/output. Never copy the same figure into both.
- A price given as "$X through <date>" followed by "$Y starting <later date>" is a promotion: X goes in promo with until = that first date, Y is the standard rate.
- If the page says a model is retired, deprecated, or redirected and that requests to it are billed at another model's rate, report that rate for it and say so in note.
- The ids in the list are catalog ids and may carry a provider prefix the page does not use; where a "listed as" name is given, that is the name to look for on the page. Match on the vendor's model name, never on the prefix.
- A page may price a model only as dated or variant builds of the same name (for example grok-4.20-0309-reasoning and grok-4.20-0309-non-reasoning when asked about grok-4.20, or a model-YYYYMMDD snapshot). When every listed build of that name carries the same standard price, report that price for the model and name the builds in note. When the builds differ in price, report found=false and list them with their prices in note.
- Match models by name carefully: a model listed only under a different version (for example "Medium 3.1" when asked about "Medium 3") is found=false, with the alternative named in note. Never carry a figure over from a different model, tier, or table: a model whose own row is not in the content is found=false.
- Return one entry for every id in the list, in the same order.`;

function completePricing(pricing: Override['pricing']): Model['pricing'] | undefined {
  return typeof pricing?.input === 'number' && typeof pricing?.output === 'number'
    ? (pricing as Model['pricing'])
    : undefined;
}

/** Rows the daily check can act on: hand-verified, with a page and a figure to compare. */
export function checkableRows(
  overrides: Override[],
  published: Map<string, Model['pricing']>,
  providers: Map<string, string> = new Map(),
): Checkable[] {
  const rows: Checkable[] = [];
  for (const override of overrides) {
    if (override.vendorVerified !== true || typeof override.verifiedUrl !== 'string') continue;
    const pricing = completePricing(override.pricing) ?? published.get(override.id);
    if (!pricing) continue;
    const providerId = override.providerId ?? providers.get(override.id);
    rows.push({ override, url: override.verifiedUrl, pricing, ...(providerId ? { providerId } : {}) });
  }
  return rows;
}

/** One page read serves every row that cites it. */
export function groupByPage(rows: Checkable[]): Map<string, Checkable[]> {
  const pages = new Map<string, Checkable[]>();
  for (const row of rows) {
    const group = pages.get(row.url);
    if (group) group.push(row);
    else pages.set(row.url, [row]);
  }
  return pages;
}

/** The user turn: the page, then the rows to find on it. Deliberately no prices. */
export function buildExtractionPrompt(url: string, rows: Checkable[], pageText: string): string {
  const list = rows
    .map((row) => {
      const { override } = row;
      const name = listedAs(row);
      return (
        `- ${override.id}` +
        (override.displayName ? ` — ${override.displayName}` : '') +
        (name ? ` (listed as "${name}")` : '')
      );
    })
    .join('\n');
  return [
    `Pricing page: ${url}`,
    '',
    'Models to look for, by id (report each id exactly as written; look for the "listed as" name where given):',
    list,
    '',
    'Page content:',
    '<<<PAGE',
    pageText,
    'PAGE>>>',
  ].join('\n');
}

/** Accept the structured output, keeping nothing that is not the shape above. */
export function parsePageExtraction(value: unknown): PageExtraction {
  const models = (value as { models?: unknown } | null)?.models;
  if (!Array.isArray(models)) throw new Error('extraction did not contain a models array');
  const rates: PageRate[] = [];
  for (const entry of models) {
    if (typeof entry !== 'object' || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== 'string' || typeof raw.found !== 'boolean') continue;
    const rate: PageRate = { id: raw.id, found: raw.found };
    if (typeof raw.input === 'number') rate.input = raw.input;
    if (typeof raw.output === 'number') rate.output = raw.output;
    if (typeof raw.cachedInput === 'number') rate.cachedInput = raw.cachedInput;
    if (typeof raw.note === 'string' && raw.note) rate.note = raw.note;
    const promo = raw.promo as Record<string, unknown> | undefined;
    if (promo && typeof promo.input === 'number' && typeof promo.output === 'number') {
      rate.promo = {
        input: promo.input,
        output: promo.output,
        ...(typeof promo.cachedInput === 'number' ? { cachedInput: promo.cachedInput } : {}),
        ...(typeof promo.until === 'string' && promo.until ? { until: promo.until } : {}),
      };
    }
    rates.push(rate);
  }
  return { models: rates };
}

interface Figure {
  input: number;
  output: number;
  cachedInput?: number;
}

function closeEnough(a: number, b: number): boolean {
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (base === 0) return true;
  return Math.abs(a - b) / base <= CONFIRM_TOLERANCE;
}

function sameFigure(a: Figure, b: Figure): boolean {
  return closeEnough(a.input, b.input) && closeEnough(a.output, b.output);
}

function fmt(figure: Figure): string {
  return `$${figure.input}/$${figure.output}`;
}

/** The intro block, but only while it is in force. */
function activeIntro(pricing: Model['pricing'], asOf: Date) {
  // `effectivePricing` hands back the very same object when nothing is in
  // force and a fresh one when an intro rate is. That identity is the signal;
  // the window's date arithmetic lives there and nowhere else.
  return effectivePricing(pricing, asOf) !== pricing ? pricing.intro : undefined;
}

/**
 * What one page reading means for one row.
 *
 *   confirmed   — every figure the record holds is on the page, unchanged
 *   mismatch    — the page contradicts the record; a human decides which is right
 *   unconfirmed — the page could not settle it either way; nothing changes
 *
 * Only `confirmed` moves a date. Only `mismatch` raises a flag.
 */
export function compareRate(row: Checkable, rate: PageRate | undefined, asOf: Date): VendorCheckItem {
  const { url, pricing } = row;
  const id = row.override.id;
  const base: Figure = {
    input: pricing.input,
    output: pricing.output,
    ...(pricing.cachedInput !== undefined ? { cachedInput: pricing.cachedInput } : {}),
  };
  const intro = activeIntro(pricing, asOf);

  if (!rate)
    return { id, url, status: 'unconfirmed', detail: 'the reading returned no entry for this model' };
  if (!rate.found) {
    return {
      id,
      url,
      status: 'unconfirmed',
      detail: `not priced on the page${rate.note ? ` (${rate.note})` : ''}`,
    };
  }

  let pageStandard: Figure | undefined =
    rate.input !== undefined && rate.output !== undefined
      ? {
          input: rate.input,
          output: rate.output,
          ...(rate.cachedInput !== undefined ? { cachedInput: rate.cachedInput } : {}),
        }
      : undefined;
  const pagePromo = rate.promo;
  if (!pageStandard && !pagePromo) {
    return { id, url, status: 'unconfirmed', detail: 'listed, but no price could be read' };
  }
  // A reader handed a page that prints one figure with "promotional" beside it
  // tends to report that figure twice, as both the promotion and the standard
  // rate. Two identical figures are one figure: the page shows only the
  // promotion.
  if (pageStandard && pagePromo && sameFigure(pageStandard, pagePromo)) pageStandard = undefined;

  const problems: string[] = [];
  const untilNote = intro?.until ? ` until ${intro.until}` : '';

  // The page prints only the rate in force and it agrees with the recorded
  // intro. That confirms what visitors are billed today — the figure the site
  // shows — so the date moves. The standard rate behind it stays a claim the
  // page cannot settle until the window closes, at which point the page prints
  // it and this check catches any error the morning it starts to matter.
  const promoOnlyAgrees = (shown: Figure): VendorCheckItem => ({
    id,
    url,
    status: 'confirmed',
    detail: `page shows only the promotional rate ${fmt(shown)}${untilNote}, which agrees; the standard rate ${fmt(base)} is not printed and stays unverified until the window closes`,
  });

  if (intro) {
    const introFigure: Figure = { input: intro.input, output: intro.output };
    if (pagePromo) {
      if (!sameFigure(pagePromo, introFigure)) {
        problems.push(`promotional rate ${fmt(pagePromo)} vs recorded intro ${fmt(introFigure)}${untilNote}`);
      }
      if (pageStandard && !sameFigure(pageStandard, base)) {
        problems.push(`standard rate ${fmt(pageStandard)} vs recorded ${fmt(base)}`);
      }
      if (
        intro.cachedInput !== undefined &&
        pagePromo.cachedInput !== undefined &&
        !closeEnough(intro.cachedInput, pagePromo.cachedInput)
      ) {
        problems.push(`promotional cached input $${pagePromo.cachedInput} vs recorded $${intro.cachedInput}`);
      }
      if (!pageStandard && problems.length === 0) return promoOnlyAgrees(pagePromo);
    } else if (sameFigure(pageStandard!, introFigure)) {
      return promoOnlyAgrees(pageStandard!);
    } else if (sameFigure(pageStandard!, base)) {
      problems.push(`page no longer shows the promotional rate ${fmt(introFigure)} recorded${untilNote}`);
    } else {
      problems.push(
        `page lists ${fmt(pageStandard!)} vs recorded ${fmt(base)} (intro ${fmt(introFigure)}${untilNote})`,
      );
    }
  } else {
    if (pagePromo) {
      const promoUntil = pagePromo.until ? ` until ${pagePromo.until}` : '';
      problems.push(`page lists a promotional rate ${fmt(pagePromo)}${promoUntil} that is not recorded`);
    }
    if (pageStandard && !sameFigure(pageStandard, base)) {
      problems.push(`page lists ${fmt(pageStandard)} vs recorded ${fmt(base)}`);
    }
  }

  if (
    pageStandard &&
    base.cachedInput !== undefined &&
    pageStandard.cachedInput !== undefined &&
    !closeEnough(base.cachedInput, pageStandard.cachedInput)
  ) {
    problems.push(`cached input $${pageStandard.cachedInput} vs recorded $${base.cachedInput}`);
  }

  if (problems.length > 0) {
    return { id, url, status: 'mismatch', detail: problems.join('; ') };
  }
  const shown = pageStandard ?? pagePromo!;
  return {
    id,
    url,
    status: 'confirmed',
    detail: `page lists ${fmt(shown)}${shown.cachedInput !== undefined ? ` (cached $${shown.cachedInput})` : ''}`,
  };
}

/** Compare every row on a page against what the page said. */
export function compareGroup(rows: Checkable[], extraction: PageExtraction, asOf: Date): VendorCheckItem[] {
  const byId = new Map(extraction.models.map((rate) => [rate.id, rate]));
  return rows.map((row) => compareRate(row, byId.get(row.override.id), asOf));
}

/** Every row a page could not be read for, so the report still names it. */
export function unreadPage(rows: Checkable[], reason: string): VendorCheckItem[] {
  return rows.map((row) => ({
    id: row.override.id,
    url: row.url,
    status: 'unconfirmed' as const,
    detail: `page could not be read: ${reason}`,
  }));
}

/** Confirmed rows get today's date; every other row keeps the date it had. */
export function applyConfirmations(
  overrides: Override[],
  items: VendorCheckItem[],
  isoDate: string,
): { overrides: Override[]; bumped: string[] } {
  const confirmed = new Set(items.filter((item) => item.status === 'confirmed').map((item) => item.id));
  const bumped: string[] = [];
  const next = overrides.map((override) => {
    if (!confirmed.has(override.id) || override.lastVerified === isoDate) return override;
    bumped.push(override.id);
    return { ...override, lastVerified: isoDate };
  });
  return { overrides: next, bumped };
}

export function buildReport(
  checkedAt: Date,
  extractionModel: string | null,
  pages: VendorPageReport[],
  items: VendorCheckItem[],
): VendorCheckReport {
  return {
    schemaVersion: VENDOR_CHECK_SCHEMA_VERSION,
    checkedAt: checkedAt.toISOString(),
    extractionModel,
    pages,
    items,
    confirmed: items.filter((item) => item.status === 'confirmed').length,
    mismatched: items.filter((item) => item.status === 'mismatch').length,
    unconfirmed: items.filter((item) => item.status === 'unconfirmed').length,
  };
}

export function isFreshReport(report: VendorCheckReport | undefined, now: Date): report is VendorCheckReport {
  if (!report || report.schemaVersion !== VENDOR_CHECK_SCHEMA_VERSION) return false;
  const checkedAt = Date.parse(report.checkedAt);
  return Number.isFinite(checkedAt) && now.getTime() - checkedAt <= REPORT_MAX_AGE_MS;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Plain-text fallback when no rendering service is configured: good enough for
 *  server-rendered pages, and honest about being no more than that. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6]|section|article|table|thead|tbody)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)\s*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match: string, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ------------------------------------------------------------------------ *
 * The OpenAI-style reader (DeepSeek).
 *
 * DeepSeek's JSON mode guarantees a JSON object, not a JSON object of a given
 * shape — the schema above is a contract Anthropic enforces and DeepSeek is
 * only told about. So the prompt carries an example, the reply is validated
 * by `parsePageExtraction`, and a reply that fails validation earns exactly
 * one retry that quotes the problem back. The page itself is public, so
 * nothing in the request is sensitive.
 * ------------------------------------------------------------------------ */

/** The example DeepSeek's JSON mode asks for; the shape is EXTRACTION_SCHEMA. */
export const EXTRACTION_JSON_EXAMPLE = JSON.stringify(
  {
    models: [
      { id: 'vendor-model-a', found: true, input: 1.25, output: 10, cachedInput: 0.125 },
      {
        id: 'vendor-model-b',
        found: true,
        input: 1.5,
        output: 7.5,
        promo: { input: 0.75, output: 3.75, until: '2026-12-31' },
        note: 'promotional rate shown beside the standard rate',
      },
      { id: 'vendor-model-c', found: false, note: 'only version 3.5 is listed' },
      {
        id: 'vendor-model-d',
        found: true,
        input: 1.25,
        output: 2.5,
        note: 'retired; the page says requests to it are billed at vendor-model-e rates',
      },
    ],
  },
  null,
  2,
);

/** The system prompt with the JSON-mode requirements DeepSeek documents:
 *  the word "json" and an example of the shape. */
export function jsonModeSystemPrompt(): string {
  return (
    `${EXTRACTION_SYSTEM_PROMPT}\n\n` +
    `Reply with a single JSON object and nothing else — no prose, no code fence. ` +
    `Use exactly these keys and no others. Omit a key rather than writing null. Example of the shape:\n` +
    EXTRACTION_JSON_EXAMPLE
  );
}

export interface ChatCompletionRequest {
  model: string;
  messages: { role: 'system' | 'user'; content: string }[];
  response_format: { type: 'json_object' };
  max_tokens: number;
  temperature: number;
  thinking: { type: 'disabled' };
}

/** Enough for sixteen rows with notes, several times over; DeepSeek warns that
 *  a low ceiling truncates the JSON mid-string. */
export const CHAT_COMPLETION_MAX_TOKENS = 8192;

/** The request body for an OpenAI-style chat completion in JSON mode. A
 *  `previousError` turns it into the one retry, telling the model what was
 *  wrong with its last reply. */
export function buildChatCompletionRequest(
  model: string,
  userPrompt: string,
  previousError?: string,
): ChatCompletionRequest {
  const system = previousError
    ? `${jsonModeSystemPrompt()}\n\nYour previous reply could not be used: ${previousError}. Reply again with only the JSON object.`
    : jsonModeSystemPrompt();
  return {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: CHAT_COMPLETION_MAX_TOKENS,
    temperature: 0,
    thinking: { type: 'disabled' },
  };
}

/** The assistant text out of an OpenAI-style completion, or why there is none. */
export function chatCompletionText(payload: unknown): string {
  const choice = (payload as { choices?: unknown[] } | null)?.choices?.[0] as
    { message?: { content?: unknown }; finish_reason?: unknown } | undefined;
  if (!choice) throw new Error('the completion carried no choices');
  if (choice.finish_reason === 'length') throw new Error('the reply was cut off at max_tokens');
  if (choice.finish_reason === 'content_filter')
    throw new Error('the reply was withheld by a content filter');
  const content = choice.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error(`the reply was empty (finish_reason ${String(choice.finish_reason ?? 'unknown')})`);
  }
  return content;
}

/** JSON mode promises an object; a stray code fence still costs nothing to strip. */
export function parseJsonReply(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(unfenced);
}
