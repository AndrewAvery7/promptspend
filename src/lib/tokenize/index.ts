import type { Model, TokenizerSpec } from '@/lib/pricing/types';

export type CountMethod = 'exact' | 'estimate';

export interface TokenCount {
  tokens: number;
  method: CountMethod;
  /** Why this number is what it is — surfaced in the UI next to the count. */
  note: string;
}

/**
 * Default characters-per-token ratios, used when a family has no tokenizer we
 * can run in the browser.
 *
 * The English figure comes from the ~4 chars/token rule every major provider
 * documents; the CJK figure reflects that Chinese and Japanese text costs far
 * more per character (frequently 1–2 characters per token), which is exactly
 * the trap this tool exists to expose.
 */
export const DEFAULT_RATIO = { charsPerToken: 3.8, cjkCharsPerToken: 1.5 } as const;

/**
 * CJK punctuation, kana, and Han ideographs. Written with unicode escapes rather
 * than literal characters so the source stays free of invisible full-width
 * spaces (which are also a lint error).
 */
const CJK = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g;

/** Split text into CJK and non-CJK character counts. */
export function characterMix(text: string): { cjk: number; other: number } {
  const cjk = text.match(CJK)?.length ?? 0;
  return { cjk, other: text.length - cjk };
}

/** Ratio-based estimate. Pure, synchronous, and always available. */
export function estimateTokens(text: string, spec?: TokenizerSpec): number {
  if (text.length === 0) return 0;
  const ratio =
    spec && spec.kind === 'approx'
      ? { charsPerToken: spec.charsPerToken, cjkCharsPerToken: spec.cjkCharsPerToken }
      : DEFAULT_RATIO;
  const { cjk, other } = characterMix(text);
  return Math.max(1, Math.round(other / ratio.charsPerToken + cjk / ratio.cjkCharsPerToken));
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
