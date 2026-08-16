import { describe, expect, it } from 'vitest';
import { updateCatalogBadges } from './readme-badges';

const README = `
<img src="https://img.shields.io/badge/models-69-2456E6.svg" alt="69 models tracked">
<img src="https://img.shields.io/badge/providers-12-2456E6.svg" alt="12 providers">

PromptSpend compares 69 hand-curated examples in this unrelated paragraph.
`;

describe('updateCatalogBadges', () => {
  it('updates both badge URLs and accessible alt text without rewriting prose', () => {
    const updated = updateCatalogBadges(README, { models: 72, providers: 13 });

    expect(updated).toContain('badge/models-72-2456E6.svg');
    expect(updated).toContain('alt="72 models tracked"');
    expect(updated).toContain('badge/providers-13-2456E6.svg');
    expect(updated).toContain('alt="13 providers"');
    expect(updated).toContain('compares 69 hand-curated examples');
  });

  it('fails closed if a README redesign removes a required claim', () => {
    expect(() =>
      updateCatalogBadges(README.replace(/.*providers.*\n/g, ''), { models: 72, providers: 13 }),
    ).toThrow(/provider badge URL/);
  });

  it('fails closed if a duplicated badge would make the replacement ambiguous', () => {
    expect(() => updateCatalogBadges(`${README}${README}`, { models: 72, providers: 13 })).toThrow(
      /model badge URL.*found 2/,
    );
  });
});
