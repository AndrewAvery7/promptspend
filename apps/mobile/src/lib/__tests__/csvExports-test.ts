import { isExpiredCsvExport, cleanOldCsvExports } from '@/lib/csvExports';

const now = Date.UTC(2026, 7, 31);
test('CSV retention only selects app-owned exports older than seven days', () => {
  expect(isExpiredCsvExport(`promptspend-estimate-${now - 8 * 86400000}.csv`, now)).toBe(true);
  expect(isExpiredCsvExport(`promptspend-estimate-${now - 7 * 86400000}.csv`, now)).toBe(false);
  expect(isExpiredCsvExport(`promptspend-estimate-${now}.csv`, now)).toBe(false);
  expect(isExpiredCsvExport(`user-estimate-${now - 8 * 86400000}.csv`, now)).toBe(false);
  expect(isExpiredCsvExport('promptspend-estimate-invalid.csv', now)).toBe(false);
  expect(isExpiredCsvExport(`promptspend-estimate-${now - 8 * 86400000}.png`, now)).toBe(false);
});

test('an unavailable cache directory does not stop a new export', () => {
  expect(() => cleanOldCsvExports(now)).not.toThrow();
});
