import { useMemo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText as Text } from '@/components/AppText';
import { NumericField } from '@/components/NumericField';
import {
  clampPromptText,
  MAX_PASTE_CHARS,
  type PromptInputFieldState,
  type PromptInputMode,
} from '@/lib/promptInput';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface PromptInputFieldProps {
  accessibilityHint: string;
  helper?: string;
  input: PromptInputFieldState;
  label: string;
  max: number;
  modelName: string;
  numericValue: number;
  onModeChange: (mode: PromptInputMode) => void;
  onNumericChange: (value: number) => void;
  onTextChange: (text: string) => void;
  placeholder: string;
  tokenEstimate: number;
}

export function PromptInputField({
  accessibilityHint,
  helper,
  input,
  label,
  max,
  modelName,
  numericValue,
  onModeChange,
  onNumericChange,
  onTextChange,
  placeholder,
  tokenEstimate,
}: PromptInputFieldProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <View
        accessibilityLabel={`${label} input method`}
        accessibilityRole="radiogroup"
        style={styles.modeGroup}
      >
        <ModeButton
          active={input.mode === 'tokens'}
          label="Enter tokens"
          onPress={() => onModeChange('tokens')}
          styles={styles}
        />
        <ModeButton
          active={input.mode === 'text'}
          label="Paste text"
          onPress={() => onModeChange('text')}
          styles={styles}
        />
      </View>

      {input.mode === 'tokens' ? (
        <NumericField
          accessibilityHint={accessibilityHint}
          label={label}
          max={max}
          onChange={onNumericChange}
          suffix="tokens"
          value={numericValue}
        />
      ) : (
        <View style={styles.textField}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>{label}</Text>
            <Text
              accessibilityLabel={`Approximately ${Math.round(tokenEstimate).toLocaleString('en-US')} tokens for ${modelName}`}
              accessibilityLiveRegion="polite"
              style={styles.tokenCount}
            >
              ≈ {Math.round(tokenEstimate).toLocaleString('en-US')} tokens
            </Text>
          </View>
          <Text style={styles.estimateNote}>
            Estimated for {modelName}; each compared model uses its own profile.
          </Text>
          <TextInput
            accessibilityHint={`${accessibilityHint}. Token count updates while you type.`}
            accessibilityLabel={`${label} text`}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            allowFontScaling
            importantForAutofill="no"
            maxLength={MAX_PASTE_CHARS}
            multiline
            numberOfLines={6}
            onChangeText={(text) => onTextChange(clampPromptText(text))}
            placeholder={placeholder}
            placeholderTextColor={theme.mutedText}
            scrollEnabled
            smartInsertDelete={false}
            spellCheck={false}
            style={styles.textInput}
            textAlignVertical="top"
            textContentType="none"
            value={input.text}
          />
          <View style={styles.textFooter}>
            <Text style={styles.privacy}>
              PromptSpend processes this on your device and does not save or send it.
            </Text>
            <Text style={styles.characterCount}>
              {input.text.length === MAX_PASTE_CHARS ? 'Maximum reached · ' : ''}
              {input.text.length.toLocaleString('en-US')} / {MAX_PASTE_CHARS.toLocaleString('en-US')}{' '}
              characters
            </Text>
          </View>
          {input.text.length > 0 && (
            <Pressable
              accessibilityHint={`Removes the pasted ${label.toLowerCase()} from this device`}
              accessibilityRole="button"
              onPress={() => onTextChange('')}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            >
              <Text style={styles.clearButtonText}>Clear text</Text>
            </Pressable>
          )}
        </View>
      )}

      {helper && <Text style={styles.helper}>{helper}</Text>}
    </View>
  );
}

function ModeButton({
  active,
  label,
  onPress,
  styles,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      aria-checked={active}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeButton,
        active && styles.modeButtonActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    container: { gap: 10 },
    modeGroup: {
      alignSelf: 'flex-start',
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.borderStrong,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 3,
      padding: 3,
    },
    modeButton: {
      alignItems: 'center',
      borderRadius: 7,
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 14,
    },
    modeButtonActive: { backgroundColor: theme.accent },
    modeButtonText: { color: theme.mutedText, fontSize: 12, fontWeight: '800' },
    modeButtonTextActive: { color: theme.onAccent },
    textField: { gap: 7 },
    labelRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
    label: { color: theme.text, flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 20 },
    tokenCount: { color: theme.accent, fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '800' },
    estimateNote: { color: theme.mutedText, fontSize: 11, lineHeight: 16 },
    textInput: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.borderStrong,
      borderRadius: 12,
      borderWidth: 1,
      color: theme.text,
      fontSize: 15,
      lineHeight: 21,
      minHeight: 144,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    textFooter: { gap: 4 },
    privacy: { color: theme.savings, fontSize: 11, fontWeight: '700', lineHeight: 16 },
    characterCount: { color: theme.mutedText, fontSize: 10, lineHeight: 14, textAlign: 'right' },
    clearButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 4,
    },
    clearButtonText: { color: theme.danger, fontSize: 12, fontWeight: '700' },
    helper: { color: theme.mutedText, fontSize: 12, lineHeight: 18 },
    pressed: { opacity: 0.68 },
  });
}
