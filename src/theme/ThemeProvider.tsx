import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme as NavDarkTheme, DefaultTheme as NavLightTheme } from '@react-navigation/native';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import { MD3Theme } from 'react-native-paper';

import { darkTheme, lightTheme } from '.';

export type ThemePreference = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  themePreference: ThemePreference;
  isDark: boolean;
  paperTheme: MD3Theme;
  navTheme: typeof NavLightTheme;
  setThemePreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
  // Keep old name as alias for backward compat
  themeName: 'light' | 'dark';
  setThemeName: (name: 'light' | 'dark') => void;
};

import { THEME_KEY as STORAGE_KEY } from '../config/storageKeys';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const resolveSystemScheme = (): 'light' | 'dark' => {
  const sys = Appearance.getColorScheme();
  return sys === 'dark' ? 'dark' : 'light';
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [themePreference, setThemePrefState] = useState<ThemePreference>('system');
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(resolveSystemScheme);

  // Load persisted preference
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setThemePrefState(stored);
        }
      })
      .catch(() => {});
  }, []);

  // Listen for system appearance changes
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => sub.remove();
  }, []);

  const isDark = themePreference === 'system' ? systemScheme === 'dark' : themePreference === 'dark';
  const themeName: 'light' | 'dark' = isDark ? 'dark' : 'light';

  const persist = (pref: ThemePreference) => {
    setThemePrefState(pref);
    AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => {});
  };

  const setThemePreference = (pref: ThemePreference) => {
    persist(pref);
  };

  const setThemeName = (name: 'light' | 'dark') => {
    persist(name);
  };

  const toggleTheme = () => {
    persist(isDark ? 'light' : 'dark');
  };

  const paperTheme = useMemo(() => (isDark ? darkTheme : lightTheme), [isDark]);
  const navTheme = useMemo(
    () => ({
      ...(isDark ? NavDarkTheme : NavLightTheme),
      colors: {
        ...(isDark ? NavDarkTheme.colors : NavLightTheme.colors),
        background: paperTheme.colors.background,
        card: paperTheme.colors.surface,
        text: paperTheme.colors.onSurface,
      },
    }),
    [isDark, paperTheme],
  );

  const value = useMemo(
    () => ({
      themePreference,
      themeName,
      isDark,
      paperTheme,
      navTheme,
      setThemePreference,
      setThemeName,
      toggleTheme,
    }),
    [isDark, navTheme, paperTheme, themePreference, themeName],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemePreference = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePreference must be used within ThemeProvider');
  return ctx;
};
