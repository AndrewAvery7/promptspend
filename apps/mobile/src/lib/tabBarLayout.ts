export const TAB_BAR_MIN_HEIGHT = 72;

/**
 * BottomTabBar calculates its height and bottom padding from the Android
 * system-navigation inset. Supplying a custom height replaces that internal
 * calculation, which can put the tab contents beneath the system controls.
 *
 * This belongs outside `src/app`: Expo Router treats every module there as a
 * screen, including layout helpers without a component export.
 */
export function getTabBarNavigatorStyle() {
  return { minHeight: TAB_BAR_MIN_HEIGHT };
}
