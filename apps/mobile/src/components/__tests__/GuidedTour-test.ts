import { GUIDED_TOUR_STEPS } from '@/lib/guidedTour';

describe('guided tour flow', () => {
  test('visits every top-level product destination before global tools', () => {
    expect(GUIDED_TOUR_STEPS.map((step) => String(step.route))).toEqual([
      '/home',
      '/',
      '/compare',
      '/learn',
      '/data',
      '/data',
    ]);
  });

  test('gives every step a unique target and useful accessible copy', () => {
    expect(new Set(GUIDED_TOUR_STEPS.map((step) => step.targetId)).size).toBe(GUIDED_TOUR_STEPS.length);
    for (const step of GUIDED_TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(10);
      expect(step.body.length).toBeGreaterThan(40);
    }
  });
});
