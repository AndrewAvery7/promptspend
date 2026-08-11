import type { Model } from '@/lib/pricing/types';
import { estimateTokens } from '../../../packages/core/src/tokenize/estimate';

export { characterMix, DEFAULT_RATIO, estimateTokens } from '../../../packages/core/src/tokenize/estimate';

export type CountMethod = 'exact' | 'estimate';

export interface TokenCount {
  tokens: number;
  method: CountMethod;
  /** Why this number is what it is — surfaced in the UI next to the count. */
  note: string;
}

type TiktokenEncoder = { encode: (text: string) => unknown[] };
const encoderCache = new Map<string, Promise<TiktokenEncoder | null>>();

/**
 * Load a real tiktoken encoder on demand.
 *
 * Two deliberate choices keep this cheap: the import is dynamic, so the ranks
 * never touch the initial bundle and are fetched only when someone actually
 * pastes text for an OpenAI-family model; and it pulls the `lite` build plus a
 * single ranks file rather than the default entry point, which bundles every
 * encoding ever shipped. A failure (offline, blocked asset) degrades to the
 * ratio estimate instead of breaking the page.
 */
async function loadEncoder(encoding: 'o200k_base' | 'cl100k_base'): Promise<TiktokenEncoder | null> {
  const cached = encoderCache.get(encoding);
  if (cached) return cached;

  const loading = (async () => {
    try {
      const { Tiktoken } = await import('js-tiktoken/lite');
      const ranks =
        encoding === 'o200k_base'
          ? (await import('js-tiktoken/ranks/o200k_base')).default
          : (await import('js-tiktoken/ranks/cl100k_base')).default;
      return new Tiktoken(ranks) as TiktokenEncoder;
    } catch {
      return null;
    }
  })();

  encoderCache.set(encoding, loading);
  return loading;
}

/**
 * What "exact" does and does not mean.
 *
 * The tokenizer is exact over *the string it is given*. A real API request
 * carries more than that string: role and message framing, tool definitions,
 * structured-output schemas, images. Those are billed too. Calling the result
 * "exact" without saying so would overstate it, so the number is labelled
 * exact **raw-text** tokens everywhere it appears.
 */
export const FRAMING_CAVEAT =
  'Counts the text only. A real request also bills message framing, tool definitions and any images.';

/**
 * Count tokens for a specific model, using the model's real tokenizer where we
 * have one and a clearly labelled estimate everywhere else.
 */
export async function countTokens(text: string, model: Model): Promise<TokenCount> {
  if (text.length === 0) return { tokens: 0, method: 'exact', note: 'Empty' };

  if (model.tokenizer.kind === 'tiktoken') {
    const encoder = await loadEncoder(model.tokenizer.encoding);
    if (encoder) {
      return {
        tokens: encoder.encode(text).length,
        method: 'exact',
        note: `Exact raw-text count — the ${model.tokenizer.encoding} tokenizer ran in your browser. ${FRAMING_CAVEAT}`,
      };
    }
    return {
      tokens: estimateTokens(text),
      method: 'estimate',
      note: 'Estimate — tokenizer could not be loaded, fell back to a calibrated ratio',
    };
  }

  return {
    tokens: estimateTokens(text, model.tokenizer),
    method: 'estimate',
    note: model.tokenizer.note ?? 'Estimate — calibrated characters-per-token ratio for this family',
  };
}

/** Synchronous estimate for a model, for live typing before the encoder lands. */
export function estimateForModel(text: string, model: Model): TokenCount {
  return {
    tokens: estimateTokens(text, model.tokenizer),
    method: 'estimate',
    note:
      model.tokenizer.kind === 'tiktoken'
        ? 'Estimate — exact count loading…'
        : (model.tokenizer.note ?? 'Estimate — calibrated ratio for this family'),
  };
}
