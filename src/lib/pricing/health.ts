/**
 * `public/data/sync-status.json` — proof that the pipeline ran, published
 * separately from the data it produces.
 *
 * The catalog's own date only tells you when a *price* last moved. On a week
 * when every vendor holds steady that date ages while the job succeeds daily,
 * and a job that silently stopped running looks exactly the same. The two
 * questions have to be answered by two different fields, so the UI can say
 * "prices last changed" and "sources last checked" separately.
 */
export const HEALTH_SCHEMA_VERSION = 1;

export type SyncOutcome = 'ok' | 'degraded';

export interface SourceReport {
  id: string;
  /** False when the fetch failed, was truncated, or returned an unusable shape. */
  ok: boolean;
  /** Content-addressed revision where the source exposes one (an ETag). */
  revision?: string;
  /** Rows the source returned, for a size sanity check over time. */
  entries?: number;
  note?: string;
}

export interface SyncStatus {
  schemaVersion: number;
  /** Every run stamps this, successful or not. */
  attemptedAt: string;
  /** Only a fully healthy run stamps this. */
  succeededAt: string | null;
  outcome: SyncOutcome;
  /** Why a run was degraded. Empty on a healthy run. */
  problems: string[];
  sources: SourceReport[];
  modelCount: number;
  flaggedCount: number;
  staleCount: number;
  /** Fingerprint of everything the app reads, ignoring per-run timestamps. */
  catalogHash: string;
  /** ISO date the published rates last actually moved. */
  pricesLastChanged: string | null;
}

export function isSyncStatus(value: unknown): value is SyncStatus {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<SyncStatus>;
  return (
    s.schemaVersion === HEALTH_SCHEMA_VERSION &&
    typeof s.attemptedAt === 'string' &&
    (s.outcome === 'ok' || s.outcome === 'degraded') &&
    Array.isArray(s.sources)
  );
}
