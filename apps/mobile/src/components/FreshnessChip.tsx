import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Freshness } from '@promptspend/core';

import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface FreshnessChipProps {
  freshness: Freshness;
}

export function FreshnessChip({ freshness }: FreshnessChipProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const tone =
    freshness.level === 'fresh' ? theme.savings : freshness.level === 'stale' ? theme.danger : theme.warning;
  const label = freshness.checkedOn
    ? `Prices checked ${formatDate(freshness.checkedOn)}`
    : 'Price check unavailable';

  return (
    <View accessibilityLabel={`${label}. Status ${freshness.level}.`} style={styles.chip}>
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(
    new Date(year, month - 1, day),
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    chip: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      minHeight: 32,
      paddingHorizontal: 12,
    },
    dot: {
      borderRadius: 4,
      height: 8,
      width: 8,
    },
    label: {
      color: theme.mutedText,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
    },
  });
}
