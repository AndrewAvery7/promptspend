import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/AppText';
import { type Catalog, formatRate } from '@promptspend/core';

import type { MobileTheme } from '@/theme/tokens';
import { useMobileTheme } from '@/theme/useMobileTheme';

const REPO_URL = 'https://github.com/AndrewAvery7/promptspend';
const FEED_URL = `${REPO_URL}/commits/main/public/data/pricing.json.atom`;
const SITE_URL = 'https://promptspend.com/';
const HEALTH_URL = `${SITE_URL}data/sync-status.json`;
const DEVELOPER_HUB_URL = 'https://promptspend.dev';
const MCP_URL = 'https://www.npmjs.com/package/@promptspend/mcp';
const VSCODE_URL = 'https://marketplace.visualstudio.com/items?itemName=promptspend.promptspend';
const OPEN_VSX_URL = 'https://open-vsx.org/extension/promptspend/promptspend';
const PRIVACY_URL = `${SITE_URL}privacy/`;
const SUPPORT_URL = `${SITE_URL}support/`;

export function DataSection({ catalog }: { catalog: Catalog }) {
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [notice, setNotice] = useState<string | null>(null);
  const health = catalog.health;
  const flagged = catalog.models.filter((model) => model.provenance.needsReview);
  const vendorVerified = catalog.primaryModels.filter((model) => model.provenance.source === 'vendor');

  const open = async (url: string) => {
    await WebBrowser.openBrowserAsync(url, {
      controlsColor: theme.accent,
      dismissButtonStyle: 'close',
      toolbarColor: theme.surface,
    });
  };

  return (
    <View style={styles.section}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>DATA &amp; ALERTS</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Every number shows its work.
        </Text>
        <Text style={styles.summary}>
          Trace every rate to its source, inspect pipeline health, and choose how to follow changes.
        </Text>
      </View>

      {notice && (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}

      <Card styles={styles} title="Pipeline health">
        <Metric
          styles={styles}
          label="Prices last changed"
          value={catalog.pricesLastChanged() ?? 'Not recorded'}
        />
        <Metric
          styles={styles}
          label="Sources last checked cleanly"
          value={catalog.sourcesLastChecked() ?? 'Evidence unavailable'}
        />
        <Metric
          styles={styles}
          label="Last run"
          value={health ? `${health.attemptedAt.slice(0, 10)} · ${health.outcome}` : 'Unknown'}
        />
        <Metric
          styles={styles}
          label="Models tracked"
          value={`${catalog.primaryModels.length}${catalog.models.length !== catalog.primaryModels.length ? ` (+${catalog.models.length - catalog.primaryModels.length} aliases)` : ''}`}
        />
        {health?.outcome === 'degraded' && (
          <View accessibilityRole="alert" style={styles.warning}>
            <Text style={styles.warningText}>
              The last run was degraded and published nothing.{' '}
              {health.problems.join('; ') || 'A source was unavailable.'}
            </Text>
          </View>
        )}
        <Action label="Open the public sync manifest" onPress={() => void open(HEALTH_URL)} styles={styles} />
      </Card>

      <Card styles={styles} title="Price alerts">
        <Text style={styles.body}>
          Email alerts are available now through PromptSpend’s secure double-opt-in web flow. The form uses
          Turnstile to prevent abuse; prompt text is never part of an alert.
        </Text>
        <Action
          label="Manage email alerts securely"
          onPress={() => void open(`${SITE_URL}?alerts`)}
          styles={styles}
        />
        <Text style={styles.body}>
          Native push is not yet enabled. Browser VAPID subscriptions cannot be reused by iOS or Android; the
          alert service must add APNs/FCM tokens before the app asks for notification permission.
        </Text>
        <Action
          label="Copy catalog commit feed"
          onPress={() => {
            void Clipboard.setStringAsync(FEED_URL).then(() => setNotice('Feed address copied.'));
          }}
          styles={styles}
        />
        <Action label="Watch the repository" onPress={() => void open(REPO_URL)} styles={styles} />
      </Card>

      <Card styles={styles} title="Use it where you work">
        <Resource
          description="The same estimator and catalog inside Claude Code, Cursor, and Windsurf."
          label="MCP server"
          onPress={() => void open(MCP_URL)}
          styles={styles}
        />
        <Resource
          description="A free, keyless API with JSON, CSV, and OpenAPI 3.1."
          label="Pricing API and developer hub"
          onPress={() => void open(DEVELOPER_HUB_URL)}
          styles={styles}
        />
        <Resource
          description="Inline model rates and response-cost estimates in VS Code."
          label="VS Code Marketplace"
          onPress={() => void open(VSCODE_URL)}
          styles={styles}
        />
        <Resource
          description="The same extension for Cursor, Windsurf, and VSCodium."
          label="Open VSX"
          onPress={() => void open(OPEN_VSX_URL)}
          styles={styles}
        />
      </Card>

      <Card styles={styles} title="Privacy & support">
        <Text style={styles.body}>
          PromptSpend has no native account, advertising SDK, behavioral analytics, or cross-app tracking.
          Pasted text stays on this device and is excluded from shares.
        </Text>
        <Action label="Read the privacy policy" onPress={() => void open(PRIVACY_URL)} styles={styles} />
        <Action
          label="Open support and troubleshooting"
          onPress={() => void open(SUPPORT_URL)}
          styles={styles}
        />
        <Action
          label="Email PromptSpend support"
          onPress={() =>
            void Linking.openURL('mailto:info@promptspend.com?subject=PromptSpend%20app%20support')
          }
          styles={styles}
        />
      </Card>

      <Card styles={styles} title="Trust ladder">
        <TrustRow
          detail={`Hand-verified vendor list prices win every conflict. ${vendorVerified.length} current models carry this mark.`}
          number="1"
          styles={styles}
          title="Vendor overrides"
        />
        <TrustRow
          detail="The LiteLLM community catalog is the automated daily feed."
          number="2"
          styles={styles}
          title="LiteLLM"
        />
        <TrustRow
          detail="OpenRouter is an independent cross-check. A disagreement flags a model but never silently overwrites it."
          number="3"
          styles={styles}
          title="OpenRouter"
        />
        <TrustRow
          detail="Schema, rate, source-size, daily-move, and catalog-shrink checks stop suspicious runs from publishing."
          number="4"
          styles={styles}
          title="Sanity gates"
        />
        <Text style={styles.scope}>
          Standard-tier global list prices in USD. Regional premiums, priority tiers, server-side tool fees,
          and negotiated discounts are outside the estimate.
        </Text>
      </Card>

      <Card styles={styles} title={`Flagged for review (${flagged.length})`}>
        {flagged.length === 0 ? (
          <Text style={styles.body}>Nothing is flagged; all independent sources agree today.</Text>
        ) : (
          flagged.slice(0, 12).map((model) => (
            <View key={model.id} style={styles.flaggedRow}>
              <Text style={styles.flaggedTitle}>Δ {model.displayName}</Text>
              <Text style={styles.body}>
                {model.provenance.reviewNote ?? 'Independent sources disagree.'}
              </Text>
              <Text style={styles.rateText}>
                {formatRate(model.pricing.input)} input · {formatRate(model.pricing.output)} output / 1M
              </Text>
            </View>
          ))
        )}
        <Text style={styles.body}>
          A flagged row keeps the primary feed’s price while the cross-check raises a visible warning.
        </Text>
        <Action
          label="Request a missing model"
          onPress={() => void open(`${REPO_URL}/issues/new?template=model-request.yml`)}
          styles={styles}
        />
      </Card>
    </View>
  );
}

function Card({ children, styles, title }: { children: React.ReactNode; styles: Styles; title: string }) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Metric({ label, styles, value }: { label: string; styles: Styles; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function Action({ label, onPress, styles }: { label: string; onPress: () => void; styles: Styles }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <Text style={styles.actionText}>{label} ↗</Text>
    </Pressable>
  );
}

function Resource({
  description,
  label,
  onPress,
  styles,
}: {
  description: string;
  label: string;
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <View style={styles.resource}>
      <Text style={styles.resourceTitle}>{label}</Text>
      <Text style={styles.body}>{description}</Text>
      <Action label={`Open ${label}`} onPress={onPress} styles={styles} />
    </View>
  );
}

function TrustRow({
  detail,
  number,
  styles,
  title,
}: {
  detail: string;
  number: string;
  styles: Styles;
  title: string;
}) {
  return (
    <View style={styles.trustRow}>
      <View style={styles.trustNumber}>
        <Text style={styles.trustNumberText}>{number}</Text>
      </View>
      <View style={styles.trustCopy}>
        <Text style={styles.resourceTitle}>{title}</Text>
        <Text style={styles.body}>{detail}</Text>
      </View>
    </View>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    section: { gap: 16 },
    hero: { gap: 12, paddingBottom: 4, paddingTop: 16 },
    eyebrow: { color: theme.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
    title: { color: theme.text, fontSize: 34, fontWeight: '800', letterSpacing: -1, lineHeight: 41 },
    summary: { color: theme.mutedText, fontSize: 17, lineHeight: 25 },
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 14,
      padding: 18,
    },
    cardTitle: { color: theme.text, fontSize: 20, fontWeight: '800', lineHeight: 26 },
    body: { color: theme.mutedText, fontSize: 14, lineHeight: 21 },
    metric: { backgroundColor: theme.surfaceRaised, borderRadius: 10, gap: 3, padding: 12 },
    metricLabel: { color: theme.mutedText, fontSize: 11, fontWeight: '700' },
    metricValue: { color: theme.text, fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '800' },
    warning: {
      backgroundColor: theme.surfaceRaised,
      borderColor: theme.warning,
      borderLeftWidth: 3,
      borderRadius: 10,
      padding: 12,
    },
    warningText: { color: theme.warning, fontSize: 13, fontWeight: '700', lineHeight: 19 },
    action: {
      alignItems: 'center',
      borderColor: theme.accent,
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 14,
    },
    actionText: { color: theme.accent, fontSize: 14, fontWeight: '800', textAlign: 'center' },
    resource: {
      borderTopColor: theme.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 8,
      paddingTop: 14,
    },
    resourceTitle: { color: theme.text, fontSize: 15, fontWeight: '800', lineHeight: 20 },
    trustRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
    trustNumber: {
      alignItems: 'center',
      backgroundColor: theme.accentSoft,
      borderRadius: 10,
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    trustNumberText: { color: theme.accent, fontWeight: '900' },
    trustCopy: { flex: 1, gap: 3 },
    scope: { color: theme.mutedText, fontSize: 12, fontStyle: 'italic', lineHeight: 18 },
    flaggedRow: {
      borderTopColor: theme.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 4,
      paddingTop: 12,
    },
    flaggedTitle: { color: theme.warning, fontSize: 14, fontWeight: '800' },
    rateText: { color: theme.text, fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '700' },
    notice: { backgroundColor: theme.accentSoft, borderRadius: 10, padding: 12 },
    noticeText: { color: theme.accent, fontSize: 13, fontWeight: '800' },
    pressed: { opacity: 0.68 },
  });
}
