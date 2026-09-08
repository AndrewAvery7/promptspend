import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/AppText';
import { effectivePricing, encodeScenario, type Catalog, type ComparisonRow } from '@promptspend/core';

import type { PromptFieldKey } from '@/lib/promptInput';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';
import { CostReceiptSheet } from '@/components/CostReceiptSheet';
import { useLaunchState } from '@/state/useLaunchState';
import { assertNumericDraftsValid } from '@/lib/numericDrafts';
import { cleanOldCsvExports } from '@/lib/csvExports';

interface ScenarioActionsProps {
  batchEnabled: boolean;
  cacheShare: number;
  catalog: Catalog;
  conversationsPerDay: number;
  monthlyActiveUsers: number;
  modelIds: readonly string[];
  outputTokens: number;
  pastedFields: readonly PromptFieldKey[];
  pricingAsOf: Date;
  reasoningMultiplier: number;
  revenuePerUserPerMonth: number;
  rows: readonly ComparisonRow[];
  systemTokens: number;
  turns: number;
  userTokens: number;
}

export function ScenarioActions(props: ScenarioActionsProps) {
  const launch = useLaunchState();
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [working, setWorking] = useState(false);
  const saving = useRef(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const scenarioUrl = useMemo(() => buildScenarioUrl(props), [props]);
  const validateAction = () => {
    assertNumericDraftsValid();
    launch.assertCurrentPricing();
  };

  const shareScenario = async () => {
    try {
      validateAction();
      await Share.share({
        message: `Open this PromptSpend scenario:\r\n${scenarioUrl}\r\n\r\nOnly model choices, derived token counts, and assumptions are included. Pasted prompt text is never placed in the link.`,
        title: 'PromptSpend scenario',
      });
    } catch (error) {
      Alert.alert(
        'Sharing is unavailable',
        error instanceof Error ? error.message : 'The system share menu could not open.',
      );
    }
  };

  const exportCsv = async () => {
    if (working || props.rows.length === 0) return;
    setWorking(true);
    try {
      validateAction();
      if (Platform.OS === 'web') {
        Alert.alert(
          'Use the website to download CSV',
          'File sharing from the web preview is not supported. The installed iOS and Android apps can export this file.',
        );
        return;
      }
      if (!(await Sharing.isAvailableAsync())) throw new Error('The system file share menu is unavailable.');
      validateAction();
      cleanOldCsvExports();
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
          accessibilityHint="Stores derived counts, model choices, scale, and assumptions on this device"
          accessibilityRole="button"
          android_ripple={{ color: theme.accentSoft }}
          disabled={saveBusy || !launch.hydrated || launch.persistenceBlocked}
          accessibilityState={{
            busy: saveBusy,
            disabled: saveBusy || !launch.hydrated || launch.persistenceBlocked,
          }}
          onPress={async () => {
            if (saving.current) return;
            saving.current = true;
            setSaveBusy(true);
            setSavedName(null);
            try {
              const scenario = await launch.saveScenario(
                `AI cost scenario · ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date())}`,
                {
                  conversationsPerDay: props.conversationsPerDay,
                  monthlyActiveUsers: props.monthlyActiveUsers,
                  outputTokens: props.outputTokens,
                  revenuePerUserPerMonth: props.revenuePerUserPerMonth,
                  systemTokens: props.systemTokens,
                  turns: props.turns,
                  userTokens: props.userTokens,
                },
              );
              if (scenario) setSavedName(scenario.name);
            } finally {
              saving.current = false;
              setSaveBusy(false);
            }
          }}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>{saveBusy ? 'Saving…' : 'Save on this device'}</Text>
        </Pressable>
        {savedName && (
          <Text accessibilityLiveRegion="polite" style={styles.savedNotice}>
            Saved “{savedName}”. Rename or duplicate it from Home.
          </Text>
        )}
        <Pressable
          accessibilityHint="Previews a polished private image or readable text receipt"
          accessibilityRole="button"
          android_ripple={{ color: theme.accentSoft }}
          accessibilityState={{ disabled: props.rows.length === 0 }}
          disabled={props.rows.length === 0}
          onPress={() => {
            try {
              validateAction();
              setReceiptOpen(true);
            } catch (error) {
              Alert.alert(
                'Check this estimate',
                error instanceof Error ? error.message : 'Review the inputs first.',
              );
            }
          }}
          style={({ pressed }) => [
            styles.receiptButton,
            pressed && styles.pressed,
            props.rows.length === 0 && styles.disabled,
          ]}
        >
          <Text style={styles.receiptButtonText}>Create Estimate Receipt</Text>
        </Pressable>
        <Pressable
          accessibilityHint="Shares a restorable website link without pasted prompt text"
          accessibilityRole="button"
          android_ripple={{ color: theme.accentSoft }}
          onPress={() => void shareScenario()}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>Share scenario link</Text>
        </Pressable>
        <Pressable
          accessibilityHint="Creates a CSV containing costs, assumptions, source dates, and warnings"
          accessibilityRole="button"
          android_ripple={{ color: theme.accentSoft }}
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
      <CostReceiptSheet
        {...props}
        validateAction={validateAction}
        onClose={() => setReceiptOpen(false)}
        visible={receiptOpen}
      />
    </View>
  );
}

export function buildScenarioUrl(props: ScenarioActionsProps): string {
  const query = encodeScenario({
    cachedInputShare: props.cacheShare,
    conversationsPerDay: props.conversationsPerDay,
    modelIds: [...props.modelIds].slice(0, 4),
    monthlyActiveUsers: props.monthlyActiveUsers,
    outputTokens: props.outputTokens,
    pastedFields: [...props.pastedFields],
    reasoningMultiplier: props.reasoningMultiplier,
    revenuePerUserPerMonth: props.revenuePerUserPerMonth,
    systemTokens: props.systemTokens,
    turns: props.turns,
    useBatchApi: props.batchEnabled,
    userTokens: props.userTokens,
  });
  return `https://promptspend.com/estimate/?${query}`;
}

export function csvForRows(props: ScenarioActionsProps): string {
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
      'cache_storage_per_1m_token_hour',
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
    ...props.rows.map(({ breakdown, model, scaled }) => {
      const pricing = effectivePricing(model.pricing, props.pricingAsOf);
      return [
        model.displayName,
        model.id,
        props.catalog.providerName(model),
        model.status,
        model.provenance.source,
        model.provenance.lastVerified,
        model.provenance.verifiedUrl ?? props.catalog.provider(model)?.pricingUrl ?? '',
        model.provenance.needsReview ? 'yes' : 'no',
        model.tokenizer.kind === 'tiktoken' ? `estimated:${model.tokenizer.encoding}` : 'estimated:ratio',
        pricing.input,
        pricing.output,
        pricing.cachedInput ?? '',
        pricing.cacheWrite ?? '',
        pricing.cacheStoragePerMillionTokenHour ?? '',
        Math.round(breakdown.inputTokens),
        Math.round(breakdown.outputTokens),
        Math.round(breakdown.peakRequestTokens),
        breakdown.longContextTurns,
        scaled.perConversation.toFixed(6),
        scaled.perMonth.toFixed(2),
        scaled.perYear.toFixed(2),
        scaled.costPerUser.toFixed(4),
        scaled.margin === null ? '' : scaled.margin.toFixed(4),
      ];
    }),
  ];
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  // Spreadsheet apps can execute cells that begin with formula sigils even
  // when the CSV field is quoted. Prefix untrusted catalog text with a single
  // quote so exported evidence remains inert when opened in Excel or Sheets.
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safeText) ? `"${safeText.replaceAll('"', '""')}"` : safeText;
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
    receiptButton: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: 10,
      justifyContent: 'center',
      minHeight: 50,
      paddingHorizontal: 14,
    },
    receiptButtonText: { color: theme.onAccent, fontSize: 14, fontWeight: '900' },
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
    savedNotice: { color: theme.savings, fontSize: 12, fontWeight: '700', lineHeight: 18 },
    pressed: { opacity: 0.68 },
    disabled: { opacity: 0.4 },
  });
}
