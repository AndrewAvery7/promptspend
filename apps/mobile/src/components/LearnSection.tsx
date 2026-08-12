import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText as Text } from '@/components/AppText';
import { estimateTokens, formatCount, LEARN_MODULES, type Catalog, type Model } from '@promptspend/core';

import { MAX_PASTE_CHARS } from '@/lib/promptInput';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

const SAMPLE =
  'Compare the cost of running this prompt on several AI models at one million requests per month.';

export function LearnSection({ catalog }: { catalog: Catalog }) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [openId, setOpenId] = useState<string | null>('tokens-101');
  const [text, setText] = useState(SAMPLE);
  const samples = useMemo(() => pickSampleModels(catalog), [catalog]);

  return (
    <View style={styles.section}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>LEARN</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Seven lessons that pay for themselves.
        </Text>
        <Text style={styles.summary}>
          Each lesson is one idea, the number that proves it, and what to do about it.
        </Text>
      </View>

      <View style={styles.lab}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          Try it: the same text is a different token count on every model
        </Text>
        <Text style={styles.body}>
          Paste any sample below. Counts are private, calculated on this device, and deliberately labelled as
          estimates until exact tokenizers pass physical-device parity tests.
        </Text>
        <TextInput
          accessibilityHint="Counts update while you type and the text never leaves this device"
          accessibilityLabel="Sample text to tokenize"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          importantForAutofill="no"
          maxLength={MAX_PASTE_CHARS}
          multiline
          onChangeText={setText}
          placeholder="Paste text to compare token estimates…"
          placeholderTextColor={theme.mutedText}
          spellCheck={false}
          style={styles.input}
          textAlignVertical="top"
          value={text}
        />
        <Text style={styles.privateText}>Private: this text is not saved, logged, shared, or uploaded.</Text>
        <View accessibilityLiveRegion="polite" style={styles.tokenGrid}>
          {samples.map((model) => (
            <View key={model.id} style={styles.tokenCell}>
              <Text style={styles.tokenCount}>≈ {formatCount(estimateTokens(text, model.tokenizer))}</Text>
              <Text style={styles.tokenModel}>{model.displayName}</Text>
              <Text style={styles.tokenMethod}>calibrated estimate</Text>
            </View>
          ))}
        </View>
      </View>

      {LEARN_MODULES.map((module) => {
        const expanded = module.id === openId;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            key={module.id}
            onPress={() => setOpenId(expanded ? null : module.id)}
            style={({ pressed }) => [styles.lesson, pressed && styles.pressed]}
          >
            <View style={styles.lessonHeader}>
              <Text style={styles.number}>{module.number}</Text>
              <View style={styles.lessonHeading}>
                <Text accessibilityRole="header" style={styles.cardTitle}>
                  {module.title}
                </Text>
                <Text style={styles.meta}>
                  {module.minutes} min · {module.kind} · {expanded ? 'collapse' : 'read'}
                </Text>
              </View>
            </View>
            <Text style={styles.body}>{module.teaser}</Text>
            {expanded && (
              <View style={styles.lessonBody}>
                {module.body.map((paragraph) => (
                  <Text key={paragraph.slice(0, 32)} style={styles.body}>
                    {paragraph}
                  </Text>
                ))}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function pickSampleModels(catalog: Catalog): Model[] {
  const preferred = ['gpt-5.4', 'claude-sonnet-5', 'deepseek-deepseek-v3.2'];
  const chosen = catalog.getAll(preferred);
  if (chosen.length === 3) return chosen;
  const seen = new Set<string>();
  return catalog.primaryModels.filter((model) => {
    const family = model.tokenizer.kind === 'tiktoken' ? model.tokenizer.encoding : model.providerId;
    if (seen.has(family) || seen.size >= 3) return false;
    seen.add(family);
    return true;
  });
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    section: { gap: 16 },
    hero: { gap: 12, paddingBottom: 4, paddingTop: 16 },
    eyebrow: { color: theme.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
    title: { color: theme.text, fontSize: 34, fontWeight: '800', letterSpacing: -1, lineHeight: 41 },
    summary: { color: theme.mutedText, fontSize: 17, lineHeight: 25 },
    lab: {
      backgroundColor: theme.accentSoft,
      borderColor: theme.accent,
      borderRadius: 16,
      borderWidth: 1,
      gap: 12,
      padding: 18,
    },
    lesson: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 12,
      padding: 18,
    },
    lessonHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
    lessonHeading: { flex: 1, gap: 3 },
    number: { color: theme.accent, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
    cardTitle: { color: theme.text, fontSize: 19, fontWeight: '800', lineHeight: 25 },
    body: { color: theme.mutedText, fontSize: 14, lineHeight: 21 },
    meta: { color: theme.accent, fontSize: 11, fontWeight: '700' },
    lessonBody: { borderTopColor: theme.border, borderTopWidth: 1, gap: 12, paddingTop: 12 },
    input: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      color: theme.text,
      fontSize: 15,
      lineHeight: 21,
      minHeight: 120,
      padding: 12,
    },
    privateText: { color: theme.text, fontSize: 11, fontWeight: '700', lineHeight: 16 },
    tokenGrid: { gap: 8 },
    tokenCell: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 10,
      borderWidth: 1,
      gap: 2,
      padding: 12,
    },
    tokenCount: { color: theme.text, fontSize: 22, fontVariant: ['tabular-nums'], fontWeight: '900' },
    tokenModel: { color: theme.text, fontSize: 13, fontWeight: '700' },
    tokenMethod: { color: theme.mutedText, fontSize: 10 },
    pressed: { opacity: 0.68 },
  });
}
