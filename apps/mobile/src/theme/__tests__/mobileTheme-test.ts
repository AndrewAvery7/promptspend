import { createMobileTheme, type AccentName, type CanvasName } from '@/theme/tokens';
import { parseAppearanceState } from '@/theme/useMobileTheme';

const accents: AccentName[] = ['cobalt', 'emerald', 'teal', 'violet'];
const canvases: CanvasName[] = ['cool', 'warm'];

describe('mobile appearance and contrast', () => {
  test('sanitizes persisted appearance choices', () => {
    expect(parseAppearanceState({ accent: 'violet', canvas: 'warm', mode: 'dark' })).toEqual({
      accent: 'violet',
      canvas: 'warm',
      mode: 'dark',
    });
    expect(parseAppearanceState({ accent: 'hot-pink', canvas: 'paper', mode: 'night' })).toEqual({
      accent: 'cobalt',
      canvas: 'cool',
      mode: 'system',
    });
    expect(parseAppearanceState('corrupt')).toEqual({
      accent: 'cobalt',
      canvas: 'cool',
      mode: 'system',
    });
  });

  test.each([false, true])('meets text contrast gates when dark=%s', (isDark) => {
    for (const accent of accents) {
      for (const canvas of canvases) {
        const theme = createMobileTheme(isDark, accent, canvas);
        expect(contrast(theme.text, theme.background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.text, theme.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.mutedText, theme.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.onAccent, theme.accent)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
