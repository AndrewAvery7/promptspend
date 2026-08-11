import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  conversationCost,
  costAtScale,
  SUGGESTED_CACHE_SHARE,
  type Catalog,
  type Model,
} from '@promptspend/core';

import { ComparisonModelPicker } from '@/components/ComparisonModelPicker';
import { ComparisonResult } from '@/components/ComparisonResult';
import { EstimateResult } from '@/components/EstimateResult';
import { FreshnessChip } from '@/components/FreshnessChip';
import { ModelPicker } from '@/components/ModelPicker';
import { NumericField } from '@/components/NumericField';
import { PromptInputField } from '@/components/PromptInputField';
import { loadMobileCatalog, type MobileCatalogResult } from '@/data/catalog';
import { defaultComparisonSelection, toggleComparisonSelection } from '@/lib/comparison';
import {
  compareModelsForInputs,
  createDefaultPromptInputs,
  promptFieldTokens,
  workloadForModel,
  type PromptFieldKey,
  type PromptInputMode,
} from '@/lib/promptInput';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

const DEFAULT_MODEL_ID = 'claude-sonnet-5';
type AppMode = 'estimate' | 'compare';

interface WorkloadState {
  conversationsPerDay: number;
  outputTokens: number;
  systemTokens: number;
  turns: number;
  userTokens: number;
}

const DEFAULT_WORKLOAD: WorkloadState = {
  conversationsPerDay: 2500,
  outputTokens: 900,
  systemTokens: 800,
  turns: 6,
  userTokens: 400,
};

export default function EstimateScreen() {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [catalogResult, setCatalogResult] = useState<MobileCatalogResult | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [mode, setMode] = useState<AppMode>('estimate');
  const [selectedId, setSelectedId] = useState(DEFAULT_MODEL_ID);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [workload, setWorkload] = useState(DEFAULT_WORKLOAD);
  const [promptInputs, setPromptInputs] = useState(createDefaultPromptInputs);
  const [cacheEnabled, setCacheEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const catalog = catalogResult?.catalog ?? null;
  const selectedModel = useMemo(
    () => (catalog ? chooseModel(catalog.primaryModels, selectedId) : null),
    [catalog, selectedId],
  );

  const refreshCatalog = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await loadMobileCatalog();
      setCatalogResult(result);
      setComparisonIds((current) => reconcileComparisonSelection(result.catalog, current));
      setCatalogError(null);
    } catch (error) {
      setCatalogResult(null);
      setCatalogError(error instanceof Error ? error.message : 'Current pricing is unavailable.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadMobileCatalog()
      .then((result) => {
        if (!cancelled) {
          setCatalogResult(result);
          setComparisonIds((current) => reconcileComparisonSelection(result.catalog, current));
          setCatalogError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCatalogError(error instanceof Error ? error.message : 'Current pricing is unavailable.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const breakdown = useMemo(
    () =>
      selectedModel
        ? conversationCost(selectedModel, workloadForModel(selectedModel, promptInputs, workload), {
            cachedInputShare: cacheEnabled ? SUGGESTED_CACHE_SHARE : 0,
          })
        : null,
    [cacheEnabled, promptInputs, selectedModel, workload],
  );
  const scaled = useMemo(
    () =>
      breakdown
        ? costAtScale(breakdown.total, {
            conversationsPerDay: workload.conversationsPerDay,
            monthlyActiveUsers: 1,
            revenuePerUserPerMonth: 0,
          })
        : null,
    [breakdown, workload.conversationsPerDay],
  );
  const comparisonModels = useMemo(
    () =>
      catalog
        ? comparisonIds.map((id) => catalog.get(id)).filter((model): model is Model => model !== undefined)
        : [],
    [catalog, comparisonIds],
  );
  const comparisonRows = useMemo(
    () =>
      compareModelsForInputs(
        comparisonModels,
        promptInputs,
        workload,
        {
          conversationsPerDay: workload.conversationsPerDay,
          monthlyActiveUsers: 1,
          revenuePerUserPerMonth: 0,
        },
        { cachedInputShare: cacheEnabled ? SUGGESTED_CACHE_SHARE : 0 },
      ),
    [cacheEnabled, comparisonModels, promptInputs, workload],
  );
  const tokenReferenceModel = mode === 'compare' ? (comparisonModels[0] ?? selectedModel) : selectedModel;
  const displayedPromptTokens = useMemo(
    () =>
      tokenReferenceModel
        ? {
            system: promptFieldTokens(promptInputs.system, workload.systemTokens, tokenReferenceModel),
            user: promptFieldTokens(promptInputs.user, workload.userTokens, tokenReferenceModel),
            output: promptFieldTokens(promptInputs.output, workload.outputTokens, tokenReferenceModel),
          }
        : { system: 0, user: 0, output: 0 },
    [promptInputs, tokenReferenceModel, workload.outputTokens, workload.systemTokens, workload.userTokens],
  );

  const toggleComparisonModel = useCallback(
    (id: string) => {
      const result = toggleComparisonSelection(comparisonIds, id);
      if (result.accepted) setComparisonIds(result.selectedIds);
      return result.accepted;
    },
    [comparisonIds],
  );

  const updateWorkload = (key: keyof WorkloadState, value: number) => {
    setWorkload((current) => ({ ...current, [key]: value }));
  };

  const updatePromptMode = (field: PromptFieldKey, inputMode: PromptInputMode) => {
    setPromptInputs((current) => ({
      ...current,
      [field]: { ...current[field], mode: inputMode },
    }));
  };

  const updatePromptText = (field: PromptFieldKey, text: string) => {
    setPromptInputs((current) => ({
      ...current,
      [field]: { ...current[field], text },
    }));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              accessibilityLabel="Refresh pricing catalog"
              colors={[theme.accent]}
              onRefresh={() => void refreshCatalog()}
              refreshing={refreshing}
              tintColor={theme.accent}
            />
          }
          testID="estimate-scroll-view"
        >
          <View style={styles.brandRow}>
            <View style={styles.brandIdentity}>
              <View accessibilityElementsHidden style={styles.brandMark}>
                <View style={styles.brandMarkInner} />
              </View>
              <Text style={styles.brandName}>PromptSpend</Text>
            </View>
            <Text style={styles.phaseLabel}>NATIVE PREVIEW</Text>
          </View>

          <View accessibilityRole="tablist" style={styles.modeSelector}>
            <ModeButton
              active={mode === 'estimate'}
              label="Estimate"
              onPress={() => setMode('estimate')}
              styles={styles}
            />
            <ModeButton
              active={mode === 'compare'}
              label="Compare"
              onPress={() => setMode('compare')}
              styles={styles}
            />
          </View>

          <View style={styles.hero}>
            <Text style={styles.eyebrow}>{mode === 'estimate' ? 'ESTIMATE' : 'COMPARE'}</Text>
            <Text accessibilityRole="header" style={styles.title}>
              {mode === 'estimate' ? 'Know the tab before you build.' : 'See the price difference.'}
            </Text>
            <Text style={styles.summary}>
              {mode === 'estimate'
                ? 'Describe one typical AI conversation. PromptSpend applies the same validated pricing rules as the website and scales the cost to your traffic.'
                : 'Apply one workload to as many as four LLMs. PromptSpend ranks the same conversation from lowest to highest estimated cost.'}
            </Text>
            {catalog && <FreshnessChip freshness={catalog.freshness()} />}
          </View>

          {!catalogResult && (
            <View accessibilityLiveRegion="polite" style={styles.gateCard}>
              {catalogError ? (
                <>
                  <Text accessibilityRole="header" style={styles.gateTitle}>
                    Price calculations paused
                  </Text>
                  <Text style={styles.gateText}>{catalogError}</Text>
                  <Text style={styles.gateText}>
                    PromptSpend never substitutes stale or unvalidated rates. Check your connection and try
                    again.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={refreshing}
                    onPress={() => void refreshCatalog()}
                    style={({ pressed }) => [
                      styles.retryButton,
                      pressed && styles.pressed,
                      refreshing && styles.disabled,
                    ]}
                  >
                    {refreshing ? (
                      <ActivityIndicator color={theme.onAccent} />
                    ) : (
                      <Text style={styles.retryButtonText}>Try again</Text>
                    )}
                  </Pressable>
                </>
              ) : (
                <>
                  <ActivityIndicator
                    accessibilityLabel="Validating current pricing"
                    color={theme.accent}
                    size="large"
                  />
                  <Text accessibilityRole="header" style={styles.gateTitle}>
                    Validating current prices
                  </Text>
                  <Text style={styles.gateText}>
                    Calculations appear only after the catalog passes schema and freshness checks.
                  </Text>
                </>
              )}
            </View>
          )}

          {catalogResult?.warning && (
            <View accessibilityRole="alert" style={styles.notice}>
              <Text style={styles.noticeTitle}>
                {catalogResult.source === 'cache' ? 'Working offline' : 'Freshness warning'}
              </Text>
              <Text style={styles.noticeText}>{catalogResult.warning}</Text>
              {catalogResult.source === 'cache' && (
                <Text style={styles.noticeText}>Saved {formatTimestamp(catalogResult.refreshedAt)}.</Text>
              )}
            </View>
          )}

          {mode === 'estimate' && breakdown && selectedModel && scaled && (
            <EstimateResult breakdown={breakdown} model={selectedModel} scaled={scaled} />
          )}

          {mode === 'compare' && catalog && <ComparisonResult catalog={catalog} rows={comparisonRows} />}

          {catalog && selectedModel && (
            <>
              <View style={styles.panel}>
                <View style={styles.panelHeader}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>1</Text>
                  </View>
                  <View style={styles.panelHeadingCopy}>
                    <Text accessibilityRole="header" style={styles.panelTitle}>
                      {mode === 'estimate' ? 'Model and workload' : 'Models and workload'}
                    </Text>
                    <Text style={styles.panelSummary}>
                      {mode === 'estimate'
                        ? 'Choose a model, then describe one representative conversation.'
                        : 'Choose up to four models. Every one uses the workload below.'}
                    </Text>
                  </View>
                </View>

                {mode === 'estimate' ? (
                  <ModelPicker
                    catalog={catalog}
                    onChange={(model) => setSelectedId(model.id)}
                    selected={selectedModel}
                  />
                ) : (
                  <ComparisonModelPicker
                    catalog={catalog}
                    onClear={() => setComparisonIds([])}
                    onToggle={toggleComparisonModel}
                    selectedIds={comparisonIds}
                  />
                )}

                <View style={styles.divider} />

                <View style={styles.inputGuide}>
                  <Text style={styles.inputGuideTitle}>Use counts or paste the real text</Text>
                  <Text style={styles.inputGuideText}>
                    If you do not know the token count, choose Paste text. The estimate updates on this device
                    while you type.
                  </Text>
                </View>

                <PromptInputField
                  accessibilityHint="Typical number of tokens in the system instructions sent with each request"
                  helper="Sent with every request. Stable prefixes may be eligible for caching."
                  input={promptInputs.system}
                  label="System prompt"
                  max={200000}
                  modelName={tokenReferenceModel?.displayName ?? 'the selected model'}
                  numericValue={workload.systemTokens}
                  onModeChange={(inputMode) => updatePromptMode('system', inputMode)}
                  onNumericChange={(value) => updateWorkload('systemTokens', value)}
                  onTextChange={(text) => updatePromptText('system', text)}
                  placeholder="Paste your actual system prompt — the token estimate updates live…"
                  tokenEstimate={displayedPromptTokens.system}
                />

                <PromptInputField
                  accessibilityHint="Typical number of tokens in each new user message"
                  input={promptInputs.user}
                  label="User message"
                  max={200000}
                  modelName={tokenReferenceModel?.displayName ?? 'the selected model'}
                  numericValue={workload.userTokens}
                  onModeChange={(inputMode) => updatePromptMode('user', inputMode)}
                  onNumericChange={(value) => updateWorkload('userTokens', value)}
                  onTextChange={(text) => updatePromptText('user', text)}
                  placeholder="Paste a typical user message…"
                  tokenEstimate={displayedPromptTokens.user}
                />

                <PromptInputField
                  accessibilityHint="Typical number of tokens generated in each model response"
                  helper="Paste a representative earlier response if you have one; otherwise enter an expected token count."
                  input={promptInputs.output}
                  label="Model response"
                  max={200000}
                  modelName={tokenReferenceModel?.displayName ?? 'the selected model'}
                  numericValue={workload.outputTokens}
                  onModeChange={(inputMode) => updatePromptMode('output', inputMode)}
                  onNumericChange={(value) => updateWorkload('outputTokens', value)}
                  onTextChange={(text) => updatePromptText('output', text)}
                  placeholder="Paste a sample response, if you have one…"
                  tokenEstimate={displayedPromptTokens.output}
                />

                <NumericField
                  accessibilityHint="Number of back-and-forth turns in one conversation"
                  label="Turns per conversation"
                  max={200}
                  min={1}
                  onChange={(value) => updateWorkload('turns', value)}
                  suffix="turns"
                  value={workload.turns}
                />
                <Text style={styles.helper}>
                  Conversation history is re-sent each turn, so cost compounds.
                </Text>

                <View style={styles.switchRow}>
                  <View style={styles.switchCopy}>
                    <Text style={styles.switchLabel}>Assume prompt caching</Text>
                    <Text style={styles.helper}>
                      Off by default. When enabled, applies a {Math.round(SUGGESTED_CACHE_SHARE * 100)}%
                      hit-rate assumption and published cache-write rates.
                    </Text>
                  </View>
                  <Switch
                    accessibilityHint="Applies a sixty percent cached-input assumption"
                    accessibilityLabel="Assume prompt caching"
                    ios_backgroundColor={theme.border}
                    onValueChange={setCacheEnabled}
                    thumbColor={Platform.OS === 'android' ? theme.surface : undefined}
                    trackColor={{ false: theme.border, true: theme.accent }}
                    value={cacheEnabled}
                  />
                </View>
              </View>

              <View style={styles.panel}>
                <View style={styles.panelHeader}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>2</Text>
                  </View>
                  <View style={styles.panelHeadingCopy}>
                    <Text accessibilityRole="header" style={styles.panelTitle}>
                      Scale
                    </Text>
                    <Text style={styles.panelSummary}>
                      Turn one representative conversation into an operating estimate.
                    </Text>
                  </View>
                </View>

                <NumericField
                  accessibilityHint="Expected number of complete AI conversations per day"
                  label="Conversations per day"
                  max={100000000}
                  onChange={(value) => updateWorkload('conversationsPerDay', value)}
                  suffix="per day"
                  value={workload.conversationsPerDay}
                />
              </View>

              <View style={styles.dataCard}>
                <Text style={styles.dataEyebrow}>PRICE EVIDENCE</Text>
                <Text style={styles.dataTitle}>{sourceLabel(catalogResult?.source ?? 'network')}</Text>
                <Text style={styles.dataText}>
                  {catalog.primaryModels.length} models across {catalog.providers.length} providers. Every
                  download is schema-validated before it can replace the bundled catalog.
                </Text>
                <Text style={styles.privacyText}>
                  No account, prompt upload, tracker, or advertising identifier.
                </Text>
              </View>
            </>
          )}

          <Text style={styles.footer}>PromptSpend mobile · Estimate and compare</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ModeButton({
  active,
  label,
  onPress,
  styles,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeButton,
        active && styles.modeButtonActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function reconcileComparisonSelection(catalog: Catalog, selectedIds: readonly string[]): string[] {
  const valid = selectedIds.filter((id) => catalog.get(id) !== undefined);
  if (valid.length > 0) return valid;
  return defaultComparisonSelection(catalog.primaryModels);
}

function chooseModel(models: Model[], selectedId: string): Model {
  const selected = models.find((model) => model.id === selectedId);
  if (selected) return selected;
  const preferred = models.find((model) => model.id === DEFAULT_MODEL_ID);
  if (preferred) return preferred;
  const first = models[0];
  if (!first) throw new Error('The validated pricing catalog contains no primary models.');
  return first;
}

function sourceLabel(source: MobileCatalogResult['source']): string {
  if (source === 'network') return 'Live catalog validated on this device';
  return 'Validated 24-hour device cache';
}

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    safeArea: {
      backgroundColor: theme.background,
      flex: 1,
    },
    content: {
      alignSelf: 'center',
      gap: 20,
      maxWidth: 720,
      paddingBottom: 40,
      paddingHorizontal: 20,
      paddingTop: 12,
      width: '100%',
    },
    brandRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 48,
    },
    brandIdentity: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    brandMark: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: 8,
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    brandMarkInner: {
      borderColor: theme.onAccent,
      borderRadius: 3,
      borderWidth: 2,
      height: 14,
      width: 14,
    },
    brandName: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.4,
    },
    modeSelector: {
      alignSelf: 'flex-start',
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 4,
      padding: 4,
    },
    modeButton: {
      alignItems: 'center',
      borderRadius: 8,
      justifyContent: 'center',
      minHeight: 44,
      minWidth: 112,
      paddingHorizontal: 18,
    },
    modeButtonActive: {
      backgroundColor: theme.accent,
    },
    modeButtonText: {
      color: theme.mutedText,
      fontSize: 14,
      fontWeight: '800',
    },
    modeButtonTextActive: {
      color: theme.onAccent,
    },
    phaseLabel: {
      color: theme.mutedText,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.1,
    },
    hero: {
      gap: 14,
      paddingBottom: 4,
      paddingTop: 16,
    },
    eyebrow: {
      color: theme.accent,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.4,
      lineHeight: 16,
    },
    title: {
      color: theme.text,
      fontSize: 38,
      fontWeight: '800',
      letterSpacing: -1.2,
      lineHeight: 44,
      maxWidth: 600,
    },
    summary: {
      color: theme.mutedText,
      fontSize: 17,
      lineHeight: 26,
      maxWidth: 620,
    },
    notice: {
      backgroundColor: theme.surface,
      borderColor: theme.warning,
      borderLeftWidth: 3,
      borderRadius: 12,
      gap: 4,
      padding: 14,
    },
    noticeTitle: {
      color: theme.warning,
      fontSize: 13,
      fontWeight: '800',
    },
    noticeText: {
      color: theme.text,
      fontSize: 13,
      lineHeight: 19,
    },
    gateCard: {
      alignItems: 'flex-start',
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 12,
      minHeight: 180,
      padding: 20,
    },
    gateTitle: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '800',
      lineHeight: 26,
    },
    gateText: {
      color: theme.mutedText,
      fontSize: 14,
      lineHeight: 21,
    },
    retryButton: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: 12,
      justifyContent: 'center',
      minHeight: 48,
      minWidth: 124,
      paddingHorizontal: 18,
    },
    retryButtonText: {
      color: theme.onAccent,
      fontSize: 15,
      fontWeight: '800',
    },
    pressed: {
      opacity: 0.68,
    },
    disabled: {
      opacity: 0.5,
    },
    panel: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 16,
      padding: 18,
    },
    panelHeader: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: 12,
      marginBottom: 2,
    },
    stepBadge: {
      alignItems: 'center',
      backgroundColor: theme.accentSoft,
      borderRadius: 10,
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    stepBadgeText: {
      color: theme.accent,
      fontSize: 14,
      fontWeight: '800',
    },
    panelHeadingCopy: {
      flex: 1,
      gap: 3,
    },
    panelTitle: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.3,
      lineHeight: 25,
    },
    panelSummary: {
      color: theme.mutedText,
      fontSize: 13,
      lineHeight: 18,
    },
    divider: {
      backgroundColor: theme.border,
      height: StyleSheet.hairlineWidth,
    },
    inputGuide: {
      backgroundColor: theme.accentSoft,
      borderRadius: 12,
      gap: 4,
      padding: 14,
    },
    inputGuideTitle: {
      color: theme.accent,
      fontSize: 14,
      fontWeight: '800',
      lineHeight: 19,
    },
    inputGuideText: {
      color: theme.text,
      fontSize: 12,
      lineHeight: 18,
    },
    helper: {
      color: theme.mutedText,
      fontSize: 12,
      lineHeight: 18,
      marginTop: -10,
    },
    switchRow: {
      alignItems: 'center',
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 14,
      minHeight: 76,
      padding: 14,
    },
    switchCopy: {
      flex: 1,
      gap: 12,
    },
    switchLabel: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 20,
    },
    dataCard: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 8,
      padding: 18,
    },
    dataEyebrow: {
      color: theme.information,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.1,
    },
    dataTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '800',
      lineHeight: 22,
    },
    dataText: {
      color: theme.mutedText,
      fontSize: 13,
      lineHeight: 20,
    },
    privacyText: {
      color: theme.savings,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 18,
      marginTop: 2,
    },
    footer: {
      color: theme.mutedText,
      fontSize: 12,
      lineHeight: 18,
      paddingTop: 4,
      textAlign: 'center',
    },
  });
}
