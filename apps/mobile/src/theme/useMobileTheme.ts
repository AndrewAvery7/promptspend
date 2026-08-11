import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme } from './tokens';

export function useMobileTheme() {
  const isDark = useColorScheme() === 'dark';
  return { isDark, theme: isDark ? darkTheme : lightTheme };
}
