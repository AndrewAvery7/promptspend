import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertFreeTiers, basisFacts, freeTierProblems, type FreeTierFile } from './types';

const ROOT = resolve(__dirname, '../../..');
const realFile: unknown = JSON.parse(readFileSync(resolve(ROOT, 'data/free-tiers.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(resolve(ROOT, 'public/data/pricing.json'), 'utf8')) as {
  providers: { id: string }[];
};

/** A minimal valid file, cloned per test so one mutation cannot leak into the next. */
function sample(): FreeTierFile {
  return structuredClone({
    schemaVersion: 1,
    providers: {
      acme: {
        verdict: 'ongoing',
        answer: 'Yes. Acme has a free tier.',
        card: 'no',
        training: 'yes',
        whatsFree: 'Acme Mini',
        updated: '2026-10-05',
        basis: { verdict: ['acme-free'], card: ['acme-free'], training: ['acme-data'] },
        facts: [
          {
            id: 'acme-free',
            topic: 'free',
            statement: 'Acme Mini is free.',
            quote: 'Acme Mini is free of charge.',
            url: 'https://acme.example/pricing',
            readOn: '2026-10-05',
          },
          {
            id: 'acme-data',
            topic: 'data',
            statement: 'Free prompts train models.',
            quote: 'We train on free usage.',
            url: 'https://acme.example/terms',
            readOn: '2026-10-04',
          },
        ],
        unpublished: [],
      },
    },
  } satisfies FreeTierFile);
}

describe('the free-tier data file', () => {
  it('passes its own gate and covers exactly the catalog providers', () => {
    const ids = catalog.providers.map((provider) => provider.id);
    expect(freeTierProblems(realFile, ids)).toEqual([]);
  });

  it('gives every headline answer at least one fact to stand on', () => {
    assertFreeTiers(realFile);
    for (const record of Object.values(realFile.providers)) {
      for (const key of ['verdict', 'card', 'training'] as const) {
        expect(basisFacts(record, key).length).toBeGreaterThan(0);
      }
    }
  });

  it('records every contradiction from both sides', () => {
    assertFreeTiers(realFile);
    for (const record of Object.values(realFile.providers)) {
      const byId = new Map(record.facts.map((fact) => [fact.id, fact]));
      for (const fact of record.facts) {
        if (fact.conflictsWith) expect(byId.get(fact.conflictsWith)?.conflictsWith).toBe(fact.id);
      }
    }
  });
});

describe('freeTierProblems', () => {
  it('accepts a well-formed file', () => {
    expect(freeTierProblems(sample(), ['acme'])).toEqual([]);
  });

  it('refuses a fact without the vendor’s own words', () => {
    const file = sample();
    file.providers.acme!.facts[0]!.quote = '  ';
    expect(freeTierProblems(file).join()).toContain("needs the vendor's own words");
  });

  it('refuses markdown left in a quote', () => {
    const file = sample();
    file.providers.acme!.facts[0]!.quote = 'Free · see [Billing](https://acme.example)';
    expect(freeTierProblems(file).join()).toContain('markdown markup');
    file.providers.acme!.facts[0]!.quote = '| Acme Mini | Free |';
    expect(freeTierProblems(file).join()).toContain('markdown markup');
  });

  it('refuses a source that is not https', () => {
    const file = sample();
    file.providers.acme!.facts[0]!.url = 'http://acme.example/pricing';
    expect(freeTierProblems(file).join()).toContain('url: must be an https URL');
  });

  it('refuses a read date after the record was last updated', () => {
    const file = sample();
    file.providers.acme!.facts[0]!.readOn = '2026-10-06';
    expect(freeTierProblems(file).join()).toContain('is after the record');
  });

  it('refuses a contradiction recorded from one side only', () => {
    const file = sample();
    file.providers.acme!.facts[0]!.conflictsWith = 'acme-data';
    expect(freeTierProblems(file).join()).toContain('but not the other way round');
    file.providers.acme!.facts[1]!.conflictsWith = 'acme-free';
    expect(freeTierProblems(file)).toEqual([]);
  });

  it('refuses a headline answer resting on a fact that does not exist', () => {
    const file = sample();
    file.providers.acme!.basis.card = ['acme-nowhere'];
    expect(freeTierProblems(file).join()).toContain('"acme-nowhere" is not a fact of this provider');
    file.providers.acme!.basis.card = [];
    expect(freeTierProblems(file).join()).toContain('must list at least one fact id');
  });

  it('refuses a fact id used twice', () => {
    const file = sample();
    file.providers.acme!.facts[1]!.id = 'acme-free';
    expect(freeTierProblems(file).join()).toContain('is used twice');
  });

  it('catches a misspelt field rather than ignoring it', () => {
    const file = sample() as unknown as { providers: { acme: Record<string, unknown> } };
    file.providers.acme.verdcit = 'none';
    expect(freeTierProblems(file).join()).toContain('unknown field "verdcit"');
  });

  it('refuses values outside the fixed answers', () => {
    const file = sample() as unknown as { providers: { acme: Record<string, unknown> } };
    file.providers.acme.verdict = 'maybe';
    file.providers.acme.card = 'sometimes';
    const problems = freeTierProblems(file).join();
    expect(problems).toContain('verdict: not one of');
    expect(problems).toContain('card: not one of');
  });

  it('demands a record for every catalog provider and nothing else', () => {
    const problems = freeTierProblems(sample(), ['acme', 'globex']);
    expect(problems).toContain('free-tiers: no record for catalog provider "globex"');
    expect(freeTierProblems(sample(), ['globex'])).toContain('free-tiers: "acme" is not a catalog provider');
  });

  it('reports every problem at once', () => {
    const file = sample();
    file.providers.acme!.facts[0]!.quote = '';
    file.providers.acme!.facts[1]!.url = 'nope';
    expect(freeTierProblems(file).length).toBeGreaterThanOrEqual(2);
  });

  it('throws with the full list from assertFreeTiers', () => {
    expect(() => assertFreeTiers({ schemaVersion: 2, providers: {} })).toThrow(/schemaVersion must be 1/);
  });
});
