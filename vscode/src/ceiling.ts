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
import { effectivePricing } from '@/lib/engine/cost';
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

/** Where a match's forward search stops: the next model id, or the line budget. */
function forwardEnd(text: string, match: ModelMatch, next: ModelMatch | undefined): number {
  return Math.min(next?.start ?? text.length, lineBoundary(text, match.end, LINES_AFTER));
}

/**
 * The cap governing one model match, if there is one.
 *
 * Neither direction may reach a cap that belongs to a neighbour, and the two
 * directions need different guards for that.
 *
 * **Forwards** stops at the next model id. Without it, a call with no cap of its
 * own confidently borrows the next call's.
 *
 * **Backwards** stops where the *previous* match's forward search stopped — not
 * at the previous match itself, which is the obvious bound and the wrong one.
 * A cap sitting between two model ids is inside the earlier one's forward
 * window, so it is already spoken for; bounding only at `previous.end` leaves it
 * reachable by both. That shipped, and it read like this:
 *
 *     client.messages.create(model="claude-sonnet-5", max_tokens=4096)
 *     openai.chat.completions.create(model="gpt-5-mini")   ← max out $0.0082
 *
 * The second call has no cap. The figure was 4096 tokens at gpt-5-mini's rate:
 * a real number, correct arithmetic, and about a request nobody had written.
 *
 * Backwards exists for configuration files, where the cap is often written
 * above the model. That case still works, because a distant previous match's
 * forward window runs out before this one's backward window begins.
 */
export function ceilingFor(
  text: string,
  match: ModelMatch,
  all: readonly ModelMatch[],
  asOf: Date = new Date(),
): Ceiling | undefined {
  const index = all.indexOf(match);
  const next = index >= 0 ? all[index + 1] : undefined;
  const previous = index > 0 ? all[index - 1] : undefined;

  const forward = text.slice(match.end, forwardEnd(text, match, next));

  const backward = text.slice(
    Math.max(
      previous ? forwardEnd(text, previous, match) : 0,
      lineBoundary(text, match.start, -LINES_BEFORE),
    ),
    match.start,
  );

  // Forwards first: every SDK in the list above writes the model before the cap.
  const found = KEY.exec(forward) ?? KEY.exec(backward);
  if (!found?.[1]) return undefined;

  const maxTokens = Number(found[1].replace(/_/g, ''));
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) return undefined;

  return {
    maxTokens,
    // Billed at the rate in force, so this figure agrees with the one the
    // gutter and the hover quote beside it.
    outputCostUsd: (maxTokens / 1_000_000) * effectivePricing(match.model.pricing, asOf).output,
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
