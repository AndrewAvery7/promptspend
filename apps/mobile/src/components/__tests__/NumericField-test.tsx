import { act, fireEvent, render } from '@testing-library/react-native';
import { useState, type ComponentProps } from 'react';
import { Pressable, Text } from 'react-native';

import { NumericField } from '@/components/NumericField';
import { NumericDraftScopeProvider } from '@/components/NumericDraftScope';
import {
  assertNumericDraftsValid,
  discardNumericDrafts,
  NumericDraftValidationError,
} from '@/lib/numericDrafts';
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
  test('preserves incomplete decimal text but publishes complete values before blur', async () => {
    const { onChange, screen } = await renderField();
    const input = screen.getByLabelText('Reasoning multiplier');

    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '1.');
    expect(screen.getByLabelText('Reasoning multiplier').props.value).toBe('1.');
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent.changeText(input, '1.5');
    expect(screen.getByLabelText('Reasoning multiplier').props.value).toBe('1.5');
    expect(onChange).toHaveBeenLastCalledWith(1.5);
    await fireEvent(input, 'blur');
    expect(onChange).toHaveBeenLastCalledWith(1.5);
  });

  test('normalizes a comma decimal separator', async () => {
    const { onChange, screen } = await renderField();
    const input = screen.getByLabelText('Reasoning multiplier');

    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '2,5');
    expect(screen.getByLabelText('Reasoning multiplier').props.value).toBe('2,5');
    await fireEvent(input, 'blur');
    expect(onChange).toHaveBeenLastCalledWith(2.5);
  });

  test('retains an out-of-range draft and blocks use of the old value', async () => {
    const { onChange, screen } = await renderField();
    const input = screen.getByLabelText('Reasoning multiplier');

    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '9');
    await fireEvent(input, 'blur');

    expect(onChange).not.toHaveBeenCalled();
    expect(input.props.value).toBe('9');
    expect(
      screen.getByText('Reasoning multiplier must be between 1 and 5. Edit the value to continue.').props
        .accessibilityLiveRegion,
    ).toBe('polite');
  });

  test('retains an empty draft with actionable feedback instead of silently reverting', async () => {
    const { onChange, screen } = await renderField({ value: 2 });
    const input = screen.getByLabelText('Reasoning multiplier');

    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '');
    await fireEvent(input, 'blur');

    expect(onChange).not.toHaveBeenCalled();
    expect(input.props.value).toBe('');
    expect(screen.getByText('Finish entering reasoning multiplier before continuing.')).toBeTruthy();
  });

  test('an action without blur sees the latest valid state, and incomplete drafts block it', async () => {
    const used = jest.fn();
    function Harness() {
      const [value, setValue] = useState(1);
      const [error, setError] = useState('');
      return (
        <MobileThemeProvider>
          <NumericField
            accessibilityHint="Reasoning tokens"
            label="Multiplier"
            min={1}
            max={5}
            step={0.1}
            suffix="×"
            value={value}
            onChange={setValue}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share"
            onPress={() => {
              try {
                assertNumericDraftsValid();
                used(value);
              } catch (cause) {
                setError((cause as Error).message);
              }
            }}
          >
            <Text>Share</Text>
          </Pressable>
          <Text>{error}</Text>
        </MobileThemeProvider>
      );
    }
    const screen = await render(<Harness />);
    const input = screen.getByLabelText('Multiplier');
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '1.15');
    expect(input.props.value).toBe('1.15');
    await fireEvent.press(screen.getByLabelText('Share'));
    expect(used).toHaveBeenLastCalledWith(1.2);
    expect(input.props.value).toBe('1.2');

    await fireEvent.changeText(input, '2.');
    await fireEvent.press(screen.getByLabelText('Share'));
    expect(used).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Finish entering multiplier before continuing.').length).toBeGreaterThan(0);
    expect(input.props.value).toBe('2.');

    await fireEvent.changeText(input, '2.7');
    await fireEvent.press(screen.getByLabelText('Share'));
    expect(used).toHaveBeenLastCalledWith(2.7);
  });

  test('a pending parent render cannot let an action consume old state', async () => {
    const { screen } = await renderField();
    await fireEvent(screen.getByLabelText('Reasoning multiplier'), 'focus');
    await fireEvent.changeText(screen.getByLabelText('Reasoning multiplier'), '3');
    // This fixture deliberately never updates the value prop after onChange.
    let error: unknown;
    await act(() => {
      try {
        assertNumericDraftsValid();
      } catch (cause) {
        error = cause;
      }
    });
    expect(error).toBeInstanceOf(NumericDraftValidationError);
    expect((error as Error).message).toMatch(/Updating estimate/);
  });

  test('large pasted values are retained with an error, never maxLength-truncated', async () => {
    const { screen, onChange } = await renderField();
    const input = screen.getByLabelText('Reasoning multiplier');
    const text = '12345678901234567890';
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, text);
    expect(input.props.maxLength).toBeUndefined();
    expect(input.props.value).toBe(text);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('leaving a tab excludes and clears its invalid transient draft', async () => {
    function Harness({ active }: { active: boolean }) {
      return (
        <MobileThemeProvider>
          <NumericDraftScopeProvider active={active}>
            <NumericField
              accessibilityHint="Reasoning tokens"
              label="Multiplier"
              min={1}
              max={5}
              step={0.1}
              suffix="×"
              value={1}
              onChange={jest.fn()}
            />
          </NumericDraftScopeProvider>
        </MobileThemeProvider>
      );
    }
    const screen = await render(<Harness active />);
    await fireEvent(screen.getByLabelText('Multiplier'), 'focus');
    await fireEvent.changeText(screen.getByLabelText('Multiplier'), '');
    await screen.rerender(<Harness active={false} />);
    expect(() => assertNumericDraftsValid()).not.toThrow();
    await screen.rerender(<Harness active />);
    expect(screen.getByLabelText('Multiplier').props.value).toBe('1');
    expect(() => assertNumericDraftsValid()).not.toThrow();
  });

  test('an external action updates focused text, and explicit reset can discard an invalid draft', async () => {
    function Harness() {
      const [value, setValue] = useState(1);
      return (
        <MobileThemeProvider>
          <NumericField
            accessibilityHint="Reasoning tokens"
            label="Multiplier"
            min={1}
            max={5}
            step={0.1}
            suffix="×"
            value={value}
            onChange={setValue}
          />
          <Pressable accessibilityLabel="Apply preset" onPress={() => setValue(3)}>
            <Text>Preset</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Reset"
            onPress={() => {
              discardNumericDrafts();
              setValue(3);
            }}
          >
            <Text>Reset</Text>
          </Pressable>
        </MobileThemeProvider>
      );
    }
    const screen = await render(<Harness />);
    const input = screen.getByLabelText('Multiplier');
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '1.5');
    await fireEvent.press(screen.getByLabelText('Apply preset'));
    expect(input.props.value).toBe('3');
    await fireEvent.changeText(input, '');
    await fireEvent.press(screen.getByLabelText('Reset'));
    expect(input.props.value).toBe('3');
    expect(() => assertNumericDraftsValid()).not.toThrow();
  });
});
