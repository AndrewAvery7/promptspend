import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useIsFocused, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  useWindowDimensions,
} from 'react-native';

import { AppText as Text, FONT_FAMILIES } from '@/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  conversationCost,
  costAtScale,
  formatMoney,
  SUGGESTED_CACHE_SHARE,
  type Model,
} from '@promptspend/core';

import { ComparisonModelPicker } from '@/components/ComparisonModelPicker';
import { ComparisonResult } from '@/components/ComparisonResult';
import {
  AppearanceSheet,
  CommandSheet,
  GlobalActions,
  PricingTicker,
  type AppSection,
  isCompactAppChrome,
} from '@/components/AppChrome';
import { DataSection } from '@/components/DataSection';
import { CatalogExplorer } from '@/components/CatalogExplorer';
import { EstimateResult } from '@/components/EstimateResult';
import { FreshnessChip } from '@/components/FreshnessChip';
import { ContextualHelpLink } from '@/components/HelpCenter';
import { TourTarget, useGuidedTour } from '@/components/GuidedTour';
import { LearnSection } from '@/components/LearnSection';
import { WebDocumentHead } from '@/components/WebDocumentHead';
import { ModelPicker } from '@/components/ModelPicker';
import { NumericField } from '@/components/NumericField';
import { NumericDraftScopeProvider } from '@/components/NumericDraftScope';
import { PersistenceStatus } from '@/components/PersistenceStatus';
import { assertNumericDraftsValid } from '@/lib/numericDrafts';
import { PromptInputField } from '@/components/PromptInputField';
import { ScenarioActions } from '@/components/ScenarioActions';
import { ScenarioInsights } from '@/components/ScenarioInsights';
import { SensitivityLab } from '@/components/SensitivityLab';
import { SavingsPlaybook } from '@/components/SavingsPlaybook';
import type { MobileCatalogResult } from '@/data/catalog';
import { toggleComparisonSelection } from '@/lib/comparison';
import type { HelpDestination } from '@/lib/helpCenter';
import {
  compareModelsForInputs,
  promptFieldTokens,
  workloadForModel,
  type PromptFieldKey,
  type PromptInputMode,
} from '@/lib/promptInput';
import { APP_ROUTES, helpHref } from '@/lib/routes';
import { readSharedScenario, type SharedScenarioParams } from '@/lib/sharedScenarioLink';
import type { SavingsLever } from '@/lib/savingsPlaybook';
import type { SensitivityDraft } from '@/lib/sensitivity';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';
import { DEFAULT_MODEL_ID, type WorkloadState, useLaunchState } from '@/state/useLaunchState';

export default function EstimateScreen() {
  const params = useLocalSearchParams() as SharedScenarioParams;
  const launch = useLaunchState();
  const handledLink = useRef<string | null>(null);
  const shared = useMemo(() => readSharedScenario(params), [params]);

  useEffect(() => {
    if (!launch.hydrated || !shared || handledLink.current === shared.signature) return;
    handledLink.current = shared.signature;
    Alert.alert(
      'Open shared estimate?',
      'This link contains model choices, derived token counts, and pricing assumptions. It never contains pasted prompt or response text.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open estimate', onPress: () => launch.applySharedScenario(shared.scenario) },
      ],
    );
  }, [launch, shared]);

  return <EstimatorWorkspace section="estimate" />;
}

export function EstimatorWorkspace({
  alertToken,
  helpEntryId,
  onHelpEntryConsumed,
  section,
}: {
  alertToken?: string;
  helpEntryId?: string;
  onHelpEntryConsumed?: () => void;
  section: AppSection;
}) {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { startTour } = useGuidedTour();
  const scrollRef = useRef<ScrollView>(null);
  const {
    batchEnabled,
    assertCurrentPricing,
    pricingDay,
    cacheEnabled,
    cacheSharePercent,
    catalogError,
    catalogResult,
    clearRestoredPasteNotice,
    comparisonIds,
    favorites,
    promptInputs,
    reasoningMultiplier,
    restoredPasteFields,
    refreshing,
    refreshCatalog,
    resetScenario,
    selectedId,
    setBatchEnabled,
    setCacheEnabled,
    setCacheSharePercent,
    setComparisonIds,
    setPromptInputs,
    setReasoningMultiplier,
    setSelectedId,
    setWorkload,
    setModelsWatched,
    toggleFavorite,
    workload,
  } = useLaunchState();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const mode = section === 'compare' ? 'compare' : 'estimate';
  const documentMeta = DOCUMENT_META[section];

  const navigateToSection = useCallback(
    (next: AppSection) => {
      if (next === 'estimate') router.navigate(APP_ROUTES.estimate);
      if (next === 'compare') router.navigate(APP_ROUTES.compare);
      if (next === 'receipt') router.navigate(APP_ROUTES.receipt);
      if (next === 'learn') router.navigate(APP_ROUTES.learn);
      if (next === 'data') router.navigate(APP_ROUTES.data);
    },
    [router],
  );
  const navigateToHelpDestination = useCallback(
    (destination: HelpDestination) => {
      if (destination === 'home') router.navigate(APP_ROUTES.home);
      else navigateToSection(destination);
    },
    [navigateToSection, router],
  );

  const catalog = catalogResult?.catalog ?? null;
  const pricingAsOf = useMemo(() => new Date(`${pricingDay}T12:00:00Z`), [pricingDay]);
  const selectedModel = useMemo(
    () => (catalog ? chooseModel(catalog.primaryModels, selectedId) : null),
    [catalog, selectedId],
  );

  const breakdown = useMemo(
    () =>
      selectedModel
        ? conversationCost(selectedModel, workloadForModel(selectedModel, promptInputs, workload), {
            asOf: pricingAsOf,
            cachedInputShare: cacheEnabled ? cacheSharePercent / 100 : 0,
            reasoningMultiplier,
            useBatchApi: batchEnabled,
          })
        : null,
    [
      batchEnabled,
      cacheEnabled,
      cacheSharePercent,
      promptInputs,
      reasoningMultiplier,
      selectedModel,
      workload,
      pricingAsOf,
    ],
  );
  const scaled = useMemo(
    () =>
      breakdown
        ? costAtScale(breakdown.total, {
            conversationsPerDay: workload.conversationsPerDay,
            monthlyActiveUsers: workload.monthlyActiveUsers,
            revenuePerUserPerMonth: workload.revenuePerUserPerMonth,
          })
        : null,
    [breakdown, workload.conversationsPerDay, workload.monthlyActiveUsers, workload.revenuePerUserPerMonth],
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
          monthlyActiveUsers: workload.monthlyActiveUsers,
          revenuePerUserPerMonth: workload.revenuePerUserPerMonth,
        },
        {
          cachedInputShare: cacheEnabled ? cacheSharePercent / 100 : 0,
          asOf: pricingAsOf,
          reasoningMultiplier,
          useBatchApi: batchEnabled,
        },
      ),
    [
      batchEnabled,
      cacheEnabled,
      cacheSharePercent,
      comparisonModels,
      promptInputs,
      reasoningMultiplier,
      workload,
      pricingAsOf,
    ],
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
  const exportRows = useMemo(() => {
    if (section === 'compare') return comparisonRows;
    if (!selectedModel || !breakdown || !scaled) return [];
    return [
      { model: selectedModel, breakdown, scaled, deltaPerMonth: 0, multipleOfCheapest: 1, isCheapest: true },
    ];
  }, [breakdown, comparisonRows, scaled, section, selectedModel]);

  const toggleComparisonModel = useCallback(
    (id: string) => {
      const result = toggleComparisonSelection(comparisonIds, id);
      if (result.accepted) setComparisonIds(result.selectedIds);
      return result.accepted;
    },
    [comparisonIds, setComparisonIds],
  );

  const updateWorkload = (key: keyof WorkloadState, value: number) => {
    setWorkload((current) => ({ ...current, [key]: value }));
  };

  const updatePromptMode = (field: PromptFieldKey, inputMode: PromptInputMode) => {
    clearRestoredPasteNotice();
    setPromptInputs((current) => ({
      ...current,
      [field]: { ...current[field], mode: inputMode },
    }));
  };

  const updatePromptText = (field: PromptFieldKey, text: string) => {
    clearRestoredPasteNotice();
    setPromptInputs((current) => ({
      ...current,
      [field]: { ...current[field], text },
    }));
    if (tokenReferenceModel) {
      const workloadKey = {
        system: 'systemTokens',
        user: 'userTokens',
        output: 'outputTokens',
      }[field] as 'systemTokens' | 'userTokens' | 'outputTokens';
      const derivedTokens = promptFieldTokens(
        { mode: 'text', text },
        workload[workloadKey],
        tokenReferenceModel,
      );
      setWorkload((current) => ({ ...current, [workloadKey]: derivedTokens }));
    }
  };

  const applySavingsLever = (lever: SavingsLever) => {
    try {
      assertNumericDraftsValid();
      assertCurrentPricing();
    } catch (error) {
      Alert.alert('Check this estimate', error instanceof Error ? error.message : 'Review the inputs first.');
      return;
    }
    if (lever.kind === 'model' && lever.proposedModelId) setSelectedId(lever.proposedModelId);
    if (lever.kind === 'output' && lever.proposedValue !== undefined) {
      updateWorkload('outputTokens', lever.proposedValue);
    }
    if (lever.kind === 'turns' && lever.proposedValue !== undefined) {
      updateWorkload('turns', lever.proposedValue);
    }
    if (lever.kind === 'cache') {
      setCacheEnabled(true);
      setCacheSharePercent(lever.proposedValue ?? SUGGESTED_CACHE_SHARE * 100);
    }
    if (lever.kind === 'batch') setBatchEnabled(true);
  };

  const applySensitivityPreview = (draft: SensitivityDraft) => {
    try {
      assertNumericDraftsValid();
      assertCurrentPricing();
    } catch (error) {
      Alert.alert('Check this preview', error instanceof Error ? error.message : 'Review the inputs first.');
      return;
    }
    setWorkload((current) => ({
      ...current,
      conversationsPerDay: draft.conversationsPerDay,
      outputTokens: promptInputs.output.mode === 'tokens' ? draft.outputTokens : current.outputTokens,
      turns: draft.turns,
    }));
  };

  return (
    <NumericDraftScopeProvider active={isFocused}>
      <WebDocumentHead description={documentMeta.description} title={documentMeta.title} />
      <SafeAreaView role="main" style={styles.safeArea} edges={['top', 'right', 'left']}>
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
            ref={scrollRef}
            stickyHeaderIndices={
              section === 'estimate' && breakdown && scaled ? [catalog ? 2 : 1] : undefined
            }
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
              <TourTarget
                enabled={section === 'learn'}
                id="global-tools"
                scrollRef={scrollRef}
                style={isCompactAppChrome(width) ? { width: '100%' } : undefined}
              >
                <GlobalActions
                  onAppearance={() => setAppearanceOpen(true)}
                  onSearch={() => setCommandOpen(true)}
                  onTour={startTour}
                />
              </TourTarget>
            </View>

            {catalog && (
              <PricingTicker
                asOf={pricingAsOf}
                catalog={catalog}
                onOpenData={() => navigateToSection('data')}
              />
            )}

            {section === 'estimate' && breakdown && selectedModel && scaled && (
              <View style={styles.stickySummaryShell}>
                <View
                  accessibilityLabel={`${selectedModel.displayName}. ${formatMoney(scaled.perMonth)} per month and ${formatMoney(breakdown.total)} per conversation.`}
                  accessibilityRole="summary"
                  style={styles.stickySummary}
                >
                  <View style={styles.stickySummaryCopy}>
                    <Text style={styles.stickySummaryEyebrow}>LIVE ESTIMATE</Text>
                    <Text numberOfLines={1} style={styles.stickySummaryModel}>
                      {selectedModel.displayName}
                    </Text>
                  </View>
                  <View style={styles.stickySummaryCost}>
                    <Text style={styles.stickySummaryAmount}>{formatMoney(scaled.perMonth)}</Text>
                    <Text style={styles.stickySummaryUnit}>
                      per month · {formatMoney(breakdown.total)}/conversation
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {(section === 'estimate' || section === 'compare') && (
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
                <ContextualHelpLink
                  label={mode === 'estimate' ? 'How to use Estimate' : 'How to use Compare'}
                  onPress={() =>
                    router.navigate(helpHref(mode === 'estimate' ? 'estimate-overview' : 'compare-overview'))
                  }
                />
                {catalog && (
                  <FreshnessChip
                    freshness={catalog.freshness()}
                    pricesChangedOn={catalog.pricesLastChanged()}
                  />
                )}
              </View>
            )}

            <PersistenceStatus />
            {!catalogResult && section !== 'learn' && (
              <View accessibilityLiveRegion="polite" style={styles.gateCard}>
                {catalogError ? (
                  <>
                    <Text accessibilityRole="header" style={styles.gateTitle}>
                      {section === 'data' ? 'Live price data paused' : 'Price calculations paused'}
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

            {section === 'estimate' && breakdown && selectedModel && scaled && (
              <EstimateResult
                breakdown={breakdown}
                country={catalog?.provider(selectedModel)?.country}
                model={selectedModel}
                scaled={scaled}
                validateAction={assertCurrentPricing}
              />
            )}

            {section === 'compare' && catalog && (
              <TourTarget id="compare-results" scrollRef={scrollRef}>
                <ComparisonResult
                  catalog={catalog}
                  rows={comparisonRows}
                  validateAction={assertCurrentPricing}
                />
              </TourTarget>
            )}

            {section === 'learn' && (
              <LearnSection
                catalog={catalog ?? undefined}
                initialHelpEntryId={helpEntryId}
                onHelpEntryConsumed={onHelpEntryConsumed}
                onNavigate={navigateToHelpDestination}
                tourScrollRef={scrollRef}
              />
            )}

            {section === 'data' && (
              <DataSection
                asOf={pricingAsOf}
                catalog={catalog}
                onOpenHelp={() => router.navigate(helpHref('data-overview'))}
                preferencesToken={alertToken}
                tourScrollRef={scrollRef}
              />
            )}

            {(section === 'estimate' || section === 'compare') && catalog && selectedModel && (
              <>
                <TourTarget enabled={section === 'estimate'} id="estimate-workload" scrollRef={scrollRef}>
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
                        asOf={pricingAsOf}
                        catalog={catalog}
                        isFavorite={favorites.includes(selectedModel.id)}
                        onChange={(model) => setSelectedId(model.id)}
                        onToggleFavorite={() => toggleFavorite(selectedModel.id)}
                        selected={selectedModel}
                      />
                    ) : (
                      <ComparisonModelPicker
                        asOf={pricingAsOf}
                        catalog={catalog}
                        favoriteIds={favorites}
                        onClear={() => setComparisonIds([])}
                        onSetModelsWatched={setModelsWatched}
                        onToggle={toggleComparisonModel}
                        selectedIds={comparisonIds}
                      />
                    )}

                    <View style={styles.divider} />

                    <View style={styles.inputGuide}>
                      <Text style={styles.inputGuideTitle}>Use counts or paste the real text</Text>
                      <Text style={styles.inputGuideText}>
                        If you do not know the token count, choose Paste text. The estimate updates on this
                        device while you type.
                      </Text>
                    </View>

                    {restoredPasteFields.length > 0 && (
                      <View accessibilityRole="alert" style={styles.restoreNotice}>
                        <View style={styles.restoreNoticeCopy}>
                          <Text style={styles.restoreNoticeTitle}>Private text was not restored</Text>
                          <Text style={styles.restoreNoticeText}>
                            This saved scenario used pasted text for {restoredPasteFields.join(', ')}.
                            PromptSpend restored only the derived token counts. Paste again if you want to
                            recalculate from the original text.
                          </Text>
                        </View>
                        <Pressable
                          accessibilityLabel="Dismiss restored text notice"
                          accessibilityRole="button"
                          onPress={clearRestoredPasteNotice}
                          style={styles.restoreDismiss}
                        >
                          <Text style={styles.restoreDismissText}>Dismiss</Text>
                        </Pressable>
                      </View>
                    )}

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

                    <Pressable
                      accessibilityHint="Shows or hides optional caching, batch, and reasoning assumptions"
                      accessibilityRole="button"
                      accessibilityState={{ expanded: advancedOpen }}
                      android_ripple={{ color: theme.accentSoft }}
                      onPress={() => setAdvancedOpen((current) => !current)}
                      style={({ pressed }) => [styles.advancedToggle, pressed && styles.pressed]}
                    >
                      <View style={styles.advancedToggleCopy}>
                        <Text style={styles.advancedToggleTitle}>Advanced assumptions</Text>
                        <Text style={styles.advancedToggleSummary}>
                          Cache {cacheEnabled ? `${Math.round(cacheSharePercent)}%` : 'off'} · Batch{' '}
                          {batchEnabled ? 'on' : 'off'} · Reasoning {reasoningMultiplier.toFixed(1)}×
                        </Text>
                      </View>
                      <Text style={styles.advancedToggleAction}>{advancedOpen ? 'Hide' : 'Edit'}</Text>
                    </Pressable>

                    {advancedOpen && (
                      <View style={styles.advancedContent}>
                        <View style={styles.switchRow}>
                          <View style={styles.switchCopy}>
                            <Text style={styles.switchLabel}>Assume prompt caching</Text>
                            <Text style={styles.helper}>
                              Off by default. When enabled, applies a{' '}
                              {Math.round(SUGGESTED_CACHE_SHARE * 100)}% starting hit-rate assumption and
                              published cache-write rates.
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

                        {cacheEnabled && (
                          <NumericField
                            accessibilityHint="Estimated percentage of repeated input served from the provider prompt cache"
                            label="Cache hit share"
                            max={100}
                            onChange={setCacheSharePercent}
                            suffix="percent"
                            value={cacheSharePercent}
                          />
                        )}

                        <View style={styles.switchRow}>
                          <View style={styles.switchCopy}>
                            <Text style={styles.switchLabel}>Use batch API where available</Text>
                            <Text style={styles.helper}>
                              Applies only each provider’s published batch multiplier. Models without one stay
                              at full rates.
                            </Text>
                          </View>
                          <Switch
                            accessibilityLabel="Use batch API where available"
                            ios_backgroundColor={theme.border}
                            onValueChange={setBatchEnabled}
                            thumbColor={Platform.OS === 'android' ? theme.surface : undefined}
                            trackColor={{ false: theme.border, true: theme.accent }}
                            value={batchEnabled}
                          />
                        </View>

                        <NumericField
                          accessibilityHint="Multiplier for hidden reasoning tokens billed at the output rate"
                          label="Reasoning token multiplier"
                          max={5}
                          min={1}
                          onChange={setReasoningMultiplier}
                          step={0.1}
                          suffix="times"
                          value={reasoningMultiplier}
                        />
                        <Text style={styles.helper}>
                          Leave at 1× unless provider usage reports hidden reasoning tokens.
                        </Text>
                      </View>
                    )}
                  </View>
                </TourTarget>

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
                  <NumericField
                    accessibilityHint="Number of users active in a typical month"
                    label="Monthly active users"
                    max={1000000000}
                    min={1}
                    onChange={(value) => updateWorkload('monthlyActiveUsers', value)}
                    suffix="users"
                    value={workload.monthlyActiveUsers}
                  />
                  <NumericField
                    accessibilityHint="Average monthly revenue earned from each active user"
                    label="Revenue per user per month"
                    max={1000000}
                    onChange={(value) => updateWorkload('revenuePerUserPerMonth', value)}
                    step={0.01}
                    suffix="USD"
                    value={workload.revenuePerUserPerMonth}
                  />
                </View>

                <ScenarioInsights onLearn={() => navigateToSection('learn')} rows={exportRows} />

                {section === 'estimate' && (
                  <>
                    <SavingsPlaybook
                      batchEnabled={batchEnabled}
                      cacheEnabled={cacheEnabled}
                      cacheSharePercent={cacheSharePercent}
                      comparisonRows={comparisonRows}
                      model={selectedModel}
                      onApply={applySavingsLever}
                      promptInputs={promptInputs}
                      reasoningMultiplier={reasoningMultiplier}
                      workload={workload}
                    />
                    <SensitivityLab
                      key={`sensitivity-${selectedModel.id}`}
                      pricingDay={pricingDay}
                      batchEnabled={batchEnabled}
                      cacheEnabled={cacheEnabled}
                      cacheSharePercent={cacheSharePercent}
                      model={selectedModel}
                      onApply={applySensitivityPreview}
                      promptInputs={promptInputs}
                      reasoningMultiplier={reasoningMultiplier}
                      workload={workload}
                    />
                  </>
                )}

                <ScenarioActions
                  batchEnabled={batchEnabled}
                  cacheShare={cacheEnabled ? cacheSharePercent / 100 : 0}
                  catalog={catalog}
                  conversationsPerDay={workload.conversationsPerDay}
                  monthlyActiveUsers={workload.monthlyActiveUsers}
                  modelIds={section === 'compare' ? comparisonIds : [selectedModel.id]}
                  outputTokens={displayedPromptTokens.output}
                  pastedFields={(Object.keys(promptInputs) as PromptFieldKey[]).filter(
                    (field) => promptInputs[field].mode === 'text',
                  )}
                  pricingAsOf={pricingAsOf}
                  reasoningMultiplier={reasoningMultiplier}
                  revenuePerUserPerMonth={workload.revenuePerUserPerMonth}
                  rows={exportRows}
                  systemTokens={displayedPromptTokens.system}
                  turns={workload.turns}
                  userTokens={displayedPromptTokens.user}
                />

                <View style={styles.dataCard}>
                  <Text style={styles.dataEyebrow}>PRICE EVIDENCE</Text>
                  <Text style={styles.dataTitle}>
                    {catalogResult?.warning
                      ? 'Last successful price validation'
                      : sourceLabel(catalogResult?.source ?? 'network')}
                  </Text>
                  <Text style={styles.dataText}>
                    {catalog.primaryModels.length} models across {catalog.providers.length} providers. Every
                    download is schema-validated before it can replace the bundled catalog.
                  </Text>
                  <Text style={styles.privacyText}>
                    No account, prompt upload, tracker, or advertising identifier.
                  </Text>
                </View>

                {section === 'compare' && (
                  <CatalogExplorer
                    asOf={pricingAsOf}
                    catalog={catalog}
                    favoriteIds={favorites}
                    onToggleFavorite={toggleFavorite}
                    onToggle={toggleComparisonModel}
                    selectedIds={comparisonIds}
                  />
                )}
              </>
            )}

            <Text style={styles.footer}>
              PromptSpend mobile · Home · Estimate · Compare · Data &amp; Alerts · Learn
            </Text>
          </ScrollView>

          <AppearanceSheet onClose={() => setAppearanceOpen(false)} visible={appearanceOpen} />
          {catalog && (
            <CommandSheet
              catalog={catalog}
              favoriteIds={favorites}
              onClose={() => setCommandOpen(false)}
              onHome={() => router.navigate(APP_ROUTES.home)}
              onHelp={(id) => router.navigate(helpHref(id))}
              onReset={resetScenario}
              onSection={navigateToSection}
              onSelectModel={(id) => {
                setSelectedId(id);
                navigateToSection('estimate');
              }}
              onToggleComparison={(id) => {
                if (toggleComparisonModel(id)) navigateToSection('compare');
              }}
              onToggleFavorite={toggleFavorite}
              onTour={startTour}
              visible={commandOpen}
              selectedComparisonIds={comparisonIds}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </NumericDraftScopeProvider>
  );
}

function chooseModel(models: Model[], selectedId: string): Model | null {
  const selected = models.find((model) => model.id === selectedId);
  if (selected) return selected;
  const preferred = models.find((model) => model.id === DEFAULT_MODEL_ID);
  if (preferred) return preferred;
  const first = models[0];
  return first ?? null;
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

const DOCUMENT_META: Record<AppSection, { description: string; title: string }> = {
  estimate: {
    description: 'Estimate one LLM API workload with current pricing evidence and transparent assumptions.',
    title: 'Estimate LLM API cost — PromptSpend',
  },
  compare: {
    description: 'Compare up to four LLMs against the same workload, pricing date, and assumptions.',
    title: 'Compare LLM API prices — PromptSpend',
  },
  data: {
    description: 'Inspect PromptSpend pricing provenance, freshness, changes, and private alert controls.',
    title: 'Pricing data and alerts — PromptSpend',
  },
  learn: {
    description: 'Learn how LLM tokens, caching, workload scale, and provider pricing affect AI cost.',
    title: 'Learn LLM cost fundamentals — PromptSpend',
  },
  receipt: {
    description: 'Audit an AI conversation using a portable, privacy-safe PromptSpend Receipt.',
    title: 'PromptSpend Receipt — audit AI cost',
  },
};

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
    stickySummaryShell: {
      backgroundColor: theme.background,
      paddingBottom: 4,
      paddingTop: 4,
      zIndex: 20,
    },
    stickySummary: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderColor: theme.borderStrong,
      borderRadius: 14,
      borderWidth: 1,
      elevation: 5,
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      minHeight: 68,
      paddingHorizontal: 14,
      paddingVertical: 10,
      shadowColor: '#000000',
      shadowOffset: { height: 3, width: 0 },
      shadowOpacity: 0.12,
      shadowRadius: 7,
    },
    stickySummaryCopy: { flex: 1, gap: 2, minWidth: 0 },
    stickySummaryEyebrow: {
      color: theme.accent,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      lineHeight: 14,
    },
    stickySummaryModel: { color: theme.text, fontSize: 14, fontWeight: '700', lineHeight: 19 },
    stickySummaryCost: { alignItems: 'flex-end', flexShrink: 0, gap: 1 },
    stickySummaryAmount: {
      color: theme.text,
      fontFamily: FONT_FAMILIES.numeric,
      fontSize: 21,
      fontWeight: '700',
      lineHeight: 25,
    },
    stickySummaryUnit: { color: theme.mutedText, fontSize: 10, lineHeight: 14 },
    brandRow: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
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
    advancedToggle: {
      alignItems: 'center',
      backgroundColor: theme.accentSoft,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      minHeight: 58,
      overflow: 'hidden',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    advancedToggleCopy: { flex: 1, gap: 2 },
    advancedToggleTitle: { color: theme.text, fontSize: 14, fontWeight: '800', lineHeight: 19 },
    advancedToggleSummary: { color: theme.mutedText, fontSize: 11, lineHeight: 16 },
    advancedToggleAction: { color: theme.accent, fontSize: 13, fontWeight: '800', lineHeight: 18 },
    advancedContent: { gap: 16 },
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
    restoreNotice: {
      alignItems: 'flex-start',
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.warning,
      borderLeftWidth: 3,
      borderRadius: 10,
      flexDirection: 'row',
      gap: 10,
      padding: 12,
    },
    restoreNoticeCopy: { flex: 1, gap: 3 },
    restoreNoticeTitle: { color: theme.warning, fontSize: 13, fontWeight: '900' },
    restoreNoticeText: { color: theme.text, fontSize: 12, lineHeight: 18 },
    restoreDismiss: { alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingHorizontal: 4 },
    restoreDismissText: { color: theme.accent, fontSize: 12, fontWeight: '800' },
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
      color: theme.mutedText,
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
