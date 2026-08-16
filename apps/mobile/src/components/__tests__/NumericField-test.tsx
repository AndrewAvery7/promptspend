import { fireEvent, render } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { NumericField } from '@/components/NumericField';
import { MobileThemeProvider } from '@/theme/useMobileTheme';

async function renderField(overrides: Partial<ComponentProps<typeof NumericField>> = {}) {
  const onChange = jest.fn();
  const screen = await render(
    <MobileThemeProvider>
      <NumericField
        accessibilityHint="Adjust the reasoning multiplier"
        label="Reasoning multiplier"
        max={5}
        min={1}
        onChange={onChange}
        step={0.1}
        suffix="×"
        value={1}
        {...overrides}
      />
    </MobileThemeProvider>,
  );
  return { onChange, screen };
}

describe('NumericField', () => {
  test('preserves a decimal draft until editing is complete', async () => {
    const { onChange, screen } = await renderField();
    const input = screen.getByLabelText('Reasoning multiplier');

    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '1.');
    expect(screen.getByLabelText('Reasoning multiplier').props.value).toBe('1.');
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent.changeText(input, '1.5');
    expect(screen.getByLabelText('Reasoning multiplier').props.value).toBe('1.5');
    await fireEvent(input, 'blur');
    expect(onChange).toHaveBeenLastCalledWith(1.5);
  });

  test('normalizes a comma decimal separator', async () => {
    const { onChange, screen } = await renderField();
    const input = screen.getByLabelText('Reasoning multiplier');

    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '2,5');
    expect(screen.getByLabelText('Reasoning multiplier').props.value).toBe('2.5');
    await fireEvent(input, 'blur');
    expect(onChange).toHaveBeenLastCalledWith(2.5);
  });

  test('announces when a value is clamped', async () => {
    const { onChange, screen } = await renderField();
    const input = screen.getByLabelText('Reasoning multiplier');

    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '9');
    await fireEvent(input, 'blur');

    expect(onChange).toHaveBeenLastCalledWith(5);
    expect(
      screen.getByText('Reasoning multiplier was adjusted to the maximum of 5.').props
        .accessibilityLiveRegion,
    ).toBe('polite');
  });

  test('reverts an empty draft instead of emitting an invalid value', async () => {
    const { onChange, screen } = await renderField({ value: 2 });
    const input = screen.getByLabelText('Reasoning multiplier');

    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '');
    await fireEvent(input, 'blur');

    expect(onChange).not.toHaveBeenCalled();
    expect(input.props.value).toBe('2');
    expect(screen.getByText('Reasoning multiplier must be a number.')).toBeTruthy();
  });
});
