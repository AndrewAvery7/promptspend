import { APP_ROUTES } from '../routes';

describe('mobile routes', () => {
  test('uses a first-class Data and Alerts destination', () => {
    expect(APP_ROUTES.data).toBe('/data');
    expect(APP_ROUTES).not.toHaveProperty('more');
  });
});
