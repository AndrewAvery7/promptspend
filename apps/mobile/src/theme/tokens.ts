export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentName = 'cobalt' | 'emerald' | 'teal' | 'violet';
export type CanvasName = 'cool' | 'warm';

export type MobileTheme = {
  accent: string;
  accentSoft: string;
  background: string;
  border: string;
  borderStrong: string;
  danger: string;
  information: string;
  mutedText: string;
  onAccent: string;
  savings: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  warning: string;
};

const base = {
  light: {
    cool: {
      background: '#EBEFF5',
      border: '#DCE2EB',
      borderStrong: '#808A98',
      mutedText: '#5F6B78',
      surface: '#FFFFFF',
      surfaceRaised: '#FAFBFD',
      text: '#15181D',
    },
    warm: {
      background: '#F5F1E8',
      border: '#E0D8C4',
      borderStrong: '#95886F',
      mutedText: '#6E6858',
      surface: '#FFFDF6',
      surfaceRaised: '#F7F3E9',
      text: '#191613',
    },
  },
  dark: {
    cool: {
      background: '#0B0E14',
      border: '#27303F',
      borderStrong: '#68768C',
      mutedText: '#93A0B4',
      surface: '#121722',
      surfaceRaised: '#1A2130',
      text: '#E9ECF2',
    },
    warm: {
      background: '#0C0E11',
      border: '#2A2E34',
      borderStrong: '#6F736F',
      mutedText: '#9C968A',
      surface: '#14171B',
      surfaceRaised: '#1C2026',
      text: '#F0ECE1',
    },
  },
} as const;

const accents = {
  light: {
    cobalt: { accent: '#2456E6', accentSoft: '#E4EAFC', onAccent: '#FFFFFF' },
    emerald: { accent: '#047857', accentSoft: '#DFF2EA', onAccent: '#FFFFFF' },
    teal: { accent: '#0B6C85', accentSoft: '#DFF2F7', onAccent: '#FFFFFF' },
    violet: { accent: '#6D28D9', accentSoft: '#EDE7FB', onAccent: '#FFFFFF' },
  },
  dark: {
    cobalt: { accent: '#7C9DFF', accentSoft: 'rgba(124, 157, 255, 0.15)', onAccent: '#08122B' },
    emerald: { accent: '#34D399', accentSoft: 'rgba(52, 211, 153, 0.15)', onAccent: '#04241A' },
    teal: { accent: '#41C6E0', accentSoft: 'rgba(65, 198, 224, 0.15)', onAccent: '#04222A' },
    violet: { accent: '#A78BFA', accentSoft: 'rgba(167, 139, 250, 0.15)', onAccent: '#1A0F36' },
  },
} as const;

export function createMobileTheme(
  isDark: boolean,
  accentName: AccentName = 'cobalt',
  canvasName: CanvasName = 'cool',
): MobileTheme {
  const scheme = isDark ? 'dark' : 'light';
  return {
    ...base[scheme][canvasName],
    ...accents[scheme][accentName],
    danger: isDark ? '#F97066' : '#C62828',
    information: isDark ? '#4D93CE' : '#2166A5',
    savings: isDark ? '#3CCB7F' : '#0E7B43',
    warning: isDark ? '#F5B849' : '#9A5B08',
  };
}

export const lightTheme = createMobileTheme(false);
export const darkTheme = createMobileTheme(true);
