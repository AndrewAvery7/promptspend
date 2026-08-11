import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMoney, type CostBreakdown, type Model, type ScaledCost } from '@promptspend/core';

import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface EstimateResultProps {
  breakdown: CostBreakdown;
  model: Model;
  scaled: ScaledCost;
}

export function EstimateResult({ breakdown, model, scaled }: EstimateResultProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [showDetails, setShowDetails] = useState(false);

  return (
    <View
      accessibilityLabel={`${model.displayName} estimate. ${formatMoney(scaled.perMonth)} per month. ${formatMoney(breakdown.total)} per conversation.`}
      style={styles.resultCard}
    >
      <Text style={styles.eyebrow}>ESTIMATED AI COST</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.monthlyCost}>
        {formatMoney(scaled.perMonth)}
      </Text>
      <Text style={styles.monthlyLabel}>per month · {model.displayName}</Text>

      <View style={styles.metrics}>
        <Metric label="Per conversation" value={formatMoney(breakdown.total)} styles={styles} />
        <Metric label="Per day" value={formatMoney(scaled.perDay)} styles={styles} />
        <Metric label="Per year" value={formatMoney(scaled.perYear)} styles={styles} />
      </View>

      {breakdown.warnings.map((warning) => (
        <View accessibilityRole="alert" key={warning} style={styles.warningCard}>
          <Text style={styles.warningTitle}>Scenario warning</Text>
          <Text style={styles.warningText}>{warning}</Text>
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showDetails }}
        onPress={() => setShowDetails((current) => !current)}
        style={({ pressed }) => [styles.detailsButton, pressed && styles.pressed]}
      >
        <Text style={styles.detailsButtonText}>{showDetails ? 'Hide calculation' : 'Show calculation'}</Text>
      </Pressable>

      {showDetails && (
        <View style={styles.details}>
          <DetailRow label="Input" value={formatMoney(breakdown.inputCost)} styles={styles} />
          {breakdown.cacheWriteCost > 0 && (
            <DetailRow label="Cache write" value={formatMoney(breakdown.cacheWriteCost)} styles={styles} />
          )}
          <DetailRow label="Output" value={formatMoney(breakdown.outputCost)} styles={styles} />
          <DetailRow
            label="Input tokens"
            value={Math.round(breakdown.inputTokens).toLocaleString('en-US')}
            styles={styles}
          />
          <DetailRow
            label="Output tokens"
            value={Math.round(breakdown.outputTokens).toLocaleString('en-US')}
            styles={styles}
          />
          {breakdown.assumptions.length > 0 && (
            <View style={styles.assumptions}>
              <Text style={styles.assumptionsTitle}>Assumptions</Text>
              {breakdown.assumptions.map((assumption) => (
                <Text key={assumption} style={styles.assumptionText}>
                  · {assumption}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function Metric({
  label,
  styles,
  value,
}: {
  label: string;
  styles: ReturnType<typeof createStyles>;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function DetailRow({
  label,
  styles,
  value,
}: {
  label: string;
  styles: ReturnType<typeof createStyles>;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    resultCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      overflow: 'hidden',
      padding: 20,
    },
    eyebrow: {
      color: theme.accent,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      lineHeight: 16,
    },
    monthlyCost: {
      color: theme.text,
      fontSize: 42,
      fontVariant: ['tabular-nums'],
      fontWeight: '800',
      letterSpacing: -1.5,
      lineHeight: 50,
      marginTop: 8,
    },
    monthlyLabel: {
      color: theme.mutedText,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 2,
    },
    metrics: {
      borderTopColor: theme.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      marginTop: 20,
      paddingTop: 16,
    },
    metric: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    metricValue: {
      color: theme.text,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
      fontWeight: '700',
      lineHeight: 20,
    },
    metricLabel: {
      color: theme.mutedText,
      fontSize: 11,
      lineHeight: 15,
    },
    warningCard: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.warning,
      borderLeftWidth: 3,
      borderRadius: 8,
      gap: 4,
      marginTop: 16,
      padding: 12,
    },
    warningTitle: {
      color: theme.warning,
      fontSize: 13,
      fontWeight: '800',
      lineHeight: 18,
    },
    warningText: {
      color: theme.text,
      fontSize: 13,
      lineHeight: 19,
    },
    detailsButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      justifyContent: 'center',
      marginLeft: -8,
      marginTop: 12,
      minHeight: 48,
      paddingHorizontal: 8,
    },
    detailsButtonText: {
      color: theme.accent,
      fontSize: 14,
      fontWeight: '700',
    },
    pressed: {
      opacity: 0.65,
    },
    details: {
      borderTopColor: theme.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: 8,
    },
    detailRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 36,
    },
    detailLabel: {
      color: theme.mutedText,
      fontSize: 13,
    },
    detailValue: {
      color: theme.text,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      fontWeight: '700',
    },
    assumptions: {
      gap: 6,
      paddingTop: 12,
    },
    assumptionsTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '800',
    },
    assumptionText: {
      color: theme.mutedText,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
