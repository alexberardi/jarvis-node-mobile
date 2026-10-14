import { MD3DarkTheme, MD3LightTheme, MD3Theme } from 'react-native-paper';

/**
 * Blend `tint` over `base` at `alpha` (0–1) and return an opaque "rgb(r, g, b)".
 *
 * MD3 builds its dark elevation surfaces the same way (primary over a neutral
 * at 5–14%). They have to be opaque: Paper's Surface moves the shadow onto its
 * children when the background has transparency.
 */
export const blend = (base: string, tint: string, alpha: number): string => {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [b, t] = [rgb(base), rgb(tint)];
  const mixed = b.map((v, i) => Math.round(v + (t[i] - v) * alpha));
  return `rgb(${mixed.join(', ')})`;
};

/**
 * The dark theme's navy palette (Tailwind slate). Paper's MD3DarkTheme
 * surfaces are a warm grey (#1C1B1F, #49454F, rgb(37, 35, 42)…), which read
 * as grey boxes on this navy background, so every surface token Paper draws
 * cards, filled inputs, menus and dividers with comes from here instead.
 */
export const NAVY = {
  background: '#0f172a', // slate-900
  surface: '#0b1222',
  tint: '#94a3b8', // slate-400, blended over the background for elevation
  surfaceVariant: '#1e293b', // slate-800: filled TextInput, contained Card
  onSurfaceVariant: '#cbd5e1', // slate-300
  outline: '#94a3b8', // slate-400: outlined TextInput border
  outlineVariant: '#334155', // slate-700: Divider
  // Chips, the selected SegmentedButton, category-chip fallback. Paper's is a
  // grey-purple (#4A4458); this is a navy-indigo that still lifts off a card.
  secondaryContainer: '#2e3561',
} as const;

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
    background: NAVY.background,
    surface: NAVY.surface,
    surfaceVariant: NAVY.surfaceVariant,
    onSurfaceVariant: NAVY.onSurfaceVariant,
    outline: NAVY.outline,
    outlineVariant: NAVY.outlineVariant,
    secondaryContainer: NAVY.secondaryContainer,
    elevation: {
      level0: 'transparent',
      // Same alphas as MD3's dark elevation overlay.
      level1: blend(NAVY.background, NAVY.tint, 0.05),
      level2: blend(NAVY.background, NAVY.tint, 0.08),
      level3: blend(NAVY.background, NAVY.tint, 0.11),
      level4: blend(NAVY.background, NAVY.tint, 0.12),
      level5: blend(NAVY.background, NAVY.tint, 0.14),
    },
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
