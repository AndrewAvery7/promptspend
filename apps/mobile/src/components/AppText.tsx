import { StyleSheet, Text as NativeText, type TextProps, type TextStyle } from 'react-native';

export const FONT_FAMILIES = {
  body: 'IBM Plex Sans',
  display: 'Space Grotesk',
  numeric: 'JetBrains Mono',
} as const;

/**
 * App-wide native text foundation.
 *
 * The fonts are embedded by the Expo config plugin, never downloaded at
 * runtime. Headers use the display face and tabular figures use the numeric
 * face while every other label inherits the body family. Font scaling remains
 * enabled and deliberately uncapped for Dynamic Type and Android font scaling.
 */
export function AppText({ accessibilityRole, style, ...props }: TextProps) {
  const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
  const isNumeric = flattened?.fontVariant?.includes('tabular-nums') ?? false;
  const fontFamily =
    flattened?.fontFamily ??
    (accessibilityRole === 'header'
      ? FONT_FAMILIES.display
      : isNumeric
        ? FONT_FAMILIES.numeric
        : FONT_FAMILIES.body);
  const requestedWeight = Number(flattened?.fontWeight ?? 400);
  const fontWeight: TextStyle['fontWeight'] =
    fontFamily === FONT_FAMILIES.display
      ? requestedWeight >= 600
        ? '700'
        : '500'
      : fontFamily === FONT_FAMILIES.numeric
        ? requestedWeight >= 600
          ? '700'
          : '400'
        : requestedWeight >= 500
          ? '600'
          : '400';

  return (
    <NativeText
      accessibilityRole={accessibilityRole}
      allowFontScaling
      {...props}
      style={[style, { fontFamily, fontWeight }]}
    />
  );
}
