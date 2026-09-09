import { useEffect, useMemo, useState, type RefObject } from 'react';
import { Pressable, type ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { AppText as Text } from '@/components/AppText';
import { estimateTokens, formatCount, LEARN_MODULES, type Catalog, type Model } from '@promptspend/core';

import { HelpCenter } from '@/components/HelpCenter';
import { TourTarget } from '@/components/GuidedTour';
import type { HelpDestination } from '@/lib/helpCenter';
import { MAX_PASTE_CHARS } from '@/lib/promptInput';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

const SAMPLE =
  'Compare the cost of running this prompt on several AI models at one million requests per month.';
const LATEST_REPORT_URL = 'https://promptspend.com/writing/2026-08-price-movement-report/';

export function LearnSection({
  catalog,
  initialHelpEntryId,
  onHelpEntryConsumed,
  onNavigate,
  tourScrollRef,
}: {
  catalog?: Catalog;
  initialHelpEntryId?: string;
  onHelpEntryConsumed?: () => void;
  onNavigate: (destination: HelpDestination) => void;
  tourScrollRef?: RefObject<ScrollView | null>;
}) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [openId, setOpenId] = useState<string | null>('tokens-101');
  const [text, setText] = useState(SAMPLE);
  const samples = useMemo(() => (catalog ? pickSampleModels(catalog) : []), [catalog]);
  useEffect(() => {
    if (initialHelpEntryId) onHelpEntryConsumed?.();
  }, [initialHelpEntryId, onHelpEntryConsumed]);

  return (
    <View style={styles.section}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>LEARN</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Understand the cost. Master the app.
        </Text>
        <Text style={styles.summary}>
          Find step-by-step help, test how tokenizers see the same text, and learn the ideas that move your AI
          bill.
        </Text>
      </View>

      <HelpCenter initialEntryId={initialHelpEntryId} onNavigate={onNavigate} />

      <Pressable
        accessibilityHint="Opens the current PromptSpend market report on the website"
        accessibilityRole="link"
        onPress={() => void WebBrowser.openBrowserAsync(LATEST_REPORT_URL)}
        style={({ pressed }) => [styles.reportCard, pressed && styles.pressed]}
      >
        <View style={styles.reportHeading}>
          <Text style={styles.number}>MARKET REPORT</Text>
          <Text style={styles.reportDate}>August 2026</Text>
        </View>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          What changed in model pricing—and what it means
        </Text>
        <Text style={styles.body}>
          Read the latest evidence-led movement report on the live website, where it can stay current without
          waiting for another app binary.
        </Text>
        <Text style={styles.reportLink}>Read the latest report ↗</Text>
      </Pressable>

      {catalog ? (
        <View style={styles.lab}>
          <TourTarget id="learn-token-lab" scrollRef={tourScrollRef} style={styles.labIntro}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              Try it: the same text is a different token count on every model
            </Text>
            <Text style={styles.body}>
              Paste any sample below. Counts are private, calculated on this device, and deliberately labelled
              as estimates until exact tokenizers pass physical-device parity tests.
            </Text>
          </TourTarget>
          <View style={styles.labControls}>
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
            <Text
              accessibilityLiveRegion={text.length >= MAX_PASTE_CHARS ? 'polite' : 'none'}
              style={styles.privateText}
            >
              {text.length.toLocaleString()} / {MAX_PASTE_CHARS.toLocaleString()} characters
              {text.length >= MAX_PASTE_CHARS ? ' · Limit reached. Shorten the sample to add more text.' : ''}
            </Text>
            <Text style={styles.privateText}>
              Private: this text is not saved, logged, shared, or uploaded.
            </Text>
            <View accessibilityLiveRegion="polite" style={styles.tokenGrid}>
              {samples.map((model) => (
                <View key={model.id} style={styles.tokenCell}>
                  <Text style={styles.tokenCount}>
                    ≈ {formatCount(estimateTokens(text, model.tokenizer))}
                  </Text>
                  <Text style={styles.tokenModel}>{model.displayName}</Text>
                  <Text style={styles.tokenMethod}>calibrated estimate</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : (
        <View accessibilityLiveRegion="polite" style={styles.lab}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            Token Lab is temporarily paused
          </Text>
          <Text style={styles.body}>
            Help and lessons remain available offline. Reconnect and refresh the validated pricing catalog to
            compare tokenizer estimates.
          </Text>
        </View>
      )}

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
    labIntro: { gap: 12 },
    labControls: { gap: 12 },
    lesson: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 12,
      padding: 18,
    },
    reportCard: {
      backgroundColor: theme.surface,
      borderColor: theme.accent,
      borderRadius: 16,
      borderWidth: 1,
      gap: 10,
      padding: 18,
    },
    reportHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    reportDate: { color: theme.mutedText, fontSize: 12, fontWeight: '700' },
    reportLink: { color: theme.accent, fontSize: 14, fontWeight: '900' },
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
