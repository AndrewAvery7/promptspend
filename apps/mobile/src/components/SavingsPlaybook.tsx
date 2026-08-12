import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMoney, formatPercent, type ComparisonRow, type Model, type Scale } from '@promptspend/core';

import type { PromptInputState } from '@/lib/promptInput';
import { workloadForModel } from '@/lib/promptInput';
import { buildSavingsPlaybook, type SavingsLever } from '@/lib/savingsPlaybook';
import type { WorkloadState } from '@/state/useLaunchState';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface SavingsPlaybookProps {
  batchEnabled: boolean;
  cacheEnabled: boolean;
  cacheSharePercent: number;
  comparisonRows: readonly ComparisonRow[];
  model: Model;
  onApply: (lever: SavingsLever) => void;
  promptInputs: PromptInputState;
  reasoningMultiplier: number;
  workload: WorkloadState;
}

export function SavingsPlaybook({
  batchEnabled,
  cacheEnabled,
  cacheSharePercent,
  comparisonRows,
  model,
  onApply,
  promptInputs,
  reasoningMultiplier,
  workload,
}: SavingsPlaybookProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [expanded, setExpanded] = useState(false);
  const scale: Scale = useMemo(
    () => ({
      conversationsPerDay: workload.conversationsPerDay,
      monthlyActiveUsers: workload.monthlyActiveUsers,
      revenuePerUserPerMonth: workload.revenuePerUserPerMonth,
    }),
    [workload.conversationsPerDay, workload.monthlyActiveUsers, workload.revenuePerUserPerMonth],
  );
  const effectiveWorkload = useMemo(
    () => workloadForModel(model, promptInputs, workload),
    [model, promptInputs, workload],
  );
  const levers = useMemo(
    () =>
      buildSavingsPlaybook({
        comparisonRows,
        model,
        options: {
          cachedInputShare: cacheEnabled ? cacheSharePercent / 100 : 0,
          reasoningMultiplier,
          useBatchApi: batchEnabled,
        },
        scale,
        workload: effectiveWorkload,
      }),
    [
      batchEnabled,
      cacheEnabled,
      cacheSharePercent,
      comparisonRows,
      effectiveWorkload,
      model,
      reasoningMultiplier,
      scale,
    ],
  );

  if (levers.length === 0) return null;
  const visibleLevers = expanded ? levers : levers.slice(0, 3);

  return (
    <View style={styles.card} testID="savings-playbook">
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>DECISION INTELLIGENCE</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Savings Playbook
          </Text>
          <Text style={styles.summary}>
            Ranked previews from this scenario—not generic advice. Review the tradeoff before applying a
            lever.
          </Text>
        </View>
        <View accessibilityLabel={`${levers.length} savings levers found`} style={styles.countBadge}>
          <Text style={styles.countText}>{levers.length}</Text>
        </View>
      </View>

      {visibleLevers.map((lever, index) => {
        const outputPasteBlocked = lever.kind === 'output' && promptInputs.output.mode === 'text';
        return (
          <View key={lever.id} style={[styles.lever, index === 0 && styles.leverPrimary]}>
            <View style={styles.rankRow}>
              <Text style={styles.rank}>#{index + 1}</Text>
              <Text style={styles.leverTitle}>{lever.title}</Text>
              <Text style={styles.savings}>{formatMoney(lever.monthlySavings)}/mo</Text>
            </View>
            <Text style={styles.impact}>
              {formatMoney(lever.annualSavings)} per year · {formatPercent(lever.percentSavings)} modeled
              reduction
            </Text>
            <Text style={styles.basis}>{lever.basis}</Text>
            <Text style={styles.caution}>{lever.caution}</Text>
            {outputPasteBlocked && (
              <Text accessibilityRole="alert" style={styles.blockedNote}>
                Your response is pasted text. Switch that field to token mode before applying this numeric
                preview.
              </Text>
            )}
            <Pressable
              accessibilityHint="Updates the active scenario; you can reset or edit it afterward"
              accessibilityRole="button"
              accessibilityState={{ disabled: outputPasteBlocked }}
              disabled={outputPasteBlocked}
              onPress={() => onApply(lever)}
              style={({ pressed }) => [
                styles.button,
                index === 0 && styles.buttonPrimary,
                pressed && styles.pressed,
                outputPasteBlocked && styles.disabled,
              ]}
            >
              <Text style={[styles.buttonText, index === 0 && styles.buttonPrimaryText]}>
                {lever.kind === 'model' ? 'Use for estimate' : 'Apply to scenario'}
              </Text>
            </Pressable>
          </View>
        );
      })}
      {levers.length > 3 && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
          style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
        >
          <Text style={styles.moreButtonText}>
            {expanded ? 'Show top three' : `Show ${levers.length - 3} more levers`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    basis: { color: theme.text, fontSize: 13, lineHeight: 19 },
    blockedNote: { color: theme.warning, fontSize: 12, fontWeight: '700', lineHeight: 17 },
    button: {
      alignItems: 'center',
      borderColor: theme.accent,
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 14,
    },
    buttonPrimary: { backgroundColor: theme.accent },
    buttonPrimaryText: { color: theme.onAccent },
    buttonText: { color: theme.accent, fontSize: 13, fontWeight: '800' },
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 20,
      borderWidth: 1,
      gap: 12,
      padding: 20,
    },
    caution: { color: theme.mutedText, fontSize: 12, lineHeight: 17 },
    countBadge: {
      alignItems: 'center',
      backgroundColor: theme.accentSoft,
      borderRadius: 999,
      height: 36,
      justifyContent: 'center',
      minWidth: 36,
      paddingHorizontal: 10,
    },
    countText: { color: theme.accent, fontSize: 14, fontWeight: '900' },
    disabled: { opacity: 0.45 },
    eyebrow: { color: theme.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
    headingCopy: { flex: 1, gap: 4 },
    headingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
    impact: { color: theme.savings, fontSize: 13, fontWeight: '800', lineHeight: 18 },
    lever: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      gap: 8,
      padding: 14,
    },
    leverPrimary: { borderColor: theme.accent },
    leverTitle: { color: theme.text, flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 20 },
    pressed: { opacity: 0.68 },
    moreButton: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 14,
    },
    moreButtonText: { color: theme.accent, fontSize: 13, fontWeight: '800' },
    rank: { color: theme.accent, fontSize: 12, fontWeight: '900' },
    rankRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
    savings: { color: theme.savings, fontSize: 13, fontWeight: '900' },
    summary: { color: theme.mutedText, fontSize: 13, lineHeight: 19 },
    title: { color: theme.text, fontSize: 22, fontWeight: '900', lineHeight: 27 },
  });
}
