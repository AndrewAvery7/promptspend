import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Catalog, type PricingCatalog } from '@promptspend/core';
import { randomUUID } from 'expo-crypto';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';

import { CatalogExplorer } from '@/components/CatalogExplorer';
import { DataSection } from '@/components/DataSection';
import { EmailAlertCenter } from '@/components/EmailAlertCenter';
import { LearnSection } from '@/components/LearnSection';
import { fetchAlertsConfig, subscribeEmailAlerts } from '@/lib/emailAlerts';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('react-native-webview', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    WebView: (props: object) => React.createElement(View, { ...props, testID: 'verification-webview' }),
  };
});
jest.mock('@/components/GuidedTour', () => ({
  TourTarget: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/theme/useMobileTheme', () => {
  const { createMobileTheme } = jest.requireActual('@/theme/tokens');
  return { useMobileTheme: () => ({ isDark: false, theme: createMobileTheme(false, 'cobalt', 'cool') }) };
});
jest.mock('@/lib/emailAlerts', () => ({
  ...jest.requireActual('@/lib/emailAlerts'),
  fetchAlertsConfig: jest.fn(),
  subscribeEmailAlerts: jest.fn(),
}));

const data: PricingCatalog = {
  schemaVersion: 2,
  generatedAt: '2026-08-31T12:00:00.000Z',
  providers: [{ id: 'example', name: 'Example', country: 'US', pricingUrl: 'https://example.com/pricing' }],
  models: Array.from({ length: 25 }, (_, index) => ({
    id: `model-${index}`,
    providerId: 'example',
    displayName: `Model ${String(index).padStart(2, '0')}`,
    status: 'current' as const,
    contextWindow: 100_000,
    pricing: { input: 1, output: 3 },
    tokenizer: { kind: 'approx' as const, charsPerToken: 4, cjkCharsPerToken: 2 },
    capabilities: { reasoning: false, vision: false },
    provenance: {
      source: 'vendor' as const,
      lastVerified: '2026-08-31',
      verifiedUrl: 'https://example.com/pricing',
    },
  })),
};
const catalog = new Catalog(data);

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(fetchAlertsConfig)
    .mockResolvedValue({ emailEnabled: true, turnstileRequired: true, turnstileSiteKey: 'test-key' });
  jest.mocked(randomUUID).mockReturnValue('40332171-f9ae-4902-ab8a-e6e0d9371234');
});

test('email errors stay absent until blur/submit and disappear when corrected', async () => {
  const view = await render(<EmailAlertCenter catalog={catalog} />);
  const input = await view.findByLabelText('Email address for price alerts');
  expect(view.queryByText('Enter the email address that should receive price alerts.')).toBeNull();
  await fireEvent.changeText(input, 'invalid');
  expect(view.queryByText('That does not look like a complete email address.')).toBeNull();
  await fireEvent(input, 'blur');
  expect(view.getByText('That does not look like a complete email address.')).toBeTruthy();
  await fireEvent.changeText(input, 'reader@example.com');
  expect(view.queryByText('That does not look like a complete email address.')).toBeNull();
});

test('invalid email cannot begin secure verification or subscribe', async () => {
  const view = await render(<EmailAlertCenter catalog={catalog} />);
  await fireEvent.press(await view.findByText('Send confirmation email'));
  expect(view.getByText('Enter the email address that should receive price alerts.')).toBeTruthy();
  expect(randomUUID).not.toHaveBeenCalled();
  expect(subscribeEmailAlerts).not.toHaveBeenCalled();
});

test('secure randomness failure stops verification without submitting', async () => {
  jest.mocked(randomUUID).mockImplementationOnce(() => {
    throw new Error('Unavailable');
  });
  const view = await render(<EmailAlertCenter catalog={catalog} />);
  await fireEvent.changeText(
    await view.findByLabelText('Email address for price alerts'),
    'reader@example.com',
  );
  await fireEvent.press(view.getByText('Send confirmation email'));
  expect(view.getByText('Secure verification could not start. Please try again.')).toBeTruthy();
  expect(view.queryByTestId('verification-webview')).toBeNull();
  expect(subscribeEmailAlerts).not.toHaveBeenCalled();
});

test('verification loading feedback clears after document load', async () => {
  const view = await render(<EmailAlertCenter catalog={catalog} />);
  await fireEvent.changeText(
    await view.findByLabelText('Email address for price alerts'),
    'reader@example.com',
  );
  await fireEvent.press(view.getByText('Send confirmation email'));
  expect(view.getByText('Loading secure verification…')).toBeTruthy();
  await fireEvent(view.getByTestId('verification-webview'), 'loadEnd');
  expect(view.queryByText('Loading secure verification…')).toBeNull();
});

test('alert model search can be cleared on either platform', async () => {
  const view = await render(<EmailAlertCenter catalog={catalog} />);
  await fireEvent.press(await view.findByText('Only selected models'));
  await fireEvent.changeText(view.getByLabelText('Search models for alerts'), 'Model 24');
  expect(view.getByText('Model 24')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Clear alert model search'));
  expect(view.getByLabelText('Search models for alerts').props.value).toBe('');
});

test('catalog starts bounded, offers remaining rows, and resets after search', async () => {
  const view = await render(
    <CatalogExplorer
      catalog={catalog}
      favoriteIds={[]}
      selectedIds={[]}
      onToggle={jest.fn()}
      onToggleFavorite={jest.fn()}
    />,
  );
  expect(view.getByText('Showing 20 of 25 matching models')).toBeTruthy();
  expect(view.queryByText('Model 24')).toBeNull();
  await fireEvent.press(view.getByLabelText('Show more catalog models'));
  expect(view.getByText('Model 24')).toBeTruthy();
  await fireEvent.changeText(view.getByLabelText('Search the model catalog'), 'Model 24');
  expect(view.getByText('Showing 1 of 1 matching models')).toBeTruthy();
});

test('Data resources stay available without a catalog and clipboard failures are truthful', async () => {
  jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error('Unavailable'));
  const view = await render(<DataSection onOpenHelp={jest.fn()} />);
  expect(view.getByText('Privacy & support')).toBeTruthy();
  expect(view.getByText('Pricing data and alert setup are temporarily unavailable')).toBeTruthy();
  expect(view.queryByText('Pipeline health')).toBeNull();
  await fireEvent.press(view.getByText('Copy catalog commit feed ↗'));
  await waitFor(() =>
    expect(view.getByText('The feed address could not be copied. Please try again.')).toBeTruthy(),
  );
  expect(view.queryByText('Feed address copied.')).toBeNull();
});

test('Data link failures offer a retry message', async () => {
  jest.mocked(WebBrowser.openBrowserAsync).mockRejectedValueOnce(new Error('Unavailable'));
  const view = await render(<DataSection onOpenHelp={jest.fn()} />);
  await fireEvent.press(view.getByText('Read the privacy policy ↗'));
  await waitFor(() =>
    expect(view.getByText('This link could not open. Check your connection and try again.')).toBeTruthy(),
  );
});

test('Learn displays sample limit feedback and acknowledges help intent', async () => {
  const onConsumed = jest.fn();
  const view = await render(
    <LearnSection
      catalog={catalog}
      initialHelpEntryId="compare-select"
      onHelpEntryConsumed={onConsumed}
      onNavigate={jest.fn()}
    />,
  );
  expect(onConsumed).toHaveBeenCalledTimes(1);
  await fireEvent.changeText(view.getByLabelText('Sample text to tokenize'), 'x'.repeat(200_000));
  expect(view.getByText(/200,000 \/ 200,000 characters/)).toBeTruthy();
  expect(view.getByText(/Limit reached/)).toBeTruthy();
});
