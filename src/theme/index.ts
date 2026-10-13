import { MD3DarkTheme, MD3LightTheme, MD3Theme } from 'react-native-paper';

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: 8,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#7E57C2',
    secondary: '#22c55e',
    tertiary: '#0891b2',
    background: '#f8fafc',
    surface: '#ffffff',
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  roundness: 8,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#B39DDB',
    secondary: '#4ade80',
    tertiary: '#38bdf8',
    background: '#0f172a',
    surface: '#0b1222',
  },
};

export default lightTheme;

/**
 * Page-title text style: the bold headlineMedium used by the tab screens that
 * draw their own header (Nodes, Routines, Inbox, Settings). Pass it as
 * `Appbar.Content`'s `titleStyle` so Appbar-based pages match them.
 */
export const pageTitleStyle = (theme: MD3Theme) => ({
  ...theme.fonts.headlineMedium,
  fontWeight: 'bold' as const,
});
