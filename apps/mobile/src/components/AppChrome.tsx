import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText as Text } from '@/components/AppText';
import { formatRate, type Catalog } from '@promptspend/core';

import type { AccentName, CanvasName, MobileTheme, ThemeMode } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

export type AppSection = 'estimate' | 'compare' | 'learn' | 'data';

const SECTIONS: { id: AppSection; label: string }[] = [
  { id: 'estimate', label: 'Estimate' },
  { id: 'compare', label: 'Compare' },
  { id: 'learn', label: 'Learn' },
  { id: 'data', label: 'Data & Alerts' },
];

export function PricingTicker({ catalog, onOpenData }: { catalog: Catalog; onOpenData: () => void }) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const items = useMemo(() => buildTickerItems(catalog), [catalog]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (paused || reduceMotion || items.length < 2) return;
    const timer = setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length);
    }, 4200);
    return () => clearInterval(timer);
  }, [items.length, paused, reduceMotion]);

  const activeItem = items[activeIndex % Math.max(1, items.length)];
  if (!activeItem) return null;

  return (
    <View accessibilityLabel="Recent pricing highlights" style={styles.ticker}>
      <Pressable
        accessibilityHint={
          activeItem.key === 'flagged' ? 'Opens Data and Alerts' : 'Shows the next highlight'
        }
        accessibilityRole="button"
        onPress={() => {
          if (activeItem.key === 'flagged') onOpenData();
          else setActiveIndex((current) => (current + 1) % items.length);
        }}
        style={styles.tickerItem}
      >
        <Text numberOfLines={2} style={styles.tickerText}>
          {activeItem.text}
        </Text>
      </Pressable>
      <Pressable
        accessibilityHint={
          reduceMotion ? 'Automatic movement is already disabled by Reduce Motion' : undefined
        }
        accessibilityRole="button"
        accessibilityState={{ disabled: reduceMotion }}
        disabled={reduceMotion}
        onPress={() => setPaused((value) => !value)}
        style={[styles.tickerPause, reduceMotion && styles.disabled]}
      >
        <Text style={styles.tickerPauseText}>
          {reduceMotion ? 'Motion off' : paused ? 'Resume' : 'Pause'}
        </Text>
      </Pressable>
    </View>
  );
}

export function GlobalActions({
  onAppearance,
  onSearch,
  onTour,
}: {
  onAppearance: () => void;
  onSearch: () => void;
  onTour: () => void;
}) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.globalActions}>
      <MiniAction label="Search" onPress={onSearch} styles={styles} />
      <MiniAction label="Guide" onPress={onTour} styles={styles} />
      <MiniAction label="Color" onPress={onAppearance} styles={styles} />
    </View>
  );
}

export function AppearanceSheet({ onClose, visible }: { onClose: () => void; visible: boolean }) {
  const appearance = useMobileTheme();
  const styles = useMemo(() => createStyles(appearance.theme), [appearance.theme]);
  return (
    <Sheet label="Appearance" onClose={onClose} visible={visible} styles={styles}>
      <OptionGroup<ThemeMode>
        label="Interface"
        onChange={appearance.setMode}
        options={[
          ['system', 'System'],
          ['light', 'Light'],
          ['dark', 'Dark'],
        ]}
        styles={styles}
        value={appearance.mode}
      />
      <OptionGroup<AccentName>
        label="Accent color"
        onChange={appearance.setAccent}
        options={[
          ['cobalt', 'Cobalt'],
          ['emerald', 'Emerald'],
          ['teal', 'Teal'],
          ['violet', 'Violet'],
        ]}
        styles={styles}
        value={appearance.accent}
      />
      <OptionGroup<CanvasName>
        label="Canvas"
        onChange={appearance.setCanvas}
        options={[
          ['cool', 'Cool paper'],
          ['warm', 'Warm cream'],
        ]}
        styles={styles}
        value={appearance.canvas}
      />
      <Text style={styles.sheetNote}>Your appearance choice is stored only on this device.</Text>
    </Sheet>
  );
}

interface CommandSheetProps {
  catalog: Catalog;
  favoriteIds: readonly string[];
  onClose: () => void;
  onHome: () => void;
  onReset: () => void;
  onSection: (section: AppSection) => void;
  onSelectModel: (id: string) => void;
  onToggleComparison: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  selectedComparisonIds: readonly string[];
  onTour: () => void;
  visible: boolean;
}

export function CommandSheet({
  catalog,
  favoriteIds,
  onClose,
  onHome,
  onReset,
  onSection,
  onSelectModel,
  onToggleComparison,
  onToggleFavorite,
  selectedComparisonIds,
  onTour,
  visible,
}: CommandSheetProps) {
  const appearance = useMobileTheme();
  const styles = useMemo(() => createStyles(appearance.theme), [appearance.theme]);
  const [query, setQuery] = useState('');
  const close = () => {
    setQuery('');
    onClose();
  };
  const commands = useMemo(() => {
    const base = [
      { id: 'view-home', kind: 'View', label: 'Go to Home Cost Brief', run: onHome },
      ...SECTIONS.map((item) => ({
        id: `view-${item.id}`,
        kind: 'View',
        label: `Go to ${item.label}`,
        run: () => onSection(item.id),
      })),
      { id: 'tour', kind: 'Guide', label: 'Start the guided tour', run: onTour },
      { id: 'reset', kind: 'Scenario', label: 'Reset the scenario', run: onReset },
      { id: 'light', kind: 'Appearance', label: 'Use light mode', run: () => appearance.setMode('light') },
      { id: 'dark', kind: 'Appearance', label: 'Use dark mode', run: () => appearance.setMode('dark') },
      {
        id: 'system',
        kind: 'Appearance',
        label: 'Follow system appearance',
        run: () => appearance.setMode('system'),
      },
      {
        id: 'canvas-cool',
        kind: 'Appearance',
        label: 'Canvas: cool paper',
        run: () => appearance.setCanvas('cool'),
      },
      {
        id: 'canvas-warm',
        kind: 'Appearance',
        label: 'Canvas: warm cream',
        run: () => appearance.setCanvas('warm'),
      },
      {
        id: 'accent-cobalt',
        kind: 'Appearance',
        label: 'Accent: cobalt',
        run: () => appearance.setAccent('cobalt'),
      },
      {
        id: 'accent-emerald',
        kind: 'Appearance',
        label: 'Accent: emerald',
        run: () => appearance.setAccent('emerald'),
      },
      {
        id: 'accent-teal',
        kind: 'Appearance',
        label: 'Accent: teal',
        run: () => appearance.setAccent('teal'),
      },
      {
        id: 'accent-violet',
        kind: 'Appearance',
        label: 'Accent: violet',
        run: () => appearance.setAccent('violet'),
      },
    ];
    const models = catalog.primaryModels.flatMap((model) => {
      const selected = selectedComparisonIds.includes(model.id);
      const watched = favoriteIds.includes(model.id);
      return [
        {
          id: `estimate-${model.id}`,
          kind: catalog.providerName(model),
          label: `Estimate ${model.displayName}`,
          run: () => onSelectModel(model.id),
        },
        {
          id: `compare-${model.id}`,
          kind: 'Comparison',
          label: `${selected ? 'Remove' : 'Add'} ${model.displayName} ${selected ? 'from' : 'to'} comparison`,
          run: () => onToggleComparison(model.id),
        },
        {
          id: `watch-${model.id}`,
          kind: 'Watchlist',
          label: `${watched ? 'Stop watching' : 'Watch'} ${model.displayName}`,
          run: () => onToggleFavorite(model.id),
        },
      ];
    });
    return [...base, ...models];
  }, [
    appearance,
    catalog,
    favoriteIds,
    onReset,
    onHome,
    onSection,
    onSelectModel,
    onToggleComparison,
    onToggleFavorite,
    onTour,
    selectedComparisonIds,
  ]);
  const matches = commands
    .filter((command) =>
      `${command.label} ${command.kind}`.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .slice(0, 15);

  return (
    <Sheet label="Search and commands" onClose={close} visible={visible} styles={styles}>
      <TextInput
        accessibilityLabel="Search commands and models"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setQuery}
        placeholder="Type a command or model name…"
        placeholderTextColor={appearance.theme.mutedText}
        style={styles.searchInput}
        value={query}
      />
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.commandList}>
        {matches.length === 0 && <Text style={styles.sheetNote}>No matches.</Text>}
        {matches.map((command) => (
          <Pressable
            accessibilityRole="button"
            key={command.id}
            onPress={() => {
              command.run();
              close();
            }}
            style={({ pressed }) => [styles.command, pressed && styles.pressed]}
          >
            <Text style={styles.commandLabel}>{command.label}</Text>
            <Text style={styles.commandKind}>{command.kind}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

export function buildTickerItems(catalog: Catalog): { key: string; text: string }[] {
  const items: { key: string; text: string }[] = [];
  const cheapest = [...catalog.primaryModels]
    .filter((model) => model.pricing.input > 0)
    .sort((a, b) => a.pricing.input - b.pricing.input)[0];
  if (cheapest)
    items.push({
      key: 'cheapest',
      text: `CHEAPEST INPUT TODAY · ${cheapest.displayName} ${formatRate(cheapest.pricing.input)}/M`,
    });
  const spread = catalog.rateSpread();
  if (spread)
    items.push({
      key: 'spread',
      text: `BLENDED PRICE SPREAD · ${Math.round(spread.multiple)}× · ${spread.cheapest.displayName} → ${spread.priciest.displayName}`,
    });
  [...catalog.primaryModels]
    .filter((model) => model.releaseDate)
    .sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
    .slice(0, 2)
    .forEach((model) => {
      items.push({
        key: `new-${model.id}`,
        text: `▲ TRACKED · ${model.displayName} · ${formatRate(model.pricing.input)}/${formatRate(model.pricing.output)} per 1M`,
      });
    });
  const flagged = catalog.models.filter((model) => model.provenance.needsReview).length;
  if (flagged > 0)
    items.push({ key: 'flagged', text: `Δ ${flagged} FLAGGED · sources disagree · open Data & Alerts` });
  items.push({
    key: 'coverage',
    text: `${catalog.primaryModels.length} MODELS · ${catalog.providers.length} PROVIDERS · re-checked every morning`,
  });
  items.push({ key: 'alerts', text: 'FOLLOW PRICE CHANGES · feed and email options in Data & Alerts' });
  return items;
}

function MiniAction({ label, onPress, styles }: { label: string; onPress: () => void; styles: Styles }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.miniAction, pressed && styles.pressed]}
    >
      <Text style={styles.miniActionText}>{label}</Text>
    </Pressable>
  );
}

function Sheet({
  children,
  label,
  onClose,
  styles,
  visible,
}: {
  children: React.ReactNode;
  label: string;
  onClose: () => void;
  styles: Styles;
  visible: boolean;
}) {
  const sheet = useRef<View>(null);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      const node = findNodeHandle(sheet.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 120);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <Modal
      accessibilityLabel={label}
      animationType="none"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <View
          accessibilityLabel={label}
          accessibilityRole="summary"
          accessibilityViewIsModal
          ref={sheet}
          style={styles.sheet}
        >
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>
              {label}
            </Text>
            <Pressable
              accessibilityLabel={`Close ${label}`}
              accessibilityRole="button"
              onPress={onClose}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function OptionGroup<T extends string>({
  label,
  onChange,
  options,
  styles,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: readonly (readonly [T, string])[];
  styles: Styles;
  value: T;
}) {
  return (
    <View style={styles.optionGroup}>
      <Text style={styles.optionLabel}>{label}</Text>
      <View accessibilityRole="radiogroup" style={styles.optionGrid}>
        {options.map(([id, optionLabel]) => (
          <Pressable
            aria-checked={value === id}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === id }}
            key={id}
            onPress={() => onChange(id)}
            style={[styles.option, value === id && styles.optionActive]}
          >
            <Text style={[styles.optionText, value === id && styles.optionTextActive]}>{optionLabel}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    pressed: { opacity: 0.68 },
    disabled: { opacity: 0.62 },
    ticker: {
      alignItems: 'center',
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.borderStrong,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    tickerItem: { flex: 1, justifyContent: 'center', minHeight: 52, paddingHorizontal: 14 },
    tickerText: { color: theme.text, fontSize: 11, fontWeight: '800', letterSpacing: 0.4, lineHeight: 16 },
    tickerPause: {
      alignItems: 'center',
      borderLeftColor: theme.border,
      borderLeftWidth: 1,
      justifyContent: 'center',
      minHeight: 52,
      paddingHorizontal: 10,
    },
    tickerPauseText: { color: theme.accent, fontSize: 10, fontWeight: '800' },
    globalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
    miniAction: {
      alignItems: 'center',
      borderColor: theme.borderStrong,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 10,
    },
    miniActionText: { color: theme.text, fontSize: 11, fontWeight: '800' },
    backdrop: { backgroundColor: 'rgba(0,0,0,0.48)', flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      gap: 18,
      maxHeight: '88%',
      paddingBottom: 28,
      paddingHorizontal: 20,
      paddingTop: 18,
    },
    sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    sheetTitle: { color: theme.text, flex: 1, fontSize: 21, fontWeight: '800', lineHeight: 27 },
    closeButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
    closeText: { color: theme.accent, fontSize: 14, fontWeight: '800' },
    optionGroup: { gap: 8 },
    optionLabel: { color: theme.text, fontSize: 14, fontWeight: '800' },
    optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    option: {
      alignItems: 'center',
      borderColor: theme.borderStrong,
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 14,
    },
    optionActive: { backgroundColor: theme.accent, borderColor: theme.accent },
    optionText: { color: theme.text, fontSize: 13, fontWeight: '700' },
    optionTextActive: { color: theme.onAccent },
    sheetNote: { color: theme.mutedText, fontSize: 12, lineHeight: 18 },
    sheetBody: { color: theme.mutedText, fontSize: 16, lineHeight: 24 },
    searchInput: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.borderStrong,
      borderRadius: 12,
      borderWidth: 1,
      color: theme.text,
      fontSize: 16,
      minHeight: 52,
      paddingHorizontal: 14,
    },
    commandList: { maxHeight: 440 },
    command: {
      alignItems: 'center',
      borderBottomColor: theme.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 12,
      minHeight: 54,
      paddingVertical: 8,
    },
    commandLabel: { color: theme.text, flex: 1, fontSize: 14, fontWeight: '700' },
    commandKind: { color: theme.mutedText, fontSize: 11 },
    tourStep: { color: theme.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
    tourActions: { flexDirection: 'row', gap: 10 },
    secondaryButton: {
      alignItems: 'center',
      borderColor: theme.borderStrong,
      borderRadius: 10,
      borderWidth: 1,
      flex: 1,
      justifyContent: 'center',
      minHeight: 48,
    },
    secondaryButtonText: { color: theme.text, fontWeight: '800' },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: 10,
      flex: 1,
      justifyContent: 'center',
      minHeight: 48,
    },
    primaryButtonText: { color: theme.onAccent, fontWeight: '800' },
  });
}
