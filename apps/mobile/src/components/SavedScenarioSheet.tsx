import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText as Text } from '@/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SavedScenario } from '@/state/useLaunchState';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface SavedScenarioSheetProps {
  onClose: () => void;
  onDelete: (scenario: SavedScenario) => boolean | Promise<boolean>;
  onDuplicate: (scenario: SavedScenario) => boolean | Promise<boolean>;
  onOpen: (scenario: SavedScenario) => void;
  onRename: (scenario: SavedScenario, name: string) => boolean | Promise<boolean>;
  scenario: SavedScenario | null;
}

export function SavedScenarioSheet({
  onClose,
  onDelete,
  onDuplicate,
  onOpen,
  onRename,
  scenario,
}: SavedScenarioSheetProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [name, setName] = useState(scenario?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const trimmedName = name.trim();

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduceMotion(value);
      })
      .catch(() => {
        /* Remain motion-free if the setting cannot be read. */
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const runAction = async (action: () => boolean | Promise<boolean>, closeAfter = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const saved = await action();
      if (!saved)
        setError(
          'This change could not be saved. Please try again or close and review the storage notice on Home.',
        );
      else if (closeAfter) onClose();
    } catch {
      setError('This change could not be saved. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (!scenario) return null;

  const confirmDelete = () => {
    if (inFlight.current) return;
    Alert.alert(
      'Delete saved scenario?',
      `“${scenario.name}” will be removed from this device. You can still undo immediately afterward.`,
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: () => void runAction(() => onDelete(scenario), true),
          style: 'destructive',
          text: 'Delete',
        },
      ],
    );
  };

  return (
    <Modal
      testID="saved-scenario-modal"
      accessibilityLabel={`${scenario.name} scenario actions`}
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible
    >
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
        <KeyboardAvoidingView
          testID="saved-scenario-keyboard"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.scrollContent}
            testID="saved-scenario-scroll"
          >
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>SAVED SCENARIO</Text>
                <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>
                  {scenario.name}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close scenario actions"
                accessibilityRole="button"
                onPress={onClose}
                style={({ pressed }) => [styles.close, pressed && styles.pressed]}
              >
                <Ionicons color={theme.text} name="close" size={24} />
              </Pressable>
            </View>

            <View style={styles.content}>
              {busy && (
                <View accessibilityLiveRegion="polite" style={styles.status}>
                  <ActivityIndicator color={theme.accent} />
                  <Text style={styles.privacyText}>Saving change…</Text>
                </View>
              )}
              {error && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              )}
              <View style={styles.privacyCard}>
                <Ionicons color={theme.savings} name="shield-checkmark-outline" size={22} />
                <Text style={styles.privacyText}>
                  Stored locally with derived counts and assumptions only. Pasted text is never saved.
                </Text>
              </View>

              <View style={styles.renameCard}>
                <Text style={styles.label}>Scenario name</Text>
                <TextInput
                  accessibilityLabel="Saved scenario name"
                  autoCapitalize="sentences"
                  editable={!busy}
                  maxLength={80}
                  onChangeText={setName}
                  placeholder="Name this scenario"
                  placeholderTextColor={theme.mutedText}
                  returnKeyType="done"
                  selectTextOnFocus
                  style={styles.input}
                  value={name}
                />
                <Pressable
                  accessibilityLabel="Save new name"
                  accessibilityRole="button"
                  accessibilityState={{
                    busy,
                    disabled: busy || !trimmedName || trimmedName === scenario.name,
                  }}
                  disabled={busy || !trimmedName || trimmedName === scenario.name}
                  onPress={() => void runAction(() => onRename(scenario, trimmedName))}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.pressed,
                    (busy || !trimmedName || trimmedName === scenario.name) && styles.disabled,
                  ]}
                >
                  <Ionicons color={theme.accent} name="create-outline" size={20} />
                  <Text style={styles.secondaryText}>Save new name</Text>
                </Pressable>
              </View>

              <Pressable
                accessibilityLabel="Open in Estimate"
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => onOpen(scenario)}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                  busy && styles.disabled,
                ]}
              >
                <Ionicons color={theme.onAccent} name="open-outline" size={20} />
                <Text style={styles.primaryText}>Open in Estimate</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Duplicate scenario"
                accessibilityRole="button"
                accessibilityState={{ busy, disabled: busy }}
                disabled={busy}
                onPress={() => void runAction(() => onDuplicate(scenario))}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                  busy && styles.disabled,
                ]}
              >
                <Ionicons color={theme.accent} name="copy-outline" size={20} />
                <Text style={styles.secondaryText}>Duplicate scenario</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Delete scenario"
                accessibilityRole="button"
                accessibilityState={{ busy, disabled: busy }}
                disabled={busy}
                onPress={confirmDelete}
                style={({ pressed }) => [
                  styles.deleteButton,
                  pressed && styles.pressed,
                  busy && styles.disabled,
                ]}
              >
                <Ionicons color={theme.danger} name="trash-outline" size={20} />
                <Text style={styles.deleteText}>Delete scenario</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scrollContent: { paddingBottom: 20 },
    status: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    error: { color: theme.danger, fontSize: 14, lineHeight: 21 },
    safeArea: { backgroundColor: theme.background, flex: 1 },
    header: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 20 },
    headerCopy: { flex: 1, gap: 3 },
    eyebrow: { color: theme.accent, fontSize: 12, fontWeight: '600', letterSpacing: 1.3 },
    title: { color: theme.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.6, lineHeight: 32 },
    close: {
      alignItems: 'center',
      borderColor: theme.border,
      borderRadius: 24,
      borderWidth: 1,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    content: { gap: 10, padding: 20 },
    privacyCard: {
      alignItems: 'flex-start',
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      padding: 14,
    },
    privacyText: { color: theme.mutedText, flex: 1, fontSize: 13, lineHeight: 19 },
    renameCard: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1,
      gap: 10,
      padding: 16,
    },
    label: { color: theme.text, fontSize: 14, fontWeight: '800' },
    input: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 10,
      borderWidth: 1,
      color: theme.text,
      fontSize: 16,
      minHeight: 50,
      paddingHorizontal: 13,
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: 12,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      minHeight: 52,
      paddingHorizontal: 16,
    },
    primaryText: { color: theme.onAccent, fontSize: 15, fontWeight: '900' },
    secondaryButton: {
      alignItems: 'center',
      borderColor: theme.accent,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      minHeight: 50,
      paddingHorizontal: 16,
    },
    secondaryText: { color: theme.accent, fontSize: 14, fontWeight: '800' },
    deleteButton: {
      alignItems: 'center',
      borderColor: theme.danger,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      minHeight: 50,
      paddingHorizontal: 16,
    },
    deleteText: { color: theme.danger, fontSize: 14, fontWeight: '800' },
    pressed: { opacity: 0.68 },
    disabled: { opacity: 0.42 },
  });
}
