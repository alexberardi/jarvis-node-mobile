import { categoryChipColors, CHIP_FILLS } from '../../src/theme/categoryChip';
import { darkTheme, lightTheme } from '../../src/theme';

// WCAG 2.x relative luminance / contrast ratio for "#rrggbb" or "rgb(r, g, b)".
const channels = (color: string): number[] => {
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (rgb) return rgb.slice(1, 4).map(Number);
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
};
const luminance = (color: string): number => {
  const [r, g, b] = channels(color).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const AA = 4.5;

describe('categoryChipColors', () => {
  const fills = { fact: CHIP_FILLS.emerald };

  it('uses the category fill with white text for a known category', () => {
    expect(categoryChipColors('fact', fills, lightTheme)).toEqual({
      backgroundColor: CHIP_FILLS.emerald,
      color: '#ffffff',
    });
  });

  it.each([
    ['light', lightTheme],
    ['dark', darkTheme],
  ])('falls back to the secondary container pair in %s mode', (_, theme) => {
    const colors = categoryChipColors('family', fills, theme);
    expect(colors).toEqual({
      backgroundColor: theme.colors.secondaryContainer,
      color: theme.colors.onSecondaryContainer,
    });
    expect(contrast(colors.backgroundColor, colors.color)).toBeGreaterThanOrEqual(AA);
  });

  it.each(Object.entries(CHIP_FILLS))('%s fill meets WCAG AA against white', (_, fill) => {
    expect(contrast(fill, '#ffffff')).toBeGreaterThanOrEqual(AA);
  });
});
