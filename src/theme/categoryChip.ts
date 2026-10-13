import type { MD3Theme } from 'react-native-paper';

/**
 * Colors for the small category chips on the Memories and Inbox lists.
 *
 * Known categories get a saturated fill with white text. Every fill here is
 * at least 4.5:1 against white (WCAG AA for the chips' 10px text) — the old
 * 500-weight shades (emerald, amber, sky) were 2.1–2.8:1.
 *
 * A category with no entry (e.g. memory "family", inbox "errand_plan") falls
 * back to the theme's secondaryContainer / onSecondaryContainer pair. It used
 * to keep the white text, which on the light theme's pale lavender container
 * was ~1.3:1 and unreadable.
 */
export const CHIP_FILLS = {
  indigo: '#4f46e5',
  emerald: '#047857',
  amber: '#b45309',
  slate: '#64748b',
  sky: '#0369a1',
  red: '#dc2626',
  blue: '#2563eb',
  violet: '#7c3aed',
} as const;

const ON_FILL = '#ffffff';

export interface ChipColors {
  backgroundColor: string;
  color: string;
}

export const categoryChipColors = (
  category: string,
  fills: Record<string, string>,
  theme: MD3Theme,
): ChipColors => {
  const fill = fills[category];
  return fill
    ? { backgroundColor: fill, color: ON_FILL }
    : {
        backgroundColor: theme.colors.secondaryContainer,
        color: theme.colors.onSecondaryContainer,
      };
};
