import type { ThemeMode } from '@time-tracker/domain';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'tempo.theme';

type ThemeContextValue = { mode: ThemeMode; setMode: (mode: ThemeMode) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(mode);
      document.documentElement.style.colorScheme = resolveTheme(mode);
    };
    apply();
    localStorage.setItem(STORAGE_KEY, mode);
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [mode]);

  const value = useMemo(() => ({ mode, setMode }), [mode]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

// Theme hooks intentionally live beside their provider; both share the same private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const value = use(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
