import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { HelpCenter } from '@/components/HelpCenter';

jest.mock('@/theme/useMobileTheme', () => {
  const { createMobileTheme } = jest.requireActual('@/theme/tokens');
  return {
    useMobileTheme: () => ({
      theme: createMobileTheme(false, 'cobalt', 'cool'),
    }),
  };
});

describe('HelpCenter', () => {
  test('opens a deep-linked answer and runs its in-app action', async () => {
    const onNavigate = jest.fn();
    const view = await render(<HelpCenter initialEntryId="compare-select" onNavigate={onNavigate} />);

    await waitFor(() => expect(view.getByText('How do I select up to four models?')).toBeTruthy());
    expect(view.getByText(/Open the comparison model picker/)).toBeTruthy();

    fireEvent.press(view.getByText('Choose comparison models'));
    expect(onNavigate).toHaveBeenCalledWith('compare');
  });

  test('searches all categories and offers recovery when nothing matches', async () => {
    const view = await render(<HelpCenter onNavigate={jest.fn()} />);
    const search = view.getByLabelText('Search Help and FAQs');

    fireEvent.changeText(search, 'pasted prompts private');
    await waitFor(() =>
      expect(view.getByText('Does PromptSpend upload or save pasted prompts?')).toBeTruthy(),
    );

    fireEvent.changeText(search, 'zzzz-no-such-help');
    await waitFor(() => expect(view.getByText('No exact answer yet')).toBeTruthy());
    expect(view.getByText(/Try a broader term/)).toBeTruthy();
  });
});
