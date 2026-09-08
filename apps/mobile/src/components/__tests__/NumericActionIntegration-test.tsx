import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Share, Text } from 'react-native';
import * as ReactNative from 'react-native';
import * as Sharing from 'expo-sharing';
import {
  Catalog,
  compareModels,
  buildEstimateShareText,
  buildComparisonShareText,
  type PricingCatalog,
} from '@promptspend/core';

import { NumericField } from '@/components/NumericField';
import { NumericDraftScopeProvider } from '@/components/NumericDraftScope';
import { EstimateResult } from '@/components/EstimateResult';
import { ComparisonResult } from '@/components/ComparisonResult';
import { ScenarioActions } from '@/components/ScenarioActions';
import { MobileThemeProvider } from '@/theme/useMobileTheme';
import { DEFAULT_WORKLOAD, LaunchStateProvider, STORAGE_KEY, useLaunchState } from '@/state/useLaunchState';

const mockWrittenCsv = jest.fn();
jest.mock('expo-file-system', () => ({
  Paths: { cache: { list: () => [] } },
  File: class {
    uri = 'file:///cache/estimate.csv';
    write(text: string) {
      mockWrittenCsv(text);
    }
  },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///cache/receipt.png') }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});
jest.mock('@/data/catalog', () => ({
  ...jest.requireActual('@/data/catalog'),
  loadMobileCatalog: jest.fn(async () => ({
    catalog: mockCatalog,
    source: 'network',
    refreshedAt: new Date(),
    warning: null,
  })),
}));

const pricing: PricingCatalog = {
  schemaVersion: 2,
  generatedAt: '2026-08-31T12:00:00.000Z',
  providers: [{ id: 'test', name: 'Test', country: 'US' }],
  models: ['test-one', 'test-two'].map((id, index) => ({
    id,
    providerId: 'test',
    displayName: id,
    status: 'current',
    contextWindow: 128000,
    pricing: { input: 1 + index, output: 2 + index },
    tokenizer: { kind: 'approx', charsPerToken: 4, cjkCharsPerToken: 1.5 },
    capabilities: { reasoning: false, vision: false },
    provenance: { source: 'vendor', lastVerified: '2026-08-31' },
  })),
};
const mockCatalog = new Catalog(pricing);

function Workspace() {
  const launch = useLaunchState();
  const rows = compareModels(mockCatalog.primaryModels, launch.workload, launch.workload);
  const first = rows[0];
  return (
    <NumericDraftScopeProvider active>
      <Text>{launch.hydrated && launch.catalogResult ? 'Ready for actions' : 'Loading'}</Text>
      <Text>{launch.persistenceNotice}</Text>
      <NumericField
        accessibilityHint="User prompt tokens"
        label="User tokens"
        min={0}
        max={200000}
        suffix="tokens"
        value={launch.workload.userTokens}
        onChange={(value) => launch.setWorkload((state) => ({ ...state, userTokens: value }))}
      />
      <EstimateResult
        breakdown={first.breakdown}
        model={first.model}
        scaled={first.scaled}
        validateAction={launch.assertCurrentPricing}
      />
      <ComparisonResult catalog={mockCatalog} rows={rows} validateAction={launch.assertCurrentPricing} />
      <ScenarioActions
        {...launch.workload}
        batchEnabled={false}
        cacheShare={0}
        catalog={mockCatalog}
        modelIds={rows.map((row) => row.model.id)}
        pastedFields={[]}
        pricingAsOf={new Date('2026-08-13T12:00:00Z')}
        reasoningMultiplier={1}
        rows={rows}
      />
    </NumericDraftScopeProvider>
  );
}

async function openWorkspace() {
  const screen = await render(
    <MobileThemeProvider>
      <LaunchStateProvider>
        <Workspace />
      </LaunchStateProvider>
    </MobileThemeProvider>,
  );
  await waitFor(() => expect(screen.getByText('Ready for actions')).toBeTruthy());
  const input = screen.getByLabelText('User tokens');
  await fireEvent(input, 'focus');
  return { screen, input };
}

describe('numeric edits through real pricing and action components', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockWrittenCsv.mockClear();
    jest.mocked(Sharing.shareAsync).mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    // Native share-sheet anchor resolution is platform plumbing, not this test's subject.
    jest.spyOn(ReactNative, 'findNodeHandle').mockReturnValue(1);
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // This real-provider/real-receipt integration also pays Jest's cold native
  // module transformation cost under --no-cache; keep its allowance local.
  test('Estimate and Compare share the latest typed workload without blur', async () => {
    const { screen, input } = await openWorkspace();
    await fireEvent.changeText(input, '900');
    const workload = { ...DEFAULT_WORKLOAD, userTokens: 900 };
    const rows = compareModels(mockCatalog.primaryModels, workload, workload);
    await fireEvent.press(screen.getByLabelText('Share this PromptSpend estimate'));
    await waitFor(() =>
      expect(Share.share).toHaveBeenCalledWith(
        expect.objectContaining({ message: buildEstimateShareText(rows[0]) }),
        expect.anything(),
      ),
    );
    await fireEvent.press(screen.getByLabelText('Share this PromptSpend model comparison'));
    await waitFor(() =>
      expect(Share.share).toHaveBeenCalledWith(
        expect.objectContaining({ message: buildComparisonShareText(rows) }),
        expect.anything(),
      ),
    );
  }, 15000);

  test('an incomplete input blocks both native share entry points', async () => {
    const { screen, input } = await openWorkspace();
    await fireEvent.changeText(input, '');
    await fireEvent.press(screen.getByLabelText('Share this PromptSpend estimate'));
    await fireEvent.press(screen.getByLabelText('Share this PromptSpend model comparison'));
    expect(Share.share).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Sharing is unavailable',
      'Finish entering user tokens before continuing.',
    );
  });

  test('Save persists the latest typed value, while invalid input cannot create another scenario', async () => {
    const { screen, input } = await openWorkspace();
    await fireEvent.changeText(input, '1234');
    await fireEvent.press(screen.getByText('Save on this device'));
    await waitFor(() => expect(screen.getByText(/Saved “AI cost scenario/)).toBeTruthy());
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
    expect(stored.savedScenarios).toHaveLength(1);
    expect(stored.savedScenarios[0].workload.userTokens).toBe(1234);

    await fireEvent.changeText(input, 'not a number');
    await fireEvent.press(screen.getByText('Save on this device'));
    await waitFor(() =>
      expect(screen.getAllByText(/User tokens must be a number/).length).toBeGreaterThan(0),
    );
    expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!).savedScenarios).toHaveLength(1);
  });

  test('CSV uses latest computed rows; invalid input creates no file or share', async () => {
    const { screen, input } = await openWorkspace();
    await fireEvent.changeText(input, '987');
    await fireEvent.press(screen.getByText('Export CSV'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    const workload = { ...DEFAULT_WORKLOAD, userTokens: 987 };
    const rows = compareModels(mockCatalog.primaryModels, workload, workload);
    expect(mockWrittenCsv.mock.calls[0][0]).toContain(rows[0].scaled.perConversation.toFixed(6));
    mockWrittenCsv.mockClear();
    jest.mocked(Sharing.shareAsync).mockClear();
    await fireEvent.changeText(input, '');
    await fireEvent.press(screen.getByText('Export CSV'));
    expect(mockWrittenCsv).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  test('Receipt opens only after valid input and readable text reflects the latest workload', async () => {
    const { screen, input } = await openWorkspace();
    await fireEvent.changeText(input, '');
    await fireEvent.press(screen.getByText('Create Estimate Receipt'));
    expect(screen.queryByLabelText('Close Estimate Receipt')).toBeNull();
    await fireEvent.changeText(input, '777');
    await fireEvent.press(screen.getByText('Create Estimate Receipt'));
    expect(screen.getByLabelText('Close Estimate Receipt')).toBeTruthy();
    await fireEvent.press(screen.getByText('Share readable text'));
    await waitFor(() => expect(Share.share).toHaveBeenCalled());
    const workload = { ...DEFAULT_WORKLOAD, userTokens: 777 };
    const rows = compareModels(mockCatalog.primaryModels, workload, workload);
    expect(jest.mocked(Share.share).mock.calls.at(-1)?.[0].message).toBe(buildComparisonShareText(rows));
  });
});
