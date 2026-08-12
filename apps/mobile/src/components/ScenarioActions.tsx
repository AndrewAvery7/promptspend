import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { type Catalog, type ComparisonRow } from '@promptspend/core';

import type { PromptFieldKey } from '@/lib/promptInput';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface ScenarioActionsProps {
  batchEnabled: boolean;
  cacheShare: number;
  catalog: Catalog;
  conversationsPerDay: number;
  monthlyActiveUsers: number;
  modelIds: readonly string[];
  outputTokens: number;
  pastedFields: readonly PromptFieldKey[];
  reasoningMultiplier: number;
  revenuePerUserPerMonth: number;
  rows: readonly ComparisonRow[];
  systemTokens: number;
  turns: number;
  userTokens: number;
}

export function ScenarioActions(props: ScenarioActionsProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [working, setWorking] = useState(false);
  const scenarioUrl = useMemo(() => buildScenarioUrl(props), [props]);

  const shareScenario = async () => {
    try {
      await Share.share({
        message: `Open this PromptSpend scenario:\r\n${scenarioUrl}\r\n\r\nOnly model choices, derived token counts, and assumptions are included. Pasted prompt text is never placed in the link.`,
        title: 'PromptSpend scenario',
      });
    } catch {
      Alert.alert('Sharing is unavailable', 'The system share menu could not open.');
    }
  };

  const exportCsv = async () => {
    if (working || props.rows.length === 0) return;
    setWorking(true);
    try {
      if (Platform.OS === 'web') {
        Alert.alert(
          'Use the website to download CSV',
          'File sharing from the web preview is not supported. The installed iOS and Android apps can export this file.',
        );
        return;
      }
      if (!(await Sharing.isAvailableAsync())) throw new Error('The system file share menu is unavailable.');
      const file = new File(Paths.cache, `promptspend-estimate-${Date.now()}.csv`);
      file.write(csvForRows(props));
      await Sharing.shareAsync(file.uri, {
        dialogTitle: 'Save or share PromptSpend CSV',
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (error) {
      Alert.alert(
        'CSV export is unavailable',
        error instanceof Error ? error.message : 'The file could not be created.',
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        Save or continue this scenario
      </Text>
      <Text style={styles.body}>
        The link carries derived counts and assumptions only. It never carries pasted prompt text.
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityHint="Shares a restorable website link without pasted prompt text"
          accessibilityRole="button"
          onPress={() => void shareScenario()}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>Share scenario link</Text>
        </Pressable>
        <Pressable
          accessibilityHint="Creates a CSV containing costs, assumptions, source dates, and warnings"
          accessibilityRole="button"
          accessibilityState={{ busy: working, disabled: working || props.rows.length === 0 }}
          disabled={working || props.rows.length === 0}
          onPress={() => void exportCsv()}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.pressed,
            (working || props.rows.length === 0) && styles.disabled,
          ]}
        >
          <Text style={styles.buttonText}>{working ? 'Preparing CSV…' : 'Export CSV'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function buildScenarioUrl(props: ScenarioActionsProps): string {
  const params = new URLSearchParams();
  params.set('m', props.modelIds.slice(0, 4).join(','));
  params.set('sys', String(Math.round(props.systemTokens)));
  params.set('usr', String(Math.round(props.userTokens)));
  params.set('out', String(Math.round(props.outputTokens)));
  params.set('t', String(Math.round(props.turns)));
  params.set('cpd', String(Math.round(props.conversationsPerDay)));
  params.set('mau', String(Math.round(props.monthlyActiveUsers)));
  params.set('rev', String(props.revenuePerUserPerMonth));
  params.set('cache', props.cacheShare.toFixed(2));
  if (props.reasoningMultiplier !== 1) params.set('rsn', String(props.reasoningMultiplier));
  if (props.batchEnabled) params.set('batch', '1');
  if (props.pastedFields.length > 0) params.set('px', props.pastedFields.join(','));
  return `https://promptspend.com/?${params.toString()}`;
}

function csvForRows(props: ScenarioActionsProps): string {
  const assumptions = [...new Set(props.rows.flatMap((row) => row.breakdown.assumptions))];
  const warnings = [...new Set(props.rows.flatMap((row) => row.breakdown.warnings))];
  const rows: unknown[][] = [
    ['PromptSpend estimate'],
    ['exported', new Date().toISOString()],
    ['prices last changed', props.catalog.pricesLastChanged() ?? 'none recorded'],
    ['sources last checked', props.catalog.sourcesLastChecked() ?? 'unknown'],
    [
      'scope',
      'Standard-tier global list prices in USD; regional premiums, priority tiers, tool fees, and negotiated discounts are excluded.',
    ],
    ['cache-hit share assumed', `${Math.round(props.cacheShare * 100)}%`],
    ...assumptions.map((text) => ['assumption', text]),
    ...warnings.map((text) => ['warning', text]),
    [],
    [
      'model',
      'model_id',
      'provider',
      'status',
      'source',
      'last_verified',
      'vendor_url',
      'flagged_for_review',
      'tokenizer',
      'input_per_1m',
      'output_per_1m',
      'cached_input_per_1m',
      'cache_write_per_1m',
      'input_tokens_per_conversation',
      'output_tokens_per_conversation',
      'peak_request_tokens',
      'long_context_turns',
      'cost_per_conversation',
      'cost_per_month',
      'cost_per_year',
      'cost_per_user',
      'margin',
    ],
    ...props.rows.map(({ breakdown, model, scaled }) => [
      model.displayName,
      model.id,
      props.catalog.providerName(model),
      model.status,
      model.provenance.source,
      model.provenance.lastVerified,
      model.provenance.verifiedUrl ?? props.catalog.provider(model)?.pricingUrl ?? '',
      model.provenance.needsReview ? 'yes' : 'no',
      model.tokenizer.kind === 'tiktoken' ? `estimated:${model.tokenizer.encoding}` : 'estimated:ratio',
      model.pricing.input,
      model.pricing.output,
      model.pricing.cachedInput ?? '',
      model.pricing.cacheWrite ?? '',
      Math.round(breakdown.inputTokens),
      Math.round(breakdown.outputTokens),
      Math.round(breakdown.peakRequestTokens),
      breakdown.longContextTurns,
      scaled.perConversation.toFixed(6),
      scaled.perMonth.toFixed(2),
      scaled.perYear.toFixed(2),
      scaled.costPerUser.toFixed(4),
      scaled.margin === null ? '' : scaled.margin.toFixed(4),
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 10,
      padding: 18,
    },
    title: { color: theme.text, fontSize: 19, fontWeight: '800', lineHeight: 25 },
    body: { color: theme.mutedText, fontSize: 13, lineHeight: 19 },
    actions: { gap: 8 },
    button: {
      alignItems: 'center',
      borderColor: theme.accent,
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 14,
    },
    buttonText: { color: theme.accent, fontSize: 14, fontWeight: '800' },
    pressed: { opacity: 0.68 },
    disabled: { opacity: 0.4 },
  });
}
