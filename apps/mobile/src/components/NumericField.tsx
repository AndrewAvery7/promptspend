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
  const [draft, setDraft] = useState({ text: String(value), sourceValue: value });
  const displayed = draft.sourceValue === value ? draft.text : String(value);

  const commit = (text: string) => {
    const parsed = Number(text.replaceAll(',', '').trim());
    if (!Number.isFinite(parsed)) {
      setDraft({ text: String(value), sourceValue: value });
      return;
    }
    const rounded = Math.round(parsed / step) * step;
    const next = Math.min(max, Math.max(min, Number(rounded.toFixed(step < 1 ? 2 : 0))));
    setDraft({ text: String(next), sourceValue: next });
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
          inputMode={step < 1 ? 'decimal' : 'numeric'}
          keyboardType={step < 1 ? 'decimal-pad' : 'number-pad'}
          maxLength={10}
          onBlur={() => commit(displayed)}
          onChangeText={(text) => {
            const clean =
              step < 1
                ? text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
                : text.replace(/[^0-9]/g, '');
            setDraft({ text: clean, sourceValue: value });
            if (clean.length > 0) commit(clean);
          }}
          returnKeyType="done"
          selectTextOnFocus
          style={styles.input}
          value={displayed}
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
