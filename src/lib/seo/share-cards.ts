/**
 * What each page's share image says: the words and figures, not the pixels.
 *
 * One card served every page until 2026-10-30, so a link to "GPT-5.5 pricing"
 * unfurled on Slack or LinkedIn as the home page's three chips, which are about
 * a different set of models. These specs give the model, provider and comparison
 * pages a card of their own carrying the figures the page leads with. The
 * pixels are drawn at build time by `scripts/lib/share-card-image.ts`; this
 * module stays pure so the choice of figures can be tested here.
 *
 * Every figure comes from the page object the HTML is rendered from, formatted
 * by the same functions, so the card cannot say something the page does not.
 * Nothing here reads the clock: a card changes only when its page's content
 * does, which is what lets the build reuse yesterday's PNG.
 */
import { formatContext, formatMoney } from '../engine/format';
import type { ComparisonPage, ModelPage, ProviderPage } from './pages';

/** Colors a chip's figure can take, named for the site's tokens. */
export type ChipTone = 'accent' | 'save' | 'cost' | 'muted';

export interface ShareCardChip {
  /** Small caps label above the figure. */
  label: string;
  /** The figure, drawn in the monospace face. */
  value: string;
  tone: ChipTone;
}

export interface ShareCard {
  /** The page this card belongs to, e.g. `/models/gpt-5-5/`. */
  pagePath: string;
  /** Where the PNG is published, without the cache key, e.g. `/og/models/gpt-5-5.png`. */
  imagePath: string;
  /** One short line above the headline. */
  eyebrow: string;
  headline: string;
  /** Up to two lines under the headline. */
  lines: string[];
  /** Exactly three, drawn top to bottom on the right. */
  chips: [ShareCardChip, ShareCardChip, ShareCardChip];
  /** The footer line. */
  footer: string;
  /** `og:image:alt`: every figure on the card, as a sentence. */
  alt: string;
}

/** Published share images are this size: the 1.91:1 frame every platform crops to. */
export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

/** `$5` per 1M, the way the pages' rate tables print a rate. */
function rate(dollarsPerMillion: number): string {
  return `$${Number(dollarsPerMillion.toFixed(4))}`;
}

function perMonth(dollars: number): string {
  return `${formatMoney(dollars)}/mo`;
}

function range(values: number[]): string {
  if (values.length === 0) return 'n/a';
  const low = Math.min(...values);
  const high = Math.max(...values);
  return low === high ? rate(low) : `${rate(low)}–${rate(high)}`;
}

/** The page path's last segment: `/models/gpt-5-5/` becomes `gpt-5-5`. */
function leaf(path: string): string {
  return path.replace(/\/$/, '').split('/').at(-1) ?? 'page';
}

function footer(lastmod: string): string {
  return `Updated ${lastmod}  ·  open source  ·  no accounts, no ads`;
}

export function modelShareCard(page: ModelPage): ShareCard {
  const { model, effective } = page;
  const input = effective.input === undefined ? 'unpublished' : rate(effective.input);
  const output = effective.output === undefined ? 'unpublished' : rate(effective.output);
  const promo = page.promotional ? ' (promotional)' : '';
  const chips = page.examples.slice(0, 3).map((example): ShareCardChip => ({
    label: example.profile.label.toUpperCase(),
    value: perMonth(example.perMonth),
    tone: 'accent',
  }));
  if (chips.length !== 3) throw new Error(`${page.path}: a share card needs three worked examples`);
  const lines = [
    `${input} input  ·  ${output} output per 1M tokens${promo}`,
    `${formatContext(model.contextWindow)} context window${model.status === 'deprecated' ? '  ·  retired by its vendor' : ''}`,
  ];
  const examples = page.examples
    .slice(0, 3)
    .map((example) => `${example.profile.label.toLowerCase()} ${perMonth(example.perMonth)}`)
    .join(', ');
  return {
    pagePath: page.path,
    imagePath: `/og/models/${leaf(page.path)}.png`,
    eyebrow: `${page.providerName}  ·  model pricing`.toUpperCase(),
    headline: model.displayName,
    lines,
    chips: chips as ShareCard['chips'],
    footer: footer(page.lastmod),
    alt: `${model.displayName} by ${page.providerName}: ${input} input and ${output} output per 1M tokens${promo}, ${formatContext(model.contextWindow)} context. Monthly cost: ${examples}.`,
  };
}

export function comparisonShareCard(page: ComparisonPage): ShareCard {
  const row = page.rows[0];
  if (!row) throw new Error(`${page.path}: a share card needs a costed workload`);
  const tone = (side: 'left' | 'right'): ChipTone =>
    row.cheaper === 'tie' ? 'muted' : row.cheaper === side ? 'save' : 'cost';
  const gap =
    row.cheaper === 'tie'
      ? 'the same'
      : row.multiple >= 1.5
        ? `${Number(row.multiple.toFixed(row.multiple < 10 ? 1 : 0))}× gap`
        : `${perMonth(row.difference)}`;
  const left = page.left.displayName;
  const right = page.right.displayName;
  return {
    pagePath: page.path,
    imagePath: `/og/compare/${leaf(page.path)}.png`,
    eyebrow: 'PRICE COMPARISON',
    headline: `${left} vs ${right}`,
    lines: [page.verdict, `${row.profile.label}: ${row.profile.summary}.`],
    chips: [
      { label: left.toUpperCase(), value: perMonth(row.left), tone: tone('left') },
      { label: right.toUpperCase(), value: perMonth(row.right), tone: tone('right') },
      { label: 'DIFFERENCE', value: gap, tone: 'muted' },
    ],
    footer: footer(page.lastmod),
    alt: `${left} vs ${right}. ${page.verdict} ${row.profile.label}, ${row.profile.summary}: ${left} ${perMonth(row.left)}, ${right} ${perMonth(row.right)}.`,
  };
}

export function providerShareCard(page: ProviderPage): ShareCard {
  // Current models only: a retired model's last rate is not something a reader
  // can buy, so it should not set the range the card advertises.
  const live = page.models.filter((entry) => entry.model.status !== 'deprecated');
  const priced = live.length > 0 ? live : page.models;
  const inputs = priced.flatMap((entry) =>
    entry.effective.input === undefined ? [] : [entry.effective.input],
  );
  const outputs = priced.flatMap((entry) =>
    entry.effective.output === undefined ? [] : [entry.effective.output],
  );
  const count = page.models.length;
  const models = `${count} model${count === 1 ? '' : 's'}`;
  const cheapest = page.cheapest?.displayName;
  return {
    pagePath: page.path,
    imagePath: `/og/providers/${leaf(page.path)}.png`,
    eyebrow: 'PROVIDER PRICING',
    headline: page.heading,
    lines: [
      `${models} tracked  ·  headquartered in ${page.provider.country}`,
      ...(cheapest ? [`Cheapest on a blended rate: ${cheapest}`] : []),
    ],
    chips: [
      { label: 'MODELS TRACKED', value: String(count), tone: 'accent' },
      { label: 'INPUT, PER 1M', value: range(inputs), tone: 'accent' },
      { label: 'OUTPUT, PER 1M', value: range(outputs), tone: 'accent' },
    ],
    footer: footer(page.lastmod),
    alt: `${page.heading}: ${models} tracked. Input ${range(inputs)} and output ${range(outputs)} per 1M tokens${cheapest ? `; cheapest on a blended rate is ${cheapest}` : ''}.`,
  };
}
