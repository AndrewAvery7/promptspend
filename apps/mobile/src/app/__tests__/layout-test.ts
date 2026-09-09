import { getTabBarNavigatorStyle, TAB_BAR_MIN_HEIGHT } from '@/lib/tabBarLayout';

describe('tab bar safe-area layout', () => {
  test('keeps the navigator responsible for Android navigation-bar insets', () => {
    const style = getTabBarNavigatorStyle();

    expect(style).toEqual({ minHeight: TAB_BAR_MIN_HEIGHT });
    expect(style).not.toHaveProperty('height');
    expect(style).not.toHaveProperty('paddingBottom');
  });

  test('uses the intended minimum tab-bar height', () => {
    expect(TAB_BAR_MIN_HEIGHT).toBe(72);
  });
});
