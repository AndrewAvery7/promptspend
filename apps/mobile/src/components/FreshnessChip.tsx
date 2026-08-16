import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/AppText';
import type { Freshness } from '@promptspend/core';

import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface FreshnessChipProps {
  freshness: Freshness;
  pricesChangedOn?: string | null;
}

export function FreshnessChip({ freshness, pricesChangedOn = null }: FreshnessChipProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const tone =
    freshness.level === 'fresh' ? theme.savings : freshness.level === 'stale' ? theme.danger : theme.warning;
  const label = freshness.checkedOn
    ? `Sources checked ${formatDate(freshness.checkedOn)}`
    : 'Source check unavailable';
  const changeLabel = pricesChangedOn
    ? `prices changed ${formatDate(pricesChangedOn)}`
    : 'no price change recorded';
  const statusLabel =
    freshness.level === 'fresh'
      ? 'Current'
      : freshness.level === 'stale'
        ? 'Refresh needed'
        : 'Status unknown';
  const statusIcon = freshness.level === 'fresh' ? '✓' : freshness.level === 'stale' ? '!' : '?';

  return (
    <View
      accessible
      accessibilityLabel={`${statusLabel}. ${label}. ${changeLabel}.`}
      accessibilityRole="text"
      style={styles.chip}
    >
      <View style={[styles.status, { borderColor: tone }]}>
        <Text style={[styles.statusText, { color: tone }]}>{statusIcon}</Text>
      </View>
      <Text style={styles.label}>
        {statusLabel} · {label} · {changeLabel}
      </Text>
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
    status: {
      alignItems: 'center',
      borderRadius: 8,
      borderWidth: 1.5,
      height: 16,
      justifyContent: 'center',
      width: 16,
    },
    statusText: { fontSize: 10, fontWeight: '900', lineHeight: 12 },
    label: {
      color: theme.mutedText,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
    },
  });
}
