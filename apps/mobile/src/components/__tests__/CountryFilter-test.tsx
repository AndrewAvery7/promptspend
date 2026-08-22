import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { CountryFilter, countryName, emptyReason } from '@/components/CountryFilter';
import { lightTheme as mockLightTheme } from '@/theme/tokens';

jest.mock('@/theme/useMobileTheme', () => ({
  useMobileTheme: () => ({ theme: mockLightTheme }),
}));

const COUNTRIES = [
  { code: 'US', count: 38 },
  { code: 'CN', count: 21 },
  { code: 'FR', count: 4 },
];

async function renderFilter(selected: string[] = [], onChange = jest.fn()) {
  const screen = await render(
    <CountryFilter
      countries={COUNTRIES}
      label="Show models from these countries"
      onChange={onChange}
      selected={selected}
    />,
  );
  return { onChange, screen };
}

describe('CountryFilter', () => {
  test('treats an empty selection as every country', async () => {
    const { onChange, screen } = await renderFilter();
    const all = screen.getByRole('button', { name: 'All countries' });

    expect(all.props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByText('All countries').props.accessibilityLiveRegion).toBe('polite');
    await fireEvent.press(all);
    expect(onChange).toHaveBeenCalledWith([]);
    expect(StyleSheet.flatten(all.props.style).minHeight).toBeGreaterThanOrEqual(48);
  });

  test('adds a country without replacing the current filter', async () => {
    const add = await renderFilter();
    await fireEvent.press(add.screen.getByRole('checkbox', { name: 'CN, China, 21 models' }));
    expect(add.onChange).toHaveBeenCalledWith(['CN']);
  });

  test('removes a country without disturbing other choices', async () => {
    const remove = await renderFilter(['US', 'CN']);
    await fireEvent.press(remove.screen.getByRole('checkbox', { name: 'CN, China, 21 models' }));
    expect(remove.onChange).toHaveBeenCalledWith(['US']);
  });

  test('does not show a filter when the catalog has no meaningful country choice', async () => {
    const screen = await render(
      <CountryFilter
        countries={[{ code: 'US', count: 1 }]}
        label="Show models from these countries"
        onChange={jest.fn()}
        selected={[]}
      />,
    );

    expect(screen.toJSON()).toBeNull();
  });
});

describe('country-filter copy', () => {
  test('uses understandable country names and falls back safely for new ISO codes', () => {
    expect(countryName('cn')).toBe('China');
    expect(countryName('DE')).toBe('DE');
  });

  test.each([
    ['', [], 'No models to show.'],
    ['sonnet', [], 'No models match “sonnet”.'],
    ['', ['CN'], 'No models from China.'],
    ['sonnet', ['CN', 'FR'], 'No model from China or France matches “sonnet”.'],
  ])('explains an empty search without hiding the active filter', (search, countries, expected) => {
    expect(emptyReason(search, countries)).toBe(expected);
  });
});
