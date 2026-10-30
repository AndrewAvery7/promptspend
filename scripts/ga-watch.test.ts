import { describe, expect, it } from 'vitest';
import { driftProblems, PRIVACY_PROMISES, tagLooksBroken } from './ga-watch';

describe('tagLooksBroken', () => {
  it('alarms when Cloudflare saw visitors and GA saw none', () => {
    expect(tagLooksBroken(0, 12)).toBe(true);
  });
  it('stays quiet on a near-empty day or when GA counted anything', () => {
    expect(tagLooksBroken(0, 3)).toBe(false);
    expect(tagLooksBroken(1, 40)).toBe(false);
  });
});

describe('driftProblems', () => {
  it('is empty when the property matches the privacy page', () => {
    expect(driftProblems({ ...PRIVACY_PROMISES })).toEqual([]);
  });
  it('names each setting that no longer matches', () => {
    const problems = driftProblems({
      retention: 'TWO_MONTHS',
      resetOnNewActivity: false,
      googleSignals: 'GOOGLE_SIGNALS_DISABLED',
    });
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain('14 months');
  });
});
