/**
 * The morning sync's dependable alarm clock, and the alarm when it is late.
 *
 * GitHub starts scheduled workflows on a best-effort basis. Through November
 * 2026 the 07:17 UTC price sync started between 16:48 and 22:21 UTC, every
 * day, so the "daily" catalog was in practice published each evening. Cloudflare
 * Cron Triggers fire on the minute, so this Worker starts the sync instead:
 * a `workflow_dispatch` begins within seconds, where a `schedule` waits in
 * GitHub's queue. The GitHub schedule stays as a second attempt, and the sync
 * workflow's own gate makes it stand down once the day's run has succeeded.
 *
 * Each firing does two independent things:
 *
 *   1. **Start the sync if today's has not run.** "Has run" means a run of
 *      sync-pricing.yml created today (UTC) that succeeded or is still going.
 *      A failed run does not count, so a later firing retries it: at most one
 *      dispatch per firing, four firings a day.
 *   2. **Raise an alert when the published catalog is getting old.** It reads
 *      the live site, as the freshness workflow does, and files one reusable
 *      issue when `generatedAt` is 20 hours old or more; it closes that issue
 *      when the catalog is fresh again. Skipped on the first firing of the
 *      day, which runs before today's sync could possibly have published and
 *      would otherwise report yesterday's catalog every morning.
 *
 * This is a warning, not the two-day freshness promise (freshness.yml still
 * owns that) and not the apps' 24-hour cache limit, which is measured from a
 * device's last download. It exists so a missed morning is noticed the same
 * morning rather than the next evening.
 *
 * Needs GITHUB_DISPATCH_TOKEN: a fine-grained token for this one repository
 * with Actions and Issues read/write. Without it every firing logs a warning
 * and does nothing, so deploying this before the secret exists is safe.
 */

import type { Env } from './env';

export const SYNC_WORKFLOW = 'sync-pricing.yml';
export const AGE_ALERT_HOURS = 20;
export const ALERT_TITLE = 'Catalog age warning';
/** The first firing of the day: start the sync, but never judge the catalog. */
export const FIRST_FIRING_HOUR_UTC = 7;

type Fetch = typeof fetch;

export interface WorkflowRun {
  status: string; // queued | in_progress | completed | waiting | requested | pending
  conclusion: string | null;
  created_at: string;
}

export interface SyncWatchResult {
  dispatched: boolean;
  reason: string;
  ageHours?: number;
  alert?: 'opened' | 'updated' | 'closed' | 'none' | 'skipped';
}

/** `YYYY-MM-DD` in UTC. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Whether today's sync is already taken care of.
 *
 * A run still in flight counts, so two firings never start two syncs. A run
 * that failed or was cancelled does not, so the next firing retries it.
 */
export function todaysSyncHandled(runs: WorkflowRun[], now: Date): boolean {
  const today = utcDay(now);
  return runs.some(
    (run) =>
      utcDay(new Date(run.created_at)) === today &&
      (run.status !== 'completed' || run.conclusion === 'success'),
  );
}

export function ageHours(generatedAt: string, now: Date): number {
  const generated = Date.parse(generatedAt);
  if (Number.isNaN(generated)) throw new Error(`unreadable generatedAt: ${generatedAt}`);
  return Math.round(((now.getTime() - generated) / 3_600_000) * 10) / 10;
}

function github(env: Env, token: string, fetchImpl: Fetch) {
  const base = `https://api.github.com/repos/${env.GITHUB_REPO}`;
  return async (path: string, init: RequestInit = {}): Promise<Response> => {
    const response = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        // GitHub refuses requests without one. Generic on purpose.
        'User-Agent': 'promptspend-alerts-worker',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!response.ok) {
      // The status and GitHub's message only: never the request headers.
      const detail = (await response.text()).slice(0, 200);
      throw new Error(`GitHub ${init.method ?? 'GET'} ${path} -> ${response.status} ${detail}`);
    }
    return response;
  };
}

export async function runSyncWatch(env: Env, now: Date, fetchImpl: Fetch = fetch): Promise<SyncWatchResult> {
  const token = env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    console.warn('sync watch: GITHUB_DISPATCH_TOKEN is not set, so nothing was started or checked');
    return { dispatched: false, reason: 'no token', alert: 'skipped' };
  }
  const gh = github(env, token, fetchImpl);

  // ---- 1. start today's sync if nothing has
  const today = utcDay(now);
  const runs = (await (
    await gh(`/actions/workflows/${SYNC_WORKFLOW}/runs?created=%3E%3D${today}&per_page=20`)
  ).json()) as { workflow_runs: WorkflowRun[] };

  let dispatched = false;
  let reason: string;
  if (todaysSyncHandled(runs.workflow_runs, now)) {
    reason = "today's sync already succeeded or is running";
  } else {
    await gh(`/actions/workflows/${SYNC_WORKFLOW}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref: 'main' }),
    });
    dispatched = true;
    reason = "started today's sync";
  }

  // ---- 2. warn when the live catalog is getting old
  if (now.getUTCHours() <= FIRST_FIRING_HOUR_UTC) {
    return { dispatched, reason, alert: 'skipped' };
  }

  const catalog = await fetchImpl(env.CATALOG_URL, { headers: { Accept: 'application/json' } });
  if (!catalog.ok) throw new Error(`catalog fetch -> ${catalog.status}`);
  const { generatedAt } = (await catalog.json()) as { generatedAt: string };
  const age = ageHours(generatedAt, now);

  const open = (await (await gh(`/issues?state=open&per_page=100`)).json()) as {
    number: number;
    title: string;
    pull_request?: unknown;
  }[];
  const existing = open.find((issue) => !issue.pull_request && issue.title === ALERT_TITLE);

  if (age < AGE_ALERT_HOURS) {
    if (!existing) return { dispatched, reason, ageHours: age, alert: 'none' };
    await gh(`/issues/${existing.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body: `Recovered: the published catalog is now ${age} hours old (generated ${generatedAt}).`,
      }),
    });
    await gh(`/issues/${existing.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    });
    return { dispatched, reason, ageHours: age, alert: 'closed' };
  }

  const body = [
    `**The published catalog is ${age} hours old** (generated ${generatedAt}); the warning line is ${AGE_ALERT_HOURS} hours.`,
    '',
    `Checked \`${env.CATALOG_URL}\` at ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC by the alerts Worker's sync watch. ${
      dispatched ? 'It has just started the sync again.' : `It did not start a sync: ${reason}.`
    }`,
    '',
    '### Where to look, in order',
    '',
    `1. **[Sync pricing](https://github.com/${env.GITHUB_REPO}/actions/workflows/${SYNC_WORKFLOW})**: did today's run start, and did it succeed?`,
    `2. **[Deploy to GitHub Pages](https://github.com/${env.GITHUB_REPO}/actions/workflows/deploy.yml)**: a green sync still needs a green deploy.`,
    '3. **The Worker itself**: if no run started today at all, the token may have expired. `cd worker; npx wrangler tail` shows each firing.',
    '',
    'This is an early warning, not the two-day freshness alert. It closes itself once the catalog is fresh again.',
  ].join('\n');

  if (existing) {
    await gh(`/issues/${existing.number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    return { dispatched, reason, ageHours: age, alert: 'updated' };
  }
  await gh('/issues', {
    method: 'POST',
    body: JSON.stringify({ title: ALERT_TITLE, body, labels: ['pricing'] }),
  });
  return { dispatched, reason, ageHours: age, alert: 'opened' };
}
