import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/AppText';
import type { CountryCount } from '@promptspend/core';

import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface CountryFilterProps {
  countries: readonly CountryCount[];
  label: string;
  onChange: (next: string[]) => void;
  selected: readonly string[];
}

const COUNTRY_NAMES: Record<string, string> = {
  CA: 'Canada',
  CN: 'China',
  FR: 'France',
  US: 'United States',
};

export function countryName(code: string): string {
  const upper = code.toUpperCase();
  return COUNTRY_NAMES[upper] ?? upper;
}

export function emptyReason(search: string, countries: readonly string[]): string {
  const needle = search.trim();
  const where = countries.map(countryName).join(' or ');
  if (needle && countries.length > 0) return `No model from ${where} matches “${needle}”.`;
  if (countries.length > 0) return `No models from ${where}.`;
  if (needle) return `No models match “${needle}”.`;
  return 'No models to show.';
}

export function CountryFilter({ countries, label, onChange, selected }: CountryFilterProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (countries.length < 2) return null;

  const toggle = (code: string) => {
    onChange(selected.includes(code) ? selected.filter((entry) => entry !== code) : [...selected, code]);
  };

  return (
    <View style={styles.group}>
      <View style={styles.headingRow}>
        <Text accessibilityLabel={label} accessibilityRole="header" style={styles.label}>
          Country
        </Text>
        <Text accessibilityLiveRegion="polite" style={styles.summary}>
          {selected.length === 0 ? 'All countries' : selected.map(countryName).join(', ')}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.chips}
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
      >
        <Pressable
          accessibilityLabel="All countries"
          accessibilityRole="button"
          accessibilityState={{ selected: selected.length === 0 }}
          onPress={() => onChange([])}
          style={({ pressed }) => [
            styles.chip,
            selected.length === 0 && styles.chipSelected,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.chipText, selected.length === 0 && styles.chipTextSelected]}>All</Text>
        </Pressable>
        {countries.map(({ code, count }) => {
          const checked = selected.includes(code);
          const name = countryName(code);
          return (
            <Pressable
              accessibilityLabel={`${code}, ${name}, ${count} ${count === 1 ? 'model' : 'models'}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              key={code}
              onPress={() => toggle(code)}
              style={({ pressed }) => [
                styles.chip,
                checked && styles.chipSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.chipText, checked && styles.chipTextSelected]}>{code}</Text>
              <View style={[styles.countBadge, checked && styles.countBadgeSelected]}>
                <Text style={[styles.countText, checked && styles.countTextSelected]}>{count}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    group: { gap: 7 },
    headingRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
    label: { color: theme.text, fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
    summary: { color: theme.mutedText, flex: 1, fontSize: 12, lineHeight: 17, textAlign: 'right' },
    chips: { gap: 8, paddingRight: 4 },
    chip: {
      alignItems: 'center',
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.borderStrong,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 7,
      justifyContent: 'center',
      minHeight: 48,
      minWidth: 56,
      paddingHorizontal: 14,
    },
    chipSelected: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
    chipText: { color: theme.text, fontSize: 13, fontWeight: '800' },
    chipTextSelected: { color: theme.accent },
    countBadge: {
      alignItems: 'center',
      backgroundColor: theme.background,
      borderRadius: 999,
      justifyContent: 'center',
      minHeight: 24,
      minWidth: 24,
      paddingHorizontal: 6,
    },
    countBadgeSelected: { backgroundColor: theme.surface },
    countText: { color: theme.mutedText, fontSize: 11, fontWeight: '800' },
    countTextSelected: { color: theme.accent },
    pressed: { opacity: 0.68 },
  });
}
