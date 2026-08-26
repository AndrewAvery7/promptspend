import { GUIDED_TOUR_STEPS, padAndClamp } from '@/lib/guidedTour';

describe('guided tour flow', () => {
  test('visits every top-level product destination before global tools', () => {
    expect(GUIDED_TOUR_STEPS.map((step) => String(step.route))).toEqual([
      '/home',
      '/estimate',
      '/compare',
      '/data',
      '/learn',
      '/learn',
    ]);
  });

  test('gives every step a unique target and useful accessible copy', () => {
    expect(new Set(GUIDED_TOUR_STEPS.map((step) => step.targetId)).size).toBe(GUIDED_TOUR_STEPS.length);
    for (const step of GUIDED_TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(10);
      expect(step.body.length).toBeGreaterThan(40);
    }
  });

  test('draws the highlight outside the measured content without exceeding the viewport', () => {
    expect(padAndClamp({ height: 100, width: 200, x: 20, y: 40 }, 390, 844, 8)).toEqual({
      height: 116,
      width: 216,
      x: 12,
      y: 32,
    });
    expect(padAndClamp({ height: 100, width: 200, x: 185, y: 750 }, 390, 844, 8)).toEqual({
      height: 102,
      width: 213,
      x: 177,
      y: 742,
    });
  });
});
