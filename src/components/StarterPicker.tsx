import type { Scenario } from '@/lib/url/scenario';

/**
 * "Start from an example" — a row of typical workloads that fill in step 2 and
 * step 3 in one press.
 *
 * Someone who has never measured a prompt has no idea whether a system prompt
 * is 200 tokens or 20,000, and three blank sliders give them nothing to push
 * against. A recognizable shape ("it's a support bot") gets them to a first
 * real number in one tap, and the sliders are right there to correct it.
 *
 * These are illustrative orders of magnitude, not measurements or benchmarks —
 * the copy beside the chips says so, and nothing here should be read as a
 * claim about any one product's traffic. The user-message sizes stay inside
 * the sliders' own range (16,000) so a starter never puts a slider's thumb
 * past its end.
 *
 * Model suggestions are ids, resolved against the live catalog when applied:
 * a suggestion the vendor has since retired, or that a test catalog lacks, is
 * skipped rather than trusted (see `applyStarter` in useEstimator).
 */
export interface Starter {
  id: string;
  label: string;
  systemTokens: number;
  userTokens: number;
  outputTokens: number;
  turns: number;
  conversationsPerDay: number;
  /** Tried in order; missing or retired ids are dropped at apply time. */
  modelIds: readonly string[];
}

export const STARTERS: readonly Starter[] = [
  {
    id: 'support',
    label: 'Support chatbot',
    // A long-ish policy prompt, short questions, short answers, a few back-and-forths.
    systemTokens: 1200,
    userTokens: 150,
    outputTokens: 300,
    turns: 6,
    conversationsPerDay: 2000,
    modelIds: [
      'claude-haiku-5-5',
      'gpt-5.4-mini',
      'gemini-gemini-3.1-flash-lite',
      'deepseek-deepseek-v4-flash',
    ],
  },
  {
    id: 'rag',
    label: 'Document Q&A (RAG)',
    // The retrieved passages ride in the user message, which is what makes it big.
    systemTokens: 600,
    userTokens: 4000,
    outputTokens: 400,
    turns: 3,
    conversationsPerDay: 1000,
    modelIds: ['claude-sonnet-5', 'gpt-5.4', 'gemini-gemini-3.1-pro-preview', 'deepseek-deepseek-v4-flash'],
  },
  {
    id: 'coding',
    label: 'Coding assistant',
    // File context in every message, long answers, long sessions, fewer of them.
    systemTokens: 2500,
    userTokens: 3000,
    outputTokens: 1200,
    turns: 10,
    conversationsPerDay: 500,
    modelIds: ['claude-sonnet-5', 'gpt-5.4', 'mistral-codestral-2508', 'deepseek-deepseek-v4-flash'],
  },
  {
    id: 'summarize',
    label: 'Summarizing long documents',
    // One long document in, one summary out, no conversation.
    systemTokens: 300,
    userTokens: 12000,
    outputTokens: 800,
    turns: 1,
    conversationsPerDay: 300,
    modelIds: [
      'gemini-gemini-3.1-flash-lite',
      'claude-haiku-5-5',
      'gpt-5.4-mini',
      'deepseek-deepseek-v4-flash',
    ],
  },
  {
    id: 'extract',
    label: 'Classification / extraction at scale',
    // Tiny structured output, one shot, a very large number of calls.
    systemTokens: 500,
    userTokens: 600,
    outputTokens: 60,
    turns: 1,
    conversationsPerDay: 50000,
    modelIds: [
      'gpt-5-nano',
      'gemini-gemini-3.1-flash-lite',
      'claude-haiku-5-5',
      'deepseek-deepseek-v4-flash',
    ],
  },
];

/**
 * The starter the current numbers still describe, if any.
 *
 * Derived from the scenario rather than remembered, so the pressed chip lets go
 * the moment the visitor moves any slider it set: from then on the numbers are
 * theirs, and a chip still claiming "Support chatbot" would be a small lie.
 * Models are not compared — swapping a model does not change what kind of app
 * it is.
 */
export function activeStarter(scenario: Scenario): Starter | undefined {
  return STARTERS.find(
    (starter) =>
      starter.systemTokens === scenario.systemTokens &&
      starter.userTokens === scenario.userTokens &&
      starter.outputTokens === scenario.outputTokens &&
      starter.turns === scenario.turns &&
      starter.conversationsPerDay === scenario.conversationsPerDay,
  );
}

interface StarterPickerProps {
  scenario: Scenario;
  onPick: (starter: Starter) => void;
}

export function StarterPicker({ scenario, onPick }: StarterPickerProps) {
  const active = activeStarter(scenario);
  return (
    <div className="starter-picker" role="group" aria-labelledby="starter-picker-label">
      {/* Real buttons with `aria-pressed`, not a radio group: a starter is an
          action that fills in the form, and it can be "un-pressed" by editing
          any value — neither of which a radio button can express. Styled as
          the country filter's chips, the existing "this one is on" pattern. */}
      <p className="starter-picker__label" id="starter-picker-label">
        Start from an example:
      </p>
      <div className="starter-picker__chips">
        {STARTERS.map((starter) => (
          <button
            key={starter.id}
            type="button"
            className={`country-toggle starter-picker__chip${active?.id === starter.id ? ' is-on' : ''}`}
            aria-pressed={active?.id === starter.id}
            onClick={() => onPick(starter)}
          >
            {starter.label}
          </button>
        ))}
      </div>
      <p className="starter-picker__note">
        Illustrative starting points, not measurements — they fill in the sizes, turns, daily volume and a few
        models to compare. Adjust them to match your app.
      </p>
    </div>
  );
}
