import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Catalog, Model } from '@promptspend/core';

import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface ModelPickerProps {
  catalog: Catalog;
  onChange: (model: Model) => void;
  selected: Model;
}

export function ModelPicker({ catalog, onChange, selected }: ModelPickerProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const models = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.primaryModels.filter((model) => {
      if (!needle) return true;
      return `${model.displayName} ${catalog.providerName(model)} ${model.id}`.toLowerCase().includes(needle);
    });
  }, [catalog, query]);

  return (
    <>
      <View style={styles.field}>
        <Text style={styles.label}>Model</Text>
        <Pressable
          accessibilityHint="Opens the searchable model catalog"
          accessibilityLabel={`Selected model, ${selected.displayName}`}
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.selector, pressed && styles.pressed]}
        >
          <View style={styles.selectorCopy}>
            <Text style={styles.modelName}>{selected.displayName}</Text>
            <Text style={styles.providerName}>
              {catalog.providerName(selected)} · ${selected.pricing.input}/M input · $
              {selected.pricing.output}/M output
            </Text>
          </View>
          <Text accessibilityElementsHidden style={styles.changeLabel}>
            Change
          </Text>
        </Pressable>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        presentationStyle="pageSheet"
        visible={open}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'right', 'bottom', 'left']}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeadingCopy}>
              <Text accessibilityRole="header" style={styles.modalTitle}>
                Choose a model
              </Text>
              <Text style={styles.modalSummary}>
                {catalog.primaryModels.length} current and historical prices
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <TextInput
            accessibilityLabel="Search models"
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
              const isSelected = item.id === selected.id;
              return (
                <Pressable
                  accessibilityLabel={`${item.displayName}, ${catalog.providerName(item)}, ${item.pricing.input} dollars per million input tokens and ${item.pricing.output} dollars per million output tokens${isSelected ? ', selected' : ''}`}
                  accessibilityRole="button"
                  onPress={() => {
                    onChange(item);
                    setOpen(false);
                    setQuery('');
                  }}
                  style={({ pressed }) => [
                    styles.modelRow,
                    isSelected && styles.modelRowSelected,
                    pressed && styles.pressed,
                  ]}
                >
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
                    <Text style={styles.rateLabel}>{isSelected ? 'Selected' : 'input / output'}</Text>
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
    field: {
      gap: 8,
    },
    label: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
    },
    selector: {
      alignItems: 'center',
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      minHeight: 68,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    selectorCopy: {
      flex: 1,
      gap: 4,
    },
    modelName: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 22,
    },
    providerName: {
      color: theme.mutedText,
      fontSize: 12,
      lineHeight: 17,
    },
    changeLabel: {
      color: theme.accent,
      fontSize: 14,
      fontWeight: '700',
    },
    pressed: {
      opacity: 0.68,
    },
    modalSafeArea: {
      backgroundColor: theme.background,
      flex: 1,
    },
    modalHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 16,
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    modalHeadingCopy: {
      flex: 1,
      gap: 2,
    },
    modalTitle: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '700',
      letterSpacing: -0.5,
      lineHeight: 30,
    },
    modalSummary: {
      color: theme.mutedText,
      fontSize: 13,
      lineHeight: 18,
    },
    closeButton: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      minWidth: 48,
      paddingHorizontal: 8,
    },
    closeText: {
      color: theme.accent,
      fontSize: 16,
      fontWeight: '700',
    },
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
    listContent: {
      paddingBottom: 32,
      paddingHorizontal: 20,
    },
    modelRow: {
      alignItems: 'center',
      borderBottomColor: theme.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 12,
      minHeight: 72,
      paddingHorizontal: 10,
      paddingVertical: 12,
    },
    modelRowSelected: {
      backgroundColor: theme.accentSoft,
      borderRadius: 10,
    },
    modelRowCopy: {
      flex: 1,
      gap: 3,
    },
    rowName: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 20,
    },
    rowMeta: {
      color: theme.mutedText,
      fontSize: 12,
      lineHeight: 17,
    },
    rateBlock: {
      alignItems: 'flex-end',
      gap: 3,
    },
    rate: {
      color: theme.text,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      fontWeight: '700',
    },
    rateLabel: {
      color: theme.mutedText,
      fontSize: 10,
      textTransform: 'uppercase',
    },
    empty: {
      color: theme.mutedText,
      fontSize: 15,
      lineHeight: 22,
      paddingVertical: 40,
      textAlign: 'center',
    },
  });
}
