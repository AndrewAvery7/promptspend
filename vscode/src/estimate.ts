/**
 * Costing a piece of selected text.
 *
 * Reports the **input** cost of the text as written, and says so. The output is
 * whatever the model decides to write and is not knowable from a selection, so
 * inventing an assumed response length would turn a computed number into a
 * guess wearing the same clothes. The estimator on the site is where an output
 * assumption belongs, which is why every row here links into it.
 *
 * Token counts come from the site's own tokenizer dispatch: exact via
 * js-tiktoken for OpenAI-family models, a labelled calibrated ratio elsewhere.
 * `method` and `note` are carried through untouched so the caller can show which
 * of the two it got.
 */
import type { Model } from '@/lib/pricing/types';
import { countTokens, type CountMethod } from '@/lib/tokenize';
import { effectivePricing } from '@/lib/engine/cost';

export interface EstimateRow {
  model: Model;
  tokens: number;
  method: CountMethod;
  /** The tokenizer's own explanation of how the count was arrived at. */
  note: string;
  /** USD to send this text once as input. Output is not included. */
  inputCostUsd: number;
}

/**
 * Cost `text` as input against each model, cheapest first.
 *
 * Counting runs concurrently: the first OpenAI-family model in the list pays
 * for loading the encoder and every later one reuses it, so serialising would
 * add nothing but latency.
 */
export async function estimateSelection(
  text: string,
  models: readonly Model[],
  asOf: Date = new Date(),
): Promise<EstimateRow[]> {
  const rows = await Promise.all(
    models.map(async (model): Promise<EstimateRow> => {
      const count = await countTokens(text, model);
      // Promotional rates are honoured through the engine's own helper rather
      // than read off `pricing.input`, so a model inside its intro window is
      // priced here exactly as the website prices it.
      const rate = effectivePricing(model.pricing, asOf).input;
      return {
        model,
        tokens: count.tokens,
        method: count.method,
        note: count.note,
        inputCostUsd: (count.tokens / 1_000_000) * rate,
      };
    }),
  );

  return rows.sort((a, b) => a.inputCostUsd - b.inputCostUsd || a.model.id.localeCompare(b.model.id));
}
