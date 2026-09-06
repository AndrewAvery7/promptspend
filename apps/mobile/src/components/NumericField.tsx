import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText as Text } from '@/components/AppText';
import { useNumericDraftScopeActive } from '@/components/NumericDraftScope';
import { parseNumericDraft, registerNumericDraft } from '@/lib/numericDrafts';
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
  const active = useNumericDraftScopeActive();
  const inputRef = useRef<TextInput>(null);
  const draftRef = useRef(String(value));
  const hasDraft = useRef(false);
  const lastEmittedValue = useRef<number | null>(null);
  const current = useRef({ label, max, min, step, value, active });

  useLayoutEffect(() => {
    if (value !== current.current.value) {
      if (value !== lastEmittedValue.current) {
        // A preset, restore, or savings action changed this field externally.
        // Do not leave older focused text on top of the new calculated value.
        draftRef.current = String(value);
        hasDraft.current = false;
        setDraft(String(value));
        setValidationMessage(null);
      }
      lastEmittedValue.current = null;
    }
    current.current = { label, max, min, step, value, active };
  }, [active, label, max, min, step, value]);

  useEffect(
    () =>
      registerNumericDraft({
        isActive: () => current.current.active,
        validate: () => {
          if (!hasDraft.current) return null;
          const result = parseNumericDraft(draftRef.current, current.current);
          if (result.kind !== 'valid') return result.message;
          if (result.value !== current.current.value) return 'Updating estimate; tap again in a moment.';
          draftRef.current = String(result.value);
          setDraft(draftRef.current);
          setValidationMessage(result.message);
          return null;
        },
        reveal: (message) => {
          setValidationMessage(message);
          inputRef.current?.focus();
        },
        discard: () => {
          draftRef.current = String(current.current.value);
          hasDraft.current = false;
          lastEmittedValue.current = null;
          setDraft(draftRef.current);
          setValidationMessage(null);
        },
      }),
    [],
  );

  useEffect(() => {
    if (editing) return;
    const result = parseNumericDraft(draftRef.current, { label, max, min, step });
    if (hasDraft.current && (result.kind !== 'valid' || result.value !== value)) return;
    draftRef.current = String(value);
    hasDraft.current = false;
    setDraft(String(value));
  }, [editing, label, max, min, step, value]);

  useEffect(() => {
    if (active) return;
    draftRef.current = String(current.current.value);
    hasDraft.current = false;
    setDraft(draftRef.current);
    setEditing(false);
    setValidationMessage(null);
  }, [active]);

  const finishEditing = () => {
    const result = parseNumericDraft(draftRef.current, { label, max, min, step });
    setValidationMessage(result.message);
    if (result.kind === 'valid') {
      draftRef.current = String(result.value);
      setDraft(draftRef.current);
      lastEmittedValue.current = result.value;
      onChange(result.value);
    }
    setEditing(false);
  };

  const updateDraft = (text: string) => {
    draftRef.current = text;
    hasDraft.current = true;
    setDraft(text);
    const result = parseNumericDraft(text, { label, max, min, step });
    // Incomplete decimal drafts remain editable. Actions still fail closed.
    setValidationMessage(result.kind === 'invalid' ? result.message : null);
    if (result.kind === 'valid') {
      lastEmittedValue.current = result.value;
      onChange(result.value);
    }
  };

  return (
    <View style={styles.field}>
      <Text nativeID={`${label}-label`} style={styles.label}>
        {label}
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          accessibilityHint={accessibilityHint}
          accessibilityLabel={label}
          inputMode={step < 1 ? 'decimal' : 'numeric'}
          keyboardType={step < 1 ? 'decimal-pad' : 'number-pad'}
          onBlur={finishEditing}
          onChangeText={updateDraft}
          onFocus={() => {
            setEditing(true);
          }}
          onSubmitEditing={finishEditing}
          returnKeyType="done"
          selectTextOnFocus
          style={styles.input}
          value={draft}
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
