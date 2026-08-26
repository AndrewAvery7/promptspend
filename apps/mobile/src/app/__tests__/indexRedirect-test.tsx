import { render } from '@testing-library/react-native';

import IndexRedirect from '../index';

const mockRedirect = jest.fn((_props: { href: string }) => null);

jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => mockRedirect(props),
}));

describe('mobile startup route', () => {
  test('redirects the root route to Home', async () => {
    await render(<IndexRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith(expect.objectContaining({ href: '/home' }));
  });
});
