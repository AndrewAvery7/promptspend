/**
 * Read every committed version of the catalog out of git, oldest first.
 *
 * Shared by the dataset export (`scripts/export-price-history.ts`) and the
 * site build, which publishes the same history at `/data/price-history.json`.
 * One reader, so the file on the site and the archived CSV cannot disagree.
 */
import { execFileSync } from 'node:child_process';
import type { PricingCatalog } from '../src/lib/pricing/types';
import type { CatalogVersion } from './lib/price-history';

export const CATALOG_PATH = 'public/data/pricing.json';

export class ShallowHistoryError extends Error {
  constructor() {
    super(
      'This checkout is shallow, so the catalog history cannot be replayed and ' +
        '/data/price-history.json would be built from one version and look complete. ' +
        'Check out with full history (actions/checkout with fetch-depth: 0, or `git fetch --unshallow`).',
    );
    this.name = 'ShallowHistoryError';
  }
}

export function loadCatalogVersions(root: string, ref: string): CatalogVersion[] {
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

  // A shallow clone still answers `git log`, with only the commits it holds —
  // which would publish a "history" that starts yesterday. Refuse instead.
  if (git('rev-parse', '--is-shallow-repository').trim() === 'true') throw new ShallowHistoryError();

  return git('log', '--first-parent', '--reverse', '--format=%H%x09%cI', ref, '--', CATALOG_PATH)
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [commit = '', committedAt = ''] = line.split('\t');
      return {
        commit,
        committedAt,
        catalog: JSON.parse(git('show', `${commit}:${CATALOG_PATH}`)) as PricingCatalog,
      };
    });
}
