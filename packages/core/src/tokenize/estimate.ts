import type { TokenizerSpec } from '../pricing/types';

/** Calibrated fallback ratios used when a tokenizer cannot run on the client. */
export const DEFAULT_RATIO = { charsPerToken: 3.8, cjkCharsPerToken: 1.5 } as const;

/** CJK punctuation, kana, and Han ideographs. */
const CJK = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g;

/** Split text into CJK and non-CJK character counts. */
export function characterMix(text: string): { cjk: number; other: number } {
  const cjk = text.match(CJK)?.length ?? 0;
  return { cjk, other: text.length - cjk };
}

/**
 * Ratio-based token estimate. Pure, synchronous, platform-neutral, and safe to
 * run for every keystroke because the text never leaves the calling process.
 */
export function estimateTokens(text: string, spec?: TokenizerSpec): number {
  if (text.length === 0) return 0;
  const ratio =
    spec && spec.kind === 'approx'
      ? { charsPerToken: spec.charsPerToken, cjkCharsPerToken: spec.cjkCharsPerToken }
      : DEFAULT_RATIO;
  const { cjk, other } = characterMix(text);
  return Math.max(1, Math.round(other / ratio.charsPerToken + cjk / ratio.cjkCharsPerToken));
}
