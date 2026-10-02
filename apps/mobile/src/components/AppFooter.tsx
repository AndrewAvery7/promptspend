import { StyleSheet } from 'react-native';

import { AppText as Text } from '@/components/AppText';
import { useMobileTheme } from '@/theme/useMobileTheme';

const FOOTER_COPY = 'Private by design · validated prices · no account required';

export function AppFooter() {
  const { theme } = useMobileTheme();
  return <Text style={[styles.footer, { color: theme.mutedText }]}>{FOOTER_COPY}</Text>;
}

const styles = StyleSheet.create({
  footer: {
    fontSize: 11,
    lineHeight: 18,
    paddingVertical: 12,
    textAlign: 'center',
  },
});
