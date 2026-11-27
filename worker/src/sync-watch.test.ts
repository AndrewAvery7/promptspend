import { describe, expect, it } from 'vitest';
import type { Env } from './env';
import { ALERT_TITLE, ageHours, runSyncWatch, todaysSyncHandled, type WorkflowRun } from './sync-watch';

const env = {
  GITHUB_REPO: 'example/repo',
  CATALOG_URL: 'https://example.test/data/pricing.json',
  GITHUB_DISPATCH_TOKEN: 'test-token-not-real',
} as unknown as Env;

const run = (created_at: string, status: string, conclusion: string | null): WorkflowRun => ({
  created_at,
  status,
  conclusion,
});

describe('todaysSyncHandled', () => {
  const now = new Date('2026-11-27T09:17:00Z');

  it('is false with no runs today', () => {
    expect(todaysSyncHandled([run('2026-11-26T17:41:57Z', 'completed', 'success')], now)).toBe(false);
  });

  it('counts a successful run today', () => {
    expect(todaysSyncHandled([run('2026-11-27T07:17:05Z', 'completed', 'success')], now)).toBe(true);
  });

  it('counts a run still in flight, so two firings never start two syncs', () => {
    expect(todaysSyncHandled([run('2026-11-27T07:17:05Z', 'in_progress', null)], now)).toBe(true);
    expect(todaysSyncHandled([run('2026-11-27T07:17:05Z', 'queued', null)], now)).toBe(true);
  });

  it('does not count a failed or cancelled run, so a later firing retries it', () => {
    expect(todaysSyncHandled([run('2026-11-27T07:17:05Z', 'completed', 'failure')], now)).toBe(false);
    expect(todaysSyncHandled([run('2026-11-27T07:17:05Z', 'completed', 'cancelled')], now)).toBe(false);
  });
});

describe('ageHours', () => {
  it('measures to a tenth of an hour', () => {
    expect(ageHours('2026-11-26T17:44:50.301Z', new Date('2026-11-27T15:06:00Z'))).toBe(21.4);
  });

  it('refuses an unreadable date rather than calling it fresh', () => {
    expect(() => ageHours('yesterday', new Date())).toThrow();
  });
});

/** A fake GitHub and site that records every call. */
function fake(options: {
  runs?: WorkflowRun[];
  generatedAt?: string;
  openIssues?: { number: number; title: string; pull_request?: unknown }[];
}) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const reply = (value: unknown, status = 200) =>
      new Response(value === null ? null : JSON.stringify(value), { status });
    if (url === env.CATALOG_URL) return reply({ generatedAt: options.generatedAt });
    if (url.includes('/runs?')) return reply({ workflow_runs: options.runs ?? [] });
    if (url.endsWith('/dispatches')) return reply(null, 204);
    if (url.includes('/issues?state=open')) return reply(options.openIssues ?? []);
    return reply({}, method === 'POST' ? 201 : 200);
  }) as typeof fetch;
  return { impl, calls };
}

describe('runSyncWatch', () => {
  it('does nothing at all without a token', async () => {
    const { impl, calls } = fake({});
    const result = await runSyncWatch(
      { ...env, GITHUB_DISPATCH_TOKEN: undefined } as Env,
      new Date('2026-11-27T07:17:00Z'),
      impl,
    );
    expect(result.dispatched).toBe(false);
    expect(calls).toEqual([]);
  });

  it('starts the sync at 07:17 when none has run, and does not judge the catalog yet', async () => {
    const { impl, calls } = fake({ runs: [run('2026-11-26T17:41:57Z', 'completed', 'success')] });
    const result = await runSyncWatch(env, new Date('2026-11-27T07:17:00Z'), impl);
    expect(result).toMatchObject({ dispatched: true, alert: 'skipped' });
    const dispatch = calls.find((c) => c.url.endsWith('/dispatches'));
    expect(dispatch).toMatchObject({
      method: 'POST',
      url: 'https://api.github.com/repos/example/repo/actions/workflows/sync-pricing.yml/dispatches',
      body: { ref: 'main' },
    });
    expect(calls.some((c) => c.url === env.CATALOG_URL)).toBe(false);
  });

  it('leaves a fresh catalog alone once today has run', async () => {
    const { impl, calls } = fake({
      runs: [run('2026-11-27T07:17:05Z', 'completed', 'success')],
      generatedAt: '2026-11-27T07:21:00Z',
    });
    const result = await runSyncWatch(env, new Date('2026-11-27T09:17:00Z'), impl);
    expect(result).toMatchObject({ dispatched: false, alert: 'none', ageHours: 1.9 });
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('opens one warning when the catalog reaches 20 hours, and retries a failed sync', async () => {
    const { impl, calls } = fake({
      runs: [run('2026-11-27T07:17:05Z', 'completed', 'failure')],
      generatedAt: '2026-11-26T07:21:00Z',
      openIssues: [{ number: 5, title: ALERT_TITLE, pull_request: {} }],
    });
    const result = await runSyncWatch(env, new Date('2026-11-27T09:17:00Z'), impl);
    expect(result).toMatchObject({ dispatched: true, alert: 'opened', ageHours: 25.9 });
    // A pull request with the same title is not the issue to reuse.
    const created = calls.find((c) => c.method === 'POST' && c.url.endsWith('/issues'));
    expect(created?.body).toMatchObject({ title: ALERT_TITLE, labels: ['pricing'] });
  });

  it('comments on the open warning rather than filing a second', async () => {
    const { impl, calls } = fake({
      runs: [run('2026-11-27T09:17:05Z', 'in_progress', null)],
      generatedAt: '2026-11-26T07:21:00Z',
      openIssues: [{ number: 12, title: ALERT_TITLE }],
    });
    const result = await runSyncWatch(env, new Date('2026-11-27T13:17:00Z'), impl);
    expect(result).toMatchObject({ dispatched: false, alert: 'updated' });
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/issues/12/comments'))).toBe(true);
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/issues'))).toBe(false);
  });

  it('closes the warning once the catalog is fresh again', async () => {
    const { impl, calls } = fake({
      runs: [run('2026-11-27T09:17:05Z', 'completed', 'success')],
      generatedAt: '2026-11-27T09:22:00Z',
      openIssues: [{ number: 12, title: ALERT_TITLE }],
    });
    const result = await runSyncWatch(env, new Date('2026-11-27T13:17:00Z'), impl);
    expect(result).toMatchObject({ alert: 'closed' });
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
      url: 'https://api.github.com/repos/example/repo/issues/12',
      body: { state: 'closed' },
    });
  });

  it('fails loudly when GitHub refuses the token', async () => {
    const impl = (async () => new Response('Bad credentials', { status: 401 })) as typeof fetch;
    await expect(runSyncWatch(env, new Date('2026-11-27T07:17:00Z'), impl)).rejects.toThrow(/401/);
  });
});
