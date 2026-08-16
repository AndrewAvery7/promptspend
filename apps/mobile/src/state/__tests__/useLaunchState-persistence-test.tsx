import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  LaunchStateProvider,
  QUARANTINE_STORAGE_KEY,
  STORAGE_KEY,
  useLaunchState,
} from '@/state/useLaunchState';

jest.mock('@/data/catalog', () => ({
  MOBILE_CATALOG_MAX_AGE_MS: 24 * 60 * 60 * 1000,
  loadMobileCatalog: jest.fn(() => Promise.reject(new Error('offline test'))),
}));

function Probe() {
  const launch = useLaunchState();
  return <Text>{launch.hydrated ? (launch.persistenceNotice ?? 'ready') : 'loading'}</Text>;
}

describe('LaunchStateProvider persistence recovery', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('quarantines corrupt state and never overwrites the original with defaults', async () => {
    const corrupt = '{not-json:SENTINEL_SAVED_SCENARIO';
    await AsyncStorage.setItem(STORAGE_KEY, corrupt);

    const screen = await render(
      <LaunchStateProvider>
        <Probe />
      </LaunchStateProvider>,
    );

    await waitFor(() => expect(screen.getByText(/recovery copy was preserved/i)).toBeTruthy());
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe(corrupt);
    expect(await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)).toBe(corrupt);
  });
});
