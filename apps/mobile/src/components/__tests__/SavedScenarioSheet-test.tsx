import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Alert } from 'react-native';
import { SavedScenarioSheet } from '@/components/SavedScenarioSheet';
import type { SavedScenario } from '@/state/useLaunchState';

jest.mock('@/theme/useMobileTheme', () => {
  const { createMobileTheme } = jest.requireActual('@/theme/tokens');
  return { useMobileTheme: () => ({ theme: createMobileTheme(false, 'cobalt', 'cool') }) };
});

const scenario: SavedScenario = {
  id: 'saved-1',
  name: 'My estimate',
  savedAt: '2026-08-31T12:00:00Z',
  selectedId: 'test',
  batchEnabled: false,
  cacheEnabled: false,
  cacheSharePercent: 0,
  comparisonIds: ['test'],
  pastedFields: [],
  reasoningMultiplier: 1,
  workload: {
    systemTokens: 10,
    userTokens: 20,
    outputTokens: 30,
    turns: 1,
    conversationsPerDay: 10,
    monthlyActiveUsers: 1,
    revenuePerUserPerMonth: 0,
  },
};

function props() {
  return {
    scenario,
    onClose: jest.fn(),
    onOpen: jest.fn(),
    onDelete: jest.fn().mockResolvedValue(true),
    onDuplicate: jest.fn().mockResolvedValue(true),
    onRename: jest.fn().mockResolvedValue(true),
  };
}

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

test('sheet uses keyboard avoidance and scrolling, and honors reduced motion', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
  const view = await render(<SavedScenarioSheet {...props()} />);
  expect(view.getByTestId('saved-scenario-keyboard')).toBeTruthy();
  expect(view.getByTestId('saved-scenario-scroll')).toBeTruthy();
  expect(view.getByTestId('saved-scenario-modal').props.animationType).toBe('none');
});

test('duplicate blocks repeated presses until persistence acknowledges', async () => {
  const callbacks = props();
  let finish!: (saved: boolean) => void;
  callbacks.onDuplicate.mockReturnValue(
    new Promise<boolean>((resolve) => {
      finish = resolve;
    }),
  );
  const view = await render(<SavedScenarioSheet {...callbacks} />);
  const button = view.getByRole('button', { name: 'Duplicate scenario' });
  await fireEvent.press(button);
  await fireEvent.press(button);
  expect(callbacks.onDuplicate).toHaveBeenCalledTimes(1);
  expect(view.getByText('Saving change…')).toBeTruthy();
  await act(async () => finish(false));
  expect(view.getByText(/This change could not be saved/)).toBeTruthy();
  expect(callbacks.onClose).not.toHaveBeenCalled();
});

test('delete failure retains the sheet, successful delete closes it', async () => {
  const confirm = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const callbacks = props();
  callbacks.onDelete.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const view = await render(<SavedScenarioSheet {...callbacks} />);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await fireEvent.press(view.getByRole('button', { name: 'Delete scenario' }));
    const buttons = confirm.mock.calls[attempt][2];
    await act(async () => {
      buttons?.find((button) => button.text === 'Delete')?.onPress?.();
    });
    if (attempt === 0) expect(callbacks.onClose).not.toHaveBeenCalled();
  }
  await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledTimes(1));
  confirm.mockRestore();
});

test('rename failure is shown without discarding the typed name', async () => {
  const callbacks = props();
  callbacks.onRename.mockResolvedValue(false);
  const view = await render(<SavedScenarioSheet {...callbacks} />);
  await fireEvent.changeText(view.getByLabelText('Saved scenario name'), 'Revised estimate');
  await fireEvent.press(view.getByRole('button', { name: 'Save new name' }));
  await waitFor(() => expect(view.getByText(/This change could not be saved/)).toBeTruthy());
  expect(view.getByLabelText('Saved scenario name').props.value).toBe('Revised estimate');
  expect(callbacks.onRename).toHaveBeenCalledWith(scenario, 'Revised estimate');
});
