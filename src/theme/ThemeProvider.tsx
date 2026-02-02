import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme as NavDarkTheme, DefaultTheme as NavLightTheme } from '@react-navigation/native';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import { MD3Theme } from 'react-native-paper';

import { darkTheme, lightTheme } from '.';

type ThemeName = 'light' | 'dark';

type ThemeContextValue = {
  themeName: ThemeName;
  isDark: boolean;
  paperTheme: MD3Theme;
  navTheme: typeof NavLightTheme;
  setThemeName: (name: ThemeName) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = '@jarvis_node_mobile/theme';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const getInitialTheme = async (): Promise<ThemeName> => {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  const sys = Appearance.getColorScheme();
  return sys === 'dark' ? 'dark' : 'light';
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [themeName, setThemeNameState] = useState<ThemeName>('light');
  const isDark = themeName === 'dark';

  useEffect(() => {
    getInitialTheme().then(setThemeNameState).catch(() => setThemeNameState('light'));
  }, []);

  const persist = (name: ThemeName) => {
    setThemeNameState(name);
    AsyncStorage.setItem(STORAGE_KEY, name).catch(() => {});
  };

  const setThemeName = (name: ThemeName) => {
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
      themeName,
      isDark,
      paperTheme,
      navTheme,
      setThemeName,
      toggleTheme,
    }),
    [isDark, navTheme, paperTheme, themeName],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemePreference = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePreference must be used within ThemeProvider');
  return ctx;
};
