import Ionicons from '@expo/vector-icons/Ionicons';
import * as Sharing from 'expo-sharing';
import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import type { Catalog, ComparisonRow } from '@promptspend/core';

import {
  buildCostReceiptData,
  costReceiptAccessibilityLabel,
  type CostReceiptInput,
} from '@/lib/costReceipt';
import type { PromptFieldKey } from '@/lib/promptInput';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface CostReceiptSheetProps {
  batchEnabled: boolean;
  cacheShare: number;
  catalog: Catalog;
  conversationsPerDay: number;
  onClose: () => void;
  outputTokens: number;
  pastedFields: readonly PromptFieldKey[];
  reasoningMultiplier: number;
  rows: readonly ComparisonRow[];
  systemTokens: number;
  turns: number;
  userTokens: number;
  visible: boolean;
}

export function CostReceiptSheet(props: CostReceiptSheetProps) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const receiptRef = useRef<View>(null);
  const [sharingImage, setSharingImage] = useState(false);
  const receiptInput: CostReceiptInput = props;
  const receipt = useMemo(() => buildCostReceiptData(receiptInput), [receiptInput]);

  const shareImage = async () => {
    if (!receipt || !receiptRef.current || sharingImage) return;
    setSharingImage(true);
    try {
      if (Platform.OS === 'web') {
        Alert.alert(
          'Image sharing is available in the installed app',
          'The web preview cannot share a local image file. Use readable text here, or open PromptSpend on iOS or Android.',
        );
        return;
      }
      if (!(await Sharing.isAvailableAsync())) throw new Error('The system file share menu is unavailable.');
      const pixelRatio = PixelRatio.get();
      const uri = await captureRef(receiptRef, {
        fileName: `promptspend-cost-receipt-${Date.now()}`,
        format: 'png',
        height: 1350 / pixelRatio,
        quality: 1,
        result: 'tmpfile',
        width: 1080 / pixelRatio,
      });
      await Sharing.shareAsync(uri, {
        dialogTitle: 'Share PromptSpend AI Cost Receipt',
        mimeType: 'image/png',
        UTI: 'public.png',
      });
    } catch (error) {
      Alert.alert(
        'Cost Receipt sharing is unavailable',
        error instanceof Error ? error.message : 'The receipt image could not be created.',
      );
    } finally {
      setSharingImage(false);
    }
  };

  const shareText = async () => {
    if (!receipt) return;
    try {
      await Share.share({ message: receipt.shareText, title: 'PromptSpend AI Cost Receipt' });
    } catch {
      Alert.alert('Text sharing is unavailable', 'The system share menu could not open.');
    }
  };

  return (
    <Modal
      accessibilityLabel="AI Cost Receipt preview"
      animationType="slide"
      onRequestClose={props.onClose}
      presentationStyle="pageSheet"
      visible={props.visible}
    >
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>SHAREABLE ARTIFACT</Text>
            <Text accessibilityRole="header" style={styles.title}>
              AI Cost Receipt
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close Cost Receipt"
            accessibilityRole="button"
            onPress={props.onClose}
            style={styles.close}
          >
            <Ionicons color={theme.text} name="close" size={24} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>
            Preview exactly what will be shared. Raw prompt text, names, device identifiers, and tracking
            metadata are excluded.
          </Text>

          {receipt ? (
            <View
              accessible
              accessibilityLabel={costReceiptAccessibilityLabel(receipt)}
              accessibilityRole="image"
              style={styles.previewFrame}
            >
              <View collapsable={false} ref={receiptRef} style={styles.receipt}>
                <View style={styles.receiptTop}>
                  <View style={styles.brandMark}>
                    <View style={styles.brandMarkInner} />
                  </View>
                  <View style={styles.brandCopy}>
                    <Text allowFontScaling={false} style={styles.brand}>
                      PromptSpend
                    </Text>
                    <Text allowFontScaling={false} style={styles.brandSubhead}>
                      AI COST INTELLIGENCE
                    </Text>
                  </View>
                  <View style={styles.verifiedBadge}>
                    <View style={styles.verifiedDot} />
                    <Text allowFontScaling={false} style={styles.verifiedText}>
                      VERIFIED DATA
                    </Text>
                  </View>
                </View>

                <Text allowFontScaling={false} style={styles.receiptEyebrow}>
                  {receipt.isComparison ? 'COST COMPARISON' : 'COST ESTIMATE'}
                </Text>
                <Text allowFontScaling={false} numberOfLines={2} style={styles.receiptTitle}>
                  {receipt.title}
                </Text>
                <Text allowFontScaling={false} style={styles.receiptHeadline}>
                  {receipt.headline}
                </Text>

                <View style={styles.receiptRows}>
                  {receipt.rows.map((row, index) => (
                    <View
                      key={`${row.modelName}-${index}`}
                      style={[styles.receiptRow, row.isLowest && styles.receiptRowLowest]}
                    >
                      <View style={styles.rank}>
                        <Text allowFontScaling={false} style={styles.rankText}>
                          {index + 1}
                        </Text>
                      </View>
                      <View style={styles.receiptRowCopy}>
                        <View style={styles.modelLine}>
                          <Text allowFontScaling={false} numberOfLines={1} style={styles.receiptModel}>
                            {row.modelName}
                          </Text>
                          {row.isLowest && receipt.isComparison && (
                            <Text allowFontScaling={false} style={styles.lowest}>
                              LOWEST
                            </Text>
                          )}
                        </View>
                        <Text allowFontScaling={false} style={styles.receiptProvider}>
                          {row.providerName} · {row.perConversation}
                        </Text>
                      </View>
                      <View style={styles.receiptPriceBlock}>
                        <Text allowFontScaling={false} style={styles.receiptMonthly}>
                          {row.monthly}
                        </Text>
                        <Text allowFontScaling={false} style={styles.receiptYearly}>
                          {row.deltaLabel ?? row.yearly}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                {receipt.savingsLabel && (
                  <View style={styles.savingsStrip}>
                    <Ionicons color="#0B6B3A" name="sparkles" size={15} />
                    <Text allowFontScaling={false} style={styles.savingsText}>
                      {receipt.savingsLabel}
                    </Text>
                  </View>
                )}

                <View style={styles.assumptions}>
                  <Text allowFontScaling={false} style={styles.assumptionTitle}>
                    SCENARIO BASIS
                  </Text>
                  {receipt.assumptionLines.map((line) => (
                    <Text allowFontScaling={false} key={line} style={styles.assumptionLine}>
                      • {line}
                    </Text>
                  ))}
                </View>

                <View style={styles.receiptFooter}>
                  <View style={styles.footerCopy}>
                    <Text allowFontScaling={false} style={styles.freshness}>
                      {receipt.freshnessLabel}
                    </Text>
                    <Text allowFontScaling={false} numberOfLines={2} style={styles.privacy}>
                      {receipt.privacyLine}
                    </Text>
                  </View>
                  <Text allowFontScaling={false} style={styles.url}>
                    promptspend.com
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <Text accessibilityRole="alert" style={styles.intro}>
              Choose at least one model before creating a receipt.
            </Text>
          )}

          <View style={styles.actions}>
            <Pressable
              accessibilityHint="Creates a local PNG and opens the system share sheet"
              accessibilityRole="button"
              accessibilityState={{ busy: sharingImage, disabled: !receipt || sharingImage }}
              disabled={!receipt || sharingImage}
              onPress={() => void shareImage()}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
                (!receipt || sharingImage) && styles.disabled,
              ]}
            >
              <Ionicons color={theme.onAccent} name="image-outline" size={20} />
              <Text style={styles.primaryButtonText}>
                {sharingImage ? 'Creating PNG…' : 'Share receipt image'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityHint="Shares the same result as readable plain text"
              accessibilityRole="button"
              disabled={!receipt}
              onPress={() => void shareText()}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
                !receipt && styles.disabled,
              ]}
            >
              <Ionicons color={theme.accent} name="text-outline" size={20} />
              <Text style={styles.secondaryButtonText}>Share readable text</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    safeArea: { backgroundColor: theme.background, flex: 1 },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    headerCopy: { flex: 1 },
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
    content: { alignItems: 'center', gap: 16, paddingBottom: 32, paddingHorizontal: 18 },
    intro: {
      alignSelf: 'center',
      color: theme.mutedText,
      fontSize: 13,
      lineHeight: 19,
      maxWidth: 640,
      width: '100%',
    },
    previewFrame: {
      alignItems: 'center',
      alignSelf: 'stretch',
      backgroundColor: '#DCE4F0',
      borderRadius: 20,
      maxWidth: 520,
      padding: 12,
      width: '100%',
    },
    receipt: {
      aspectRatio: 0.8,
      backgroundColor: '#F8FAFD',
      borderRadius: 14,
      gap: 10,
      overflow: 'hidden',
      padding: 18,
      width: '100%',
    },
    receiptTop: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    brandMark: {
      alignItems: 'center',
      backgroundColor: '#2456E6',
      borderRadius: 8,
      height: 30,
      justifyContent: 'center',
      width: 30,
    },
    brandMarkInner: { borderColor: '#FFFFFF', borderRadius: 3, borderWidth: 2, height: 14, width: 14 },
    brandCopy: { flex: 1 },
    brand: { color: '#15181D', fontSize: 14, fontWeight: '900' },
    brandSubhead: { color: '#5F6B78', fontSize: 6, fontWeight: '800', letterSpacing: 1.1 },
    verifiedBadge: {
      alignItems: 'center',
      backgroundColor: '#E7F6EE',
      borderRadius: 8,
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 5,
    },
    verifiedDot: { backgroundColor: '#0E7B43', borderRadius: 4, height: 6, width: 6 },
    verifiedText: { color: '#0B6B3A', fontSize: 6, fontWeight: '900', letterSpacing: 0.6 },
    receiptEyebrow: { color: '#2456E6', fontSize: 8, fontWeight: '900', letterSpacing: 1.3, marginTop: 4 },
    receiptTitle: { color: '#15181D', fontSize: 22, fontWeight: '900', letterSpacing: -0.7, lineHeight: 25 },
    receiptHeadline: {
      color: '#2456E6',
      fontSize: 27,
      fontVariant: ['tabular-nums'],
      fontWeight: '900',
      letterSpacing: -0.8,
      lineHeight: 31,
    },
    receiptRows: { gap: 5 },
    receiptRow: {
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      borderColor: '#E1E6EE',
      borderRadius: 9,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 7,
      minHeight: 45,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    receiptRowLowest: { backgroundColor: '#EDF2FF', borderColor: '#AFC0F6' },
    rank: {
      alignItems: 'center',
      backgroundColor: '#E9EDF4',
      borderRadius: 6,
      height: 24,
      justifyContent: 'center',
      width: 24,
    },
    rankText: { color: '#344054', fontSize: 9, fontWeight: '900' },
    receiptRowCopy: { flex: 1, minWidth: 0 },
    modelLine: { alignItems: 'center', flexDirection: 'row', gap: 4 },
    receiptModel: { color: '#15181D', flexShrink: 1, fontSize: 10, fontWeight: '900' },
    lowest: {
      backgroundColor: '#2456E6',
      borderRadius: 5,
      color: '#FFFFFF',
      fontSize: 5,
      fontWeight: '900',
      letterSpacing: 0.5,
      paddingHorizontal: 4,
      paddingVertical: 2,
    },
    receiptProvider: { color: '#667085', fontSize: 6.5, lineHeight: 9 },
    receiptPriceBlock: { alignItems: 'flex-end' },
    receiptMonthly: { color: '#15181D', fontSize: 10, fontVariant: ['tabular-nums'], fontWeight: '900' },
    receiptYearly: { color: '#667085', fontSize: 6.5, fontVariant: ['tabular-nums'] },
    savingsStrip: {
      alignItems: 'center',
      backgroundColor: '#E7F6EE',
      borderRadius: 8,
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 9,
      paddingVertical: 7,
    },
    savingsText: { color: '#0B6B3A', flex: 1, fontSize: 7.5, fontWeight: '800' },
    assumptions: { backgroundColor: '#F0F3F8', borderRadius: 8, gap: 2, padding: 8 },
    assumptionTitle: { color: '#344054', fontSize: 6, fontWeight: '900', letterSpacing: 0.9 },
    assumptionLine: { color: '#475467', fontSize: 7, lineHeight: 10 },
    receiptFooter: {
      alignItems: 'flex-end',
      borderTopColor: '#DCE2EB',
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: 8,
      marginTop: 'auto',
      paddingTop: 8,
    },
    footerCopy: { flex: 1 },
    freshness: { color: '#344054', fontSize: 6.5, fontWeight: '800' },
    privacy: { color: '#667085', fontSize: 5.8, lineHeight: 8 },
    url: { color: '#2456E6', fontSize: 7.5, fontWeight: '900' },
    actions: { alignSelf: 'center', gap: 8, maxWidth: 640, width: '100%' },
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
    primaryButtonText: { color: theme.onAccent, fontSize: 15, fontWeight: '900' },
    secondaryButton: {
      alignItems: 'center',
      borderColor: theme.accent,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      minHeight: 52,
      paddingHorizontal: 16,
    },
    secondaryButtonText: { color: theme.accent, fontSize: 15, fontWeight: '800' },
    pressed: { opacity: 0.68 },
    disabled: { opacity: 0.45 },
  });
}
