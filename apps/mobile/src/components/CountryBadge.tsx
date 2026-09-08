import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/AppText';
import { countryFlag, countryName } from '@/lib/countries';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

export function CountryBadge({ country }: { country?: string | null }) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (!country) return null;
  const code = country.trim().toUpperCase();
  return (
    <View
      accessibilityLabel={`Provider country: ${countryName(code)} (${code})`}
      accessibilityRole="text"
      style={styles.badge}
    >
      <Text accessibilityElementsHidden style={styles.flag}>
        {countryFlag(code)}
      </Text>
      <Text style={styles.text}>{countryName(code)}</Text>
    </View>
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    badge: {
      alignItems: 'center',
      alignSelf: 'flex-end',
      backgroundColor: theme.background,
      borderColor: theme.border,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 5,
      marginTop: 2,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    flag: { fontSize: 15, lineHeight: 18 },
    text: { color: theme.mutedText, fontSize: 10, fontWeight: '700', lineHeight: 14 },
  });
}
