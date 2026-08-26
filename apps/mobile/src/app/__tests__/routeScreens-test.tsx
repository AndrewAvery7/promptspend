import { cleanup, render } from '@testing-library/react-native';
import { Catalog, type PricingCatalog } from '@promptspend/core';

import CompareScreen from '../compare';
import DataAndAlertsScreen from '../data';
import EstimateScreen from '../estimate';
import HomeScreen from '../home';
import LearnScreen from '../learn';

const mockNavigate = jest.fn();
const mockSetParams = jest.fn();
const mockLaunchState = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ navigate: mockNavigate, setParams: mockSetParams }),
}));

jest.mock('@/state/useLaunchState', () => {
  const actual = jest.requireActual('@/state/useLaunchState');
  return { ...actual, useLaunchState: () => mockLaunchState() };
});

jest.mock('@/theme/useMobileTheme', () => {
  const { createMobileTheme } = jest.requireActual('@/theme/tokens');
  return {
    useMobileTheme: () => ({
      accent: 'cobalt',
      canvas: 'cool',
      isDark: false,
      mode: 'light',
      setAccent: jest.fn(),
      setCanvas: jest.fn(),
      setMode: jest.fn(),
      theme: createMobileTheme(false, 'cobalt', 'cool'),
    }),
  };
});

jest.mock('@/components/GuidedTour', () => ({
  TourTarget: ({ children }: { children: React.ReactNode }) => children,
  useGuidedTour: () => ({ startTour: jest.fn() }),
}));

jest.mock('@/components/EmailAlertCenter', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return { EmailAlertCenter: () => React.createElement(Text, null, 'Email alert controls') };
});

jest.mock('@/components/WebDocumentHead', () => ({ WebDocumentHead: () => null }));

const PRICING: PricingCatalog = {
  schemaVersion: 2,
  generatedAt: '2026-08-16T12:00:00.000Z',
  providers: [
    {
      id: 'anthropic',
      name: 'Anthropic',
      country: 'US',
      pricingUrl: 'https://www.anthropic.com/pricing',
    },
  ],
  models: [
    {
      id: 'claude-sonnet-5',
      providerId: 'anthropic',
      displayName: 'Claude Sonnet 5',
      status: 'current',
      contextWindow: 1_000_000,
      pricing: { input: 3, output: 15, cachedInput: 0.3 },
      tokenizer: { kind: 'approx', charsPerToken: 3.6, cjkCharsPerToken: 1.5 },
      capabilities: { reasoning: true, vision: true },
      provenance: {
        source: 'vendor',
        lastVerified: '2026-08-16',
        verifiedUrl: 'https://www.anthropic.com/pricing',
      },
    },
  ],
};

const catalog = new Catalog(PRICING);
const noop = jest.fn();

function launchState() {
  return {
    applyPreset: noop,
    batchEnabled: false,
    cacheEnabled: false,
    cacheSharePercent: 0,
    catalogError: null,
    catalogResult: {
      catalog,
      refreshedAt: new Date('2026-08-16T12:00:00.000Z'),
      source: 'network',
      warning: null,
    },
    clearRestoredPasteNotice: noop,
    comparisonIds: ['claude-sonnet-5'],
    completeOnboarding: noop,
    deleteScenario: noop,
    duplicateScenario: noop,
    favorites: [],
    hydrated: true,
    onboardingComplete: true,
    persistenceNotice: null,
    promptInputs: {
      system: { mode: 'tokens', text: '' },
      user: { mode: 'tokens', text: '' },
      output: { mode: 'tokens', text: '' },
    },
    reasoningMultiplier: 1,
    recoverScenario: noop,
    refreshCatalog: noop,
    refreshing: false,
    renameScenario: noop,
    resetOnboarding: noop,
    resetScenario: noop,
    restoreScenario: noop,
    restoredPasteFields: [],
    savedScenarios: [],
    saveScenario: noop,
    selectedId: 'claude-sonnet-5',
    setBatchEnabled: noop,
    setCacheEnabled: noop,
    setCacheSharePercent: noop,
    setComparisonIds: noop,
    setModelsWatched: noop,
    setPromptInputs: noop,
    setReasoningMultiplier: noop,
    setSelectedId: noop,
    setWorkload: noop,
    toggleFavorite: noop,
    workload: {
      conversationsPerDay: 100,
      monthlyActiveUsers: 50,
      outputTokens: 200,
      revenuePerUserPerMonth: 0,
      systemTokens: 300,
      turns: 1,
      userTokens: 100,
    },
  };
}

describe('top-level route screens', () => {
  beforeEach(() => {
    mockLaunchState.mockReturnValue(launchState());
    mockNavigate.mockClear();
    mockSetParams.mockClear();
  });

  afterEach(cleanup);

  test.each([
    ['Home', HomeScreen, /Know what your AI decision costs/],
    ['Estimate', EstimateScreen, /Know the tab before you build/],
    ['Compare', CompareScreen, /See the price difference/],
    ['Learn', LearnScreen, /Understand the cost. Master the app/],
    ['Data & Alerts', DataAndAlertsScreen, /Every number shows its work/],
  ])('%s renders its defining product outcome', async (_name, Screen, heading) => {
    const view = await render(<Screen />);
    expect(view.getByText(heading)).toBeTruthy();
  });
});
