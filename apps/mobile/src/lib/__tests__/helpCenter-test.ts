import { HELP_CATEGORIES, HELP_ENTRIES, searchHelpEntries, type HelpDestination } from '@/lib/helpCenter';

describe('mobile Help and FAQ catalog', () => {
  test('covers every product area with unique, substantial entries', () => {
    expect(HELP_ENTRIES.length).toBeGreaterThanOrEqual(55);
    expect(new Set(HELP_ENTRIES.map((entry) => entry.id)).size).toBe(HELP_ENTRIES.length);

    for (const category of HELP_CATEGORIES) {
      expect(HELP_ENTRIES.some((entry) => entry.category === category.id)).toBe(true);
    }
    for (const entry of HELP_ENTRIES) {
      expect(entry.question.length).toBeGreaterThan(12);
      expect(entry.answer.join(' ').length).toBeGreaterThan(100);
      expect(entry.keywords.length).toBeGreaterThan(2);
    }
  });

  test.each([
    ['compare four models', 'compare-select'],
    ['paste prompt or token count', 'estimate-paste-tokens'],
    ['country filter', 'estimate-model-country'],
    ['six digit alert code', 'data-manage-code'],
    ['right side clipped', 'troubleshooting-display'],
  ])('finds natural-language help for %s', (query, expectedId) => {
    expect(searchHelpEntries(query).map((entry) => entry.id)).toContain(expectedId);
  });

  test('keeps in-app actions inside known destinations', () => {
    const destinations = new Set<HelpDestination>(['home', 'estimate', 'compare', 'data', 'learn']);
    for (const entry of HELP_ENTRIES) {
      if (entry.action) expect(destinations.has(entry.action.destination)).toBe(true);
    }
  });
});
