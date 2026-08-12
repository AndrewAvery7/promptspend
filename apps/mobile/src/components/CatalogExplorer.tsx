import * as WebBrowser from 'expo-web-browser';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Catalog, formatContext, formatRate, type Model } from '@promptspend/core';

import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

type SortKey = 'name' | 'provider' | 'input' | 'output' | 'context';

interface CatalogExplorerProps {
  catalog: Catalog;
  favoriteIds: readonly string[];
  onToggleFavorite: (id: string) => void;
  onToggle: (id: string) => boolean;
  selectedIds: readonly string[];
}

export function CatalogExplorer({
  catalog,
  favoriteIds,
  onToggle,
  onToggleFavorite,
  selectedIds,
}: CatalogExplorerProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [showInactive, setShowInactive] = useState(false);
  const [detail, setDetail] = useState<Model | null>(null);
  const [chartWidth, setChartWidth] = useState(0);

  const models = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.models
      .filter((model) => !model.aliasOf)
      .filter((model) => showInactive || (model.status === 'current' && model.provenance.stale !== true))
      .filter(
        (model) =>
          !needle ||
          `${model.displayName} ${catalog.providerName(model)} ${model.id}`.toLowerCase().includes(needle),
      )
      .sort((a, b) => compareModel(a, b, sort, catalog));
  }, [catalog, query, showInactive, sort]);
  const scored = useMemo(
    () =>
      catalog.primaryModels.filter(
        (model) =>
          model.capabilityIndex !== undefined &&
          Catalog.blendedRate(model) > 0 &&
          model.provenance.stale !== true,
      ),
    [catalog],
  );
  const unscored = catalog.primaryModels.length - scored.length;

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>FULL CATALOG</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Explore every tracked model
        </Text>
        <Text style={styles.body}>
          The shortlist above prices your current workload. This catalog adds the website’s full discovery,
          provenance, and illustrative Value Map.
        </Text>
      </View>

      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          Capability versus price
        </Text>
        <Text style={styles.body}>
          Horizontal: blended list price per 1M tokens on a logarithmic scale. Vertical: an illustrative 0–100
          capability index, not a benchmark guarantee.
        </Text>
        <View
          accessibilityLabel={`Value map with ${scored.length} scored models. ${unscored} models are not scored and remain available in the list.`}
          onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
          style={styles.chart}
        >
          <Text style={styles.chartTop}>Higher illustrative capability</Text>
          {chartWidth > 0 &&
            scored.map((model) => {
              const point = chartPoint(model, scored, chartWidth);
              const selected = selectedIds.includes(model.id);
              const disabled = !selected && selectedIds.length >= 4;
              return (
                <Pressable
                  accessibilityHint="Adds or removes this model from the four-model shortlist"
                  accessibilityLabel={`${model.displayName}, capability ${model.capabilityIndex}, blended rate ${formatRate(Catalog.blendedRate(model))} per million tokens${selected ? ', selected' : ''}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled, selected }}
                  disabled={disabled}
                  key={model.id}
                  onPress={() => onToggle(model.id)}
                  style={[styles.pointTarget, { left: point.left - 14, top: point.top - 14 }]}
                >
                  <View style={[styles.point, selected && styles.pointSelected]} />
                </Pressable>
              );
            })}
          <Text style={styles.chartBottom}>Lower cost ← blended price → Higher cost</Text>
        </View>
        <Text style={styles.note}>
          {scored.length} scored · {unscored} unscored. The structured catalog below is the accessible source
          of truth for every model.
        </Text>
      </View>

      <View style={styles.card}>
        <TextInput
          accessibilityLabel="Search the model catalog"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder="Search models or providers…"
          placeholderTextColor={theme.mutedText}
          style={styles.search}
          value={query}
        />
        <ScrollView contentContainerStyle={styles.sortRow} horizontal showsHorizontalScrollIndicator={false}>
          {(['name', 'provider', 'input', 'output', 'context'] as SortKey[]).map((key) => (
            <Pressable
              aria-checked={sort === key}
              accessibilityRole="radio"
              accessibilityState={{ checked: sort === key }}
              key={key}
              onPress={() => setSort(key)}
              style={[styles.sortButton, sort === key && styles.sortButtonActive]}
            >
              <Text style={[styles.sortText, sort === key && styles.sortTextActive]}>{key}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchTitle}>Show legacy, deprecated, and unlisted</Text>
            <Text style={styles.note}>
              Off by default so the catalog starts with purchasable current models.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Show legacy, deprecated, and unlisted models"
            ios_backgroundColor={theme.border}
            onValueChange={setShowInactive}
            trackColor={{ false: theme.border, true: theme.accent }}
            value={showInactive}
          />
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.note}>
          {models.length} matching models
        </Text>
        {models.map((model) => {
          const selected = selectedIds.includes(model.id);
          return (
            <View key={model.id} style={styles.modelRow}>
              <View style={styles.modelHeader}>
                <View style={styles.modelCopy}>
                  <Text style={styles.modelName}>{model.displayName}</Text>
                  <Text style={styles.provider}>
                    {catalog.providerName(model)} · {model.status}
                    {model.provenance.stale ? ' · unlisted' : ''}
                  </Text>
                </View>
                <Pressable
                  aria-checked={selected}
                  accessibilityHint="Adds or removes this model from the four-model shortlist"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled: !selected && selectedIds.length >= 4 }}
                  disabled={!selected && selectedIds.length >= 4}
                  onPress={() => onToggle(model.id)}
                  style={[
                    styles.selectButton,
                    selected && styles.selectButtonActive,
                    !selected && selectedIds.length >= 4 && styles.disabled,
                  ]}
                >
                  <Text style={[styles.selectText, selected && styles.selectTextActive]}>
                    {selected ? 'Selected' : 'Compare'}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.rates}>
                <Text style={styles.rate}>{formatRate(model.pricing.input)} input</Text>
                <Text style={styles.rate}>{formatRate(model.pricing.output)} output</Text>
                <Text style={styles.rate}>{formatContext(model.contextWindow)} context</Text>
              </View>
              <Text style={styles.note}>
                {model.provenance.source}
                {model.provenance.needsReview ? ' · CHECK' : ''} · verified {model.provenance.lastVerified}
              </Text>
              <View style={styles.modelActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDetail(model)}
                  style={styles.detailButton}
                >
                  <Text style={styles.detailText}>Details and source</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={
                    favoriteIds.includes(model.id)
                      ? `Remove ${model.displayName} from watchlist`
                      : `Watch ${model.displayName}`
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected: favoriteIds.includes(model.id) }}
                  onPress={() => onToggleFavorite(model.id)}
                  style={styles.watchButton}
                >
                  <Ionicons
                    color={theme.accent}
                    name={favoriteIds.includes(model.id) ? 'bookmark' : 'bookmark-outline'}
                    size={18}
                  />
                  <Text style={styles.watchText}>
                    {favoriteIds.includes(model.id) ? 'Watching' : 'Watch'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      <Modal
        accessibilityLabel={detail ? `${detail.displayName} details` : 'Model details'}
        animationType="none"
        onRequestClose={() => setDetail(null)}
        transparent
        visible={detail !== null}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            {detail && (
              <>
                <View style={styles.sheetHeader}>
                  <Text accessibilityRole="header" style={styles.title}>
                    {detail.displayName}
                  </Text>
                  <Pressable accessibilityRole="button" onPress={() => setDetail(null)} style={styles.close}>
                    <Text style={styles.detailText}>Close</Text>
                  </Pressable>
                </View>
                <Text style={styles.body}>
                  {catalog.providerName(detail)} · {detail.status} ·{' '}
                  {detail.capabilities.reasoning ? 'reasoning' : 'standard'} ·{' '}
                  {detail.capabilities.vision ? 'vision' : 'text'}
                </Text>
                <Text style={styles.body}>
                  Input {formatRate(detail.pricing.input)}/M · Output {formatRate(detail.pricing.output)}/M ·
                  Context {formatContext(detail.contextWindow)}
                </Text>
                <Text style={styles.body}>
                  Source: {detail.provenance.source}. Last verified {detail.provenance.lastVerified}.
                </Text>
                {detail.provenance.reviewNote && (
                  <Text style={styles.warning}>{detail.provenance.reviewNote}</Text>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: favoriteIds.includes(detail.id) }}
                  onPress={() => onToggleFavorite(detail.id)}
                  style={styles.watchDetailButton}
                >
                  <Ionicons
                    color={theme.accent}
                    name={favoriteIds.includes(detail.id) ? 'bookmark' : 'bookmark-outline'}
                    size={20}
                  />
                  <Text style={styles.detailText}>
                    {favoriteIds.includes(detail.id) ? 'Remove from watchlist' : 'Add to watchlist'}
                  </Text>
                </Pressable>
                {(detail.provenance.verifiedUrl ?? catalog.provider(detail)?.pricingUrl) && (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() =>
                      void WebBrowser.openBrowserAsync(
                        (detail.provenance.verifiedUrl ?? catalog.provider(detail)?.pricingUrl)!,
                      )
                    }
                    style={styles.sourceButton}
                  >
                    <Text style={styles.sourceText}>Open published pricing source ↗</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function compareModel(a: Model, b: Model, key: SortKey, catalog: Catalog): number {
  if (key === 'provider')
    return (
      catalog.providerName(a).localeCompare(catalog.providerName(b)) ||
      a.displayName.localeCompare(b.displayName)
    );
  if (key === 'input') return a.pricing.input - b.pricing.input || a.displayName.localeCompare(b.displayName);
  if (key === 'output')
    return a.pricing.output - b.pricing.output || a.displayName.localeCompare(b.displayName);
  if (key === 'context')
    return b.contextWindow - a.contextWindow || a.displayName.localeCompare(b.displayName);
  return a.displayName.localeCompare(b.displayName);
}

function chartPoint(model: Model, models: Model[], width: number): { left: number; top: number } {
  const rates = models.map(Catalog.blendedRate).filter((rate) => rate > 0);
  const min = Math.log10(Math.min(...rates));
  const max = Math.log10(Math.max(...rates));
  const x = max === min ? 0.5 : (Math.log10(Catalog.blendedRate(model)) - min) / (max - min);
  const y = (model.capabilityIndex ?? 0) / 100;
  return { left: 10 + x * Math.max(0, width - 34), top: 26 + (1 - y) * 184 };
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    section: { gap: 16 },
    heading: { gap: 8 },
    eyebrow: { color: theme.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
    title: { color: theme.text, flex: 1, fontSize: 24, fontWeight: '800', lineHeight: 30 },
    body: { color: theme.mutedText, fontSize: 14, lineHeight: 21 },
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 12,
      padding: 18,
    },
    cardTitle: { color: theme.text, fontSize: 19, fontWeight: '800', lineHeight: 25 },
    note: { color: theme.mutedText, fontSize: 11, lineHeight: 16 },
    chart: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      height: 252,
      overflow: 'hidden',
    },
    chartTop: { color: theme.mutedText, fontSize: 10, left: 10, position: 'absolute', top: 7 },
    chartBottom: { bottom: 7, color: theme.mutedText, fontSize: 10, left: 10, position: 'absolute' },
    pointTarget: {
      alignItems: 'center',
      height: 44,
      justifyContent: 'center',
      position: 'absolute',
      width: 44,
    },
    point: {
      backgroundColor: theme.mutedText,
      borderColor: theme.surface,
      borderRadius: 8,
      borderWidth: 2,
      height: 16,
      width: 16,
    },
    pointSelected: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
      borderRadius: 10,
      height: 20,
      width: 20,
    },
    search: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      color: theme.text,
      fontSize: 15,
      minHeight: 52,
      paddingHorizontal: 14,
    },
    sortRow: { gap: 7 },
    sortButton: {
      alignItems: 'center',
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 13,
    },
    sortButtonActive: { backgroundColor: theme.accent, borderColor: theme.accent },
    sortText: { color: theme.text, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
    sortTextActive: { color: theme.onAccent },
    switchRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    switchCopy: { flex: 1, gap: 3 },
    switchTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
    modelRow: {
      borderTopColor: theme.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 9,
      paddingTop: 14,
    },
    modelHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    modelActions: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'space-between',
    },
    watchButton: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 48, paddingHorizontal: 4 },
    watchText: { color: theme.accent, fontSize: 12, fontWeight: '800' },
    watchDetailButton: {
      alignItems: 'center',
      borderColor: theme.accent,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 14,
    },
    modelCopy: { flex: 1, gap: 2 },
    modelName: { color: theme.text, fontSize: 15, fontWeight: '800', lineHeight: 20 },
    provider: { color: theme.mutedText, fontSize: 11 },
    selectButton: {
      alignItems: 'center',
      borderColor: theme.accent,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 11,
    },
    selectButtonActive: { backgroundColor: theme.accent },
    selectText: { color: theme.accent, fontSize: 11, fontWeight: '800' },
    selectTextActive: { color: theme.onAccent },
    disabled: { opacity: 0.35 },
    rates: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    rate: { color: theme.text, fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '700' },
    detailButton: { alignItems: 'flex-start', justifyContent: 'center', minHeight: 44 },
    detailText: { color: theme.accent, fontSize: 12, fontWeight: '800' },
    backdrop: { backgroundColor: 'rgba(0,0,0,0.48)', flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      gap: 14,
      padding: 20,
      paddingBottom: 30,
    },
    sheetHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    close: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
    warning: { color: theme.warning, fontSize: 13, lineHeight: 19 },
    sourceButton: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: 10,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 14,
    },
    sourceText: { color: theme.onAccent, fontSize: 14, fontWeight: '800' },
  });
}
