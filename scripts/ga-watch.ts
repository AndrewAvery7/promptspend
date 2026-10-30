/**
 * Read-only watches on the site's Google Analytics property (SEO register 1.10,
 * 2.2 and 2.12). Three modes:
 *
 *   npx tsx scripts/ga-watch.ts tag-health   # daily: GA counts nobody while Cloudflare counts visitors
 *   npx tsx scripts/ga-watch.ts drift        # weekly: GA settings still match what the privacy page promises
 *   npx tsx scripts/ga-watch.ts baseline     # the four-week baseline ratios (meaningful from 2026-11-26)
 *
 * Reads with the `campaign-seo-reader@promptspend-seo` service account, which
 * has Viewer access and nothing more. Its JSON key arrives in GA_SERVICE_ACCOUNT_JSON;
 * Cloudflare's read-only analytics token in CF_ANALYTICS_TOKEN (tag-health only).
 * With either missing the mode says so and exits 0, the same as the daily vendor
 * check, so a fork or a fresh clone is not a red build. A real alarm exits 1.
 */
import { createSign } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const PROPERTY = '561559697';
const CF_ACCOUNT_TAG = process.env.CF_ACCOUNT_ID ?? '';
const CF_SITE_TAG = process.env.CF_SITE_TAG ?? '';

/**
 * What the privacy page (src/content/information/privacy.md) says about the
 * property. Change this only in the same pull request that changes the page.
 */
export const PRIVACY_PROMISES = {
  retention: 'FOURTEEN_MONTHS',
  resetOnNewActivity: true,
  googleSignals: 'GOOGLE_SIGNALS_ENABLED',
} as const;

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function googleToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = base64url(
    createSign('RSA-SHA256').update(`${header}.${claims}`).sign(account.private_key),
  );
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  if (!response.ok) throw new Error(`Google token refused: ${response.status} ${await response.text()}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

async function google<T>(token: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

interface ReportResponse {
  rows?: { dimensionValues?: { value: string }[]; metricValues: { value: string }[] }[];
}

async function gaReport(token: string, body: unknown): Promise<ReportResponse> {
  return google(token, `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`, body);
}

function isoDay(offset: number): string {
  return new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
}

async function cloudflareVisits(day: string): Promise<number | null> {
  const token = process.env.CF_ANALYTICS_TOKEN;
  if (!token || !CF_ACCOUNT_TAG || !CF_SITE_TAG) return null;
  const query = `query { viewer { accounts(filter: { accountTag: "${CF_ACCOUNT_TAG}" }) {
    rumPageloadEventsAdaptiveGroups(limit: 1, filter: { siteTag: "${CF_SITE_TAG}", date: "${day}", bot: 0 }) { sum { visits } } } } }`;
  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`Cloudflare analytics: ${response.status}`);
  const data = (await response.json()) as {
    data?: { viewer: { accounts: { rumPageloadEventsAdaptiveGroups: { sum: { visits: number } }[] }[] } };
  };
  return data.data?.viewer.accounts[0]?.rumPageloadEventsAdaptiveGroups[0]?.sum.visits ?? 0;
}

/** The alarm rule, kept pure so it can be tested: Cloudflare saw real visitors and GA saw none. */
export function tagLooksBroken(gaSessions: number, cloudflareVisitCount: number): boolean {
  return gaSessions === 0 && cloudflareVisitCount >= 5;
}

async function tagHealth(token: string): Promise<boolean> {
  const day = isoDay(1);
  const report = await gaReport(token, {
    dateRanges: [{ startDate: day, endDate: day }],
    metrics: [{ name: 'sessions' }],
  });
  const sessions = Number(report.rows?.[0]?.metricValues[0]?.value ?? 0);
  const visits = await cloudflareVisits(day);
  if (visits === null) {
    console.log(`GA sessions on ${day}: ${sessions}. Cloudflare not configured, so no comparison.`);
    return sessions > 0;
  }
  console.log(`${day}: GA ${sessions} sessions, Cloudflare ${visits} visits (bots excluded).`);
  if (tagLooksBroken(sessions, visits)) {
    console.log(
      `::error::GA counted no sessions on ${day} while Cloudflare counted ${visits} visits. The tag may be broken.`,
    );
    return false;
  }
  return true;
}

export interface DriftSettings {
  retention: string;
  resetOnNewActivity: boolean;
  googleSignals: string;
}

export function driftProblems(actual: DriftSettings): string[] {
  const problems: string[] = [];
  if (actual.retention !== PRIVACY_PROMISES.retention)
    problems.push(`data retention is ${actual.retention}; the privacy page says 14 months`);
  if (actual.resetOnNewActivity !== PRIVACY_PROMISES.resetOnNewActivity)
    problems.push('retention no longer resets on new activity; the privacy page says it does');
  if (actual.googleSignals !== PRIVACY_PROMISES.googleSignals)
    problems.push(`Google signals is ${actual.googleSignals}; the privacy page says it is on`);
  return problems;
}

async function drift(token: string): Promise<boolean> {
  const admin = `https://analyticsadmin.googleapis.com/v1alpha/properties/${PROPERTY}`;
  const retention = await google<{ eventDataRetention: string; resetUserDataOnNewActivity: boolean }>(
    token,
    `${admin}/dataRetentionSettings`,
  );
  const signals = await google<{ state: string }>(token, `${admin}/googleSignalsSettings`);
  const problems = driftProblems({
    retention: retention.eventDataRetention,
    resetOnNewActivity: retention.resetUserDataOnNewActivity,
    googleSignals: signals.state,
  });
  for (const problem of problems) console.log(`::error::${problem}`);
  if (problems.length === 0) console.log('GA settings match the privacy page.');
  return problems.length === 0;
}

async function baseline(token: string): Promise<boolean> {
  const startDate = isoDay(28);
  const endDate = isoDay(1);
  if (startDate < '2026-10-29') {
    console.log(
      `Only data from 2026-10-29 exists; a four-week baseline needs ${startDate} or later. Not written.`,
    );
    return true;
  }
  const report = await gaReport(token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'engagedSessions' },
      { name: 'keyEvents' },
    ],
  });
  const channels = (report.rows ?? []).map((row) => {
    const [sessions, users, engaged, keyEvents] = row.metricValues.map((metric) => Number(metric.value));
    return {
      channel: row.dimensionValues?.[0]?.value ?? '(none)',
      sessions,
      users,
      engagementRate: sessions ? engaged! / sessions : 0,
      keyEventsPerSession: sessions ? keyEvents! / sessions : 0,
      sessionsPerUser: users ? sessions! / users : 0,
    };
  });
  const out = { property: PROPERTY, startDate, endDate, channels };
  await writeFile(`docs/seo/ga-baseline-${endDate}.json`, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Baseline written for ${startDate} to ${endDate}, ${channels.length} channels.`);
  return true;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (!['tag-health', 'drift', 'baseline'].includes(mode ?? '')) {
    console.error('usage: ga-watch.ts tag-health | drift | baseline');
    process.exitCode = 2;
    return;
  }
  const raw = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.log('GA_SERVICE_ACCOUNT_JSON is not set; skipping.');
    return;
  }
  const token = await googleToken(JSON.parse(raw) as ServiceAccount);
  const ok =
    mode === 'tag-health'
      ? await tagHealth(token)
      : mode === 'drift'
        ? await drift(token)
        : await baseline(token);
  if (!ok) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('ga-watch.ts')) {
  main().catch((cause: unknown) => {
    console.error(`::error::${cause instanceof Error ? cause.message : String(cause)}`);
    process.exitCode = 1;
  });
}
