// Runtime light/dark theme. useTheme() works WITHOUT a provider (returns dark),
// so components that render outside a ThemeProvider (e.g. the mobile app) stay on
// the dark Palette 1 and never crash. Wrap the TV game tree in <ThemeProvider> to
// enable the in-app toggle.

import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { darkTheme, lightTheme, type ThemeMode, type ThemeTokens } from './themes';

const STORAGE_KEY = 'ue.themeMode';

interface ThemeContextValue {
  theme: ThemeTokens;
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: darkTheme,
  mode: 'dark',
  toggle: () => {},
  setMode: () => {},
});

// AsyncStorage is a peer dep provided by the host apps. Load lazily so importing
// the theme layer never hard-requires it (keeps web/SSR and tests happy).
type AsyncStorageLike = {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
};

function loadAsyncStorage(): AsyncStorageLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-native-async-storage/async-storage').default as AsyncStorageLike;
  } catch {
    return null;
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  // Restore the persisted choice on mount.
  useEffect(() => {
    const storage = loadAsyncStorage();
    if (!storage) return;
    let cancelled = false;
    storage.getItem(STORAGE_KEY).then((value) => {
      if (!cancelled && (value === 'dark' || value === 'light')) {
        setModeState(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    loadAsyncStorage()?.setItem(STORAGE_KEY, next);
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      loadAsyncStorage()?.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: mode === 'light' ? lightTheme : darkTheme, mode, toggle, setMode }),
    [mode, toggle, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);
