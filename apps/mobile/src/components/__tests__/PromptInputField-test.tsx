import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PromptInputField } from '@/components/PromptInputField';
import { MAX_PASTE_CHARS } from '@/lib/promptInput';
import { MobileThemeProvider } from '@/theme/useMobileTheme';

const baseProps = {
  accessibilityHint: 'Typical system instructions sent with each request',
  input: { mode: 'text' as const, text: 'Private example' },
  label: 'System prompt',
  max: 2_000_000,
  modelName: 'Test Model',
  numericValue: 800,
  onModeChange: jest.fn(),
  onNumericChange: jest.fn(),
  onTextChange: jest.fn(),
  placeholder: 'Paste system instructions',
  tokenEstimate: 321,
};

function renderField(overrides: Partial<typeof baseProps> = {}) {
  return render(
    <MobileThemeProvider>
      <PromptInputField {...baseProps} {...overrides} />
    </MobileThemeProvider>,
  );
}

describe('PromptInputField accessibility and privacy guards', () => {
  beforeEach(() => jest.clearAllMocks());

  test('exposes an understandable radio group and selected input mode', async () => {
    const screen = await renderField();
    const radios = screen.getAllByRole('radio');

    expect(radios).toHaveLength(2);
    expect(radios[0]?.props.accessibilityState).toMatchObject({ checked: false });
    expect(radios[1]?.props.accessibilityState).toMatchObject({ checked: true });
  });

  test('announces changing token estimates without exposing the prompt', async () => {
    const screen = await renderField();
    const count = screen.getByLabelText('Approximately 321 tokens for Test Model');

    expect(count.props.accessibilityLiveRegion).toBe('polite');
    expect(count.props.accessibilityLabel).not.toContain('Private example');
  });

  test('disables autofill, honors Dynamic Type, and clamps oversized clipboard input', async () => {
    const onTextChange = jest.fn();
    const screen = await renderField({ onTextChange });
    const input = screen.getByLabelText('System prompt text');
    const oversized = 'x'.repeat(MAX_PASTE_CHARS + 10);

    expect(input.props.allowFontScaling).toBe(true);
    expect(input.props.autoComplete).toBe('off');
    expect(input.props.importantForAutofill).toBe('no');
    expect(input.props.maxLength).toBe(MAX_PASTE_CHARS);
    fireEvent.changeText(input, oversized);
    expect(onTextChange).toHaveBeenCalledWith(oversized.slice(0, MAX_PASTE_CHARS));
  });

  test('keeps the destructive clear action at least 44 points tall', async () => {
    const screen = await renderField();
    const clear = screen.getByRole('button', { name: 'Clear text' });

    expect(StyleSheet.flatten(clear.props.style).minHeight).toBeGreaterThanOrEqual(44);
  });
});
