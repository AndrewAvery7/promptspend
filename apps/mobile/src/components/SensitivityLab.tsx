import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMoney, formatPercent, type Model, type Scale } from '@promptspend/core';

import { NumericField } from '@/components/NumericField';
import type { PromptInputState } from '@/lib/promptInput';
import { workloadForModel } from '@/lib/promptInput';
import { evaluateSensitivity, type SensitivityDraft } from '@/lib/sensitivity';
import type { WorkloadState } from '@/state/useLaunchState';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface SensitivityLabProps {
  batchEnabled: boolean;
  cacheEnabled: boolean;
  cacheSharePercent: number;
  model: Model;
  onApply: (draft: SensitivityDraft) => void;
  promptInputs: PromptInputState;
  reasoningMultiplier: number;
  workload: WorkloadState;
}

export function SensitivityLab({
  batchEnabled,
  cacheEnabled,
  cacheSharePercent,
  model,
  onApply,
  promptInputs,
  reasoningMultiplier,
  workload,
}: SensitivityLabProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const effectiveWorkload = useMemo(
    () => workloadForModel(model, promptInputs, workload),
    [model, promptInputs, workload],
  );
  const baselineDraft = useMemo<SensitivityDraft>(
    () => ({
      conversationsPerDay: workload.conversationsPerDay,
      outputTokens: effectiveWorkload.outputTokens,
      turns: effectiveWorkload.turns,
    }),
    [effectiveWorkload.outputTokens, effectiveWorkload.turns, workload.conversationsPerDay],
  );
  const [draft, setDraft] = useState(baselineDraft);

  const scale: Scale = useMemo(
    () => ({
      conversationsPerDay: workload.conversationsPerDay,
      monthlyActiveUsers: workload.monthlyActiveUsers,
      revenuePerUserPerMonth: workload.revenuePerUserPerMonth,
    }),
    [workload.conversationsPerDay, workload.monthlyActiveUsers, workload.revenuePerUserPerMonth],
  );
  const result = useMemo(
    () =>
      evaluateSensitivity(model, effectiveWorkload, scale, draft, {
        cachedInputShare: cacheEnabled ? cacheSharePercent / 100 : 0,
        reasoningMultiplier,
        useBatchApi: batchEnabled,
      }),
    [
      batchEnabled,
      cacheEnabled,
      cacheSharePercent,
      draft,
      effectiveWorkload,
      model,
      reasoningMultiplier,
      scale,
    ],
  );
  const changed =
    draft.conversationsPerDay !== baselineDraft.conversationsPerDay ||
    draft.outputTokens !== baselineDraft.outputTokens ||
    draft.turns !== baselineDraft.turns;
  const outputIsPasted = promptInputs.output.mode === 'text';

  const applyPreset = (preset: 'baseline' | 'launch' | 'lean' | 'long') => {
    if (preset === 'baseline') setDraft(baselineDraft);
    if (preset === 'launch') {
      setDraft({ ...baselineDraft, conversationsPerDay: Math.round(baselineDraft.conversationsPerDay * 2) });
    }
    if (preset === 'lean') {
      setDraft({
        ...baselineDraft,
        outputTokens: outputIsPasted
          ? baselineDraft.outputTokens
          : Math.max(1, Math.round(baselineDraft.outputTokens * 0.75)),
      });
    }
    if (preset === 'long') {
      setDraft({
        ...baselineDraft,
        outputTokens: outputIsPasted
          ? baselineDraft.outputTokens
          : Math.round(baselineDraft.outputTokens * 1.25),
        turns: baselineDraft.turns + 2,
      });
    }
  };

  return (
    <View style={styles.card} testID="sensitivity-lab">
      <Text style={styles.eyebrow}>SCENARIO STRESS TEST</Text>
      <Text accessibilityRole="header" style={styles.title}>
        Cost Sensitivity Lab
      </Text>
      <Text style={styles.summary}>
        Change high-impact assumptions in a private preview. Nothing touches the active estimate until you
        apply it.
      </Text>

      <View accessibilityLabel="Sensitivity presets" style={styles.presetRow}>
        {[
          ['baseline', 'Baseline'],
          ['lean', 'Lean response'],
          ['launch', '2× traffic'],
          ['long', 'Long session'],
        ].map(([id, label]) => (
          <Pressable
            key={id}
            accessibilityRole="button"
            onPress={() => applyPreset(id as 'baseline' | 'launch' | 'lean' | 'long')}
            style={({ pressed }) => [styles.preset, pressed && styles.pressed]}
          >
            <Text style={styles.presetText}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <NumericField
        accessibilityHint="Preview a different daily conversation volume without changing the active scenario"
        label="Preview conversations per day"
        max={100000000}
        onChange={(value) => setDraft((current) => ({ ...current, conversationsPerDay: value }))}
        suffix="per day"
        value={draft.conversationsPerDay}
      />
      {outputIsPasted ? (
        <View style={styles.fixedField}>
          <Text style={styles.fixedLabel}>Preview response length</Text>
          <Text style={styles.fixedValue}>
            {Math.round(draft.outputTokens).toLocaleString()} derived tokens
          </Text>
          <Text style={styles.fixedNote}>
            This value stays tied to your private pasted response. Switch to token mode to vary it
            independently.
          </Text>
        </View>
      ) : (
        <NumericField
          accessibilityHint="Preview a different model response length without changing the active scenario"
          label="Preview response length"
          max={200000}
          onChange={(value) => setDraft((current) => ({ ...current, outputTokens: value }))}
          suffix="tokens"
          value={draft.outputTokens}
        />
      )}
      <NumericField
        accessibilityHint="Preview a different number of conversation turns without changing the active scenario"
        label="Preview turns"
        max={200}
        min={1}
        onChange={(value) => setDraft((current) => ({ ...current, turns: value }))}
        suffix="turns"
        value={draft.turns}
      />

      <View accessibilityLabel="Sensitivity comparison" style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableCell, styles.metricCell]}>Measure</Text>
          <Text style={styles.tableCell}>Current</Text>
          <Text style={styles.tableCell}>Preview</Text>
        </View>
        <MetricRow
          current={formatMoney(result.baseline.perMonth)}
          label="Per month"
          preview={formatMoney(result.preview.perMonth)}
          styles={styles}
        />
        <MetricRow
          current={formatMoney(result.baseline.perYear)}
          label="Per year"
          preview={formatMoney(result.preview.perYear)}
          styles={styles}
        />
        <MetricRow
          current={formatMoney(result.baseline.perConversation)}
          label="Conversation"
          preview={formatMoney(result.preview.perConversation)}
          styles={styles}
        />
      </View>

      <Text
        accessibilityLiveRegion="polite"
        style={[
          styles.delta,
          result.monthlyDelta > 0
            ? styles.deltaCost
            : result.monthlyDelta < 0
              ? styles.deltaSavings
              : undefined,
        ]}
      >
        {result.monthlyDelta === 0
          ? 'Preview matches the current monthly estimate.'
          : `${result.monthlyDelta > 0 ? '+' : '−'}${formatMoney(Math.abs(result.monthlyDelta))} per month (${result.percentDelta === null ? 'new volume' : formatPercent(Math.abs(result.percentDelta), 1)})`}
      </Text>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !changed }}
          disabled={!changed}
          onPress={() => setDraft(baselineDraft)}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.pressed,
            !changed && styles.disabled,
          ]}
        >
          <Text style={styles.secondaryButtonText}>Restore</Text>
        </Pressable>
        <Pressable
          accessibilityHint="Updates the active estimate with these preview assumptions"
          accessibilityRole="button"
          accessibilityState={{ disabled: !changed }}
          disabled={!changed}
          onPress={() => onApply(draft)}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
            !changed && styles.disabled,
          ]}
        >
          <Text style={styles.primaryButtonText}>Apply preview</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MetricRow({
  current,
  label,
  preview,
  styles,
}: {
  current: string;
  label: string;
  preview: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.tableRow}>
      <Text style={[styles.tableCell, styles.metricCell]}>{label}</Text>
      <Text style={styles.tableCell}>{current}</Text>
      <Text style={[styles.tableCell, styles.previewCell]}>{preview}</Text>
    </View>
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    actionRow: { flexDirection: 'row', gap: 10 },
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 20,
      borderWidth: 1,
      gap: 14,
      padding: 20,
    },
    delta: { color: theme.mutedText, fontSize: 14, fontWeight: '800', lineHeight: 20, textAlign: 'center' },
    deltaCost: { color: theme.warning },
    deltaSavings: { color: theme.savings },
    disabled: { opacity: 0.45 },
    eyebrow: { color: theme.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
    fixedField: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      gap: 5,
      padding: 14,
    },
    fixedLabel: { color: theme.text, fontSize: 14, fontWeight: '700' },
    fixedNote: { color: theme.mutedText, fontSize: 12, lineHeight: 17 },
    fixedValue: { color: theme.text, fontSize: 17, fontWeight: '900' },
    metricCell: { flex: 1.2, textAlign: 'left' },
    preset: {
      alignItems: 'center',
      backgroundColor: theme.accentSoft,
      borderRadius: 999,
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 13,
    },
    presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    presetText: { color: theme.accent, fontSize: 12, fontWeight: '800' },
    pressed: { opacity: 0.68 },
    previewCell: { color: theme.accent, fontWeight: '900' },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: 11,
      flex: 1.5,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 14,
    },
    primaryButtonText: { color: theme.onAccent, fontSize: 13, fontWeight: '900' },
    secondaryButton: {
      alignItems: 'center',
      borderColor: theme.border,
      borderRadius: 11,
      borderWidth: 1,
      flex: 1,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 14,
    },
    secondaryButtonText: { color: theme.text, fontSize: 13, fontWeight: '800' },
    summary: { color: theme.mutedText, fontSize: 13, lineHeight: 19 },
    table: { borderColor: theme.border, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
    tableCell: {
      color: theme.text,
      flex: 1,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
    },
    tableHeader: {
      backgroundColor: theme.surfaceRaised,
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    tableRow: {
      borderTopColor: theme.border,
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    title: { color: theme.text, fontSize: 22, fontWeight: '900', lineHeight: 27 },
  });
}
