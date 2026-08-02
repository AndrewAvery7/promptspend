import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
export type Accent = 'cobalt' | 'emerald' | 'teal' | 'violet';
export type Canvas = 'cool' | 'warm';

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: 'cobalt', label: 'Cobalt', swatch: '#2456E6' },
  { id: 'emerald', label: 'Emerald', swatch: '#059669' },
  { id: 'teal', label: 'Teal', swatch: '#0891B2' },
  { id: 'violet', label: 'Violet', swatch: '#6D28D9' },
];

const KEYS = { theme: 'tt.theme', accent: 'tt.accent', canvas: 'tt.canvas' } as const;

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key) as T | null;
    if (stored && allowed.includes(stored)) return stored;
  } catch {
    /* private mode — fall through to the default */
  }
  return fallback;
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* nothing to do: appearance is a nice-to-have, not state we must keep */
  }
}

/** Theme, brand accent and canvas, persisted and reflected onto <html>. */
export function useAppearance() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = read<Theme>(KEYS.theme, ['light', 'dark'], 'light');
    try {
      if (!localStorage.getItem(KEYS.theme) && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch {
      /* ignore */
    }
    return stored;
  });
  const [accent, setAccentState] = useState<Accent>(() =>
    read<Accent>(KEYS.accent, ['cobalt', 'emerald', 'teal', 'violet'], 'cobalt'),
  );
  const [canvas, setCanvasState] = useState<Canvas>(() =>
    read<Canvas>(KEYS.canvas, ['cool', 'warm'], 'cool'),
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.accent = accent;
    root.dataset.canvas = canvas;
  }, [theme, accent, canvas]);

  const setTheme = useCallback((value: Theme) => {
    setThemeState(value);
    persist(KEYS.theme, value);
  }, []);
  const setAccent = useCallback((value: Accent) => {
    setAccentState(value);
    persist(KEYS.accent, value);
  }, []);
  const setCanvas = useCallback((value: Canvas) => {
    setCanvasState(value);
    persist(KEYS.canvas, value);
  }, []);

  const toggleTheme = useCallback(() => setTheme(theme === 'light' ? 'dark' : 'light'), [theme, setTheme]);

  return { theme, accent, canvas, setTheme, setAccent, setCanvas, toggleTheme };
}
