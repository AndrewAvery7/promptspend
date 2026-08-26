import { APP_ROUTES, helpHref } from '../routes';

describe('mobile routes', () => {
  test('uses a first-class Data and Alerts destination', () => {
    expect(APP_ROUTES.data).toBe('/data');
    expect(APP_ROUTES).not.toHaveProperty('more');
  });

  test('keeps Estimate separate from the startup route', () => {
    expect(APP_ROUTES.home).toBe('/home');
    expect(APP_ROUTES.estimate).toBe('/estimate');
  });

  test('builds an encoded deep link to a Help answer', () => {
    expect(String(helpHref('estimate/paste text'))).toBe('/learn?help=estimate%2Fpaste%20text');
  });
});
