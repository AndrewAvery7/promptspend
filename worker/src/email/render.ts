/**
 * Email rendering.
 *
 * Mail clients are a decade behind browsers and disagree with each other, so
 * this is deliberately old-fashioned: tables for layout, styles inlined on the
 * elements that carry them, no external assets, no images at all. A `<style>`
 * block is included purely for the dark-mode media query, which the clients
 * that support it read and the rest ignore harmlessly.
 *
 * Every message is built as HTML *and* plain text. The text part is not a
 * fallback afterthought — a good number of readers use clients that prefer it,
 * spam filters treat a missing or lazy text part as a signal, and writing it
 * forces the content to make sense without layout.
 */

import { describeChange, formatRate, type ChangeSet, type PriceChange } from '../changes';

const BRAND = '#2456e6';
const INK = '#15181d';
const MUTED = '#5f6b78';
const BORDER = '#dce2eb';
const SURFACE = '#ffffff';
const CANVAS = '#ebeff5';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LayoutOptions {
  title: string;
  /** The grey line clients show next to the subject in the inbox list. */
  preheader: string;
  body: string;
  footer: string;
}

function layout({ title, preheader, body, footer }: LayoutOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .ps-canvas { background: #0b0e14 !important; }
    .ps-card { background: #121722 !important; border-color: #27303f !important; }
    .ps-ink { color: #e9ecf2 !important; }
    .ps-muted { color: #93a0b4 !important; }
    .ps-rule { border-color: #27303f !important; }
    .ps-chip { background: #1a2130 !important; color: #93a0b4 !important; }
  }
  @media (max-width: 620px) {
    .ps-pad { padding: 24px !important; }
  }
</style>
</head>
<body class="ps-canvas" style="margin:0;padding:0;background:${CANVAS};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ps-canvas" style="background:${CANVAS};">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
      <tr><td style="padding:0 0 18px 4px;">
        <span style="font:700 19px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND};letter-spacing:-0.02em;">PromptSpend</span>
      </td></tr>
      <tr><td class="ps-card" style="background:${SURFACE};border:1px solid ${BORDER};border-radius:14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td class="ps-pad" style="padding:34px 36px;font:400 15px/1.62 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
${body}
          </td></tr>
        </table>
      </td></tr>
      <tr><td class="ps-pad" style="padding:22px 36px 0;font:400 12.5px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${MUTED};" class="ps-muted">
${footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 8px;"><tr>
<td style="background:${BRAND};border-radius:10px;">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;font:600 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

/** A change rendered as a row: name, provider chip, and the movement itself. */
function changeRow(change: PriceChange): string {
  const movement =
    change.kind === 'price' && change.before && change.after
      ? `<span class="ps-muted" style="color:${MUTED};">${escapeHtml(formatRate(change.before.input))} → </span><b>${escapeHtml(formatRate(change.after.input))}</b><span class="ps-muted" style="color:${MUTED};"> in · ${escapeHtml(formatRate(change.before.output))} → </span><b>${escapeHtml(formatRate(change.after.output))}</b><span class="ps-muted" style="color:${MUTED};"> out</span>`
      : `<span class="ps-muted" style="color:${MUTED};">${escapeHtml(describeChange(change))}</span>`;

  return `<tr><td class="ps-rule" style="padding:13px 0;border-bottom:1px solid ${BORDER};">
<div class="ps-ink" style="font-weight:600;color:${INK};">${escapeHtml(change.displayName)}
<span class="ps-chip" style="display:inline-block;margin-left:7px;padding:2px 7px;border-radius:5px;background:#f1f4f9;font:500 11px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${MUTED};vertical-align:1px;">${escapeHtml(change.provider)}</span></div>
<div style="margin-top:3px;font-size:14px;">${movement}</div>
</td></tr>`;
}

function changeTable(changes: PriceChange[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px;">${changes
    .map(changeRow)
    .join('')}</table>`;
}

function footerHtml(unsubscribeUrl: string, preferencesUrl: string, siteUrl: string): string {
  return `<p style="margin:0 0 8px;">You are getting this because you asked PromptSpend to tell you when LLM prices move.
<a href="${escapeHtml(preferencesUrl)}" style="color:${BRAND};">Change what you get</a> ·
<a href="${escapeHtml(unsubscribeUrl)}" style="color:${BRAND};">Unsubscribe</a></p>
<p style="margin:0;">No tracking pixels, no click tracking, no third parties. <a href="${escapeHtml(siteUrl)}" style="color:${BRAND};">${escapeHtml(siteUrl.replace(/^https:\/\//, ''))}</a></p>`;
}

function footerText(unsubscribeUrl: string, preferencesUrl: string, siteUrl: string): string {
  return `--
You are getting this because you asked PromptSpend to tell you when LLM prices move.
Change what you get: ${preferencesUrl}
Unsubscribe:         ${unsubscribeUrl}

No tracking pixels, no click tracking, no third parties.
${siteUrl}`;
}

export interface Links {
  confirmUrl?: string;
  unsubscribeUrl: string;
  preferencesUrl: string;
  siteUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Double opt-in. Nothing else is ever sent to an unconfirmed address. */
export function renderConfirmation(links: Links & { confirmUrl: string }, scopeLabel: string): RenderedEmail {
  const body = `<h1 class="ps-ink" style="margin:0 0 14px;font:700 24px/1.25 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};letter-spacing:-0.02em;">One click and you're set</h1>
<p style="margin:0 0 4px;">Confirm this address and PromptSpend will tell you when ${escapeHtml(scopeLabel)}.</p>
${button(links.confirmUrl, 'Confirm my subscription')}
<p class="ps-muted" style="margin:14px 0 0;font-size:13.5px;color:${MUTED};">The link works for 48 hours. If you did not ask for this, ignore this message — nothing was subscribed and the address is deleted within a week.</p>`;

  const text = `One click and you're set

Confirm this address and PromptSpend will tell you when ${scopeLabel}.

${links.confirmUrl}

The link works for 48 hours. If you did not ask for this, ignore this
message — nothing was subscribed and the address is deleted within a week.

--
${links.siteUrl}`;

  return {
    subject: 'Confirm your PromptSpend price alerts',
    html: layout({
      title: 'Confirm your PromptSpend price alerts',
      preheader: 'One click to confirm — the link works for 48 hours.',
      body,
      // No unsubscribe footer here: there is nothing yet to unsubscribe from,
      // and offering one would imply the address is already on a list.
      footer: `<p style="margin:0;">Sent because someone entered this address at <a href="${escapeHtml(links.siteUrl)}" style="color:${BRAND};">${escapeHtml(links.siteUrl.replace(/^https:\/\//, ''))}</a>. No other mail will arrive unless you confirm.</p>`,
    }),
    text,
  };
}

/**
 * Double opt-in for the mobile-launch list.
 *
 * Deliberately explicit that this is a single message and not a subscription,
 * because the reader has no other way to tell: an address that also gets price
 * alerts would otherwise see two near-identical confirmation mails and have no
 * idea they authorise different things.
 */
export function renderLaunchConfirmation(confirmUrl: string, siteUrl: string): RenderedEmail {
  const body = `<h1 class="ps-ink" style="margin:0 0 14px;font:700 24px/1.25 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};letter-spacing:-0.02em;">Confirm and you're on the launch list</h1>
<p style="margin:0 0 4px;">Confirm this address and PromptSpend will email you when the iPhone and Android apps are available to download — one message, then nothing more.</p>
${button(confirmUrl, 'Confirm my address')}
<p class="ps-muted" style="margin:14px 0 0;font-size:13.5px;color:${MUTED};">This is not a price-alert subscription and does not change any alerts you already receive. The link works for 48 hours. If you did not ask for this, ignore this message — nothing was recorded and the address is deleted within a week.</p>`;

  const text = `Confirm and you're on the launch list

Confirm this address and PromptSpend will email you when the iPhone and
Android apps are available to download — one message, then nothing more.

${confirmUrl}

This is not a price-alert subscription and does not change any alerts you
already receive. The link works for 48 hours. If you did not ask for this,
ignore this message — nothing was recorded and the address is deleted
within a week.

--
${siteUrl}`;

  return {
    subject: 'Confirm: Tell me when the PromptSpend apps launch',
    html: layout({
      title: 'Confirm: Tell me when the PromptSpend apps launch',
      preheader: 'One click to confirm — the link works for 48 hours.',
      body,
      // No unsubscribe footer, for the same reason as the price-alert
      // confirmation: there is nothing on a list yet to leave.
      footer: `<p style="margin:0;">Sent because someone entered this address at <a href="${escapeHtml(siteUrl)}" style="color:${BRAND};">${escapeHtml(siteUrl.replace(/^https:\/\//, ''))}</a>. No other mail will arrive unless you confirm.</p>`,
    }),
    text,
  };
}

/** Passwordless native preference access. The code is short-lived and single-use. */
export function renderManageCode(code: string, siteUrl: string): RenderedEmail {
  const body = `<h1 class="ps-ink" style="margin:0 0 14px;font:700 24px/1.25 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};letter-spacing:-0.02em;">Your alert management code</h1>
<p style="margin:0 0 18px;">Enter this code in the PromptSpend app to review or change your email alerts:</p>
<p class="ps-ink" style="margin:0;padding:18px;border:1px solid ${BORDER};border-radius:12px;text-align:center;font:700 32px/1.1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:0.22em;color:${INK};">${escapeHtml(code)}</p>
<p class="ps-muted" style="margin:16px 0 0;font-size:13.5px;color:${MUTED};">The code expires in 10 minutes and works once. PromptSpend will never ask you to send this code to another person.</p>`;

  const text = `Your PromptSpend alert management code

${code}

Enter this code in the PromptSpend app. It expires in 10 minutes and works once.
PromptSpend will never ask you to send this code to another person.

--
${siteUrl}`;

  return {
    subject: 'Your PromptSpend alert management code',
    html: layout({
      title: 'Your PromptSpend alert management code',
      preheader: `${code} · Expires in 10 minutes.`,
      body,
      footer: `<p style="margin:0;">If you did not request this code, ignore this message. Your alert preferences have not changed.</p>`,
    }),
    text,
  };
}

export function renderInstantAlert(set: ChangeSet, links: Links): RenderedEmail {
  const headline =
    set.changes.length === 1 ? '1 model just changed price' : `${set.changes.length} models just changed`;

  const body = `<h1 class="ps-ink" style="margin:0 0 6px;font:700 24px/1.25 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};letter-spacing:-0.02em;">${escapeHtml(headline)}</h1>
<p class="ps-muted" style="margin:0;font-size:13.5px;color:${MUTED};">Detected ${escapeHtml(formatWhen(set.generatedAt))} in the daily catalog sync.</p>
${changeTable(set.changes)}
${button(links.siteUrl, 'Re-run your estimate')}`;

  const text = `${headline}
Detected ${formatWhen(set.generatedAt)} in the daily catalog sync.

${set.changes.map((change) => `  • ${describeChange(change)}`).join('\n')}

Re-run your estimate: ${links.siteUrl}

${footerText(links.unsubscribeUrl, links.preferencesUrl, links.siteUrl)}`;

  return {
    subject: subjectFor(set),
    html: layout({
      title: headline,
      preheader: set.changes.map(describeChange).join(' · ').slice(0, 140),
      body,
      footer: footerHtml(links.unsubscribeUrl, links.preferencesUrl, links.siteUrl),
    }),
    text,
  };
}

export function renderDigest(sets: ChangeSet[], links: Links): RenderedEmail {
  const changes = dedupeChanges(sets.flatMap((set) => set.changes));
  const headline =
    changes.length === 0
      ? 'A quiet week in LLM pricing'
      : `${changes.length} pricing change${changes.length === 1 ? '' : 's'} this week`;

  const intro =
    changes.length === 0
      ? 'Nothing moved in the models you follow. The catalog was checked every morning and every source agreed.'
      : 'Here is everything that moved in the models you follow.';

  const body = `<h1 class="ps-ink" style="margin:0 0 6px;font:700 24px/1.25 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};letter-spacing:-0.02em;">${escapeHtml(headline)}</h1>
<p style="margin:0;">${escapeHtml(intro)}</p>
${changes.length > 0 ? changeTable(changes) : ''}
${button(links.siteUrl, changes.length > 0 ? 'See what it costs you' : 'Open PromptSpend')}`;

  const text = `${headline}

${intro}
${changes.length > 0 ? `\n${changes.map((change) => `  • ${describeChange(change)}`).join('\n')}\n` : ''}
${links.siteUrl}

${footerText(links.unsubscribeUrl, links.preferencesUrl, links.siteUrl)}`;

  return {
    subject: headline,
    html: layout({
      title: headline,
      preheader:
        changes.length === 0
          ? 'No price changes in the models you follow.'
          : changes.map(describeChange).join(' · ').slice(0, 140),
      body,
      footer: footerHtml(links.unsubscribeUrl, links.preferencesUrl, links.siteUrl),
    }),
    text,
  };
}

/**
 * Subject lines say what happened, not that something happened.
 *
 * "PromptSpend update" is what a reader learns nothing from and eventually stops
 * opening; the model and the direction belong in the inbox list.
 */
function subjectFor(set: ChangeSet): string {
  if (set.changes.length === 1) {
    const [change] = set.changes;
    if (change.kind === 'price' && change.before && change.after) {
      const direction = change.after.input > change.before.input ? 'up' : 'down';
      return `${change.displayName} price ${direction}`;
    }
    return describeChange(change).slice(0, 90);
  }
  const providers = new Set(set.changes.map((change) => change.provider));
  return `${set.changes.length} price changes — ${[...providers].slice(0, 3).join(', ')}${
    providers.size > 3 ? ' and more' : ''
  }`;
}

/** Later reports about the same model supersede earlier ones within a digest. */
function dedupeChanges(changes: PriceChange[]): PriceChange[] {
  const byModel = new Map<string, PriceChange>();
  for (const change of changes) byModel.set(change.modelId, change);
  return [...byModel.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'today';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}
