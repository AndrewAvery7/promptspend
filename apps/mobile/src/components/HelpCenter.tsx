import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText as Text } from '@/components/AppText';
import {
  DEFAULT_HELP_ENTRY_ID,
  findHelpEntry,
  HELP_CATEGORIES,
  HELP_ENTRIES,
  type HelpCategoryId,
  type HelpDestination,
  type HelpEntry,
  searchHelpEntries,
} from '@/lib/helpCenter';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface HelpCenterProps {
  initialEntryId?: string;
  onNavigate: (destination: HelpDestination) => void;
}

const POPULAR_ENTRY_IDS = [
  'start-first-estimate',
  'estimate-paste-tokens',
  'compare-select',
  'data-start-alerts',
  'privacy-prompts',
] as const;

export function HelpCenter({ initialEntryId, onNavigate }: HelpCenterProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const initialEntry = findHelpEntry(initialEntryId);
  const [lastInitialEntryId, setLastInitialEntryId] = useState(initialEntryId);
  const [activeCategory, setActiveCategory] = useState<HelpCategoryId | 'all'>(
    initialEntry ? 'all' : 'start',
  );
  const [openId, setOpenId] = useState<string | null>(initialEntry?.id ?? DEFAULT_HELP_ENTRY_ID);
  const [query, setQuery] = useState(initialEntry?.question ?? '');

  // Expo Router can update a deep link while Learn remains mounted. React supports
  // this guarded render-time adjustment for state derived from a changed prop.
  if (initialEntryId !== lastInitialEntryId) {
    setLastInitialEntryId(initialEntryId);
    if (initialEntry) {
      setActiveCategory('all');
      setOpenId(initialEntry.id);
      setQuery(initialEntry.question);
    }
  }

  const matches = useMemo(
    () => searchHelpEntries(query, query.trim() ? 'all' : activeCategory),
    [activeCategory, query],
  );
  const popular = useMemo(
    () =>
      POPULAR_ENTRY_IDS.map((id) => findHelpEntry(id)).filter((entry): entry is HelpEntry => Boolean(entry)),
    [],
  );

  const chooseEntry = (entry: HelpEntry) => {
    setActiveCategory('all');
    setOpenId(entry.id);
    setQuery(entry.question);
  };

  const clearSearch = () => {
    setQuery('');
    setActiveCategory('start');
    setOpenId(DEFAULT_HELP_ENTRY_ID);
  };

  return (
    <View style={styles.section} testID="help-center">
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <Ionicons color={theme.accent} name="help-circle-outline" size={25} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>HELP &amp; FAQs</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Every feature, clearly explained.
          </Text>
          <Text style={styles.summary}>
            Search step-by-step directions, understand the numbers, or jump directly to the part of the app
            you need.
          </Text>
        </View>

        <View style={styles.searchShell}>
          <Ionicons accessibilityElementsHidden color={theme.mutedText} name="search" size={20} />
          <TextInput
            accessibilityHint="Searches all PromptSpend help answers while you type"
            accessibilityLabel="Search Help and FAQs"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => {
              setQuery(value);
              if (value.trim()) setActiveCategory('all');
            }}
            placeholder="Ask a question or search a feature…"
            placeholderTextColor={theme.mutedText}
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
          />
          {query.length > 0 && (
            <Pressable
              accessibilityLabel="Clear Help search"
              accessibilityRole="button"
              onPress={clearSearch}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            >
              <Ionicons color={theme.mutedText} name="close-circle" size={22} />
            </Pressable>
          )}
        </View>
      </View>

      {!query.trim() && (
        <View style={styles.popularCard}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            Popular help
          </Text>
          <View style={styles.popularGrid}>
            {popular.map((entry) => (
              <Pressable
                accessibilityRole="button"
                key={entry.id}
                onPress={() => chooseEntry(entry)}
                style={({ pressed }) => [styles.popularButton, pressed && styles.pressed]}
              >
                <Text style={styles.popularText}>{entry.question}</Text>
                <Ionicons color={theme.accent} name="arrow-forward" size={18} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {!query.trim() && (
        <View style={styles.categorySection}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            Browse by page or topic
          </Text>
          <View accessibilityRole="radiogroup" style={styles.categoryGrid}>
            <CategoryChip
              active={activeCategory === 'all'}
              count={HELP_ENTRIES.length}
              label="All topics"
              onPress={() => {
                setActiveCategory('all');
                setOpenId(null);
              }}
              styles={styles}
            />
            {HELP_CATEGORIES.map((category) => (
              <CategoryChip
                active={activeCategory === category.id}
                count={HELP_ENTRIES.filter((entry) => entry.category === category.id).length}
                key={category.id}
                label={category.label}
                onPress={() => {
                  setActiveCategory(category.id);
                  setOpenId(null);
                }}
                styles={styles}
              />
            ))}
          </View>
          {activeCategory !== 'all' && (
            <Text style={styles.categorySummary}>
              {HELP_CATEGORIES.find((category) => category.id === activeCategory)?.summary}
            </Text>
          )}
        </View>
      )}

      <View accessibilityLiveRegion="polite" style={styles.resultsHeader}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          {query.trim() ? 'Search results' : activeCategory === 'all' ? 'All help topics' : 'Questions'}
        </Text>
        <Text style={styles.resultCount}>{matches.length} found</Text>
      </View>

      {matches.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons color={theme.accent} name="search-outline" size={28} />
          <Text accessibilityRole="header" style={styles.emptyTitle}>
            No exact answer yet
          </Text>
          <Text style={styles.body}>
            Try a broader term such as tokens, compare, country, alerts, privacy, sharing, or saved work.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={clearSearch}
            style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryActionText}>Browse all categories</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.questionList}>
          {matches.map((entry) => (
            <HelpQuestion
              entry={entry}
              expanded={openId === entry.id}
              key={entry.id}
              onNavigate={onNavigate}
              onToggle={() => setOpenId((current) => (current === entry.id ? null : entry.id))}
              styles={styles}
            />
          ))}
        </View>
      )}

      <View style={styles.supportCard}>
        <View style={styles.supportCopy}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            Still need help?
          </Text>
          <Text style={styles.body}>
            Data &amp; Alerts includes troubleshooting, privacy information, model requests, and direct email
            support.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => onNavigate('data')}
          style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
        >
          <Text style={styles.primaryActionText}>Open support options</Text>
          <Ionicons color={theme.onAccent} name="arrow-forward" size={18} />
        </Pressable>
      </View>
    </View>
  );
}

export function ContextualHelpLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Pressable
      accessibilityHint="Opens the relevant step-by-step Help and FAQ answer"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.contextLink, pressed && styles.pressed]}
    >
      <Ionicons color={theme.accent} name="help-circle-outline" size={19} />
      <Text style={styles.contextLinkText}>{label}</Text>
      <Ionicons color={theme.accent} name="chevron-forward" size={17} />
    </Pressable>
  );
}

function CategoryChip({
  active,
  count,
  label,
  onPress,
  styles,
}: {
  active: boolean;
  count: number;
  label: string;
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryChip,
        active && styles.categoryChipActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{label}</Text>
      <Text style={[styles.categoryCount, active && styles.categoryChipTextActive]}>{count}</Text>
    </Pressable>
  );
}

function HelpQuestion({
  entry,
  expanded,
  onNavigate,
  onToggle,
  styles,
}: {
  entry: HelpEntry;
  expanded: boolean;
  onNavigate: (destination: HelpDestination) => void;
  onToggle: () => void;
  styles: Styles;
}) {
  const { theme } = useMobileTheme();
  const category = HELP_CATEGORIES.find((item) => item.id === entry.category);
  return (
    <View style={styles.questionCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [styles.questionButton, pressed && styles.pressed]}
      >
        <View style={styles.questionCopy}>
          <Text style={styles.questionCategory}>{category?.label}</Text>
          <Text accessibilityRole="header" style={styles.questionText}>
            {entry.question}
          </Text>
        </View>
        <Ionicons
          color={theme.accent}
          name={expanded ? 'remove-circle-outline' : 'add-circle-outline'}
          size={24}
        />
      </Pressable>
      {expanded && (
        <View style={styles.answer}>
          {entry.answer.map((paragraph) => (
            <Text key={paragraph.slice(0, 48)} style={styles.answerText}>
              {paragraph}
            </Text>
          ))}
          {entry.action && (
            <Pressable
              accessibilityRole="button"
              onPress={() => onNavigate(entry.action!.destination)}
              style={({ pressed }) => [styles.answerAction, pressed && styles.pressed]}
            >
              <Text style={styles.answerActionText}>{entry.action.label}</Text>
              <Ionicons color={theme.accent} name="arrow-forward" size={17} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    section: { gap: 16 },
    heroCard: {
      backgroundColor: theme.surface,
      borderColor: theme.borderStrong,
      borderRadius: 16,
      borderWidth: 1,
      gap: 16,
      padding: 18,
    },
    heroIcon: {
      alignItems: 'center',
      backgroundColor: theme.accentSoft,
      borderRadius: 12,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    heroCopy: { gap: 7 },
    eyebrow: { color: theme.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
    title: { color: theme.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.5, lineHeight: 31 },
    summary: { color: theme.mutedText, fontSize: 15, lineHeight: 23 },
    searchShell: {
      alignItems: 'center',
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.borderStrong,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      minHeight: 54,
      paddingLeft: 14,
      paddingRight: 6,
    },
    searchInput: { color: theme.text, flex: 1, fontSize: 15, minHeight: 52, paddingVertical: 10 },
    clearButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
    popularCard: {
      backgroundColor: theme.accentSoft,
      borderColor: theme.accent,
      borderRadius: 16,
      borderWidth: 1,
      gap: 12,
      padding: 18,
    },
    cardTitle: { color: theme.text, fontSize: 19, fontWeight: '900', lineHeight: 25 },
    popularGrid: { gap: 8 },
    popularButton: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      minHeight: 50,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    popularText: { color: theme.text, flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 19 },
    categorySection: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 12,
      padding: 18,
    },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    categoryChip: {
      alignItems: 'center',
      borderColor: theme.borderStrong,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 13,
      paddingVertical: 7,
    },
    categoryChipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
    categoryChipText: { color: theme.text, fontSize: 12, fontWeight: '800' },
    categoryChipTextActive: { color: theme.onAccent },
    categoryCount: { color: theme.mutedText, fontSize: 11, fontVariant: ['tabular-nums'], fontWeight: '800' },
    categorySummary: { color: theme.mutedText, fontSize: 13, lineHeight: 19 },
    resultsHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
    resultCount: { color: theme.mutedText, fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '700' },
    questionList: { gap: 10 },
    questionCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      overflow: 'hidden',
    },
    questionButton: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      minHeight: 64,
      paddingHorizontal: 15,
      paddingVertical: 12,
    },
    questionCopy: { flex: 1, gap: 3 },
    questionCategory: { color: theme.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
    questionText: { color: theme.text, fontSize: 15, fontWeight: '800', lineHeight: 21 },
    answer: { borderTopColor: theme.border, borderTopWidth: 1, gap: 12, padding: 16 },
    answerText: { color: theme.mutedText, fontSize: 14, lineHeight: 22 },
    answerAction: {
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
    answerActionText: { color: theme.accent, fontSize: 13, fontWeight: '900' },
    emptyCard: {
      alignItems: 'flex-start',
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 12,
      padding: 18,
    },
    emptyTitle: { color: theme.text, fontSize: 19, fontWeight: '900', lineHeight: 25 },
    body: { color: theme.mutedText, fontSize: 14, lineHeight: 21 },
    secondaryAction: {
      alignItems: 'center',
      borderColor: theme.accent,
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 16,
    },
    secondaryActionText: { color: theme.accent, fontSize: 13, fontWeight: '900' },
    supportCard: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.borderStrong,
      borderRadius: 16,
      borderWidth: 1,
      gap: 14,
      padding: 18,
    },
    supportCopy: { gap: 7 },
    primaryAction: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: 11,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      minHeight: 50,
      paddingHorizontal: 16,
    },
    primaryActionText: { color: theme.onAccent, fontSize: 14, fontWeight: '900' },
    contextLink: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: theme.accentSoft,
      borderColor: theme.accent,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 7,
      minHeight: 44,
      paddingHorizontal: 13,
      paddingVertical: 7,
    },
    contextLinkText: { color: theme.accent, fontSize: 12, fontWeight: '900' },
    pressed: { opacity: 0.68 },
  });
}
