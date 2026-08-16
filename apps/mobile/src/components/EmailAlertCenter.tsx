import Ionicons from '@expo/vector-icons/Ionicons';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { AppText as Text } from '@/components/AppText';
import { TourTarget } from '@/components/GuidedTour';
import {
  alertDraftValidationMessage,
  emailValidationMessage,
  fetchAlertsConfig,
  fetchEmailAlertPreferences,
  requestEmailManagementCode,
  saveEmailAlertPreferences,
  subscribeEmailAlerts,
  unsubscribeEmailAlerts,
  verifyEmailManagementCode,
  type AlertsConfig,
  type EmailAlertDraft,
  type EmailAlertPreferences,
} from '@/lib/emailAlerts';
import {
  isAllowedVerificationUrl,
  isVerificationDocument,
  parseTurnstileMessage,
} from '@/lib/turnstileVerification';
import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';
import type { Catalog, Model } from '@promptspend/core';

const TURNSTILE_PAGE = 'https://api.promptspend.dev/v1/mobile-turnstile';

type Mode = 'subscribe' | 'manage';
type VerificationPurpose = 'manage' | 'subscribe';
type PendingVerification = { nonce: string; purpose: VerificationPurpose };

export function EmailAlertCenter({
  catalog,
  preferencesToken,
  tourScrollRef,
}: {
  catalog: Catalog;
  preferencesToken?: string;
  tourScrollRef?: RefObject<ScrollView | null>;
}) {
  const { isDark, theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [config, setConfig] = useState<AlertsConfig | null>(null);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [mode, setMode] = useState<Mode>(preferencesToken ? 'manage' : 'subscribe');
  const [draft, setDraft] = useState<EmailAlertDraft>({
    cadence: 'weekly',
    email: '',
    models: [],
    scope: 'all',
  });
  const [token, setToken] = useState(preferencesToken ?? '');
  const [preferences, setPreferences] = useState<EmailAlertPreferences | null>(null);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(Boolean(preferencesToken));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [verification, setVerification] = useState<PendingVerification | null>(null);
  const codeInput = useRef<TextInput>(null);
  const verifiedPanel = useRef<View>(null);

  useEffect(() => {
    if (!codeSent) return;
    void AccessibilityInfo.announceForAccessibility(
      'Secure code sent. Enter the six-digit code from your email.',
    );
    const timer = setTimeout(() => codeInput.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [codeSent]);

  useEffect(() => {
    if (!preferences) return;
    void AccessibilityInfo.announceForAccessibility(
      'Identity verified. Alert preferences are ready to update.',
    );
    const timer = setTimeout(() => {
      const node = findNodeHandle(verifiedPanel.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 120);
    return () => clearTimeout(timer);
  }, [preferences]);

  useEffect(() => {
    void AccessibilityInfo.announceForAccessibility(
      mode === 'subscribe' ? 'Start alerts form.' : 'Manage alerts form.',
    );
  }, [mode]);

  useEffect(() => {
    let active = true;
    void fetchAlertsConfig()
      .then((value) => {
        if (active) {
          setConfig(value);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(messageFor(cause));
      });
    return () => {
      active = false;
    };
  }, [configAttempt]);

  useEffect(() => {
    if (!preferencesToken) return;
    void fetchEmailAlertPreferences(preferencesToken)
      .then((value) => {
        setPreferences(value);
        setDraft(draftFromPreferences(value));
        setToken(preferencesToken);
      })
      .catch(() => {
        setToken('');
        setPreferences(null);
        setError('That email link is invalid or expired. Request a new secure code below.');
      })
      .finally(() => setBusy(false));
  }, [preferencesToken]);

  const runWithVerification = (purpose: VerificationPurpose) => {
    setError(null);
    setSuccess(null);
    if (purpose === 'subscribe') {
      const validation = alertDraftValidationMessage(draft);
      if (validation) {
        setError(validation);
        return;
      }
    } else {
      const validation = emailValidationMessage(draft.email);
      if (validation) {
        setError(validation);
        return;
      }
    }
    if (config?.turnstileRequired) {
      if (!config.turnstileSiteKey) {
        setError('Secure verification is temporarily misconfigured. Please try again later.');
        return;
      }
      setVerification({ nonce: createVerificationNonce(), purpose });
    } else void completeVerifiedAction(purpose);
  };

  const completeVerifiedAction = async (purpose: VerificationPurpose, turnstileToken?: string) => {
    setVerification(null);
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (purpose === 'subscribe') {
        await subscribeEmailAlerts(
          { ...draft, email: draft.email.trim(), models: uniqueValidModels(draft.models, catalog) },
          turnstileToken,
        );
        setSuccess(
          `Check ${draft.email.trim()} and tap Confirm my subscription. Nothing else will be sent until you confirm.`,
        );
      } else {
        await requestEmailManagementCode(draft.email.trim(), turnstileToken);
        setCodeSent(true);
        setSuccess('If that address has active PromptSpend alerts, a six-digit code is on its way.');
      }
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the complete six-digit code from the email.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await verifyEmailManagementCode(draft.email.trim(), code);
      setToken(result.token);
      setPreferences(result.preferences);
      setDraft(draftFromPreferences(result.preferences));
      setCode('');
      setCodeSent(false);
      setSuccess('Identity verified. You can now update these alert preferences.');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const validation = alertDraftValidationMessage(draft);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await saveEmailAlertPreferences(token, {
        cadence: draft.cadence,
        models: uniqueValidModels(draft.models, catalog),
        scope: draft.scope,
      });
      setPreferences((current) =>
        current
          ? { ...current, cadence: draft.cadence, models: [...draft.models], scope: draft.scope }
          : current,
      );
      setSuccess('Alert preferences saved.');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = () => {
    Alert.alert(
      'Stop all email alerts?',
      'Your address and followed-model list will be deleted immediately. This cannot be undone.',
      [
        { text: 'Keep alerts', style: 'cancel' },
        {
          text: 'Stop and delete',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            setError(null);
            void unsubscribeEmailAlerts(token)
              .then(() => {
                setToken('');
                setPreferences(null);
                setDraft((current) => ({ ...current, models: [] }));
                setSuccess('Email alerts stopped. The address and followed-model list were deleted.');
              })
              .catch((cause: unknown) => setError(messageFor(cause)))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };

  if (!config) {
    return (
      <View accessibilityLiveRegion="polite" style={styles.statusCard}>
        {error ? (
          <>
            <Ionicons color={theme.warning} name="cloud-offline-outline" size={24} />
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>Alert service unavailable</Text>
              <Text style={styles.body}>{error}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setError(null);
                  setConfigAttempt((current) => current + 1);
                }}
                style={({ pressed }) => [styles.inlineRetry, pressed && styles.pressed]}
              >
                <Text style={styles.linkText}>Try again</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <ActivityIndicator color={theme.accent} />
            <Text style={styles.body}>Checking the secure alerts service…</Text>
          </>
        )}
      </View>
    );
  }

  if (config && !config.emailEnabled) {
    return (
      <View style={styles.statusCard}>
        <Ionicons color={theme.warning} name="mail-unread-outline" size={24} />
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>Email alerts are temporarily unavailable</Text>
          <Text style={styles.body}>
            The app will offer setup here as soon as the sending service is healthy.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <TourTarget id="data-alerts" scrollRef={tourScrollRef}>
        <View style={styles.centerHeader}>
          <View style={styles.iconWell}>
            <Ionicons color={theme.accent} name="notifications-outline" size={24} />
          </View>
          <View style={styles.flex}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              Email Alert Center
            </Text>
            <Text style={styles.body}>Private price intelligence, configured without leaving the app.</Text>
          </View>
        </View>
      </TourTarget>

      {!preferences && (
        <View accessibilityRole="tablist" style={styles.modeTabs}>
          <ModeTab
            active={mode === 'subscribe'}
            label="Start alerts"
            onPress={() => switchMode('subscribe', setMode, setError, setSuccess)}
            styles={styles}
          />
          <ModeTab
            active={mode === 'manage'}
            label="Manage alerts"
            onPress={() => switchMode('manage', setMode, setError, setSuccess)}
            styles={styles}
          />
        </View>
      )}

      {mode === 'subscribe' && !preferences && (
        <>
          <Text style={styles.intro}>
            Get a weekly pricing brief or hear when a price changes. Double opt-in, one-click unsubscribe, no
            tracking pixels, and no click tracking.
          </Text>
          <EmailField
            editable={!busy}
            onChange={(email) => setDraft((current) => ({ ...current, email }))}
            styles={styles}
            theme={theme}
            value={draft.email}
          />
          <AlertPreferences
            catalog={catalog}
            draft={draft}
            onChange={setDraft}
            onOpenPicker={() => setPickerOpen(true)}
            styles={styles}
          />
          <PrivacyPromise styles={styles} />
          <PrimaryButton
            busy={busy}
            label="Send confirmation email"
            onPress={() => runWithVerification('subscribe')}
            styles={styles}
          />
        </>
      )}

      {mode === 'manage' && !preferences && (
        <>
          <Text style={styles.intro}>
            Enter the subscribed address. We will email a short-lived code so no password or PromptSpend
            account is needed.
          </Text>
          <EmailField
            editable={!busy && !codeSent}
            onChange={(email) => setDraft((current) => ({ ...current, email }))}
            styles={styles}
            theme={theme}
            value={draft.email}
          />
          {!codeSent ? (
            <PrimaryButton
              busy={busy}
              label="Email my secure code"
              onPress={() => runWithVerification('manage')}
              styles={styles}
            />
          ) : (
            <>
              <Text style={styles.label}>Six-digit code</Text>
              <TextInput
                accessibilityHint="The code expires in ten minutes and works once"
                accessibilityLabel="Six-digit management code"
                autoComplete="one-time-code"
                editable={!busy}
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                placeholderTextColor={theme.mutedText}
                ref={codeInput}
                style={[styles.input, styles.codeInput]}
                textContentType="oneTimeCode"
                value={code}
              />
              <PrimaryButton
                busy={busy}
                label="Verify and open preferences"
                onPress={() => void verifyCode()}
                styles={styles}
              />
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => runWithVerification('manage')}
                style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
              >
                <Text style={styles.linkText}>Send a new code</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  setCodeSent(false);
                  setCode('');
                  setSuccess(null);
                }}
                style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
              >
                <Text style={styles.linkText}>Use a different address</Text>
              </Pressable>
            </>
          )}
        </>
      )}

      {preferences && (
        <>
          <View accessible ref={verifiedPanel} style={styles.verifiedRow}>
            <Ionicons color={theme.savings} name="shield-checkmark" size={22} />
            <View style={styles.flex}>
              <Text style={styles.verifiedLabel}>Verified subscription</Text>
              <Text selectable style={styles.body}>
                {preferences.email}
              </Text>
            </View>
          </View>
          <AlertPreferences
            catalog={catalog}
            draft={draft}
            onChange={setDraft}
            onOpenPicker={() => setPickerOpen(true)}
            styles={styles}
          />
          <PrimaryButton
            busy={busy}
            label="Save alert preferences"
            onPress={() => void save()}
            styles={styles}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={unsubscribe}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
          >
            <Text style={styles.deleteText}>Stop alerts and delete my address</Text>
          </Pressable>
        </>
      )}

      {error && (
        <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {success && (
        <Text accessibilityLiveRegion="polite" style={styles.success}>
          {success}
        </Text>
      )}

      <ModelAlertPicker
        catalog={catalog}
        onChange={(models) => setDraft((current) => ({ ...current, models }))}
        onClose={() => setPickerOpen(false)}
        selectedIds={draft.models}
        visible={pickerOpen}
      />
      {config?.turnstileRequired && config.turnstileSiteKey && verification && (
        <TurnstileSheet
          dark={isDark}
          onCancel={() => setVerification(null)}
          onError={(message) => {
            setVerification(null);
            setError(message);
          }}
          onToken={(value) => void completeVerifiedAction(verification.purpose, value)}
          nonce={verification.nonce}
          siteKey={config.turnstileSiteKey}
        />
      )}
    </View>
  );
}

function AlertPreferences({
  catalog,
  draft,
  onChange,
  onOpenPicker,
  styles,
}: {
  catalog: Catalog;
  draft: EmailAlertDraft;
  onChange: (value: EmailAlertDraft) => void;
  onOpenPicker: () => void;
  styles: Styles;
}) {
  return (
    <>
      <Text style={styles.label}>How often</Text>
      <View accessibilityRole="radiogroup" style={styles.choiceStack}>
        <ChoiceCard
          checked={draft.cadence === 'weekly'}
          description="A concise Monday brief—even when the week is quiet."
          label="Weekly brief"
          onPress={() => onChange({ ...draft, cadence: 'weekly' })}
          styles={styles}
        />
        <ChoiceCard
          checked={draft.cadence === 'instant'}
          description="An email whenever a selected model’s published price moves."
          label="As prices change"
          onPress={() => onChange({ ...draft, cadence: 'instant' })}
          styles={styles}
        />
      </View>
      <Text style={styles.label}>What to watch</Text>
      <View accessibilityRole="radiogroup" style={styles.choiceStack}>
        <ChoiceCard
          checked={draft.scope === 'all'}
          description={`All ${catalog.primaryModels.length} current models in the validated catalog.`}
          label="Every model"
          onPress={() => onChange({ ...draft, models: [], scope: 'all' })}
          styles={styles}
        />
        <ChoiceCard
          checked={draft.scope === 'followed'}
          description={
            draft.models.length === 0
              ? 'Choose the models that matter to your work.'
              : `${draft.models.length} selected model${draft.models.length === 1 ? '' : 's'}.`
          }
          label="Only selected models"
          onPress={() => {
            onChange({ ...draft, scope: 'followed' });
            onOpenPicker();
          }}
          styles={styles}
        />
      </View>
      {draft.scope === 'followed' && (
        <Pressable
          accessibilityHint="Opens the searchable model selection sheet"
          accessibilityRole="button"
          onPress={onOpenPicker}
          style={({ pressed }) => [styles.modelButton, pressed && styles.pressed]}
        >
          <Ionicons color={styles.modelButtonText.color} name="options-outline" size={20} />
          <Text style={styles.modelButtonText}>
            {draft.models.length === 0 ? 'Choose models' : `Edit ${draft.models.length} selected`}
          </Text>
        </Pressable>
      )}
    </>
  );
}

function ChoiceCard({
  checked,
  description,
  label,
  onPress,
  styles,
}: {
  checked: boolean;
  description: string;
  label: string;
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, checked && styles.choiceActive, pressed && styles.pressed]}
    >
      <Ionicons
        color={checked ? styles.choiceLabelActive.color : styles.choiceLabel.color}
        name={checked ? 'radio-button-on' : 'radio-button-off'}
        size={22}
      />
      <View style={styles.flex}>
        <Text style={[styles.choiceLabel, checked && styles.choiceLabelActive]}>{label}</Text>
        <Text style={styles.choiceDescription}>{description}</Text>
      </View>
    </Pressable>
  );
}

function EmailField({
  editable,
  onChange,
  styles,
  theme,
  value,
}: {
  editable: boolean;
  onChange: (value: string) => void;
  styles: Styles;
  theme: MobileTheme;
  value: string;
}) {
  return (
    <>
      <Text style={styles.label}>Email address</Text>
      <TextInput
        accessibilityLabel="Email address for price alerts"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        editable={editable}
        inputMode="email"
        keyboardType="email-address"
        maxLength={254}
        onChangeText={onChange}
        placeholder="you@example.com"
        placeholderTextColor={theme.mutedText}
        style={styles.input}
        textContentType="emailAddress"
        value={value}
      />
    </>
  );
}

function PrivacyPromise({ styles }: { styles: Styles }) {
  return (
    <View style={styles.privacyCard}>
      <Ionicons color={styles.privacyTitle.color} name="lock-closed-outline" size={20} />
      <View style={styles.flex}>
        <Text style={styles.privacyTitle}>The minimum data needed</Text>
        <Text style={styles.privacyText}>
          The alert service stores the address, selected models, cadence, and consent date. No name, prompt
          text, opens, clicks, advertising ID, or behavioral profile.
        </Text>
      </View>
    </View>
  );
}

function PrimaryButton({
  busy,
  label,
  onPress,
  styles,
}: {
  busy: boolean;
  label: string;
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, busy && styles.disabled, pressed && styles.pressed]}
    >
      {busy ? (
        <ActivityIndicator color={styles.primaryButtonText.color} />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function ModeTab({
  active,
  label,
  onPress,
  styles,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.modeTab, active && styles.modeTabActive, pressed && styles.pressed]}
    >
      <Text style={[styles.modeTabText, active && styles.modeTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ModelAlertPicker({
  catalog,
  onChange,
  onClose,
  selectedIds,
  visible,
}: {
  catalog: Catalog;
  onChange: (ids: string[]) => void;
  onClose: () => void;
  selectedIds: string[];
  visible: boolean;
}) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [query, setQuery] = useState('');
  const selected = new Set(selectedIds);
  const visibleModels = catalog.primaryModels.filter((model) =>
    modelSearchText(catalog, model).includes(query.trim().toLowerCase()),
  );
  const toggle = (id: string) =>
    onChange(
      selected.has(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id].slice(0, 40),
    );
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.modalPage}>
        <View style={styles.modalHeader}>
          <View style={styles.flex}>
            <Text style={styles.modalEyebrow}>PRICE ALERTS</Text>
            <Text accessibilityRole="header" style={styles.modalTitle}>
              Choose models
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.doneButton}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.selectionCount}>
          {selectedIds.length} selected · maximum 40
        </Text>
        <TextInput
          accessibilityLabel="Search models for alerts"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder="Search model or provider…"
          placeholderTextColor={theme.mutedText}
          style={styles.searchInput}
          value={query}
        />
        <ScrollView contentContainerStyle={styles.modelList} keyboardShouldPersistTaps="handled">
          {visibleModels.map((model) => {
            const checked = selected.has(model.id);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled: !checked && selectedIds.length >= 40 }}
                disabled={!checked && selectedIds.length >= 40}
                key={model.id}
                onPress={() => toggle(model.id)}
                style={({ pressed }) => [
                  styles.modelRow,
                  checked && styles.modelRowActive,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.flex}>
                  <Text style={styles.modelName}>{model.displayName}</Text>
                  <Text style={styles.modelProvider}>{catalog.providerName(model)}</Text>
                </View>
                <Ionicons
                  color={checked ? theme.accent : theme.mutedText}
                  name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                />
              </Pressable>
            );
          })}
          {visibleModels.length === 0 && <Text style={styles.empty}>No model matches “{query}”.</Text>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function TurnstileSheet({
  dark,
  nonce,
  onCancel,
  onError,
  onToken,
  siteKey,
}: {
  dark: boolean;
  nonce: string;
  onCancel: () => void;
  onError: (message: string) => void;
  onToken: (token: string) => void;
  siteKey: string;
}) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const url = `${TURNSTILE_PAGE}?sitekey=${encodeURIComponent(siteKey)}&theme=${dark ? 'dark' : 'light'}&nonce=${encodeURIComponent(nonce)}`;
  const handleMessage = (event: WebViewMessageEvent) => {
    if (!isVerificationDocument(event.nativeEvent.url)) {
      onError('The secure verification response came from an unexpected page.');
      return;
    }
    const value = parseTurnstileMessage(event.nativeEvent.data, nonce);
    if (value.kind === 'token') onToken(value.token);
    if (value.kind === 'expired') onError('The secure check expired. Please complete a new verification.');
    if (value.kind === 'error')
      onError('The secure anti-abuse check could not be completed. Check the network and try again.');
    if (value.kind === 'invalid') onError(value.message);
  };
  return (
    <Modal animationType="slide" onRequestClose={onCancel} presentationStyle="pageSheet" visible>
      <SafeAreaView style={styles.modalPage}>
        <View style={styles.modalHeader}>
          <View style={styles.flex}>
            <Text style={styles.modalEyebrow}>SECURE CHECK</Text>
            <Text accessibilityRole="header" style={styles.modalTitle}>
              Confirm you’re human
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.doneButton}>
            <Text style={styles.doneText}>Cancel</Text>
          </Pressable>
        </View>
        <View style={styles.verificationCopy}>
          <Ionicons color={theme.information} name="shield-checkmark-outline" size={24} />
          <Text style={styles.body}>
            This protects the sending service from automated abuse. Your email address, model choices, and
            prompt text are never loaded into this verification view.
          </Text>
        </View>
        <WebView
          accessibilityLabel="Cloudflare secure anti-abuse verification"
          allowsInlineMediaPlayback
          cacheEnabled={false}
          domStorageEnabled
          incognito
          javaScriptEnabled
          mixedContentMode="never"
          onError={() => onError('The secure anti-abuse check could not load.')}
          onHttpError={() => onError('The secure anti-abuse check could not load.')}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={(request) => isAllowedVerificationUrl(request.url)}
          originWhitelist={['https://api.promptspend.dev', 'https://challenges.cloudflare.com', 'about:*']}
          setSupportMultipleWindows={false}
          source={{ uri: url }}
          style={styles.webView}
          thirdPartyCookiesEnabled
        />
      </SafeAreaView>
    </Modal>
  );
}

function switchMode(
  mode: Mode,
  setMode: (mode: Mode) => void,
  setError: (value: string | null) => void,
  setSuccess: (value: string | null) => void,
) {
  setMode(mode);
  setError(null);
  setSuccess(null);
}
function draftFromPreferences(value: EmailAlertPreferences): EmailAlertDraft {
  return { cadence: value.cadence, email: value.email, models: [...value.models], scope: value.scope };
}
function uniqueValidModels(ids: readonly string[], catalog: Catalog): string[] {
  return [...new Set(ids)].filter((id) => catalog.get(id) !== undefined).slice(0, 40);
}
function modelSearchText(catalog: Catalog, model: Model): string {
  return `${model.displayName} ${catalog.providerName(model)} ${model.id}`.toLowerCase();
}
function createVerificationNonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
function messageFor(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong. Please try again.';
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    center: {
      backgroundColor: theme.surface,
      borderColor: theme.borderStrong,
      borderRadius: 16,
      borderWidth: 1,
      gap: 14,
      padding: 18,
    },
    centerHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    iconWell: {
      alignItems: 'center',
      backgroundColor: theme.accentSoft,
      borderRadius: 12,
      height: 46,
      justifyContent: 'center',
      width: 46,
    },
    flex: { flex: 1 },
    cardTitle: { color: theme.text, fontSize: 19, fontWeight: '800', lineHeight: 24 },
    body: { color: theme.mutedText, fontSize: 14, lineHeight: 21 },
    intro: { color: theme.text, fontSize: 15, lineHeight: 23 },
    modeTabs: { backgroundColor: theme.surfaceRaised, borderRadius: 12, flexDirection: 'row', padding: 4 },
    modeTab: {
      alignItems: 'center',
      borderRadius: 9,
      flex: 1,
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 10,
    },
    modeTabActive: { backgroundColor: theme.surface, borderColor: theme.borderStrong, borderWidth: 1 },
    modeTabText: { color: theme.mutedText, fontSize: 14, fontWeight: '700' },
    modeTabTextActive: { color: theme.accent },
    label: { color: theme.text, fontSize: 14, fontWeight: '800', marginTop: 4 },
    input: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.borderStrong,
      borderRadius: 11,
      borderWidth: 1,
      color: theme.text,
      fontSize: 16,
      minHeight: 50,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    codeInput: {
      fontFamily: Platform.select({ ios: 'JetBrainsMono-Regular', android: 'JetBrains Mono' }),
      fontSize: 24,
      letterSpacing: 8,
      textAlign: 'center',
    },
    choiceStack: { gap: 8 },
    choice: {
      alignItems: 'flex-start',
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.borderStrong,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      minHeight: 64,
      padding: 12,
    },
    choiceActive: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
    choiceLabel: { color: theme.text, fontSize: 15, fontWeight: '800' },
    choiceLabelActive: { color: theme.accent },
    choiceDescription: { color: theme.mutedText, fontSize: 13, lineHeight: 19, marginTop: 2 },
    modelButton: {
      alignItems: 'center',
      borderColor: theme.accent,
      borderRadius: 11,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 14,
    },
    modelButtonText: { color: theme.accent, fontSize: 15, fontWeight: '800' },
    privacyCard: {
      alignItems: 'flex-start',
      backgroundColor: theme.accentSoft,
      borderRadius: 12,
      flexDirection: 'row',
      gap: 10,
      padding: 13,
    },
    privacyTitle: { color: theme.accent, fontSize: 14, fontWeight: '800' },
    privacyText: { color: theme.mutedText, fontSize: 12, lineHeight: 18, marginTop: 3 },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: 11,
      justifyContent: 'center',
      minHeight: 50,
      paddingHorizontal: 16,
    },
    primaryButtonText: { color: theme.onAccent, fontSize: 16, fontWeight: '800' },
    linkButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
    inlineRetry: { alignItems: 'flex-start', justifyContent: 'center', minHeight: 44 },
    linkText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
    verifiedRow: {
      alignItems: 'center',
      backgroundColor: theme.surfaceRaised,
      borderRadius: 12,
      flexDirection: 'row',
      gap: 10,
      padding: 12,
    },
    verifiedLabel: { color: theme.savings, fontSize: 13, fontWeight: '800' },
    deleteButton: {
      alignItems: 'center',
      borderColor: theme.danger,
      borderRadius: 11,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 14,
    },
    deleteText: { color: theme.danger, fontSize: 14, fontWeight: '800' },
    error: {
      backgroundColor: `${theme.danger}18`,
      borderRadius: 10,
      color: theme.danger,
      fontSize: 13,
      lineHeight: 19,
      padding: 12,
    },
    success: {
      backgroundColor: `${theme.savings}18`,
      borderRadius: 10,
      color: theme.savings,
      fontSize: 13,
      lineHeight: 19,
      padding: 12,
    },
    statusCard: {
      alignItems: 'center',
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.borderStrong,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 16,
    },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.72 },
    modalPage: { backgroundColor: theme.background, flex: 1 },
    modalHeader: {
      alignItems: 'center',
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 18,
    },
    modalEyebrow: { color: theme.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
    modalTitle: { color: theme.text, fontSize: 24, fontWeight: '800', lineHeight: 30 },
    doneButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 54 },
    doneText: { color: theme.accent, fontSize: 15, fontWeight: '800' },
    selectionCount: { color: theme.mutedText, fontSize: 13, paddingHorizontal: 18, paddingTop: 12 },
    searchInput: {
      backgroundColor: theme.surface,
      borderColor: theme.borderStrong,
      borderRadius: 11,
      borderWidth: 1,
      color: theme.text,
      fontSize: 16,
      margin: 14,
      minHeight: 48,
      paddingHorizontal: 14,
    },
    modelList: { gap: 8, padding: 14, paddingBottom: 40 },
    modelRow: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderColor: theme.borderStrong,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      minHeight: 64,
      padding: 13,
    },
    modelRowActive: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
    modelName: { color: theme.text, fontSize: 15, fontWeight: '800' },
    modelProvider: { color: theme.mutedText, fontSize: 12, marginTop: 3 },
    empty: { color: theme.mutedText, fontSize: 14, padding: 24, textAlign: 'center' },
    verificationCopy: {
      alignItems: 'flex-start',
      backgroundColor: theme.surface,
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 18,
    },
    webView: { backgroundColor: theme.background, flex: 1 },
  });
}

type Styles = ReturnType<typeof createStyles>;
