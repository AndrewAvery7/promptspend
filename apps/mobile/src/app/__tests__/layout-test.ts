import { getTabBarNavigatorStyle, TAB_BAR_MIN_HEIGHT } from '@/app/tabBarLayout';

describe('tab bar safe-area layout', () => {
  test('keeps the navigator responsible for Android navigation-bar insets', () => {
    const style = getTabBarNavigatorStyle();

    expect(style).toEqual({ minHeight: TAB_BAR_MIN_HEIGHT });
    expect(style).not.toHaveProperty('height');
  });

  test('does not replace the navigator-calculated bottom padding', () => {
    const style = getTabBarNavigatorStyle();

    expect(style).not.toHaveProperty('paddingBottom');
  });
});
