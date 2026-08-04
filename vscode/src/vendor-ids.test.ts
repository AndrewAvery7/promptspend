import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PricingCatalog } from '@/lib/pricing/types';
import {
  ROUTE_PREFIXES,
  NATIVE_PREFIXES,
  firstSegment,
  writtenFormsOf,
  prefixesInCatalog,
} from './vendor-ids';

const catalog = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../public/data/pricing.json'), 'utf8'),
) as PricingCatalog;

describe('firstSegment', () => {
  it('splits on the first hyphen', () => {
    expect(firstSegment('gemini-gemini-2.5-flash')).toBe('gemini');
    expect(firstSegment('gpt-5.6')).toBe('gpt');
  });

  it('returns the whole id when there is no hyphen', () => {
    expect(firstSegment('o3')).toBe('o3');
  });
});

describe('writtenFormsOf', () => {
  it('strips a routing prefix but keeps the catalog id too', () => {
    expect(writtenFormsOf('gemini-gemini-2.5-flash')).toEqual([
      'gemini-gemini-2.5-flash',
      'gemini-2.5-flash',
    ]);
    expect(writtenFormsOf('xai-grok-4.5')).toEqual(['xai-grok-4.5', 'grok-4.5']);
    expect(writtenFormsOf('zai-glm-5')).toEqual(['zai-glm-5', 'glm-5']);
  });

  it('leaves vendor-native ids alone', () => {
    expect(writtenFormsOf('gpt-5.6')).toEqual(['gpt-5.6']);
    expect(writtenFormsOf('claude-sonnet-5')).toEqual(['claude-sonnet-5']);
    expect(writtenFormsOf('o3')).toEqual(['o3']);
    // A Bedrock id, whose first segment is `amazon.nova` and not a prefix.
    expect(writtenFormsOf('amazon.nova-2-lite-v1-0')).toEqual(['amazon.nova-2-lite-v1-0']);
  });
});

describe('catalog prefix coverage', () => {
  /**
   * The guard that keeps this file from going stale invisibly.
   *
   * If the sync pipeline picks up a provider family whose ids carry a routing
   * prefix nobody has classified, every model in it would be scanned for under
   * its catalog id only — which is not what anyone writes — and would silently
   * never appear in the editor. That failure looks exactly like the extension
   * working. This test converts it into a red build and a one-line fix.
   */
  it('classifies every first segment in the live catalog', () => {
    const seen = prefixesInCatalog(catalog.models.map((m) => m.id));
    const unclassified = [...seen].filter((p) => !ROUTE_PREFIXES.has(p) && !NATIVE_PREFIXES.has(p));

    expect(
      unclassified,
      `Unclassified id prefixes: ${unclassified.join(', ')}.\n` +
        `Add each to ROUTE_PREFIXES (if it is the upstream feed's routing prefix and ` +
        `not part of what a developer types) or to NATIVE_PREFIXES (if it is the ` +
        `vendor's own id) in vscode/src/vendor-ids.ts.`,
    ).toEqual([]);
  });

  it('is not classifying prefixes that no longer exist', () => {
    // Keeps the lists honest in the other direction. A prefix listed here but
    // absent from the catalog is dead weight that hides what is really covered.
    const seen = prefixesInCatalog(catalog.models.map((m) => m.id));
    const orphaned = [...ROUTE_PREFIXES, ...NATIVE_PREFIXES].filter((p) => !seen.has(p));
    expect(orphaned, `Prefixes classified but absent from the catalog: ${orphaned.join(', ')}`).toEqual([]);
  });
});
