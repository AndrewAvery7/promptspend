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
import { conversationCost } from '@/lib/engine/cost';

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
      // Use the shared integer-money engine so promotions and long-context
      // tiers follow exactly the same request-level rules as every app surface.
      const inputCostUsd = conversationCost(
        model,
        { systemTokens: 0, userTokens: count.tokens, outputTokens: 0, turns: 1 },
        { asOf },
      ).total;
      return {
        model,
        tokens: count.tokens,
        method: count.method,
        note: count.note,
        inputCostUsd,
      };
    }),
  );

  return rows.sort((a, b) => a.inputCostUsd - b.inputCostUsd || a.model.id.localeCompare(b.model.id));
}
