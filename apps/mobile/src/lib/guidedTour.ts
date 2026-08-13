import { APP_ROUTES } from '@/lib/routes';

export type GuidedTourTargetId =
  | 'home-cost-brief'
  | 'estimate-workload'
  | 'compare-results'
  | 'learn-token-lab'
  | 'data-alerts'
  | 'global-tools';

export interface GuidedTourStep {
  body: string;
  id: string;
  route: (typeof APP_ROUTES)[keyof typeof APP_ROUTES];
  section: string;
  targetId: GuidedTourTargetId;
  title: string;
}

export const GUIDED_TOUR_STEPS: readonly GuidedTourStep[] = [
  {
    id: 'cost-brief',
    route: APP_ROUTES.home,
    section: 'Home',
    targetId: 'home-cost-brief',
    title: 'Your private AI Cost Brief',
    body: 'Home shows the scenario you are shaping, the best current savings opportunity, saved work, and watched models. It is your decision dashboard—not another calculator.',
  },
  {
    id: 'estimate',
    route: APP_ROUTES.estimate,
    section: 'Estimate',
    targetId: 'estimate-workload',
    title: 'Describe one real workload',
    body: 'Choose one model, paste representative text or enter token counts, then set turns, caching, batch pricing, and operating scale. Pasted text stays on this device.',
  },
  {
    id: 'compare',
    route: APP_ROUTES.compare,
    section: 'Compare',
    targetId: 'compare-results',
    title: 'Put the same workload side by side',
    body: 'Compare ranks as many as four models from lowest to highest cost, while keeping every workload assumption identical and every pricing source inspectable.',
  },
  {
    id: 'learn',
    route: APP_ROUTES.learn,
    section: 'Learn',
    targetId: 'learn-token-lab',
    title: 'See why the numbers move',
    body: 'The Token Lab and short lessons explain tokenization, output premiums, conversation growth, caching, and the assumptions behind an estimate.',
  },
  {
    id: 'alerts',
    route: APP_ROUTES.data,
    section: 'Data & Alerts',
    targetId: 'data-alerts',
    title: 'Follow the evidence and the changes',
    body: 'Inspect catalog health and provenance, then configure private email alerts for every model or only the models that matter to you.',
  },
  {
    id: 'global-tools',
    route: APP_ROUTES.data,
    section: 'Every screen',
    targetId: 'global-tools',
    title: 'Search, revisit the guide, or make it yours',
    body: 'Search jumps to models and commands, Guide is always replayable, and Color controls light, dark, accent, and canvas preferences stored only on this device.',
  },
] as const;
