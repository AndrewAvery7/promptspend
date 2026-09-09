import {
  ANDROID_TAB_BAR_FALLBACK_INSET,
  BASE_TAB_BAR_HEIGHT,
  getTabBarSafeAreaStyle,
} from '@/app/tabBarLayout';

describe('tab bar safe-area layout', () => {
  test('reserves the reported Android navigation inset', () => {
    expect(getTabBarSafeAreaStyle(24, 'android')).toEqual({
      height: BASE_TAB_BAR_HEIGHT + 24,
      minHeight: BASE_TAB_BAR_HEIGHT + 24,
      paddingBottom: 24,
    });
  });

  test('keeps a fallback clearance when Android reports no inset', () => {
    expect(getTabBarSafeAreaStyle(0, 'android')).toEqual({
      height: BASE_TAB_BAR_HEIGHT + ANDROID_TAB_BAR_FALLBACK_INSET,
      minHeight: BASE_TAB_BAR_HEIGHT + ANDROID_TAB_BAR_FALLBACK_INSET,
      paddingBottom: ANDROID_TAB_BAR_FALLBACK_INSET,
    });
  });

  test('does not change the existing iOS and web tab bar sizing', () => {
    expect(getTabBarSafeAreaStyle(34, 'ios')).toEqual({
      height: BASE_TAB_BAR_HEIGHT,
      minHeight: BASE_TAB_BAR_HEIGHT,
      paddingBottom: 0,
    });
    expect(getTabBarSafeAreaStyle(24, 'web')).toEqual({
      height: BASE_TAB_BAR_HEIGHT,
      minHeight: BASE_TAB_BAR_HEIGHT,
      paddingBottom: 0,
    });
  });
});
