import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { AppText, FONT_FAMILIES } from '@/components/AppText';

describe('AppText', () => {
  test('uses the display family for semantic headings', async () => {
    const { getByRole } = await render(<AppText accessibilityRole="header">Cost brief</AppText>);
    expect(StyleSheet.flatten(getByRole('header').props.style).fontFamily).toBe(FONT_FAMILIES.display);
  });

  test('uses the numeric family for tabular figures', async () => {
    const { getByText } = await render(<AppText style={{ fontVariant: ['tabular-nums'] }}>$1,613</AppText>);
    expect(StyleSheet.flatten(getByText('$1,613').props.style).fontFamily).toBe(FONT_FAMILIES.numeric);
  });

  test('keeps font scaling enabled and honors an explicit family override', async () => {
    const { getByText } = await render(<AppText style={{ fontFamily: 'System' }}>Readable</AppText>);
    const text = getByText('Readable');
    expect(text.props.allowFontScaling).toBe(true);
    expect(StyleSheet.flatten(text.props.style).fontFamily).toBe('System');
  });

  test('maps requested heavy weights to font files that are actually embedded', async () => {
    const { getByRole, getByText } = await render(
      <>
        <AppText accessibilityRole="header" style={{ fontWeight: '900' }}>
          Headline
        </AppText>
        <AppText style={{ fontWeight: '800' }}>Body label</AppText>
      </>,
    );
    expect(StyleSheet.flatten(getByRole('header').props.style).fontWeight).toBe('700');
    expect(StyleSheet.flatten(getByText('Body label').props.style).fontWeight).toBe('600');
  });
});
