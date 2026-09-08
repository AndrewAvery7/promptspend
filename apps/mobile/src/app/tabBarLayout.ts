export const BASE_TAB_BAR_HEIGHT = 72;
export const ANDROID_TAB_BAR_FALLBACK_INSET = 16;

/**
 * The tab navigator is edge-to-edge on recent Android releases. Reserve the
 * system navigation area so wrapped labels (notably Data & Alerts) remain
 * fully visible above gesture/three-button navigation controls.
 */
export function getTabBarSafeAreaStyle(
  bottomInset: number,
  platform: 'android' | 'ios' | 'web' = 'web',
) {
  const safeBottomInset =
    platform === 'android' ? Math.max(bottomInset, ANDROID_TAB_BAR_FALLBACK_INSET) : 0;
  return {
    height: BASE_TAB_BAR_HEIGHT + safeBottomInset,
    minHeight: BASE_TAB_BAR_HEIGHT + safeBottomInset,
    paddingBottom: safeBottomInset,
  };
}
