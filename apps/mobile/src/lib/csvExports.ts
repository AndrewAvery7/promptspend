import { File, Paths } from 'expo-file-system';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export function isExpiredCsvExport(name: string, now = Date.now()): boolean {
  const match = /^promptspend-estimate-(\d{13})\.csv$/.exec(name);
  return !!match && Number(match[1]) < now - RETENTION_MS;
}

/** Only app-owned CSVs older than seven days; never remove the file currently being shared. */
export function cleanOldCsvExports(now = Date.now()): void {
  try {
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && isExpiredCsvExport(entry.name, now)) {
        try {
          entry.delete();
        } catch {
          /* Best-effort cleanup must not prevent a new export. */
        }
      }
    }
  } catch {
    /* A restricted cache directory should not prevent sharing. */
  }
}
