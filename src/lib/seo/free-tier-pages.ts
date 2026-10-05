/**
 * The free-tier pages: `/free-tiers/` and one `/providers/<slug>/free/` per provider.
 *
 * Built from `data/free-tiers.json` (the vendors' own words, sourced and dated)
 * plus the catalog, which supplies the one thing a free-tier page needs that a
 * vendor's terms page does not: what you pay once the free part runs out.
 *
 * Like the writing and app pages these sit outside the catalog's `PageSet`, so
 * `check-pages.ts`'s page arithmetic stays about the catalog alone. Their
 * sitemap `lastmod` is still a content date, never the build date: the latest
 * of the record's own `updated`, the provider page's `lastmod` (the closing
 * section quotes that provider's prices) and any day the daily check saw a
 * quote disappear from, or return to, its source.
 */

import { Catalog } from '../pricing/catalog';
import { effectivePricing } from '../engine/cost';
import type { Model, Pricing, Provider } from '../pricing/types';
import { factCheckFor, type FactCheck, type FreeTierCheckReport } from '../free-tiers/check';
import type { FreeTierFact, FreeTierFile, FreeTierRecord, FreeTierVerdict } from '../free-tiers/types';
import { blendedRate, fitDescription, fitTitle, type PageSet } from './pages';

export const FREE_TIERS_PATH = '/free-tiers/';

export interface CheckedFact extends FreeTierFact {
  check: FactCheck;
}

export interface FreeTierPage {
  kind: 'free-tier';
  providerId: string;
  provider: Provider;
  path: string;
  /** The provider's pricing page on this site. */
  providerPath: string;
  title: string;
  description: string;
  heading: string;
  record: FreeTierRecord;
  facts: CheckedFact[];
  /** The provider's cheapest model still on sale, by blended rate — what the
   *  free tier gives way to. Undefined only if the provider sells nothing. */
  after: { model: Model; path: string; effective: Pricing } | undefined;
  lastmod: string;
}

export interface FreeTierIndexPage {
  kind: 'free-tier-index';
  path: string;
  title: string;
  description: string;
  heading: string;
  lastmod: string;
}

export interface FreeTierPageSet {
  index: FreeTierIndexPage;
  pages: FreeTierPage[];
}

/** The short label for a verdict, used in tables and badges. */
export const VERDICT_LABEL: Record<FreeTierVerdict, string> = {
  ongoing: 'Ongoing free tier',
  'one-time': 'One-time credit',
  none: 'No free tier',
  unclear: 'Unclear',
};

/** Ongoing first, then one-time, none, unclear — then by name. A reader scanning
 *  for "where can I start free" sees the answers that say yes at the top. */
const VERDICT_ORDER: Record<FreeTierVerdict, number> = { ongoing: 0, 'one-time': 1, unclear: 2, none: 3 };

/** Length as written into the page, where `'` becomes `&#39;` and so on.
 *  `check-seo` measures the attribute as written, so a description full of
 *  possessives ("Google's", "DeepSeek's") must be fitted on that length. */
function writtenLength(value: string): number {
  const extra: Record<string, number> = { '&': 4, '<': 3, '>': 3, '"': 5, "'": 4 };
  let length = value.length;
  for (const char of value) length += extra[char] ?? 0;
  return length;
}

function fitWritten(candidates: readonly string[], limit: number): string {
  return (
    candidates.find((candidate) => writtenLength(candidate) <= limit) ?? fitDescription(candidates, limit)
  );
}

function maxDate(...dates: (string | undefined)[]): string {
  return dates.filter((d): d is string => typeof d === 'string').reduce((a, b) => (b > a ? b : a), '');
}

function freeTitle(name: string, verdict: FreeTierVerdict): string {
  const tail: Record<FreeTierVerdict, string> = {
    ongoing: 'what you get free, limits and data use',
    'one-time': 'free credits, limits and data use',
    none: 'is there a free tier?',
    unclear: 'what its own pages say',
  };
  return fitWritten([`${name} API free tier: ${tail[verdict]}`, `${name} API free tier`], 70);
}

export function buildFreeTierPages(
  file: FreeTierFile,
  report: FreeTierCheckReport,
  catalog: Catalog,
  set: PageSet,
  asOf: Date,
): FreeTierPageSet {
  const providerPages = new Map(set.providers.map((page) => [page.id, page]));
  const modelPages = new Map(set.models.map((page) => [page.id, page]));

  const pages: FreeTierPage[] = Object.entries(file.providers)
    .map(([providerId, record]) => {
      const providerPage = providerPages.get(providerId);
      if (!providerPage)
        throw new Error(`free-tiers: provider "${providerId}" has no pricing page to link to`);
      const provider = providerPage.provider;

      const facts: CheckedFact[] = record.facts.map((fact) => ({
        ...fact,
        check: factCheckFor(report, fact.id, fact.readOn),
      }));

      const cheapest = catalog.models
        .filter((m) => m.providerId === providerId && Catalog.isSelectable(m) && modelPages.has(m.id))
        .sort((a, b) => blendedRate(a) - blendedRate(b) || a.id.localeCompare(b.id))[0];
      const after = cheapest
        ? {
            model: cheapest,
            path: modelPages.get(cheapest.id)!.path,
            effective: effectivePricing(cheapest.pricing, asOf),
          }
        : undefined;

      const path = `${providerPage.path}free/`;
      return {
        kind: 'free-tier' as const,
        providerId,
        provider,
        path,
        providerPath: providerPage.path,
        title: freeTitle(provider.name, record.verdict),
        description: fitWritten(
          [
            `${record.answer} Every fact quoted from ${provider.name}'s own pages, with links and dates.`,
            record.answer,
            `Does ${provider.name} have a free API tier? The answer in ${provider.name}'s own words, with a link and date on every fact.`,
          ],
          160,
        ),
        heading: `Is there a free ${provider.name} API tier?`,
        record,
        facts,
        after,
        lastmod: maxDate(record.updated, providerPage.lastmod, ...facts.map((fact) => fact.check.changedOn)),
      };
    })
    .sort(
      (a, b) =>
        VERDICT_ORDER[a.record.verdict] - VERDICT_ORDER[b.record.verdict] ||
        a.provider.name.localeCompare(b.provider.name),
    );

  const count = (verdict: FreeTierVerdict) => pages.filter((page) => page.record.verdict === verdict).length;
  const index: FreeTierIndexPage = {
    kind: 'free-tier-index',
    path: FREE_TIERS_PATH,
    title: fitTitle([
      `Free LLM API tiers compared: ${pages.length} providers, every fact sourced`,
      `Free LLM API tiers compared`,
    ]),
    description: fitWritten(
      [
        `Which LLM APIs can you start for free? ${count('ongoing')} of ${pages.length} providers have an ongoing free tier. Card rules, limits and data use, quoted from each provider's own pages.`,
        `Which LLM APIs can you start for free? Card rules, limits and data use for ${pages.length} providers.`,
      ],
      160,
    ),
    heading: 'Free LLM API tiers, compared',
    lastmod: maxDate(...pages.map((page) => page.lastmod)),
  };

  return { index, pages };
}

/**
 * `/data/free-tiers.json`: the facts as the pages show them. Each fact carries
 * the check state the page rendered — after a hand re-read has superseded an
 * older check — so the file and the page can never disagree about whether a
 * quote is under review.
 */
export function publishedFreeTiers(
  set: FreeTierPageSet,
  generatedAt: string,
  checkedAt: string | null,
): unknown {
  return {
    schemaVersion: 1,
    generatedAt,
    checkedAt,
    providers: Object.fromEntries(
      set.pages.map((page) => [page.providerId, { ...page.record, page: page.path, facts: page.facts }]),
    ),
  };
}

/** Facts grouped for display, in a fixed reading order, empty groups dropped. */
export const TOPIC_SECTIONS: readonly { topics: FreeTierFact['topic'][]; heading: string }[] = [
  { topics: ['free', 'models'], heading: 'What is free' },
  { topics: ['credits'], heading: 'Credits and allowances' },
  { topics: ['card'], heading: 'Payment card' },
  { topics: ['limits'], heading: 'Rate limits' },
  { topics: ['data'], heading: 'How your data is used' },
  { topics: ['regions'], heading: 'Where it applies' },
  { topics: ['upgrade'], heading: 'Moving beyond the free tier' },
];
