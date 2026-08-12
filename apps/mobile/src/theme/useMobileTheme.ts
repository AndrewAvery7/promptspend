import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  createElement,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import {
  createMobileTheme,
  type AccentName,
  type CanvasName,
  type ThemeMode,
} from './tokens';

const STORAGE_KEY = 'promptspend:appearance:v1';

interface AppearanceState {
  accent: AccentName;
  canvas: CanvasName;
  mode: ThemeMode;
}

interface MobileThemeContextValue extends AppearanceState {
  isDark: boolean;
  setAccent: (accent: AccentName) => void;
  setCanvas: (canvas: CanvasName) => void;
  setMode: (mode: ThemeMode) => void;
  theme: ReturnType<typeof createMobileTheme>;
}

const DEFAULT_APPEARANCE: AppearanceState = {
  accent: 'cobalt',
  canvas: 'cool',
  mode: 'system',
};

const MobileThemeContext = createContext<MobileThemeContextValue | null>(null);

export function MobileThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!active || !stored) return;
      try {
        const value = JSON.parse(stored) as Partial<AppearanceState>;
        setAppearance({
          accent: isAccent(value.accent) ? value.accent : DEFAULT_APPEARANCE.accent,
          canvas: value.canvas === 'warm' ? 'warm' : 'cool',
          mode: value.mode === 'light' || value.mode === 'dark' ? value.mode : 'system',
        });
      } catch {
        // Appearance is optional, non-sensitive state. Invalid storage falls back safely.
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(appearance)).catch(() => {
      // A full or read-only device must not stop the app from rendering.
    });
  }, [appearance]);

  const isDark = appearance.mode === 'system' ? systemScheme === 'dark' : appearance.mode === 'dark';
  const value = useMemo<MobileThemeContextValue>(
    () => ({
      ...appearance,
      isDark,
      setAccent: (accent) => setAppearance((current) => ({ ...current, accent })),
      setCanvas: (canvas) => setAppearance((current) => ({ ...current, canvas })),
      setMode: (mode) => setAppearance((current) => ({ ...current, mode })),
      theme: createMobileTheme(isDark, appearance.accent, appearance.canvas),
    }),
    [appearance, isDark],
  );

  return createElement(MobileThemeContext.Provider, { value }, children);
}

export function useMobileTheme(): MobileThemeContextValue {
  const value = useContext(MobileThemeContext);
  if (!value) throw new Error('useMobileTheme must be used within MobileThemeProvider.');
  return value;
}

function isAccent(value: unknown): value is AccentName {
  return value === 'cobalt' || value === 'emerald' || value === 'teal' || value === 'violet';
}
