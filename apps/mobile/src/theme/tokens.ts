export type MobileTheme = {
  accent: string;
  accentSoft: string;
  background: string;
  border: string;
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

export const lightTheme: MobileTheme = {
  accent: '#2456E6',
  accentSoft: '#E4EAFC',
  background: '#EBEFF5',
  border: '#DCE2EB',
  danger: '#C62828',
  information: '#2166A5',
  mutedText: '#5F6B78',
  onAccent: '#FFFFFF',
  savings: '#0E7B43',
  surface: '#FFFFFF',
  surfaceRaised: '#FAFBFD',
  text: '#15181D',
  warning: '#9A5B08',
};

export const darkTheme: MobileTheme = {
  accent: '#7C9DFF',
  accentSoft: 'rgba(124, 157, 255, 0.15)',
  background: '#0B0E14',
  border: '#27303F',
  danger: '#F97066',
  information: '#4D93CE',
  mutedText: '#93A0B4',
  onAccent: '#08122B',
  savings: '#3CCB7F',
  surface: '#121722',
  surfaceRaised: '#1A2130',
  text: '#E9ECF2',
  warning: '#F5B849',
};
