import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface NumericFieldProps {
  accessibilityHint: string;
  label: string;
  max: number;
  min?: number;
  onChange: (value: number) => void;
  suffix: string;
  value: number;
}

export function NumericField({
  accessibilityHint,
  label,
  max,
  min = 0,
  onChange,
  suffix,
  value,
}: NumericFieldProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [draft, setDraft] = useState(String(value));

  const commit = (text: string) => {
    const parsed = Number(text.replaceAll(',', '').trim());
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.min(max, Math.max(min, Math.round(parsed)));
    setDraft(String(next));
    onChange(next);
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
          inputMode="numeric"
          keyboardType="number-pad"
          maxLength={10}
          onBlur={() => commit(draft)}
          onChangeText={(text) => {
            const clean = text.replace(/[^0-9]/g, '');
            setDraft(clean);
            if (clean.length > 0) commit(clean);
          }}
          returnKeyType="done"
          selectTextOnFocus
          style={styles.input}
          value={draft}
        />
        <Text style={styles.suffix}>{suffix}</Text>
      </View>
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
      borderColor: theme.border,
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
  });
}
