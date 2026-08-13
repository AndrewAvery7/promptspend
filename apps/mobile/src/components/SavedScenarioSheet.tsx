import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText as Text } from '@/components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SavedScenario } from '@/state/useLaunchState';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface SavedScenarioSheetProps {
  onClose: () => void;
  onDelete: (scenario: SavedScenario) => void;
  onDuplicate: (scenario: SavedScenario) => void;
  onOpen: (scenario: SavedScenario) => void;
  onRename: (scenario: SavedScenario, name: string) => void;
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
  const trimmedName = name.trim();

  if (!scenario) return null;

  const confirmDelete = () => {
    Alert.alert(
      'Delete saved scenario?',
      `“${scenario.name}” will be removed from this device. You can still undo immediately afterward.`,
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: () => {
            onDelete(scenario);
            onClose();
          },
          style: 'destructive',
          text: 'Delete',
        },
      ],
    );
  };

  return (
    <Modal
      accessibilityLabel={`${scenario.name} scenario actions`}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible
    >
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
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
            style={styles.close}
          >
            <Ionicons color={theme.text} name="close" size={24} />
          </Pressable>
        </View>

        <View style={styles.content}>
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
              accessibilityRole="button"
              accessibilityState={{ disabled: !trimmedName || trimmedName === scenario.name }}
              disabled={!trimmedName || trimmedName === scenario.name}
              onPress={() => onRename(scenario, trimmedName)}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
                (!trimmedName || trimmedName === scenario.name) && styles.disabled,
              ]}
            >
              <Ionicons color={theme.accent} name="create-outline" size={20} />
              <Text style={styles.secondaryText}>Save new name</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => onOpen(scenario)}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Ionicons color={theme.onAccent} name="open-outline" size={20} />
            <Text style={styles.primaryText}>Open in Estimate</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => onDuplicate(scenario)}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Ionicons color={theme.accent} name="copy-outline" size={20} />
            <Text style={styles.secondaryText}>Duplicate scenario</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={confirmDelete}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
          >
            <Ionicons color={theme.danger} name="trash-outline" size={20} />
            <Text style={styles.deleteText}>Delete scenario</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    safeArea: { backgroundColor: theme.background, flex: 1 },
    header: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 20 },
    headerCopy: { flex: 1, gap: 3 },
    eyebrow: { color: theme.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
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
