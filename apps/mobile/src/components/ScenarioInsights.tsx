import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/AppText';
import { formatMoney, formatPercent, type ComparisonRow } from '@promptspend/core';

import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

export function ScenarioInsights({ onLearn, rows }: { onLearn: () => void; rows: readonly ComparisonRow[] }) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insights = useMemo(() => buildInsights(rows), [rows]);
  if (insights.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        What this scenario is telling you
      </Text>
      {insights.map((insight) => (
        <View key={insight} style={styles.row}>
          <Text style={styles.marker}>→</Text>
          <Text style={styles.body}>{insight}</Text>
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={onLearn}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.buttonText}>Learn why these costs move</Text>
      </Pressable>
    </View>
  );
}

function buildInsights(rows: readonly ComparisonRow[]): string[] {
  const first = rows[0];
  if (!first) return [];
  const result: string[] = [];
  const total = first.breakdown.inputCost + first.breakdown.cacheWriteCost + first.breakdown.outputCost;
  const outputShare = total > 0 ? first.breakdown.outputCost / total : 0;
  const inputTokens = first.breakdown.inputTokens;
  const historyShare = inputTokens > 0 ? first.breakdown.historyTokens / inputTokens : 0;
  if (outputShare >= 0.5)
    result.push(
      `Output drives ${formatPercent(outputShare)} of ${first.model.displayName}’s modeled conversation cost. Shorter responses are the first lever to test.`,
    );
  if (historyShare >= 0.25)
    result.push(
      `Repeated conversation history is ${formatPercent(historyShare)} of billed input. Summarization or shorter sessions can flatten the curve.`,
    );
  if (first.breakdown.cacheSavings > 0)
    result.push(
      `The cache assumption saves about ${formatMoney(first.breakdown.cacheSavings)} per conversation after the modeled write.`,
    );
  const last = rows[rows.length - 1];
  if (rows.length > 1 && last && last.deltaPerMonth > 0)
    result.push(
      `The current shortlist spans ${formatMoney(last.deltaPerMonth)} per month and ${formatMoney(last.scaled.perYear - first.scaled.perYear)} per year on the same workload.`,
    );
  if (first.scaled.margin !== null)
    result.push(
      `AI-only gross margin is ${formatPercent(first.scaled.margin, 1)} at the entered revenue and active-user assumptions.`,
    );
  return result;
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    card: { backgroundColor: theme.accentSoft, borderRadius: 16, gap: 10, padding: 18 },
    title: { color: theme.text, fontSize: 18, fontWeight: '800', lineHeight: 24 },
    row: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
    marker: { color: theme.accent, fontSize: 15, fontWeight: '900' },
    body: { color: theme.text, flex: 1, fontSize: 13, lineHeight: 19 },
    button: {
      alignItems: 'center',
      borderColor: theme.accent,
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: 'center',
      marginTop: 2,
      minHeight: 48,
      paddingHorizontal: 14,
    },
    buttonText: { color: theme.accent, fontSize: 13, fontWeight: '800' },
    pressed: { opacity: 0.68 },
  });
}
