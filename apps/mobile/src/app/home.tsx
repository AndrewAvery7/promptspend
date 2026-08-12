import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { conversationCost, costAtScale, formatMoney, type Model } from '@promptspend/core';

import {
  AppearanceSheet,
  CommandSheet,
  GlobalActions,
  GuidedTourSheet,
  PricingTicker,
  type AppSection,
} from '@/components/AppChrome';
import { FreshnessChip } from '@/components/FreshnessChip';
import { SavedScenarioSheet } from '@/components/SavedScenarioSheet';
import { toggleComparisonSelection } from '@/lib/comparison';
import { compareModelsForInputs, workloadForModel } from '@/lib/promptInput';
import { APP_ROUTES } from '@/lib/routes';
import {
  SCENARIO_PRESETS,
  type SavedScenario,
  type ScenarioPreset,
  useLaunchState,
} from '@/state/useLaunchState';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const launch = useLaunchState();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [deletedScenario, setDeletedScenario] = useState<SavedScenario | null>(null);
  const [managedScenario, setManagedScenario] = useState<SavedScenario | null>(null);
  const [showAllScenarios, setShowAllScenarios] = useState(false);

  const catalog = launch.catalogResult?.catalog ?? null;
  const selectedModel = useMemo(
    () => chooseModel(catalog?.primaryModels ?? [], launch.selectedId),
    [catalog, launch.selectedId],
  );
  const current = useMemo(() => {
    if (!selectedModel) return null;
    const modelWorkload = workloadForModel(selectedModel, launch.promptInputs, launch.workload);
    const breakdown = conversationCost(selectedModel, modelWorkload, {
      cachedInputShare: launch.cacheEnabled ? launch.cacheSharePercent / 100 : 0,
      reasoningMultiplier: launch.reasoningMultiplier,
      useBatchApi: launch.batchEnabled,
    });
    const scaled = costAtScale(breakdown.total, {
      conversationsPerDay: launch.workload.conversationsPerDay,
      monthlyActiveUsers: launch.workload.monthlyActiveUsers,
      revenuePerUserPerMonth: launch.workload.revenuePerUserPerMonth,
    });
    return { breakdown, modelWorkload, scaled };
  }, [
    launch.batchEnabled,
    launch.cacheEnabled,
    launch.cacheSharePercent,
    launch.promptInputs,
    launch.reasoningMultiplier,
    launch.workload,
    selectedModel,
  ]);
  const comparisonModels = useMemo(
    () =>
      catalog
        ? [...new Set([launch.selectedId, ...launch.comparisonIds])]
            .map((id) => catalog.get(id))
            .filter((model): model is Model => model !== undefined)
            .slice(0, 4)
        : [],
    [catalog, launch.comparisonIds, launch.selectedId],
  );
  const comparisonRows = useMemo(
    () =>
      compareModelsForInputs(
        comparisonModels,
        launch.promptInputs,
        launch.workload,
        {
          conversationsPerDay: launch.workload.conversationsPerDay,
          monthlyActiveUsers: launch.workload.monthlyActiveUsers,
          revenuePerUserPerMonth: launch.workload.revenuePerUserPerMonth,
        },
        {
          cachedInputShare: launch.cacheEnabled ? launch.cacheSharePercent / 100 : 0,
          reasoningMultiplier: launch.reasoningMultiplier,
          useBatchApi: launch.batchEnabled,
        },
      ),
    [
      comparisonModels,
      launch.batchEnabled,
      launch.cacheEnabled,
      launch.cacheSharePercent,
      launch.promptInputs,
      launch.reasoningMultiplier,
      launch.workload,
    ],
  );
  const selectedRow = comparisonRows.find((row) => row.model.id === launch.selectedId);
  const cheapestRow = comparisonRows[0];
  const potentialSavings =
    selectedRow && cheapestRow ? selectedRow.scaled.perMonth - cheapestRow.scaled.perMonth : 0;

  const navigateToSection = (section: AppSection) => {
    if (section === 'estimate') router.navigate(APP_ROUTES.estimate);
    if (section === 'compare') router.navigate(APP_ROUTES.compare);
    if (section === 'learn') router.navigate(APP_ROUTES.learn);
    if (section === 'data') router.navigate(APP_ROUTES.more);
  };

  const applyPreset = (preset: ScenarioPreset) => {
    launch.applyPreset(preset);
    launch.completeOnboarding();
    setOnboardingStep(0);
    router.navigate(APP_ROUTES.estimate);
  };

  const saveCurrentScenario = () => {
    if (!current) return;
    launch.saveScenario(`Estimate · ${shortDate(new Date())}`, {
      ...launch.workload,
      ...current.modelWorkload,
    });
  };

  return (
    <>
      <Head>
        <title>PromptSpend — AI Cost Brief</title>
        <meta
          content="Your private AI cost brief, scenarios, watchlist, and price evidence."
          name="description"
        />
      </Head>
      <SafeAreaView edges={['top', 'right', 'left']} role="main" style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              accessibilityLabel="Refresh the PromptSpend Cost Brief"
              colors={[theme.accent]}
              onRefresh={() => void launch.refreshCatalog()}
              refreshing={launch.refreshing}
              tintColor={theme.accent}
            />
          }
        >
          <View style={styles.brandRow}>
            <View style={styles.brandIdentity}>
              <View accessibilityElementsHidden style={styles.brandMark}>
                <View style={styles.brandMarkInner} />
              </View>
              <View>
                <Text style={styles.brandName}>PromptSpend</Text>
                <Text style={styles.brandSubhead}>AI COST INTELLIGENCE</Text>
              </View>
            </View>
            <GlobalActions
              onAppearance={() => setAppearanceOpen(true)}
              onSearch={() => setCommandOpen(true)}
              onTour={() => setTourOpen(true)}
            />
          </View>

          {catalog && <PricingTicker catalog={catalog} onOpenData={() => router.navigate(APP_ROUTES.more)} />}

          <View style={styles.hero}>
            <Text style={styles.eyebrow}>YOUR COST BRIEF</Text>
            <Text accessibilityRole="header" style={styles.title}>
              Know what your AI decision costs.
            </Text>
            <Text style={styles.summary}>
              One private view of the estimate you are shaping, the models you watch, and the next place to
              save.
            </Text>
            {catalog && (
              <FreshnessChip freshness={catalog.freshness()} pricesChangedOn={catalog.pricesLastChanged()} />
            )}
          </View>

          {!launch.catalogResult && (
            <View accessibilityLiveRegion="polite" style={styles.statusCard}>
              {launch.catalogError ? (
                <>
                  <Ionicons color={theme.warning} name="cloud-offline-outline" size={28} />
                  <Text accessibilityRole="header" style={styles.cardTitle}>
                    Current prices unavailable
                  </Text>
                  <Text style={styles.body}>{launch.catalogError}</Text>
                  <ActionButton
                    label="Try again"
                    onPress={() => void launch.refreshCatalog()}
                    primary
                    styles={styles}
                  />
                </>
              ) : (
                <>
                  <ActivityIndicator accessibilityLabel="Validating current prices" color={theme.accent} />
                  <Text style={styles.body}>Validating the current catalog before showing cost figures.</Text>
                </>
              )}
            </View>
          )}

          {launch.catalogResult?.warning && (
            <View accessibilityRole="alert" style={styles.warningCard}>
              <Ionicons color={theme.warning} name="warning-outline" size={22} />
              <Text style={styles.warningText}>{launch.catalogResult.warning}</Text>
            </View>
          )}

          {selectedModel && current && (
            <View
              accessibilityLabel={`${selectedModel.displayName} current estimate, ${formatMoney(current.scaled.perMonth)} per month`}
              style={styles.costCard}
            >
              <View style={styles.costHeader}>
                <View style={styles.costHeaderCopy}>
                  <Text style={styles.cardEyebrow}>ACTIVE SCENARIO</Text>
                  <Text style={styles.cardTitle}>{selectedModel.displayName}</Text>
                </View>
                <Pressable
                  accessibilityLabel={
                    launch.favorites.includes(selectedModel.id)
                      ? `Remove ${selectedModel.displayName} from watchlist`
                      : `Watch ${selectedModel.displayName}`
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected: launch.favorites.includes(selectedModel.id) }}
                  onPress={() => launch.toggleFavorite(selectedModel.id)}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                  <Ionicons
                    color={theme.accent}
                    name={launch.favorites.includes(selectedModel.id) ? 'bookmark' : 'bookmark-outline'}
                    size={22}
                  />
                </Pressable>
              </View>
              <Text style={styles.costValue}>{formatMoney(current.scaled.perMonth)}</Text>
              <Text style={styles.costCaption}>
                per month · {formatMoney(current.breakdown.total)} per conversation
              </Text>
              <View style={styles.metricRow}>
                <Metric label="Per day" value={formatMoney(current.scaled.perDay)} styles={styles} />
                <Metric label="Per year" value={formatMoney(current.scaled.perYear)} styles={styles} />
                <Metric label="Turns" value={`${launch.workload.turns}`} styles={styles} />
              </View>
              <View style={styles.actionRow}>
                <ActionButton
                  label="Open estimate"
                  onPress={() => router.navigate(APP_ROUTES.estimate)}
                  primary
                  styles={styles}
                />
                <ActionButton label="Save" onPress={saveCurrentScenario} styles={styles} />
              </View>
            </View>
          )}

          {potentialSavings > 0.005 && cheapestRow && (
            <Pressable
              accessibilityHint="Opens the full comparison"
              accessibilityRole="button"
              onPress={() => router.navigate(APP_ROUTES.compare)}
              style={({ pressed }) => [styles.savingsCard, pressed && styles.pressed]}
            >
              <View style={styles.savingsIcon}>
                <Ionicons color={theme.savings} name="sparkles-outline" size={22} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.savingsLabel}>SAVINGS OPPORTUNITY</Text>
                <Text style={styles.savingsValue}>{formatMoney(potentialSavings)} less per month</Text>
                <Text style={styles.body}>
                  Preview the same workload with {cheapestRow.model.displayName}. Capability equivalence is
                  not assumed.
                </Text>
              </View>
              <Ionicons color={theme.accent} name="chevron-forward" size={20} />
            </Pressable>
          )}

          <SectionHeading
            eyebrow="START FAST"
            summary="Use a transparent starting point, then change every assumption."
            title="Scenario presets"
            styles={styles}
          />
          <View style={styles.presetGrid}>
            {SCENARIO_PRESETS.map((preset) => (
              <Pressable
                accessibilityHint="Applies editable assumptions and opens Estimate"
                accessibilityRole="button"
                key={preset.id}
                onPress={() => applyPreset(preset)}
                style={({ pressed }) => [styles.presetCard, pressed && styles.pressed]}
              >
                <View style={styles.presetIcon}>
                  <Ionicons color={theme.accent} name={presetIcon(preset.id)} size={21} />
                </View>
                <Text style={styles.presetTitle}>{preset.label}</Text>
                <Text style={styles.presetDescription}>{preset.description}</Text>
                <Text style={styles.presetMeta}>
                  {preset.workload.conversationsPerDay.toLocaleString()} conversations/day
                </Text>
              </Pressable>
            ))}
          </View>

          <SectionHeading
            eyebrow="CONTINUE"
            summary="Only derived counts and assumptions are stored. Prompt text never is."
            title="Saved scenarios"
            styles={styles}
          />
          {launch.savedScenarios.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons color={theme.mutedText} name="albums-outline" size={28} />
              <Text style={styles.cardTitle}>No saved scenarios yet</Text>
              <Text style={styles.body}>Save the active estimate above, or build one from a preset.</Text>
            </View>
          ) : (
            <View style={styles.savedList}>
              {launch.savedScenarios.slice(0, showAllScenarios ? 50 : 5).map((scenario) => (
                <View key={scenario.id} style={styles.savedRow}>
                  <Pressable
                    accessibilityHint="Restores derived counts and assumptions, then opens Estimate"
                    accessibilityRole="button"
                    onPress={() => {
                      launch.restoreScenario(scenario);
                      router.navigate(APP_ROUTES.estimate);
                    }}
                    style={({ pressed }) => [styles.savedMain, pressed && styles.pressed]}
                  >
                    <Text style={styles.savedName}>{scenario.name}</Text>
                    <Text style={styles.savedMeta}>
                      {shortDate(new Date(scenario.savedAt))} ·{' '}
                      {scenario.workload.conversationsPerDay.toLocaleString()}/day
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityHint="Opens rename, duplicate, and delete actions"
                    accessibilityLabel={`More actions for ${scenario.name}`}
                    accessibilityRole="button"
                    onPress={() => setManagedScenario(scenario)}
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                  >
                    <Ionicons color={theme.accent} name="ellipsis-horizontal" size={21} />
                  </Pressable>
                </View>
              ))}
              {launch.savedScenarios.length > 5 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showAllScenarios }}
                  onPress={() => setShowAllScenarios((current) => !current)}
                  style={({ pressed }) => [styles.showAllButton, pressed && styles.pressed]}
                >
                  <Text style={styles.showAllText}>
                    {showAllScenarios
                      ? 'Show recent five'
                      : `View all ${launch.savedScenarios.length} scenarios`}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          <SectionHeading
            eyebrow="WATCHLIST"
            summary="Local to this device. Verified changes and review flags appear here; version 1 does not send push notifications."
            title="Models you follow"
            styles={styles}
          />
          {launch.favorites.length === 0 || !catalog ? (
            <View style={styles.emptyCard}>
              <Ionicons color={theme.mutedText} name="bookmark-outline" size={28} />
              <Text style={styles.cardTitle}>Your watchlist is ready</Text>
              <Text style={styles.body}>
                Bookmark the active model or models in Compare to keep them close.
              </Text>
              <ActionButton
                label="Browse models"
                onPress={() => router.navigate(APP_ROUTES.compare)}
                styles={styles}
              />
            </View>
          ) : (
            <View style={styles.watchGrid}>
              {launch.favorites.slice(0, 6).map((id) => {
                const model = catalog.get(id);
                if (!model) {
                  return (
                    <View key={id} style={styles.watchCard}>
                      <View style={styles.watchHeader}>
                        <Text style={styles.watchName}>{id}</Text>
                        <Text style={[styles.watchBadge, styles.watchBadgeWarning]}>UNAVAILABLE</Text>
                      </View>
                      <Text style={styles.watchMeta}>
                        This saved model is no longer in the validated catalog. Your watch choice was kept.
                      </Text>
                      <Pressable
                        accessibilityLabel={`Remove ${id} from watchlist`}
                        accessibilityRole="button"
                        onPress={() => launch.toggleFavorite(id)}
                        style={styles.watchRemove}
                      >
                        <Text style={styles.watchRemoveText}>Remove from watchlist</Text>
                      </Pressable>
                    </View>
                  );
                }
                const attention =
                  model.provenance.needsReview || model.provenance.stale || model.status !== 'current';
                const status = model.provenance.needsReview
                  ? 'CHECK'
                  : model.provenance.stale
                    ? 'UNLISTED'
                    : model.status === 'current'
                      ? 'CURRENT'
                      : model.status.toUpperCase();
                return (
                  <Pressable
                    accessibilityLabel={`${model.displayName}. ${status}. Input ${formatMoney(model.pricing.input)} and output ${formatMoney(model.pricing.output)} per million tokens. Verified ${model.provenance.lastVerified}.`}
                    accessibilityRole="button"
                    key={id}
                    onPress={() => {
                      launch.setSelectedId(id);
                      router.navigate(APP_ROUTES.estimate);
                    }}
                    style={({ pressed }) => [styles.watchCard, pressed && styles.pressed]}
                  >
                    <View style={styles.watchHeader}>
                      <Text style={styles.watchName}>{model.displayName}</Text>
                      <Text style={[styles.watchBadge, attention && styles.watchBadgeWarning]}>{status}</Text>
                    </View>
                    <Text style={styles.watchMeta}>
                      {catalog.providerName(model)} · verified {model.provenance.lastVerified}
                    </Text>
                    <Text style={styles.watchPrice}>
                      {formatMoney(model.pricing.input)}/{formatMoney(model.pricing.output)} per 1M
                    </Text>
                    {model.provenance.reviewNote && (
                      <Text numberOfLines={2} style={styles.watchReview}>
                        {model.provenance.reviewNote}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={styles.footer}>Private by design · validated prices · no account required</Text>
        </ScrollView>

        {deletedScenario && (
          <View accessibilityLiveRegion="polite" style={styles.undoBar}>
            <Text style={styles.undoText}>Scenario deleted</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                launch.recoverScenario(deletedScenario);
                setDeletedScenario(null);
              }}
              style={styles.undoButton}
            >
              <Text style={styles.undoButtonText}>Undo</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Dismiss delete message"
              accessibilityRole="button"
              onPress={() => setDeletedScenario(null)}
              style={styles.undoClose}
            >
              <Ionicons color={theme.onAccent} name="close" size={20} />
            </Pressable>
          </View>
        )}

        <SavedScenarioSheet
          key={managedScenario?.id ?? 'no-managed-scenario'}
          onClose={() => setManagedScenario(null)}
          onDelete={(scenario) => {
            launch.deleteScenario(scenario.id);
            setDeletedScenario(scenario);
          }}
          onDuplicate={(scenario) => {
            const duplicate = launch.duplicateScenario(scenario);
            setManagedScenario(null);
            Alert.alert('Scenario duplicated', `“${duplicate.name}” is ready in Saved scenarios.`);
          }}
          onOpen={(scenario) => {
            launch.restoreScenario(scenario);
            setManagedScenario(null);
            router.navigate(APP_ROUTES.estimate);
          }}
          onRename={(scenario, name) => {
            launch.renameScenario(scenario.id, name);
            setManagedScenario({ ...scenario, name });
          }}
          scenario={managedScenario}
        />
        <AppearanceSheet onClose={() => setAppearanceOpen(false)} visible={appearanceOpen} />
        {catalog && (
          <CommandSheet
            catalog={catalog}
            favoriteIds={launch.favorites}
            onClose={() => setCommandOpen(false)}
            onReset={() => {
              launch.resetScenario();
              router.navigate(APP_ROUTES.estimate);
            }}
            onSection={navigateToSection}
            onSelectModel={(id) => {
              launch.setSelectedId(id);
              router.navigate(APP_ROUTES.estimate);
            }}
            onToggleComparison={(id) => {
              const result = toggleComparisonSelection(launch.comparisonIds, id);
              if (result.accepted) launch.setComparisonIds(result.selectedIds);
              if (result.accepted) router.navigate(APP_ROUTES.compare);
            }}
            onToggleFavorite={launch.toggleFavorite}
            onTour={() => setTourOpen(true)}
            selectedComparisonIds={launch.comparisonIds}
            visible={commandOpen}
          />
        )}
        <GuidedTourSheet
          onClose={() => setTourOpen(false)}
          onOpenEstimate={() => router.navigate(APP_ROUTES.estimate)}
          visible={tourOpen}
        />
        <Onboarding
          onApplyPreset={applyPreset}
          onBack={() => setOnboardingStep((step) => Math.max(0, step - 1))}
          onComplete={() => {
            launch.completeOnboarding();
            setOnboardingStep(0);
          }}
          onNext={() => setOnboardingStep((step) => Math.min(2, step + 1))}
          step={onboardingStep}
          styles={styles}
          theme={theme}
          visible={launch.hydrated && !launch.onboardingComplete}
        />
      </SafeAreaView>
    </>
  );
}

function Onboarding({
  onApplyPreset,
  onBack,
  onComplete,
  onNext,
  step,
  styles,
  theme,
  visible,
}: {
  onApplyPreset: (preset: ScenarioPreset) => void;
  onBack: () => void;
  onComplete: () => void;
  onNext: () => void;
  step: number;
  styles: Styles;
  theme: MobileTheme;
  visible: boolean;
}) {
  const copy = [
    [
      'Know the tab before you build.',
      'Paste real prompt text or enter known token counts. PromptSpend turns one conversation into daily, monthly, and annual cost.',
    ],
    [
      'Compare the same workload.',
      'Choose up to four models. Each uses its own token profile, and the result stays tied to validated published pricing.',
    ],
    [
      'Start with something familiar.',
      'Choose an editable preset or begin from the default scenario. Nothing requires an account, and pasted text stays on this device.',
    ],
  ] as const;
  return (
    <Modal
      accessibilityLabel="Welcome to PromptSpend"
      animationType="none"
      onRequestClose={onComplete}
      transparent
      visible={visible}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.onboardingCard}>
          <View style={styles.onboardingTop}>
            <View accessibilityElementsHidden style={styles.onboardingMark}>
              <View style={styles.brandMarkInner} />
            </View>
            <Pressable
              accessibilityLabel="Skip onboarding"
              accessibilityRole="button"
              onPress={onComplete}
              style={styles.skipButton}
            >
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          </View>
          <Text accessibilityLiveRegion="polite" style={styles.onboardingStep}>
            STEP {step + 1} OF 3
          </Text>
          <Text accessibilityRole="header" style={styles.onboardingTitle}>
            {copy[step][0]}
          </Text>
          <Text style={styles.onboardingBody}>{copy[step][1]}</Text>
          {step === 0 && <Ionicons color={theme.accent} name="calculator-outline" size={54} />}
          {step === 1 && <Ionicons color={theme.accent} name="podium-outline" size={54} />}
          {step === 2 && (
            <ScrollView
              contentContainerStyle={styles.onboardingPresets}
              style={styles.onboardingPresetScroll}
            >
              {SCENARIO_PRESETS.slice(0, 3).map((preset) => (
                <Pressable
                  accessibilityRole="button"
                  key={preset.id}
                  onPress={() => onApplyPreset(preset)}
                  style={({ pressed }) => [styles.onboardingPreset, pressed && styles.pressed]}
                >
                  <Text style={styles.onboardingPresetTitle}>{preset.label}</Text>
                  <Text style={styles.onboardingPresetMeta}>
                    {preset.workload.conversationsPerDay.toLocaleString()}/day
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <View style={styles.progressDots}>
            {[0, 1, 2].map((value) => (
              <View
                accessibilityElementsHidden
                key={value}
                style={[styles.progressDot, value === step && styles.progressDotActive]}
              />
            ))}
          </View>
          <View style={styles.actionRow}>
            {step > 0 && <ActionButton label="Back" onPress={onBack} styles={styles} />}
            <ActionButton
              label={step === 2 ? 'Start blank' : 'Continue'}
              onPress={step === 2 ? onComplete : onNext}
              primary
              styles={styles}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ActionButton({
  label,
  onPress,
  primary = false,
  styles,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        primary && styles.actionButtonPrimary,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionButtonText, primary && styles.actionButtonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function Metric({ label, styles, value }: { label: string; styles: Styles; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SectionHeading({
  eyebrow,
  summary,
  title,
  styles,
}: {
  eyebrow: string;
  summary: string;
  title: string;
  styles: Styles;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      <Text style={styles.sectionSummary}>{summary}</Text>
    </View>
  );
}

function chooseModel(models: readonly Model[], selectedId: string): Model | null {
  return models.find((model) => model.id === selectedId) ?? models[0] ?? null;
}

function presetIcon(id: string): keyof typeof Ionicons.glyphMap {
  if (id === 'support') return 'headset-outline';
  if (id === 'documents') return 'document-text-outline';
  if (id === 'coding') return 'code-slash-outline';
  if (id === 'content') return 'create-outline';
  return 'flash-outline';
}

function shortDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    safeArea: { backgroundColor: theme.background, flex: 1 },
    content: {
      alignSelf: 'center',
      gap: 20,
      maxWidth: 1040,
      paddingBottom: 36,
      paddingHorizontal: 20,
      paddingTop: 12,
      width: '100%',
    },
    flex: { flex: 1 },
    brandRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
    brandIdentity: { alignItems: 'center', flexDirection: 'row', gap: 11 },
    brandMark: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: 9,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    brandMarkInner: { borderColor: theme.onAccent, borderRadius: 3, borderWidth: 2, height: 17, width: 14 },
    brandName: { color: theme.text, fontSize: 20, fontWeight: '900' },
    brandSubhead: { color: theme.mutedText, fontSize: 8, fontWeight: '800', letterSpacing: 1.25 },
    hero: { gap: 10, paddingBottom: 4, paddingTop: 8 },
    eyebrow: { color: theme.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
    title: {
      color: theme.text,
      fontSize: 36,
      fontWeight: '900',
      letterSpacing: -1.2,
      lineHeight: 42,
      maxWidth: 700,
    },
    summary: { color: theme.mutedText, fontSize: 16, lineHeight: 24, maxWidth: 720 },
    statusCard: {
      alignItems: 'flex-start',
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 12,
      padding: 20,
    },
    warningCard: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderColor: theme.warning,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      padding: 14,
    },
    warningText: { color: theme.text, flex: 1, fontSize: 13, lineHeight: 19 },
    costCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 18,
      borderWidth: 1,
      gap: 12,
      padding: 22,
    },
    costHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
    costHeaderCopy: { flex: 1, gap: 4 },
    cardEyebrow: { color: theme.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.15 },
    cardTitle: { color: theme.text, fontSize: 19, fontWeight: '800', lineHeight: 25 },
    body: { color: theme.mutedText, fontSize: 14, lineHeight: 21 },
    iconButton: {
      alignItems: 'center',
      borderColor: theme.border,
      borderRadius: 10,
      borderWidth: 1,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    costValue: { color: theme.text, fontSize: 46, fontWeight: '900', letterSpacing: -1.7, lineHeight: 52 },
    costCaption: { color: theme.mutedText, fontSize: 14, lineHeight: 20 },
    metricRow: {
      borderTopColor: theme.border,
      borderTopWidth: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      paddingTop: 14,
    },
    metric: { flexGrow: 1, minWidth: 90 },
    metricValue: { color: theme.text, fontSize: 16, fontWeight: '800' },
    metricLabel: { color: theme.mutedText, fontSize: 11, marginTop: 3 },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    actionButton: {
      alignItems: 'center',
      borderColor: theme.border,
      borderRadius: 11,
      borderWidth: 1,
      flexGrow: 1,
      justifyContent: 'center',
      minHeight: 48,
      minWidth: 120,
      paddingHorizontal: 16,
    },
    actionButtonPrimary: { backgroundColor: theme.accent, borderColor: theme.accent },
    actionButtonText: { color: theme.text, fontSize: 14, fontWeight: '800' },
    actionButtonTextPrimary: { color: theme.onAccent },
    pressed: { opacity: 0.68 },
    savingsCard: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderColor: theme.savings,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 14,
      padding: 18,
    },
    savingsIcon: {
      alignItems: 'center',
      backgroundColor: theme.surfaceRaised,
      borderRadius: 12,
      height: 46,
      justifyContent: 'center',
      width: 46,
    },
    savingsLabel: { color: theme.savings, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
    savingsValue: { color: theme.text, fontSize: 20, fontWeight: '900', marginBottom: 2, marginTop: 3 },
    sectionHeading: { gap: 4, paddingTop: 8 },
    sectionEyebrow: { color: theme.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
    sectionTitle: { color: theme.text, fontSize: 25, fontWeight: '900', lineHeight: 31 },
    sectionSummary: { color: theme.mutedText, fontSize: 13, lineHeight: 20 },
    presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    presetCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      flexBasis: 230,
      flexGrow: 1,
      gap: 8,
      minWidth: 156,
      padding: 16,
    },
    presetIcon: {
      alignItems: 'center',
      backgroundColor: theme.accentSoft,
      borderRadius: 10,
      height: 42,
      justifyContent: 'center',
      width: 42,
    },
    presetTitle: { color: theme.text, fontSize: 16, fontWeight: '800' },
    presetDescription: { color: theme.mutedText, flexGrow: 1, fontSize: 12, lineHeight: 18 },
    presetMeta: { color: theme.accent, fontSize: 11, fontWeight: '800' },
    emptyCard: {
      alignItems: 'flex-start',
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      gap: 10,
      padding: 18,
    },
    savedList: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      overflow: 'hidden',
    },
    savedRow: {
      alignItems: 'center',
      borderBottomColor: theme.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 10,
      minHeight: 72,
      paddingHorizontal: 12,
    },
    savedMain: {
      flex: 1,
      justifyContent: 'center',
      minHeight: 64,
      paddingHorizontal: 4,
      paddingVertical: 10,
    },
    savedName: { color: theme.text, fontSize: 15, fontWeight: '800' },
    savedMeta: { color: theme.mutedText, fontSize: 11, lineHeight: 17, marginTop: 3 },
    showAllButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingHorizontal: 14 },
    showAllText: { color: theme.accent, fontSize: 13, fontWeight: '800' },
    watchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    watchCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      flexBasis: 200,
      flexGrow: 1,
      gap: 5,
      minHeight: 104,
      padding: 14,
    },
    watchName: { color: theme.text, fontSize: 14, fontWeight: '800' },
    watchHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
    watchBadge: {
      backgroundColor: theme.accentSoft,
      borderRadius: 6,
      color: theme.accent,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.6,
      overflow: 'hidden',
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    watchBadgeWarning: { backgroundColor: theme.surfaceRaised, color: theme.warning },
    watchMeta: { color: theme.mutedText, fontSize: 11 },
    watchPrice: { color: theme.accent, fontSize: 11, fontWeight: '800', marginTop: 6 },
    watchReview: { color: theme.warning, fontSize: 10, lineHeight: 15 },
    watchRemove: { alignItems: 'center', alignSelf: 'flex-start', justifyContent: 'center', minHeight: 48 },
    watchRemoveText: { color: theme.danger, fontSize: 11, fontWeight: '800' },
    footer: {
      color: theme.mutedText,
      fontSize: 11,
      lineHeight: 18,
      paddingVertical: 12,
      textAlign: 'center',
    },
    undoBar: {
      alignItems: 'center',
      backgroundColor: theme.text,
      borderRadius: 12,
      bottom: 12,
      flexDirection: 'row',
      gap: 8,
      left: 16,
      minHeight: 52,
      paddingHorizontal: 14,
      position: 'absolute',
      right: 16,
    },
    undoText: { color: theme.background, flex: 1, fontSize: 13, fontWeight: '700' },
    undoButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 },
    undoButtonText: { color: theme.accent, fontSize: 13, fontWeight: '900' },
    undoClose: { alignItems: 'center', justifyContent: 'center', minHeight: 44, width: 44 },
    modalBackdrop: {
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.56)',
      flex: 1,
      justifyContent: 'center',
      padding: 18,
    },
    onboardingCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 22,
      borderWidth: 1,
      gap: 16,
      maxHeight: '92%',
      maxWidth: 560,
      padding: 22,
      width: '100%',
    },
    onboardingTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    onboardingMark: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: 10,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    skipButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 },
    skipText: { color: theme.accent, fontSize: 14, fontWeight: '800' },
    onboardingStep: { color: theme.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
    onboardingTitle: {
      color: theme.text,
      fontSize: 30,
      fontWeight: '900',
      letterSpacing: -0.7,
      lineHeight: 36,
    },
    onboardingBody: { color: theme.mutedText, fontSize: 16, lineHeight: 24 },
    onboardingPresetScroll: { maxHeight: 220 },
    onboardingPresets: { gap: 8 },
    onboardingPreset: {
      alignItems: 'center',
      borderColor: theme.border,
      borderRadius: 11,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      minHeight: 52,
      paddingHorizontal: 14,
    },
    onboardingPresetTitle: { color: theme.text, flex: 1, fontSize: 14, fontWeight: '800' },
    onboardingPresetMeta: { color: theme.mutedText, fontSize: 11 },
    progressDots: { flexDirection: 'row', gap: 7 },
    progressDot: { backgroundColor: theme.border, borderRadius: 4, height: 7, width: 7 },
    progressDotActive: { backgroundColor: theme.accent, width: 24 },
  });
}
