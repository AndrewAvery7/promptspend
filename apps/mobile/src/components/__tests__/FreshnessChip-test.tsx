import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { FreshnessChip } from '@/components/FreshnessChip';

jest.mock('@/theme/useMobileTheme', () => {
  const { createMobileTheme } = jest.requireActual('@/theme/tokens');
  return { useMobileTheme: () => ({ isDark: false, theme: createMobileTheme(false, 'cobalt', 'cool') }) };
});

describe('FreshnessChip', () => {
  test('uses a compact, outlined, one-line status label on narrow Android screens', async () => {
    const view = await render(
      <FreshnessChip
        freshness={{ ageDays: 0, checkedOn: '2026-09-09', level: 'fresh' }}
        pricesChangedOn="2026-09-01"
      />,
    );

    const chip = view.getByLabelText('Current. Sources checked Sep 9. prices changed Sep 1.');
    const styles = StyleSheet.flatten(chip.props.style);
    const label = view.getByText('Current · checked Sep 9 · changed Sep 1');

    expect(styles).toMatchObject({ alignSelf: 'center', backgroundColor: '#EBEFF5', borderColor: '#808A98' });
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.ellipsizeMode).toBe('tail');
  });
});
