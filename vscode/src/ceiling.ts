/**
 * The output ceiling: what the response alone can cost at most.
 *
 * A rate is abstract. `$15 per M` does not make anyone stop and think, and it is
 * not what lands on the invoice. `max_tokens=4096` on a $15/M model is
 * $0.061 per call, every call, and that is a number people react to.
 *
 * **This is the output ceiling, not the request ceiling.** The input side is
 * whatever the caller sends — unknown at this point in the file, and frequently
 * the larger half once conversation history is included. Every string this
 * module produces says "max output" rather than "max", because a number labelled
 * as the whole cost when it is half of it is exactly the error this project
 * exists to correct.
 */
import type { Model } from '@/lib/pricing/types';
import type { ModelMatch } from './scan';

/**
 * Keys the major SDKs use for the output cap.
 *
 * `max_new_tokens` is here for the Hugging Face and vLLM shapes; the rest cover
 * OpenAI (`max_tokens`, `max_completion_tokens`), Anthropic (`max_tokens`) and
 * Google (`maxOutputTokens`). Underscores and camelCase both, because a YAML
 * config and a TypeScript call express the same field differently.
 */
const KEY = /\bmax[_-]?(?:new[_-]?|output[_-]?|completion[_-]?)?tokens\b\s*[:=]\s*(\d[\d_]*)/i;

/** How far from the model id to look. Generous forwards, tight backwards. */
const LINES_AFTER = 12;
const LINES_BEFORE = 3;

export interface Ceiling {
  /** The cap as written in the source. */
  maxTokens: number;
  /** USD the output alone costs if it runs to the cap. Input is not included. */
  outputCostUsd: number;
  /**
   * Set when the cap is above what the model can actually emit. The request will
   * be rejected or silently truncated — a case worth naming rather than pricing
   * as though it would work.
   */
  exceedsModelMax: boolean;
}

/**
 * The cap governing one model match, if there is one.
 *
 * Bounded by the neighbouring matches so that two calls in one file cannot
 * borrow each other's numbers: the search forward stops at the next model id,
 * and the search backward stops at the previous one. Without that, a file with
 * two calls would confidently price the first one using the second's cap.
 */
export function ceilingFor(text: string, match: ModelMatch, all: readonly ModelMatch[]): Ceiling | undefined {
  const index = all.indexOf(match);
  const next = index >= 0 ? all[index + 1] : undefined;
  const previous = index > 0 ? all[index - 1] : undefined;

  const forward = text.slice(
    match.end,
    Math.min(next?.start ?? text.length, lineBoundary(text, match.end, LINES_AFTER)),
  );
  const backward = text.slice(
    Math.max(previous?.end ?? 0, lineBoundary(text, match.start, -LINES_BEFORE)),
    match.start,
  );

  // Forwards first: every SDK in the list above writes the model before the cap.
  const found = KEY.exec(forward) ?? KEY.exec(backward);
  if (!found?.[1]) return undefined;

  const maxTokens = Number(found[1].replace(/_/g, ''));
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) return undefined;

  return {
    maxTokens,
    outputCostUsd: (maxTokens / 1_000_000) * match.model.pricing.output,
    exceedsModelMax: exceedsMax(maxTokens, match.model),
  };
}

function exceedsMax(maxTokens: number, model: Model): boolean {
  return model.maxOutput !== undefined && maxTokens > model.maxOutput;
}

/** Offset `count` lines away from `from`, clamped to the text. Negative counts go back. */
function lineBoundary(text: string, from: number, count: number): number {
  let offset = from;
  if (count >= 0) {
    for (let i = 0; i < count; i += 1) {
      const next = text.indexOf('\n', offset);
      if (next === -1) return text.length;
      offset = next + 1;
    }
    return offset;
  }
  for (let i = 0; i < -count; i += 1) {
    const previous = text.lastIndexOf('\n', offset - 1);
    if (previous === -1) return 0;
    offset = previous;
  }
  return offset;
}
