import { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText as Text } from '@/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Catalog, Model } from '@promptspend/core';

import { MAX_COMPARISON_MODELS } from '@/lib/comparison';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface ComparisonModelPickerProps {
  catalog: Catalog;
  favoriteIds: readonly string[];
  onClear: () => void;
  onSetModelsWatched: (ids: readonly string[], watched: boolean) => void;
  onToggle: (id: string) => boolean;
  selectedIds: readonly string[];
}

export function ComparisonModelPicker({
  catalog,
  favoriteIds,
  onClear,
  onSetModelsWatched,
  onToggle,
  selectedIds,
}: ComparisonModelPickerProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedModels = useMemo(
    () => selectedIds.map((id) => catalog.get(id)).filter((model): model is Model => model !== undefined),
    [catalog, selectedIds],
  );
  const models = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.primaryModels.filter((model) => {
      if (!needle) return true;
      return `${model.displayName} ${catalog.providerName(model)} ${model.id}`.toLowerCase().includes(needle);
    });
  }, [catalog, query]);
  const allSelectedWatched = selectedIds.length > 0 && selectedIds.every((id) => favoriteIds.includes(id));

  const toggle = (id: string) => {
    if (onToggle(id)) return;
    Alert.alert(
      'Four models selected',
      'PromptSpend compares up to four models at once. Remove one of your current choices before adding another.',
    );
  };

  return (
    <>
      <View style={styles.field}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Models to compare</Text>
          <Text accessibilityLiveRegion="polite" style={styles.count}>
            {selectedModels.length} / {MAX_COMPARISON_MODELS}
          </Text>
        </View>

        {selectedModels.length > 0 ? (
          <View style={styles.selectedList}>
            {selectedModels.map((model, index) => (
              <Pressable
                accessibilityHint="Removes this model from the comparison"
                accessibilityLabel={`Remove ${model.displayName} from comparison`}
                accessibilityRole="button"
                key={model.id}
                onPress={() => toggle(model.id)}
                style={({ pressed }) => [styles.selectedRow, pressed && styles.pressed]}
              >
                <View style={styles.orderBadge}>
                  <Text style={styles.orderBadgeText}>{index + 1}</Text>
                </View>
                <View style={styles.selectedCopy}>
                  <Text style={styles.selectedName}>{model.displayName}</Text>
                  <Text style={styles.selectedMeta}>{catalog.providerName(model)}</Text>
                </View>
                <Text accessibilityElementsHidden style={styles.removeLabel}>
                  Remove
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.emptySelection}>
            <Text style={styles.emptySelectionTitle}>Choose at least two models</Text>
            <Text style={styles.emptySelectionText}>
              Every choice will be priced against exactly the same workload.
            </Text>
          </View>
        )}

        <Pressable
          accessibilityHint="Opens the searchable model catalog for multi-selection"
          accessibilityLabel={`Choose comparison models. ${selectedModels.length} of ${MAX_COMPARISON_MODELS} selected.`}
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.chooseButton, pressed && styles.pressed]}
        >
          <Text style={styles.chooseButtonText}>
            {selectedModels.length === 0 ? 'Choose models' : 'Change comparison models'}
          </Text>
        </Pressable>
        {selectedModels.length > 0 && (
          <View style={styles.secondaryActions}>
            <Pressable
              accessibilityHint="Adds or removes every selected model from the local watchlist"
              accessibilityRole="button"
              accessibilityState={{ selected: allSelectedWatched }}
              onPress={() => onSetModelsWatched(selectedIds, !allSelectedWatched)}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            >
              <Text style={styles.watchText}>
                {allSelectedWatched ? 'Stop watching selected' : 'Watch selected models'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityHint="Removes every model but keeps the current workload"
              accessibilityRole="button"
              onPress={onClear}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            >
              <Text style={styles.clearButtonText}>Clear all models</Text>
            </Pressable>
          </View>
        )}
      </View>

      <Modal
        accessibilityLabel="Compare models"
        animationType="none"
        onRequestClose={() => setOpen(false)}
        presentationStyle="pageSheet"
        visible={open}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'right', 'bottom', 'left']}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeadingCopy}>
              <Text accessibilityRole="header" style={styles.modalTitle}>
                Compare models
              </Text>
              <Text accessibilityLiveRegion="polite" style={styles.modalSummary}>
                Select up to four · {selectedModels.length} selected
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setOpen(false);
                setQuery('');
              }}
              style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>

          <TextInput
            accessibilityLabel="Search comparison models"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={setQuery}
            placeholder="Search model or provider"
            placeholderTextColor={theme.mutedText}
            returnKeyType="search"
            style={styles.search}
            value={query}
          />

          <FlatList
            contentContainerStyle={styles.listContent}
            data={models}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            keyExtractor={(model) => model.id}
            ListEmptyComponent={<Text style={styles.empty}>No models match “{query}”.</Text>}
            renderItem={({ item }) => {
              const isSelected = selectedIds.includes(item.id);
              const isAtLimit = selectedIds.length >= MAX_COMPARISON_MODELS && !isSelected;
              return (
                <Pressable
                  aria-checked={isSelected}
                  accessibilityHint={
                    isAtLimit
                      ? 'Remove one selected model before adding this model'
                      : isSelected
                        ? 'Removes this model from the comparison'
                        : 'Adds this model to the comparison'
                  }
                  accessibilityLabel={`${item.displayName}, ${catalog.providerName(item)}, ${item.pricing.input} dollars per million input tokens and ${item.pricing.output} dollars per million output tokens${isSelected ? ', selected for comparison' : ''}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  onPress={() => toggle(item.id)}
                  style={({ pressed }) => [
                    styles.modelRow,
                    isSelected && styles.modelRowSelected,
                    isAtLimit && styles.modelRowAtLimit,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    <Text style={styles.checkmark}>{isSelected ? '✓' : ''}</Text>
                  </View>
                  <View style={styles.modelRowCopy}>
                    <Text style={styles.rowName}>{item.displayName}</Text>
                    <Text style={styles.rowMeta}>
                      {catalog.providerName(item)} · {item.contextWindow.toLocaleString('en-US')} context
                    </Text>
                  </View>
                  <View style={styles.rateBlock}>
                    <Text style={styles.rate}>
                      ${item.pricing.input} / ${item.pricing.output}
                    </Text>
                    <Text style={styles.rateLabel}>input / output</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    field: { gap: 10 },
    labelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    label: { color: theme.text, fontSize: 15, fontWeight: '600', lineHeight: 20 },
    count: { color: theme.accent, fontSize: 13, fontWeight: '800' },
    selectedList: {
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      overflow: 'hidden',
    },
    selectedRow: {
      alignItems: 'center',
      backgroundColor: theme.surfaceRaised,
      borderBottomColor: theme.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 10,
      minHeight: 58,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    orderBadge: {
      alignItems: 'center',
      backgroundColor: theme.accentSoft,
      borderRadius: 8,
      height: 28,
      justifyContent: 'center',
      width: 28,
    },
    orderBadgeText: { color: theme.accent, fontSize: 12, fontWeight: '800' },
    selectedCopy: { flex: 1, gap: 2 },
    selectedName: { color: theme.text, fontSize: 14, fontWeight: '700', lineHeight: 19 },
    selectedMeta: { color: theme.mutedText, fontSize: 11, lineHeight: 15 },
    removeLabel: { color: theme.accent, fontSize: 12, fontWeight: '700' },
    emptySelection: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 12,
      borderStyle: 'dashed',
      borderWidth: 1,
      gap: 4,
      padding: 14,
    },
    emptySelectionTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
    emptySelectionText: { color: theme.mutedText, fontSize: 12, lineHeight: 18 },
    chooseButton: {
      alignItems: 'center',
      borderColor: theme.accent,
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 16,
    },
    chooseButtonText: { color: theme.accent, fontSize: 14, fontWeight: '800' },
    clearButton: {
      alignItems: 'center',
      alignSelf: 'center',
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 12,
    },
    secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    watchText: { color: theme.accent, fontSize: 13, fontWeight: '800' },
    clearButtonText: { color: theme.mutedText, fontSize: 13, fontWeight: '700' },
    pressed: { opacity: 0.68 },
    modalSafeArea: { backgroundColor: theme.background, flex: 1 },
    modalHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 16,
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    modalHeadingCopy: { flex: 1, gap: 2 },
    modalTitle: { color: theme.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5, lineHeight: 30 },
    modalSummary: { color: theme.mutedText, fontSize: 13, lineHeight: 18 },
    doneButton: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      minWidth: 48,
      paddingHorizontal: 8,
    },
    doneText: { color: theme.accent, fontSize: 16, fontWeight: '700' },
    search: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      color: theme.text,
      fontSize: 16,
      marginBottom: 12,
      marginHorizontal: 20,
      minHeight: 52,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    listContent: { paddingBottom: 32, paddingHorizontal: 20 },
    modelRow: {
      alignItems: 'center',
      borderBottomColor: theme.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 10,
      minHeight: 76,
      paddingHorizontal: 8,
      paddingVertical: 12,
    },
    modelRowSelected: { backgroundColor: theme.accentSoft, borderRadius: 10 },
    modelRowAtLimit: { opacity: 0.56 },
    checkbox: {
      alignItems: 'center',
      borderColor: theme.border,
      borderRadius: 7,
      borderWidth: 1,
      height: 28,
      justifyContent: 'center',
      width: 28,
    },
    checkboxSelected: { backgroundColor: theme.accent, borderColor: theme.accent },
    checkmark: { color: theme.onAccent, fontSize: 16, fontWeight: '800' },
    modelRowCopy: { flex: 1, gap: 3 },
    rowName: { color: theme.text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
    rowMeta: { color: theme.mutedText, fontSize: 12, lineHeight: 17 },
    rateBlock: { alignItems: 'flex-end', gap: 3 },
    rate: { color: theme.text, fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '700' },
    rateLabel: { color: theme.mutedText, fontSize: 10, textTransform: 'uppercase' },
    empty: { color: theme.mutedText, fontSize: 15, lineHeight: 22, paddingVertical: 40, textAlign: 'center' },
  });
}
