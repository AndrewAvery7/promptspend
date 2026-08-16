import { useMemo, useRef, useState } from 'react';
import { Alert, findNodeHandle, Pressable, Share, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText as Text } from '@/components/AppText';
import {
  buildComparisonShareText,
  formatMoney,
  formatPercent,
  type Catalog,
  type ComparisonRow,
} from '@promptspend/core';

import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface ComparisonResultProps {
  catalog: Catalog;
  rows: readonly ComparisonRow[];
}

export function ComparisonResult({ catalog, rows }: ComparisonResultProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { fontScale, width } = useWindowDimensions();
  const shareButtonRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const useGrid = width >= 760 && fontScale <= 1.2;
  const cheapest = rows[0];
  const priciest = rows[rows.length - 1];
  const annualSavings =
    cheapest && priciest ? Math.max(0, priciest.scaled.perYear - cheapest.scaled.perYear) : 0;

  const shareComparison = async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const anchor = findNodeHandle(shareButtonRef.current);
      await Share.share(
        { message: buildComparisonShareText(rows), title: 'PromptSpend LLM cost comparison' },
        {
          dialogTitle: 'Share PromptSpend comparison',
          subject: 'PromptSpend LLM cost comparison',
          ...(anchor === null ? {} : { anchor }),
        },
      );
    } catch {
      Alert.alert(
        'Sharing is unavailable',
        'The share menu could not open. Please try again after checking that sharing is enabled on this device.',
      );
    } finally {
      setIsSharing(false);
    }
  };

  if (!cheapest) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.eyebrow}>COST COMPARISON</Text>
        <Text accessibilityRole="header" style={styles.emptyTitle}>
          Choose models to compare
        </Text>
        <Text style={styles.emptyText}>
          Select two to four models below. PromptSpend will apply the same workload to every choice.
        </Text>
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={`${rows.length} model cost comparison. ${cheapest.model.displayName} has the lowest estimated monthly cost at ${formatMoney(cheapest.scaled.perMonth)}.`}
      style={styles.resultCard}
    >
      <Text style={styles.eyebrow}>LOWEST ESTIMATED COST</Text>
      <Text style={styles.monthlyCost}>{formatMoney(cheapest.scaled.perMonth)}</Text>
      <Text style={styles.monthlyLabel}>per month · {cheapest.model.displayName}</Text>

      {rows.length > 1 && priciest && (
        <View style={styles.savingsCallout}>
          <Text style={styles.savingsValue}>{formatMoney(annualSavings)} potential annual difference</Text>
          <Text style={styles.savingsText}>
            {priciest.model.displayName} is {formatMultiple(priciest.multipleOfCheapest)} the estimated
            monthly cost of {cheapest.model.displayName} for this workload.
          </Text>
        </View>
      )}

      <View style={[styles.rows, useGrid && styles.rowsGrid]}>
        {rows.map((row, index) => (
          <View
            accessibilityLabel={`${index + 1}. ${row.model.displayName}, ${formatMoney(row.scaled.perMonth)} per month${row.isCheapest ? ', lowest estimated cost' : `, ${formatMoney(row.deltaPerMonth)} more per month than the lowest`}.`}
            key={row.model.id}
            style={[
              styles.modelCard,
              useGrid && styles.modelCardGrid,
              row.isCheapest && styles.modelCardCheapest,
            ]}
          >
            <View style={styles.modelHeader}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>{index + 1}</Text>
              </View>
              <View style={styles.modelCopy}>
                <Text style={styles.modelName}>{row.model.displayName}</Text>
                <Text style={styles.provider}>{catalog.providerName(row.model)}</Text>
              </View>
              <View style={[styles.statusBadge, row.isCheapest && styles.statusBadgeCheapest]}>
                <Text style={[styles.statusText, row.isCheapest && styles.statusTextCheapest]}>
                  {row.isCheapest ? 'LOWEST' : `+${formatMoney(row.deltaPerMonth)}/MO`}
                </Text>
              </View>
            </View>

            <Text style={styles.rowMonthly}>{formatMoney(row.scaled.perMonth)}/mo</Text>
            <View style={styles.rowMetrics}>
              <SmallMetric
                label="Per conversation"
                value={formatMoney(row.breakdown.total)}
                styles={styles}
              />
              <SmallMetric label="Per year" value={formatMoney(row.scaled.perYear)} styles={styles} />
              <SmallMetric label="Per user" value={formatMoney(row.scaled.costPerUser)} styles={styles} />
              {row.scaled.margin !== null && (
                <SmallMetric label="AI margin" value={formatPercent(row.scaled.margin, 1)} styles={styles} />
              )}
            </View>

            {row.breakdown.warnings.map((warning, warningIndex) => (
              <View
                accessibilityRole="alert"
                key={`${row.model.id}-${warningIndex}`}
                style={styles.warningCard}
              >
                <Text style={styles.warningTitle}>Scenario warning</Text>
                <Text style={styles.warningText}>{warning}</Text>
              </View>
            ))}

            {showDetails && (
              <View style={styles.details}>
                <DetailRow label="Input" value={formatMoney(row.breakdown.inputCost)} styles={styles} />
                {row.breakdown.cacheWriteCost > 0 && (
                  <DetailRow
                    label="Cache write"
                    value={formatMoney(row.breakdown.cacheWriteCost)}
                    styles={styles}
                  />
                )}
                <DetailRow label="Output" value={formatMoney(row.breakdown.outputCost)} styles={styles} />
                <DetailRow
                  label="Input tokens"
                  value={Math.round(row.breakdown.inputTokens).toLocaleString('en-US')}
                  styles={styles}
                />
                <DetailRow
                  label="Generated output tokens"
                  value={Math.round(row.breakdown.outputTokens).toLocaleString('en-US')}
                  styles={styles}
                />
                {row.breakdown.billedOutputTokens !== row.breakdown.outputTokens && (
                  <DetailRow
                    label="Billed output tokens"
                    value={Math.round(row.breakdown.billedOutputTokens).toLocaleString('en-US')}
                    styles={styles}
                  />
                )}
                {row.breakdown.assumptions.map((assumption, assumptionIndex) => (
                  <Text key={`${row.model.id}-assumption-${assumptionIndex}`} style={styles.assumptionText}>
                    · {assumption}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>

      <Pressable
        accessibilityHint="Opens the system share menu with every model in this comparison"
        accessibilityLabel="Share this PromptSpend model comparison"
        accessibilityRole="button"
        accessibilityState={{ busy: isSharing, disabled: isSharing }}
        disabled={isSharing}
        onPress={() => void shareComparison()}
        ref={shareButtonRef}
        style={({ pressed }) => [
          styles.shareButton,
          pressed && !isSharing && styles.pressed,
          isSharing && styles.disabled,
        ]}
      >
        <Text style={styles.shareButtonText}>{isSharing ? 'Opening share menu...' : 'Share comparison'}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showDetails }}
        onPress={() => setShowDetails((current) => !current)}
        style={({ pressed }) => [styles.detailsButton, pressed && styles.pressed]}
      >
        <Text style={styles.detailsButtonText}>
          {showDetails ? 'Hide calculations' : 'Show calculations'}
        </Text>
      </Pressable>
    </View>
  );
}

function formatMultiple(value: number | null): string {
  if (value === null) return 'not meaningfully comparable to';
  if (!Number.isFinite(value)) return 'more than';
  if (value >= 10) return `${Math.round(value)}×`;
  return `${Number(value.toFixed(1))}×`;
}

function SmallMetric({
  label,
  styles,
  value,
}: {
  label: string;
  styles: ReturnType<typeof createStyles>;
  value: string;
}) {
  return (
    <View style={styles.smallMetric}>
      <Text style={styles.smallMetricValue}>{value}</Text>
      <Text style={styles.smallMetricLabel}>{label}</Text>
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
      padding: 20,
    },
    emptyCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderStyle: 'dashed',
      borderWidth: 1,
      gap: 8,
      padding: 20,
    },
    eyebrow: { color: theme.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
    monthlyCost: {
      color: theme.text,
      fontSize: 42,
      fontVariant: ['tabular-nums'],
      fontWeight: '800',
      letterSpacing: -1.2,
      lineHeight: 50,
      marginTop: 8,
    },
    monthlyLabel: { color: theme.mutedText, fontSize: 14, lineHeight: 20 },
    emptyTitle: { color: theme.text, fontSize: 22, fontWeight: '800', lineHeight: 28 },
    emptyText: { color: theme.mutedText, fontSize: 14, lineHeight: 21 },
    savingsCallout: {
      backgroundColor: theme.accentSoft,
      borderRadius: 12,
      gap: 4,
      marginTop: 18,
      padding: 14,
    },
    savingsValue: { color: theme.accent, fontSize: 15, fontWeight: '800', lineHeight: 20 },
    savingsText: { color: theme.text, fontSize: 12, lineHeight: 18 },
    rows: { gap: 12, marginTop: 18 },
    rowsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    modelCard: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      gap: 12,
      padding: 14,
    },
    modelCardGrid: { flexBasis: '48%', flexGrow: 1 },
    modelCardCheapest: { borderColor: theme.savings, borderWidth: 2 },
    modelHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    rankBadge: {
      alignItems: 'center',
      backgroundColor: theme.accentSoft,
      borderRadius: 8,
      height: 28,
      justifyContent: 'center',
      width: 28,
    },
    rankText: { color: theme.accent, fontSize: 12, fontWeight: '800' },
    modelCopy: { flex: 1, gap: 2 },
    modelName: { color: theme.text, fontSize: 15, fontWeight: '800', lineHeight: 20 },
    provider: { color: theme.mutedText, fontSize: 11, lineHeight: 15 },
    statusBadge: {
      backgroundColor: theme.accentSoft,
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 5,
    },
    statusBadgeCheapest: { backgroundColor: theme.savings },
    statusText: { color: theme.accent, fontSize: 9, fontWeight: '800' },
    statusTextCheapest: { color: theme.onAccent },
    rowMonthly: {
      color: theme.text,
      fontSize: 26,
      fontVariant: ['tabular-nums'],
      fontWeight: '800',
      letterSpacing: -0.5,
      lineHeight: 32,
    },
    rowMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    smallMetric: { flexBasis: '42%', flexGrow: 1, gap: 3 },
    smallMetricValue: { color: theme.text, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '700' },
    smallMetricLabel: { color: theme.mutedText, fontSize: 10, lineHeight: 14 },
    warningCard: {
      backgroundColor: theme.background,
      borderColor: theme.warning,
      borderLeftWidth: 3,
      borderRadius: 8,
      gap: 3,
      padding: 10,
    },
    warningTitle: { color: theme.warning, fontSize: 11, fontWeight: '800' },
    warningText: { color: theme.text, fontSize: 11, lineHeight: 16 },
    shareButton: {
      alignItems: 'center',
      backgroundColor: theme.accentSoft,
      borderColor: theme.accent,
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: 'center',
      marginTop: 18,
      minHeight: 48,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    shareButtonText: { color: theme.accent, fontSize: 14, fontWeight: '800', lineHeight: 20 },
    detailsButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      justifyContent: 'center',
      marginLeft: -8,
      marginTop: 8,
      minHeight: 48,
      paddingHorizontal: 8,
    },
    detailsButtonText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
    details: {
      borderTopColor: theme.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 3,
      paddingTop: 8,
    },
    detailRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 30 },
    detailLabel: { color: theme.mutedText, fontSize: 12 },
    detailValue: { color: theme.text, fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '700' },
    assumptionText: { color: theme.mutedText, fontSize: 11, lineHeight: 16 },
    pressed: { opacity: 0.65 },
    disabled: { opacity: 0.5 },
  });
}
