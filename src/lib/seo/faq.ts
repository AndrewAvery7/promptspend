/**
 * Question-and-answer sections for the generated pages, and the FAQPage markup
 * that describes them.
 *
 * Every answer is assembled from data the page already holds, so it cannot
 * drift from the page's own figures, and it is plain text, so the sentence a
 * visitor reads is exactly the sentence the markup carries. Search engines
 * treat markup that says something the page does not as a defect; one string,
 * rendered twice, rules that out.
 *
 * What this is for, plainly: a reader who arrives with a question ("how much
 * does it cost to run?", "is there a free tier?") finds the answer in the
 * words they asked it in, and software that reads the page gets the same
 * question-and-answer pairs without scraping. Google now shows FAQ rich
 * results only for a small set of authoritative sites, so none is promised for
 * these pages; the markup is accurate either way and costs nothing to keep.
 *
 * Nothing here is invented. A question is asked only when the data to answer
 * it exists: no history, no "has the price changed" question; no free-tier
 * record, no free-tier question.
 */
import { formatContext, formatMoney } from '../engine/format';
import type { PriceHistory } from '../pricing/history';
import type { FreeTierRecord, FreeTierVerdict } from '../free-tiers/types';
import type { ComparisonPage, ModelPage, ProviderPage } from './pages';
import type { FreeTierPage } from './free-tier-pages';
import { modelHistory } from './price-history-view';

export interface Faq {
  question: string;
  /** Plain text. The page escapes it for display; the markup carries it as is. */
  answer: string;
}

function usd(dollarsPerMillion: number): string {
  return `$${Number(dollarsPerMillion.toFixed(4))}`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export interface ModelFaqInput {
  /** What the model's prices are sourced from, as the page's "source of record". */
  sourceLabel: string;
  history?: PriceHistory;
}

export function modelFaq(page: ModelPage, input: ModelFaqInput): Faq[] {
  const { model, effective } = page;
  const name = model.displayName;
  const faqs: Faq[] = [];

  const promo = page.promotional
    ? ` These are promotional rates, in force until ${model.pricing.intro?.until ?? 'the promotion ends'}; the standard rates are ${usd(model.pricing.input)} in and ${usd(model.pricing.output)} out.`
    : '';
  faqs.push({
    question: `How much does ${name} cost?`,
    answer: `${name} costs ${usd(effective.input)} per 1M input tokens and ${usd(effective.output)} per 1M output tokens at the standard tier, as last checked against ${input.sourceLabel} on ${model.provenance.lastVerified}.${promo}`,
  });

  if (page.examples.length > 0) {
    const parts = page.examples.map(
      (example) => `${formatMoney(example.perMonth)} for a ${example.profile.label.toLowerCase()}`,
    );
    faqs.push({
      question: `How much does ${name} cost to run for a month?`,
      answer: `On PromptSpend's three standard workloads, ${name} costs about ${list(parts)} each month. No prompt caching and no batch discount is assumed, and the same workloads are costed on every model page, so the figures compare directly.`,
    });
  }

  if (page.alternatives.length === 0) {
    faqs.push({
      question: `Is there a cheaper alternative to ${name}?`,
      answer: `No. Nothing in the catalog is cheaper than ${name} on a blended rate (75% input, 25% output).`,
    });
  } else {
    const top = page.alternatives
      .slice(0, 3)
      .map(
        (alt) =>
          `${alt.model.displayName} (${usd(alt.effective.input)} in, ${usd(alt.effective.output)} out)`,
      );
    faqs.push({
      question: `Is there a cheaper alternative to ${name}?`,
      answer: page.alternativesAreComparable
        ? `Yes. ${list(top)} cost less on a blended rate and carry a capability score at least as high. The score is a rough estimate, not a benchmark, so treat the list as a shortlist.`
        : `Yes, though none is scored as highly. The cheaper options, best-scored first, include ${list(top)}, so trading down is a real trade.`,
    });
  }

  faqs.push({
    question: `How large is the context window of ${name}?`,
    answer: `${name} accepts up to ${formatContext(model.contextWindow)} tokens of context${
      model.maxOutput ? ` and can produce up to ${formatContext(model.maxOutput)} tokens of output` : ''
    }.`,
  });

  if (input.history) {
    const view = modelHistory(input.history, model.id);
    if (view.listedOn !== null) {
      const vendor = view.changes.filter((change) => change.kind === 'price');
      const fixes = view.changes.length - vendor.length;
      const began = `PromptSpend began tracking prices on ${input.history.firstDate}, so earlier changes are not on record.`;
      const last = vendor[vendor.length - 1];
      // Days, not rows: one repricing usually moves several rates at once.
      const days = new Set(vendor.map((change) => change.date)).size;
      faqs.push({
        question: `Has the price of ${name} changed?`,
        answer:
          vendor.length === 0
            ? `No vendor change is on record. PromptSpend has recorded ${name} since ${view.listedOn} and none of its rates has moved${
                fixes > 0
                  ? `, apart from ${plural(fixes, 'correction', 'corrections')} of PromptSpend's own reading of a page`
                  : ''
              }. ${began}`
            : `Yes. Since ${view.listedOn}, the vendor has changed its rates on ${plural(days, 'day', 'days')} (${plural(vendor.length, 'rate', 'rates')} in all), most recently on ${last!.date}.${
                fixes > 0
                  ? ` PromptSpend also corrected its own reading of a page ${plural(fixes, 'time', 'times')}, which is not a vendor change.`
                  : ''
              } ${began}`,
      });
    }
  }

  faqs.push({
    question: `Where do the prices for ${name} come from?`,
    answer: `They come from ${input.sourceLabel} and were last checked on ${model.provenance.lastVerified}. Regional and data-residency premiums, priority tiers, server-side tool fees and negotiated discounts are not included.`,
  });

  return faqs;
}

export function providerFaq(
  page: ProviderPage,
  freeTier: { verdict: FreeTierVerdict; label: string } | undefined,
): Faq[] {
  const name = page.provider.name;
  const faqs: Faq[] = [];
  const models = page.models;
  if (models.length > 0) {
    const cheapest = models[0]!;
    const dearest = models[models.length - 1]!;
    faqs.push({
      question: `How much do ${name} API models cost?`,
      answer:
        models.length === 1
          ? `PromptSpend tracks one ${name} model, ${cheapest.model.displayName}, at ${usd(cheapest.effective.input)} per 1M input tokens and ${usd(cheapest.effective.output)} per 1M output tokens.`
          : `PromptSpend tracks ${models.length} ${name} models. The cheapest on a blended rate is ${cheapest.model.displayName}, at ${usd(cheapest.effective.input)} per 1M input tokens and ${usd(cheapest.effective.output)} per 1M output tokens; the most expensive is ${dearest.model.displayName}, at ${usd(dearest.effective.input)} in and ${usd(dearest.effective.output)} out.`,
    });
  }
  if (freeTier) {
    faqs.push({
      question: `Does ${name} have a free API tier?`,
      answer: `PromptSpend's verdict is "${freeTier.label}". Its free-tier page gives ${name}'s own wording for each claim, with a link to the page it came from and the date it was read.`,
    });
  }
  if (page.provider.pricingUrl) {
    faqs.push({
      question: `Where do the ${name} prices come from?`,
      answer: `From ${name}'s own pricing page, ${page.provider.pricingUrl}, with each model's check date shown on its page. Prices change without notice, and regional premiums, priority tiers and negotiated discounts are not included.`,
    });
  }
  return faqs;
}

export function comparisonFaq(page: ComparisonPage): Faq[] {
  const left = page.left.displayName;
  const right = page.right.displayName;
  const faqs: Faq[] = [{ question: `Which is cheaper, ${left} or ${right}?`, answer: page.verdict }];

  if (page.rows.length > 0) {
    const parts = page.rows.map((row) => {
      const gap =
        row.cheaper === 'tie'
          ? 'the same on both'
          : `${row.cheaper === 'left' ? left : right} is cheaper by ${formatMoney(row.difference)}`;
      return `${row.profile.label.toLowerCase()}: ${left} ${formatMoney(row.left)}, ${right} ${formatMoney(row.right)} (${gap})`;
    });
    faqs.push({
      question: `How much would ${left} and ${right} cost each month?`,
      answer: `On PromptSpend's standard workloads, per month: ${parts.join('; ')}. No prompt caching and no batch discount is assumed.`,
    });
  }

  faqs.push({
    question: `How do ${left} and ${right} differ apart from price?`,
    answer:
      page.differences.length > 0
        ? page.differences.join(' ')
        : `PromptSpend records no other difference between them: context window, output ceiling, reasoning, vision, caching and batch pricing all match.`,
  });
  return faqs;
}

const CARD_ANSWER: Record<FreeTierRecord['card'], (name: string) => string> = {
  yes: (name) => `Yes. According to ${name}'s own pages, starting needs a payment method.`,
  no: (name) => `No. According to ${name}'s own pages, a new account can start without a payment method.`,
  unclear: (name) => `${name}'s own pages do not say clearly, so PromptSpend does not guess.`,
};

const TRAINING_ANSWER: Record<FreeTierRecord['training'], (name: string) => string> = {
  yes: (name) => `Yes. According to ${name}'s own pages, free-tier usage may be used to train its models.`,
  no: (name) => `No. According to ${name}'s own pages, free-tier usage is not used to train its models.`,
  'opt-out': (name) =>
    `Yes by default. According to ${name}'s own pages, free-tier usage may be used to train its models unless you opt out.`,
  unclear: (name) => `${name}'s own pages are not clear on this, so PromptSpend does not guess.`,
};

export function freeTierFaq(page: FreeTierPage): Faq[] {
  const name = page.provider.name;
  const record = page.record;
  const faqs: Faq[] = [
    { question: `Does ${name} offer a free API tier?`, answer: record.answer },
    {
      question: `Does ${name}'s free API tier need a payment method?`,
      answer: CARD_ANSWER[record.card](name),
    },
    {
      question: `Does ${name} train its models on free-tier usage?`,
      answer: `${TRAINING_ANSWER[record.training](name)}${record.trainingNote ? ` ${record.trainingNote}` : ''}`,
    },
  ];
  if (page.after) {
    faqs.push({
      question: `What does ${name} cost after the free tier?`,
      answer: `${name}'s lowest-priced model on sale today is ${page.after.model.displayName}, at ${usd(page.after.effective.input)} per million input tokens and ${usd(page.after.effective.output)} per million output tokens.`,
    });
  }
  return faqs;
}
