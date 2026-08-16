interface CatalogBadgeCounts {
  models: number;
  providers: number;
}

interface BadgeReplacement {
  label: string;
  pattern: RegExp;
  replacement: string;
}

/**
 * Keep the README's machine-readable badge URLs and human-readable alt text in
 * lockstep with the catalog candidate the daily sync just produced.
 *
 * Each pattern is intentionally required exactly once. Silently doing nothing
 * after a future README redesign would recreate the stale-claim failure this
 * helper exists to prevent.
 */
export function updateCatalogBadges(readme: string, counts: CatalogBadgeCounts): string {
  const replacements: BadgeReplacement[] = [
    {
      label: 'model badge URL',
      pattern: /badge\/models-\d+-2456E6\.svg/g,
      replacement: `badge/models-${counts.models}-2456E6.svg`,
    },
    {
      label: 'model badge alt text',
      pattern: /alt="\d+ models tracked"/g,
      replacement: `alt="${counts.models} models tracked"`,
    },
    {
      label: 'provider badge URL',
      pattern: /badge\/providers-\d+-2456E6\.svg/g,
      replacement: `badge/providers-${counts.providers}-2456E6.svg`,
    },
    {
      label: 'provider badge alt text',
      pattern: /alt="\d+ providers"/g,
      replacement: `alt="${counts.providers} providers"`,
    },
  ];

  let updated = readme;
  for (const { label, pattern, replacement } of replacements) {
    const matches = [...updated.matchAll(pattern)];
    if (matches.length !== 1) {
      throw new Error(`README must contain exactly one ${label}; found ${matches.length}`);
    }
    updated = updated.replace(pattern, replacement);
  }

  return updated;
}
