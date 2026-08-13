import { useRouter } from 'expo-router';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Pressable,
  type ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  createContext,
  type PropsWithChildren,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText as Text } from '@/components/AppText';
import { GUIDED_TOUR_STEPS, type GuidedTourStep, type GuidedTourTargetId } from '@/lib/guidedTour';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

interface TargetRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface RegisteredTarget {
  measure: (callback: (rect: TargetRect | null) => void) => void;
  reveal?: () => void;
}

interface GuidedTourValue {
  active: boolean;
  currentTargetId: GuidedTourTargetId | null;
  registerTarget: (id: GuidedTourTargetId, target: RegisteredTarget) => () => void;
  startTour: () => void;
}

const GuidedTourContext = createContext<GuidedTourValue | null>(null);

export function GuidedTourProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const targets = useRef(new Map<GuidedTourTargetId, RegisteredTarget>());
  const step = GUIDED_TOUR_STEPS[stepIndex];

  const registerTarget = useCallback((id: GuidedTourTargetId, target: RegisteredTarget) => {
    targets.current.set(id, target);
    return () => {
      if (targets.current.get(id) === target) targets.current.delete(id);
    };
  }, []);

  const startTour = useCallback(() => {
    setStepIndex(0);
    setTargetRect(null);
    setActive(true);
  }, []);

  const close = useCallback(() => {
    setActive(false);
    setTargetRect(null);
  }, []);

  const move = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0) return;
      if (nextIndex >= GUIDED_TOUR_STEPS.length) {
        close();
        return;
      }
      setStepIndex(nextIndex);
      setTargetRect(null);
    },
    [close],
  );

  useEffect(() => {
    if (!active) return;
    router.navigate(step.route);
    void AccessibilityInfo.announceForAccessibility(
      `Guide step ${stepIndex + 1} of ${GUIDED_TOUR_STEPS.length}. ${step.title}`,
    );

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const locate = () => {
      if (cancelled) return;
      const target = targets.current.get(step.targetId);
      if (!target) {
        attempts += 1;
        if (attempts < 12) timer = setTimeout(locate, 120);
        return;
      }
      target.reveal?.();
      timer = setTimeout(() => {
        target.measure((rect) => {
          if (!cancelled) setTargetRect(rect);
        });
      }, 260);
    };
    timer = setTimeout(locate, 220);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, router, step, stepIndex]);

  const value = useMemo<GuidedTourValue>(
    () => ({ active, currentTargetId: active ? step.targetId : null, registerTarget, startTour }),
    [active, registerTarget, startTour, step.targetId],
  );

  return (
    <GuidedTourContext.Provider value={value}>
      {children}
      <GuidedTourOverlay
        active={active}
        onBack={() => move(stepIndex - 1)}
        onClose={close}
        onNext={() => move(stepIndex + 1)}
        step={step}
        stepIndex={stepIndex}
        targetRect={targetRect}
      />
    </GuidedTourContext.Provider>
  );
}

export function useGuidedTour(): GuidedTourValue {
  const value = useContext(GuidedTourContext);
  if (!value) throw new Error('useGuidedTour must be used within GuidedTourProvider.');
  return value;
}

export function TourTarget({
  children,
  enabled = true,
  id,
  onReveal,
  scrollRef,
}: PropsWithChildren<{
  id: GuidedTourTargetId;
  enabled?: boolean;
  onReveal?: () => void;
  scrollRef?: RefObject<ScrollView | null>;
}>) {
  const { currentTargetId, registerTarget } = useGuidedTour();
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const container = useRef<View>(null);
  const contentY = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    return registerTarget(id, {
      measure: (callback) => {
        container.current?.measureInWindow((x, y, width, height) => {
          callback(width > 0 && height > 0 ? { height, width, x, y } : null);
        });
      },
      reveal: () => {
        onReveal?.();
        const scrollView = scrollRef?.current;
        const target = container.current;
        if (scrollView && target) {
          target.measureLayout(
            scrollView.getInnerViewNode(),
            (_x, y) => scrollView.scrollTo({ animated: true, y: Math.max(0, y - 88) }),
            () => scrollView.scrollTo({ animated: true, y: Math.max(0, contentY.current - 88) }),
          );
        }
      },
    });
  }, [enabled, id, onReveal, registerTarget, scrollRef]);

  const active = enabled && currentTargetId === id;
  return (
    <View
      collapsable={false}
      onLayout={(event) => {
        contentY.current = event.nativeEvent.layout.y;
      }}
      ref={container}
    >
      {children}
      {active && <View pointerEvents="none" style={styles.targetOutline} />}
    </View>
  );
}

function GuidedTourOverlay({
  active,
  onBack,
  onClose,
  onNext,
  step,
  stepIndex,
  targetRect,
}: {
  active: boolean;
  onBack: () => void;
  onClose: () => void;
  onNext: () => void;
  step: GuidedTourStep;
  stepIndex: number;
  targetRect: TargetRect | null;
}) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const card = useRef<View>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      const node = findNodeHandle(card.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 420);
    return () => clearTimeout(timer);
  }, [active, stepIndex]);

  const padded = targetRect ? padAndClamp(targetRect, width, height, 8) : null;
  const placeAtTop = Boolean(padded && padded.y + padded.height > height * 0.6);
  const last = stepIndex === GUIDED_TOUR_STEPS.length - 1;

  return (
    <Modal
      animationType={reduceMotion ? 'none' : 'fade'}
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={active}
    >
      <View style={StyleSheet.absoluteFill}>
        {padded ? (
          <>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.scrim, { height: padded.y, left: 0, right: 0, top: 0 }]}
            />
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.scrim, { bottom: 0, left: 0, right: 0, top: padded.y + padded.height }]}
            />
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.scrim, { height: padded.height, left: 0, top: padded.y, width: padded.x }]}
            />
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.scrim,
                { height: padded.height, left: padded.x + padded.width, right: 0, top: padded.y },
              ]}
            />
            <View pointerEvents="auto" style={[styles.targetBlocker, padded]} />
          </>
        ) : (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[StyleSheet.absoluteFill, styles.scrim]}
          />
        )}

        <View
          accessibilityViewIsModal
          ref={card}
          style={[
            styles.tourCard,
            { left: 16, maxWidth: 620, right: 16 },
            placeAtTop ? { top: insets.top + 16 } : { bottom: insets.bottom + 16 },
          ]}
        >
          <View style={styles.tourHeader}>
            <View style={styles.tourHeaderCopy}>
              <Text style={styles.tourStep}>
                STEP {stepIndex + 1} OF {GUIDED_TOUR_STEPS.length} · {step.section.toUpperCase()}
              </Text>
              <Text accessibilityLiveRegion="polite" accessibilityRole="header" style={styles.tourTitle}>
                {step.title}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Exit guided tour"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.exitButton, pressed && styles.pressed]}
            >
              <Text style={styles.exitText}>Exit</Text>
            </Pressable>
          </View>
          <Text style={styles.tourBody}>{step.body}</Text>
          <View
            accessibilityLabel={`Step ${stepIndex + 1} of ${GUIDED_TOUR_STEPS.length}`}
            style={styles.progressRow}
          >
            {GUIDED_TOUR_STEPS.map((item, index) => (
              <View
                key={item.id}
                style={[styles.progressSegment, index <= stepIndex && styles.progressSegmentActive]}
              />
            ))}
          </View>
          <View style={styles.tourActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: stepIndex === 0 }}
              disabled={stepIndex === 0}
              onPress={onBack}
              style={({ pressed }) => [
                styles.secondaryButton,
                stepIndex === 0 && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onNext}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>{last ? 'Finish tour' : 'Next'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function padAndClamp(rect: TargetRect, width: number, height: number, padding: number): TargetRect {
  const x = Math.min(width, Math.max(0, rect.x - padding));
  const y = Math.min(height, Math.max(0, rect.y - padding));
  return {
    x,
    y,
    width: Math.max(0, Math.min(width - x, rect.width + padding * 2)),
    height: Math.max(0, Math.min(height - y, rect.height + padding * 2)),
  };
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    scrim: { backgroundColor: 'rgba(5, 8, 14, 0.62)', position: 'absolute' },
    targetBlocker: { position: 'absolute' },
    targetOutline: {
      bottom: 0,
      borderColor: theme.accent,
      borderRadius: 18,
      borderWidth: 3,
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
      zIndex: 20,
    },
    tourCard: {
      alignSelf: 'center',
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 18,
      borderWidth: 1,
      padding: 20,
      position: 'absolute',
      shadowColor: '#000000',
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: 0.24,
      shadowRadius: 20,
    },
    tourHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
    tourHeaderCopy: { flex: 1 },
    tourStep: { color: theme.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    tourTitle: { color: theme.text, fontSize: 22, fontWeight: '800', lineHeight: 28, marginTop: 6 },
    tourBody: { color: theme.mutedText, fontSize: 15, lineHeight: 22, marginTop: 12 },
    exitButton: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      minWidth: 52,
      paddingHorizontal: 10,
    },
    exitText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
    progressRow: { flexDirection: 'row', gap: 6, marginTop: 18 },
    progressSegment: { backgroundColor: theme.border, borderRadius: 3, flex: 1, height: 4 },
    progressSegmentActive: { backgroundColor: theme.accent },
    tourActions: { flexDirection: 'row', gap: 12, marginTop: 18 },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: 11,
      flex: 1,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 16,
    },
    primaryButtonText: { color: theme.onAccent, fontSize: 16, fontWeight: '800' },
    secondaryButton: {
      alignItems: 'center',
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.border,
      borderRadius: 11,
      borderWidth: 1,
      flex: 1,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 16,
    },
    secondaryButtonText: { color: theme.text, fontSize: 16, fontWeight: '700' },
    disabled: { opacity: 0.42 },
    pressed: { opacity: 0.72 },
  });
}
