import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText as Text } from '@/components/AppText';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface NumericFieldProps {
  accessibilityHint: string;
  label: string;
  max: number;
  min?: number;
  onChange: (value: number) => void;
  step?: number;
  suffix: string;
  value: number;
}

export function NumericField({
  accessibilityHint,
  label,
  max,
  min = 0,
  onChange,
  step = 1,
  suffix,
  value,
}: NumericFieldProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const commit = (text: string) => {
    const normalized = text.replace(',', '.').trim();
    const parsed = normalized.length > 0 && normalized !== '.' ? Number(normalized) : Number.NaN;
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      setValidationMessage(`${label} must be a number.`);
      return;
    }
    const rounded = Math.round(parsed / step) * step;
    const next = Math.min(max, Math.max(min, Number(rounded.toFixed(step < 1 ? 2 : 0))));
    setDraft(String(next));
    setValidationMessage(
      parsed < min
        ? `${label} was adjusted to the minimum of ${min}.`
        : parsed > max
          ? `${label} was adjusted to the maximum of ${max}.`
          : null,
    );
    onChange(next);
  };

  const updateDraft = (text: string) => {
    const normalized = step < 1 ? text.replace(',', '.') : text;
    const clean =
      step < 1
        ? normalized.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
        : normalized.replace(/[^0-9]/g, '');
    setValidationMessage(null);
    setDraft(clean);
  };

  return (
    <View style={styles.field}>
      <Text nativeID={`${label}-label`} style={styles.label}>
        {label}
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityHint={accessibilityHint}
          accessibilityLabel={label}
          inputMode={step < 1 ? 'decimal' : 'numeric'}
          keyboardType={step < 1 ? 'decimal-pad' : 'number-pad'}
          maxLength={10}
          onBlur={() => {
            commit(draft);
            setEditing(false);
          }}
          onChangeText={updateDraft}
          onFocus={() => {
            setDraft(String(value));
            setEditing(true);
          }}
          onSubmitEditing={() => commit(draft)}
          returnKeyType="done"
          selectTextOnFocus
          style={styles.input}
          value={editing ? draft : String(value)}
        />
        <Text style={styles.suffix}>{suffix}</Text>
      </View>
      {validationMessage ? (
        <Text accessibilityLiveRegion="polite" style={styles.validationMessage}>
          {validationMessage}
        </Text>
      ) : null}
    </View>
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
    inputRow: {
      alignItems: 'center',
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.borderStrong,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      minHeight: 52,
      overflow: 'hidden',
    },
    input: {
      color: theme.text,
      flex: 1,
      fontSize: 17,
      fontVariant: ['tabular-nums'],
      minHeight: 50,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    suffix: {
      color: theme.mutedText,
      fontSize: 13,
      paddingHorizontal: 14,
    },
    validationMessage: {
      color: theme.danger,
      fontSize: 13,
      lineHeight: 18,
    },
  });
}
