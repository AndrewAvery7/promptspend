import { cleanup, fireEvent, render } from '@testing-library/react-native';
import { Catalog, type PricingCatalog } from '@promptspend/core';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import CompareScreen from '../compare';
import DataAndAlertsScreen from '../data';
import EstimateScreen from '../estimate';
import HomeScreen from '../home';
import LearnScreen from '../learn';

const mockNavigate = jest.fn();
const mockSetParams = jest.fn();
const mockLaunchState = jest.fn();

jest.mock('expo-router', () => ({
  useIsFocused: () => true,
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
    applySharedScenario: noop,
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
    persistenceBlocked: false,
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
    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, bottom: 34, left: 0, right: 0 },
        }}
      >
        <Screen />
      </SafeAreaProvider>,
    );
    expect(view.getByText(heading)).toBeTruthy();
  });

  test('Estimate keeps optional cost assumptions behind a labeled disclosure', async () => {
    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, bottom: 34, left: 0, right: 0 },
        }}
      >
        <EstimateScreen />
      </SafeAreaProvider>,
    );

    const disclosure = view.getByText('Advanced assumptions');
    expect(view.queryByText('Assume prompt caching')).toBeNull();
    expect(view.getByText(/Cache off · Batch off · Reasoning 1.0×/)).toBeTruthy();

    await fireEvent.press(disclosure);

    expect(view.getByText('Assume prompt caching')).toBeTruthy();
    expect(view.getByText('Use batch API where available')).toBeTruthy();
    expect(view.getByLabelText('Reasoning token multiplier')).toBeTruthy();
  });

  async function renderHome() {
    return render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, bottom: 34, left: 0, right: 0 },
        }}
      >
        <HomeScreen />
      </SafeAreaProvider>,
    );
  }

  test('Home waits for local hydration rather than claiming saved data is empty', async () => {
    mockLaunchState.mockReturnValue({ ...launchState(), hydrated: false });
    const view = await renderHome();
    expect(view.getByText('Loading saved scenarios…')).toBeTruthy();
    expect(view.getByText('Loading watched models…')).toBeTruthy();
    expect(view.queryByText('No saved scenarios yet')).toBeNull();
    expect(view.queryByText('Your watchlist is ready')).toBeNull();
  });

  test('Home distinguishes quarantined storage from genuinely empty collections', async () => {
    mockLaunchState.mockReturnValue({
      ...launchState(),
      persistenceBlocked: true,
      persistenceNotice: 'Local data needs recovery. The original data has not been overwritten.',
    });
    const view = await renderHome();
    expect(view.getByText(/Saved scenarios are protected while storage recovery is pending/)).toBeTruthy();
    expect(view.getByText('Your watchlist is protected while storage recovery is pending.')).toBeTruthy();
    expect(view.queryByText('No saved scenarios yet')).toBeNull();
    expect(view.queryByText('Your watchlist is ready')).toBeNull();
  });

  test('Home preserves watched-model count when pricing is unavailable', async () => {
    mockLaunchState.mockReturnValue({
      ...launchState(),
      favorites: ['claude-sonnet-5', 'unavailable-model'],
      catalogResult: null,
      catalogError: 'Reconnect to validate prices.',
    });
    const view = await renderHome();
    expect(view.getByText('2 watched models saved')).toBeTruthy();
    expect(view.getByText(/Your choices are kept/)).toBeTruthy();
    expect(view.queryByText('Your watchlist is ready')).toBeNull();
    expect(view.queryByText(/Bookmark the active model or models in Compare/)).toBeNull();
  });

  test('Home can reveal the seventh watched model and collapse again', async () => {
    const models = Array.from({ length: 7 }, (_, index) => ({
      ...PRICING.models[0],
      id: `watched-${index + 1}`,
      displayName: `Watched model ${index + 1}`,
    }));
    const state = launchState();
    mockLaunchState.mockReturnValue({
      ...state,
      favorites: models.map((model) => model.id),
      selectedId: models[0].id,
      comparisonIds: [models[0].id],
      catalogResult: { ...state.catalogResult, catalog: new Catalog({ ...PRICING, models }) },
    });
    const view = await renderHome();
    expect(view.queryByText('Watched model 7')).toBeNull();
    await fireEvent.press(view.getByText('View all 7 watched models'));
    expect(view.getByText('Watched model 7')).toBeTruthy();
    await fireEvent.press(view.getByText('Show first six'));
    expect(view.queryByText('Watched model 7')).toBeNull();
  });

  test('Home keeps a useful saved scenario visible when its saved date is malformed', async () => {
    const state = launchState();
    mockLaunchState.mockReturnValue({
      ...state,
      savedScenarios: [
        {
          id: 'corrupt-date-only',
          name: 'Preserved estimate',
          savedAt: 'not-a-valid-date',
          selectedId: 'claude-sonnet-5',
          comparisonIds: ['claude-sonnet-5'],
          batchEnabled: false,
          cacheEnabled: false,
          cacheSharePercent: 0,
          pastedFields: [],
          reasoningMultiplier: 1,
          workload: state.workload,
        },
      ],
    });
    const view = await renderHome();
    expect(view.getByText('Preserved estimate')).toBeTruthy();
    expect(view.getByText(/Date unavailable · 100\/day/)).toBeTruthy();
    expect(view.queryByText('No saved scenarios yet')).toBeNull();
  });
});
