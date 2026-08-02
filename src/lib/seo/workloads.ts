import type { Scale, Workload } from '@/lib/engine/cost';

/**
 * Three workloads every generated page is costed against.
 *
 * A page that shows only "$3 per 1M input tokens" makes the reader do the work
 * that the site exists to do. These turn the rate card into three monthly bills,
 * and because every page uses the same three, the numbers are comparable across
 * the whole catalog — which is the thing a rate table on a vendor's own site can
 * never give you.
 *
 * They are deliberately ordinary. The chatbot is the estimator's own default
 * scenario, so a visitor who follows the link from a model page into the
 * calculator sees the number they just read, unchanged. Inventing flattering
 * workloads to make a model look cheap would be the easiest possible way to
 * make these pages dishonest.
 */
export interface WorkloadProfile {
  id: string;
  label: string;
  /** One line under the heading: the shape of the traffic. */
  summary: string;
  /** The token counts spelled out, so the number can be checked. */
  detail: string;
  workload: Workload;
  scale: Scale;
}

export const WORKLOAD_PROFILES: readonly WorkloadProfile[] = [
  {
    id: 'chatbot',
    label: 'Support chatbot',
    summary: '2,500 six-turn conversations a day',
    detail:
      'An 800-token system prompt, 400-token questions and 900-token answers, over six turns — each turn re-sending everything before it.',
    workload: { systemTokens: 800, userTokens: 400, outputTokens: 900, turns: 6 },
    scale: { conversationsPerDay: 2_500, monthlyActiveUsers: 1_500, revenuePerUserPerMonth: 0 },
  },
  {
    id: 'summariser',
    label: 'Document summariser',
    summary: '1,000 single-shot summaries a day',
    detail:
      'One 12,000-token document in, an 800-token summary out, no conversation history. The case where input dominates the bill.',
    workload: { systemTokens: 200, userTokens: 12_000, outputTokens: 800, turns: 1 },
    scale: { conversationsPerDay: 1_000, monthlyActiveUsers: 400, revenuePerUserPerMonth: 0 },
  },
  {
    id: 'coding-agent',
    label: 'Coding agent',
    summary: '200 twelve-turn sessions a day',
    detail:
      'A 3,000-token system prompt, 1,500-token instructions and 2,500-token responses over twelve turns. Long sessions are where the quadratic cost of re-sent history stops being theoretical.',
    workload: { systemTokens: 3_000, userTokens: 1_500, outputTokens: 2_500, turns: 12 },
    scale: { conversationsPerDay: 200, monthlyActiveUsers: 120, revenuePerUserPerMonth: 0 },
  },
] as const;
