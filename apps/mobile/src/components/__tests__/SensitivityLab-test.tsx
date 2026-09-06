import { fireEvent, render } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Alert } from 'react-native';
import type { Model } from '@promptspend/core';

import { SensitivityLab } from '@/components/SensitivityLab';
import { NumericField } from '@/components/NumericField';
import { NumericDraftScopeProvider } from '@/components/NumericDraftScope';
import { createDefaultPromptInputs, type PromptInputState } from '@/lib/promptInput';
import { DEFAULT_WORKLOAD } from '@/state/useLaunchState';
import { MobileThemeProvider } from '@/theme/useMobileTheme';

const model: Model = {
  capabilities: { reasoning: false, vision: false },
  contextWindow: 128000,
  displayName: 'Test model',
  id: 'test-model',
  pricing: { input: 2, output: 10 },
  provenance: { lastVerified: '2026-08-31', source: 'vendor' },
  providerId: 'test',
  status: 'current',
  tokenizer: { charsPerToken: 4, cjkCharsPerToken: 1.5, kind: 'approx' },
};

type LabProps = ComponentProps<typeof SensitivityLab>;
const workload = { ...DEFAULT_WORKLOAD, conversationsPerDay: 1000, turns: 4, outputTokens: 1000 };
const baseProps: LabProps = {
  batchEnabled: false,
  cacheEnabled: false,
  cacheSharePercent: 0,
  model,
  onApply: () => undefined,
  promptInputs: createDefaultPromptInputs(),
  pricingDay: '2026-08-31',
  reasoningMultiplier: 1,
  workload,
};

function Lab({ props }: { props: LabProps }) {
  return (
    <MobileThemeProvider>
      <NumericDraftScopeProvider active>
        <SensitivityLab {...props} />
      </NumericDraftScopeProvider>
    </MobileThemeProvider>
  );
}

describe('Sensitivity preview editing', () => {
  test('retains manually edited traffic when pasted response changes, while untouched turns follow baseline', async () => {
    const promptInputs: PromptInputState = {
      ...createDefaultPromptInputs(),
      output: { mode: 'text', text: 'abcd'.repeat(10) },
    };
    const props = { ...baseProps, promptInputs };
    const screen = await render(<Lab props={props} />);
    const traffic = screen.getByLabelText('Preview conversations per day');
    await fireEvent(traffic, 'focus');
    await fireEvent.changeText(traffic, '2400');
    expect(screen.getByText('10 derived tokens')).toBeTruthy();

    await screen.rerender(
      <Lab
        props={{
          ...props,
          promptInputs: { ...promptInputs, output: { mode: 'text', text: 'abcd'.repeat(25) } },
          workload: { ...workload, conversationsPerDay: 1200, turns: 7 },
        }}
      />,
    );

    expect(screen.getByLabelText('Preview conversations per day').props.value).toBe('2400');
    expect(screen.getByLabelText('Preview turns').props.value).toBe('7');
    expect(screen.getByText('25 derived tokens')).toBeTruthy();
    expect(screen.queryByLabelText('Preview response length')).toBeNull();
  });

  test('untouched traffic follows the new baseline and manually edited numeric output stays independent', async () => {
    const screen = await render(<Lab props={baseProps} />);
    const output = screen.getByLabelText('Preview response length');
    await fireEvent(output, 'focus');
    await fireEvent.changeText(output, '1500');

    await screen.rerender(
      <Lab
        props={{
          ...baseProps,
          workload: { ...workload, conversationsPerDay: 1700, outputTokens: 1100 },
        }}
      />,
    );

    expect(screen.getByLabelText('Preview conversations per day').props.value).toBe('1700');
    expect(screen.getByLabelText('Preview response length').props.value).toBe('1500');
  });

  test('Apply rejects an invalid preview and uses the latest valid edit without blur', async () => {
    const applied = jest.fn();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    try {
      const screen = await render(<Lab props={{ ...baseProps, onApply: applied }} />);
      const traffic = screen.getByLabelText('Preview conversations per day');
      await fireEvent(traffic, 'focus');
      await fireEvent.changeText(traffic, '2500');
      await fireEvent.changeText(traffic, '');
      await fireEvent.press(screen.getByText('Apply preview'));
      expect(applied).not.toHaveBeenCalled();
      expect(alert).toHaveBeenCalledWith(
        'Check this preview',
        'Finish entering preview conversations per day before continuing.',
      );

      await fireEvent.changeText(traffic, '2600');
      await fireEvent.press(screen.getByText('Apply preview'));
      expect(applied).toHaveBeenCalledWith({ conversationsPerDay: 2600, outputTokens: 1000, turns: 4 });
    } finally {
      alert.mockRestore();
    }
  });

  test('Baseline clears incomplete text even if the underlying preview value never changed', async () => {
    const screen = await render(<Lab props={baseProps} />);
    const traffic = screen.getByLabelText('Preview conversations per day');
    await fireEvent(traffic, 'focus');
    await fireEvent.changeText(traffic, '');
    await fireEvent(traffic, 'blur');
    await fireEvent.press(screen.getByText('Baseline'));
    expect(screen.getByLabelText('Preview conversations per day').props.value).toBe('1000');
    expect(screen.queryByText('Finish entering preview conversations per day before continuing.')).toBeNull();
  });

  test('Restore clears incomplete text and returns an edited preview to its baseline', async () => {
    const screen = await render(<Lab props={baseProps} />);
    const traffic = screen.getByLabelText('Preview conversations per day');
    await fireEvent(traffic, 'focus');
    await fireEvent.changeText(traffic, '2400');
    await fireEvent.changeText(traffic, '');
    await fireEvent.press(screen.getByText('Restore'));
    expect(screen.getByLabelText('Preview conversations per day').props.value).toBe('1000');
  });

  test('Restore remains usable for an invalid unchanged preview and does not discard main estimate text', async () => {
    const screen = await render(
      <MobileThemeProvider>
        <NumericDraftScopeProvider active>
          <NumericField
            accessibilityHint="Main estimate tokens"
            label="Main user tokens"
            max={200000}
            value={500}
            suffix="tokens"
            onChange={() => undefined}
          />
          <SensitivityLab {...baseProps} />
        </NumericDraftScopeProvider>
      </MobileThemeProvider>,
    );
    await fireEvent.changeText(screen.getByLabelText('Main user tokens'), 'not finished');
    await fireEvent.changeText(screen.getByLabelText('Preview conversations per day'), '');
    await fireEvent.press(screen.getByText('Restore'));
    expect(screen.getByLabelText('Preview conversations per day').props.value).toBe('1000');
    expect(screen.getByLabelText('Main user tokens').props.value).toBe('not finished');
  });
});
