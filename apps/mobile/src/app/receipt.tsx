import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useIsFocused, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import {
  DEFAULT_SHARE_RECEIPT,
  parseShareReceipt,
  RECEIPT_PAGE_URL,
  RECEIPT_SPEC_VERSION,
  renderReceiptInstructions,
  SHARE_RECEIPT_LIMITS,
  type ShareReceiptData,
} from '@promptspend/core';

import { AppText as Text } from '@/components/AppText';
import { AppearanceSheet, CommandSheet, GlobalActions, type AppSection } from '@/components/AppChrome';
import { TourTarget, useGuidedTour } from '@/components/GuidedTour';
import { WebDocumentHead } from '@/components/WebDocumentHead';
import { APP_ROUTES, helpHref } from '@/lib/routes';
import { toggleComparisonSelection } from '@/lib/comparison';
import { useLaunchState } from '@/state/useLaunchState';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

const FIELDS: { key: keyof ShareReceiptData; label: string }[] = [
  { key: 'conversation', label: 'Conversation' },
  { key: 'estimatedTokens', label: 'Estimated tokens' },
  { key: 'currentModel', label: 'Current model' },
  { key: 'estimatedCost', label: 'Estimated cost' },
  { key: 'alternativeModel', label: 'Lower-cost model to test' },
  { key: 'alternativeCost', label: 'Alternative cost' },
  { key: 'priceDifference', label: 'Price difference' },
  { key: 'note', label: 'Assumption note' },
];

export default function ReceiptScreen() {
  const focused = useIsFocused();
  return focused ? <ReceiptContent /> : null;
}

function ReceiptContent() {
  const router = useRouter();
  const { startTour } = useGuidedTour();
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scrollRef = useRef<ScrollView>(null);
  const launch = useLaunchState();
  const receiptRef = useRef<View>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [assistantResult, setAssistantResult] = useState('');
  const [data, setData] = useState<ShareReceiptData>(DEFAULT_SHARE_RECEIPT);
  const [imported, setImported] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const [sharing, setSharing] = useState(false);
  const navigateToSection = (section: AppSection) => router.navigate(APP_ROUTES[section]);

  const importResult = (value: string) => {
    try {
      const parsed = parseShareReceipt(value);
      setData(parsed);
      setImported(true);
      setAssistantResult('');
      setNotice('Receipt imported. Review every field before sharing.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The receipt could not be imported.');
    }
  };

  const copyInstructions = async () => {
    try {
      await Clipboard.setStringAsync(renderReceiptInstructions());
      setNotice(
        'Audit instructions copied. Paste them as the next message in the conversation you want to audit.',
      );
    } catch {
      setNotice('The instructions could not be copied. Please try again.');
    }
  };

  const pasteResult = async () => {
    try {
      const value = await Clipboard.getStringAsync();
      setAssistantResult(value.slice(0, SHARE_RECEIPT_LIMITS.input));
      importResult(value);
    } catch {
      setNotice('PromptSpend could not read the clipboard. Paste the share block into the field instead.');
    }
  };

  const shareInstructions = async () => {
    try {
      await Share.share({
        message: renderReceiptInstructions(),
        title: 'PromptSpend conversation audit instructions',
      });
    } catch {
      setNotice('The system share menu could not open. Use Copy audit instructions instead.');
    }
  };

  const shareText = async () => {
    if (!imported) return;
    try {
      await Share.share({ message: receiptText(data), title: 'My PromptSpend Receipt' });
    } catch {
      setNotice('The system share menu could not open.');
    }
  };

  const shareImage = async () => {
    if (!imported || !receiptRef.current || sharing) return;
    if (Platform.OS === 'web') {
      setNotice('Image sharing is available in the installed iOS and Android apps.');
      return;
    }
    setSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('The system file share menu is unavailable.');
      const uri = await captureRef(receiptRef, {
        fileName: `promptspend-conversation-receipt-${Date.now()}`,
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: 1080,
      });
      await Sharing.shareAsync(uri, {
        dialogTitle: 'Share PromptSpend Receipt',
        mimeType: 'image/png',
        UTI: 'public.png',
      });
    } catch (error) {
      Alert.alert('Receipt sharing is unavailable', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      <WebDocumentHead
        description="Audit an existing AI conversation and create a private, shareable cost receipt."
        title="PromptSpend Receipt"
      />
      <SafeAreaView edges={['top', 'right', 'left']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          ref={scrollRef}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="Return to Home"
              accessibilityRole="button"
              onPress={() => router.navigate(APP_ROUTES.home)}
              style={({ pressed }) => [styles.brand, pressed && styles.pressed]}
            >
              <View style={styles.brandMark}>
                <View style={styles.brandMarkInner} />
              </View>
              <Text style={styles.brandName}>PromptSpend</Text>
            </Pressable>
            <GlobalActions
              onAppearance={() => setAppearanceOpen(true)}
              onSearch={() => setCommandOpen(true)}
              onTour={startTour}
            />
          </View>

          <View style={styles.hero}>
            <TourTarget id="receipt-audit" scrollRef={scrollRef} style={styles.heroIntro}>
              <Text style={styles.eyebrow}>PROMPTSPEND RECEIPT · v{RECEIPT_SPEC_VERSION}</Text>
              <Text accessibilityRole="header" style={styles.title}>
                Your prompt has a price tag.
              </Text>
              <Text style={styles.summary}>
                Audit a conversation that already happened, then turn the assistant’s structured answer into a
                private receipt generated on this device.
              </Text>
            </TourTarget>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.navigate(helpHref('receipt-overview'))}
              style={({ pressed }) => [styles.helpButton, pressed && styles.pressed]}
            >
              <Ionicons color={theme.accent} name="help-circle-outline" size={19} />
              <Text style={styles.helpText}>How PromptSpend Receipt works</Text>
            </Pressable>
          </View>

          <Step number="1" styles={styles} title="Send the audit instructions">
            <Text style={styles.body}>
              Open the existing AI conversation you want to audit. Copy or share the instructions below and
              send them as the next message. The instructions explicitly exclude themselves, hidden prompts,
              tools, and private metadata.
            </Text>
            <View style={styles.actionRow}>
              <Action
                icon="copy-outline"
                label="Copy instructions"
                onPress={() => void copyInstructions()}
                primary
                styles={styles}
              />
              <Action
                icon="share-outline"
                label="Share instructions"
                onPress={() => void shareInstructions()}
                styles={styles}
              />
            </View>
          </Step>

          <Step number="2" styles={styles} title="Import the assistant’s share block">
            <Text style={styles.body}>
              Copy only the fenced <Text style={styles.strong}>promptspend-receipt</Text> JSON block from the
              assistant’s answer. PromptSpend validates it locally and never uploads or saves the pasted
              result.
            </Text>
            <TextInput
              accessibilityLabel="Assistant receipt JSON"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={SHARE_RECEIPT_LIMITS.input}
              multiline
              onChangeText={setAssistantResult}
              placeholder={'```promptspend-receipt\n{ "conversation": "47 visible turns", ... }\n```'}
              placeholderTextColor={theme.mutedText}
              style={styles.input}
              value={assistantResult}
            />
            <View style={styles.actionRow}>
              <Action
                icon="clipboard-outline"
                label="Import clipboard"
                onPress={() => void pasteResult()}
                primary
                styles={styles}
              />
              <Action
                icon="download-outline"
                label="Import pasted JSON"
                onPress={() => importResult(assistantResult)}
                styles={styles}
              />
            </View>
          </Step>

          {notice ? (
            <Text accessibilityLiveRegion="polite" style={styles.notice}>
              {notice}
            </Text>
          ) : null}

          <Step number="3" styles={styles} title="Review before sharing">
            <Text style={styles.body}>
              This is an estimate, not an invoice. Unknown models, ranges, unavailable prices, and quality
              caveats remain visible rather than being converted into false precision.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: editing }}
              onPress={() => setEditing((value) => !value)}
              style={({ pressed }) => [styles.editToggle, pressed && styles.pressed]}
            >
              <Text style={styles.editToggleText}>
                {editing ? 'Hide editable fields' : 'Review or edit receipt fields'}
              </Text>
              <Ionicons color={theme.accent} name={editing ? 'chevron-up' : 'chevron-down'} size={20} />
            </Pressable>
            {editing &&
              FIELDS.map(({ key, label }) => (
                <View key={key} style={styles.field}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <TextInput
                    accessibilityLabel={label}
                    maxLength={key === 'note' ? SHARE_RECEIPT_LIMITS.note : SHARE_RECEIPT_LIMITS.field}
                    onChangeText={(value) => setData((current) => ({ ...current, [key]: value }))}
                    style={[styles.fieldInput, key === 'note' && styles.fieldInputMultiline]}
                    multiline={key === 'note'}
                    value={data[key]}
                  />
                </View>
              ))}
          </Step>

          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={receiptAccessibilityLabel(data)}
            style={styles.previewFrame}
          >
            <View collapsable={false} ref={receiptRef} style={styles.receipt}>
              <Text allowFontScaling={false} style={styles.receiptBrand}>
                PROMPTSPEND
              </Text>
              <Text allowFontScaling={false} style={styles.receiptEyebrow}>
                YOUR AI RECEIPT
              </Text>
              <Text allowFontScaling={false} style={styles.receiptTitle}>
                YOUR PROMPT{`\n`}HAS A PRICE TAG.
              </Text>
              {FIELDS.slice(0, 6).map(({ key, label }) => (
                <View key={key} style={styles.receiptRow}>
                  <Text allowFontScaling={false} style={styles.receiptLabel}>
                    {label.toUpperCase()}
                  </Text>
                  <Text allowFontScaling={false} style={styles.receiptValue}>
                    {data[key]}
                  </Text>
                </View>
              ))}
              <View style={styles.difference}>
                <Text allowFontScaling={false} style={styles.receiptLabel}>
                  PRICE DIFFERENCE
                </Text>
                <Text allowFontScaling={false} style={styles.differenceValue}>
                  {data.priceDifference}
                </Text>
              </View>
              <Text allowFontScaling={false} style={styles.receiptNote}>
                {data.note}
              </Text>
              <Text allowFontScaling={false} style={styles.receiptUrl}>
                PROMPTSPEND.COM
              </Text>
            </View>
          </View>

          <View style={styles.shareActions}>
            <Action
              disabled={!imported || sharing}
              icon="image-outline"
              label={sharing ? 'Creating PNG…' : 'Share receipt image'}
              onPress={() => void shareImage()}
              primary
              styles={styles}
            />
            <Action
              disabled={!imported}
              icon="text-outline"
              label="Share readable text"
              onPress={() => void shareText()}
              styles={styles}
            />
          </View>
          {!imported && (
            <Text style={styles.privateNote}>
              Sharing unlocks after a valid assistant result is imported. Nothing on this screen is persisted.
            </Text>
          )}
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              void WebBrowser.openBrowserAsync(RECEIPT_PAGE_URL).catch(() =>
                setNotice('The specification could not open. Check your connection and try again.'),
              )
            }
            style={styles.websiteLink}
          >
            <Text style={styles.helpText}>Open the complete specification and demonstration ↗</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
      <AppearanceSheet onClose={() => setAppearanceOpen(false)} visible={appearanceOpen} />
      {launch.catalogResult?.catalog && (
        <CommandSheet
          catalog={launch.catalogResult.catalog}
          favoriteIds={launch.favorites}
          onClose={() => setCommandOpen(false)}
          onHelp={(id) => router.navigate(helpHref(id))}
          onHome={() => router.navigate(APP_ROUTES.home)}
          onReset={launch.resetScenario}
          onSection={navigateToSection}
          onSelectModel={(id) => {
            launch.setSelectedId(id);
            router.navigate(APP_ROUTES.estimate);
          }}
          onToggleComparison={(id) => {
            const next = toggleComparisonSelection(launch.comparisonIds, id);
            if (next.accepted) launch.setComparisonIds(next.selectedIds);
          }}
          onToggleFavorite={(id) => void launch.toggleFavorite(id)}
          onTour={startTour}
          selectedComparisonIds={launch.comparisonIds}
          visible={commandOpen}
        />
      )}
    </>
  );
}

function Step({
  children,
  number,
  styles,
  title,
}: {
  children: React.ReactNode;
  number: string;
  styles: Styles;
  title: string;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHeader}>
        <View style={styles.stepNumber}>
          <Text style={styles.stepNumberText}>{number}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.stepTitle}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function Action({
  disabled = false,
  icon,
  label,
  onPress,
  primary = false,
  styles,
}: {
  disabled?: boolean;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  primary?: boolean;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        primary && styles.actionPrimary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons color={primary ? '#FFFFFF' : styles.actionText.color} name={icon} size={19} />
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function receiptText(data: ShareReceiptData): string {
  return `PromptSpend Receipt\n\nConversation: ${data.conversation}\nEstimated tokens: ${data.estimatedTokens}\nCurrent model: ${data.currentModel}\nEstimated cost: ${data.estimatedCost}\nLower-cost model to test: ${data.alternativeModel}\nAlternative cost: ${data.alternativeCost}\nPrice difference: ${data.priceDifference}\n\n${data.note}\n\nEstimate, not invoice. promptspend.com`;
}

function receiptAccessibilityLabel(data: ShareReceiptData): string {
  return `PromptSpend Receipt. ${receiptText(data)}`;
}

type Styles = ReturnType<typeof createStyles>;
function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    safeArea: { backgroundColor: theme.background, flex: 1 },
    content: {
      alignSelf: 'center',
      gap: 16,
      maxWidth: 760,
      paddingBottom: 40,
      paddingHorizontal: 18,
      width: '100%',
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      justifyContent: 'space-between',
      paddingTop: 10,
    },
    brand: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 10, minHeight: 48 },
    brandMark: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: 10,
      height: 42,
      justifyContent: 'center',
      width: 42,
    },
    brandMarkInner: { borderColor: theme.onAccent, borderRadius: 3, borderWidth: 2, height: 19, width: 19 },
    brandName: { color: theme.text, flexShrink: 1, fontSize: 21, fontWeight: '900' },
    hero: { gap: 12, paddingVertical: 14 },
    heroIntro: { gap: 12 },
    eyebrow: { color: theme.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
    title: { color: theme.text, fontSize: 38, fontWeight: '900', letterSpacing: -1.2, lineHeight: 44 },
    summary: { color: theme.mutedText, fontSize: 17, lineHeight: 25 },
    helpButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      flexDirection: 'row',
      gap: 7,
      minHeight: 48,
    },
    helpText: { color: theme.accent, fontSize: 14, fontWeight: '800' },
    step: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 13,
      padding: 18,
    },
    stepHeader: { alignItems: 'center', flexDirection: 'row', gap: 11 },
    stepNumber: {
      alignItems: 'center',
      backgroundColor: theme.accentSoft,
      borderRadius: 10,
      height: 34,
      justifyContent: 'center',
      width: 34,
    },
    stepNumberText: { color: theme.accent, fontWeight: '900' },
    stepTitle: { color: theme.text, flex: 1, fontSize: 20, fontWeight: '900', lineHeight: 25 },
    body: { color: theme.mutedText, fontSize: 14, lineHeight: 21 },
    strong: { color: theme.text, fontWeight: '800' },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
    action: {
      alignItems: 'center',
      borderColor: theme.accent,
      borderRadius: 11,
      borderWidth: 1,
      flexDirection: 'row',
      flexGrow: 1,
      gap: 7,
      justifyContent: 'center',
      minHeight: 50,
      minWidth: 180,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    actionPrimary: { backgroundColor: theme.accent },
    actionText: { color: theme.accent, flexShrink: 1, fontSize: 14, fontWeight: '800' },
    actionTextPrimary: { color: theme.onAccent },
    input: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.borderStrong,
      borderRadius: 11,
      borderWidth: 1,
      color: theme.text,
      fontSize: 13,
      lineHeight: 19,
      minHeight: 150,
      padding: 12,
      textAlignVertical: 'top',
    },
    notice: {
      backgroundColor: theme.accentSoft,
      borderRadius: 11,
      color: theme.accent,
      fontSize: 13,
      fontWeight: '800',
      lineHeight: 19,
      padding: 12,
    },
    editToggle: {
      alignItems: 'center',
      borderColor: theme.border,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 48,
      paddingHorizontal: 12,
    },
    editToggleText: { color: theme.accent, flex: 1, fontSize: 14, fontWeight: '800' },
    field: { gap: 6 },
    fieldLabel: { color: theme.text, fontSize: 13, fontWeight: '800' },
    fieldInput: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.borderStrong,
      borderRadius: 9,
      borderWidth: 1,
      color: theme.text,
      minHeight: 46,
      paddingHorizontal: 11,
      paddingVertical: 9,
    },
    fieldInputMultiline: { minHeight: 72, textAlignVertical: 'top' },
    previewFrame: { alignItems: 'center', backgroundColor: '#DCE4F0', borderRadius: 20, padding: 12 },
    receipt: {
      backgroundColor: '#FBFAF7',
      borderRadius: 14,
      gap: 8,
      maxWidth: 520,
      padding: 20,
      width: '100%',
    },
    receiptBrand: { color: '#6D4AFF', fontSize: 17, fontWeight: '900', letterSpacing: 0.4 },
    receiptEyebrow: { color: '#6D4AFF', fontSize: 8, fontWeight: '900', letterSpacing: 1.8, marginTop: 4 },
    receiptTitle: { color: '#171A21', fontSize: 27, fontWeight: '900', letterSpacing: -0.9, lineHeight: 31 },
    receiptRow: {
      borderTopColor: '#D6D2CC',
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 2,
      paddingTop: 7,
    },
    receiptLabel: { color: '#666B76', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
    receiptValue: { color: '#171A21', fontSize: 11, fontWeight: '800', lineHeight: 14 },
    difference: { borderTopColor: '#A8A8AA', borderTopWidth: 1, gap: 2, marginTop: 2, paddingTop: 8 },
    differenceValue: { color: '#6D4AFF', fontSize: 22, fontWeight: '900', lineHeight: 26 },
    receiptNote: { color: '#666B76', fontSize: 8, lineHeight: 11 },
    receiptUrl: { color: '#171A21', fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginTop: 'auto' },
    shareActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
    privateNote: { color: theme.mutedText, fontSize: 12, lineHeight: 18, textAlign: 'center' },
    websiteLink: { alignItems: 'center', minHeight: 48, justifyContent: 'center' },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.68 },
  });
}
