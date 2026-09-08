const COUNTRY_NAMES: Record<string, string> = {
  CA: 'Canada',
  CN: 'China',
  FR: 'France',
  US: 'United States',
};

export function countryName(code: string): string {
  const upper = code.trim().toUpperCase();
  return COUNTRY_NAMES[upper] ?? upper;
}

/** Returns a compact, platform-native flag for an ISO alpha-2 country code. */
export function countryFlag(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return '🌐';
  return String.fromCodePoint(
    ...[...upper].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  );
}
