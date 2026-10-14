import { MD3DarkTheme } from 'react-native-paper';

import { blend, darkTheme, NAVY } from '../../src/theme';

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
// Navy, not grey: blue clearly leads red.
const isNavy = (color: string): boolean => {
  const [r, , b] = channels(color);
  return b - r >= 15;
};

describe('blend', () => {
  it('returns the base at 0 and the tint at 1', () => {
    expect(blend('#0f172a', '#94a3b8', 0)).toBe('rgb(15, 23, 42)');
    expect(blend('#0f172a', '#94a3b8', 1)).toBe('rgb(148, 163, 184)');
  });

  it('mixes each channel and rounds', () => {
    expect(blend('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
  });
});

describe('darkTheme surfaces', () => {
  const { colors } = darkTheme;
  const levels = [1, 2, 3, 4, 5].map(
    (n) => colors.elevation[`level${n}` as keyof typeof colors.elevation],
  );

  it('replaces every Paper grey surface token', () => {
    for (const key of ['surface', 'surfaceVariant', 'outlineVariant', 'secondaryContainer', 'background'] as const) {
      expect(colors[key]).not.toBe(MD3DarkTheme.colors[key]);
    }
    levels.forEach((level, i) => {
      expect(level).not.toBe(
        MD3DarkTheme.colors.elevation[`level${i + 1}` as keyof typeof colors.elevation],
      );
    });
  });

  it('keeps cards and filled inputs navy', () => {
    [...levels, colors.surfaceVariant, colors.outlineVariant, colors.secondaryContainer].forEach((c) =>
      expect(isNavy(c)).toBe(true),
    );
  });

  it('raises each elevation level above the background, one step at a time', () => {
    const lums = [colors.background, ...levels].map(luminance);
    for (let i = 1; i < lums.length; i++) expect(lums[i]).toBeGreaterThan(lums[i - 1]);
    expect(colors.background).toBe(NAVY.background);
  });

  it('keeps text readable (WCAG AA) on cards and filled inputs', () => {
    levels.forEach((level) =>
      expect(contrast(colors.onSurface, level)).toBeGreaterThanOrEqual(4.5),
    );
    expect(contrast(colors.onSurfaceVariant, colors.surfaceVariant)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.onSurface, colors.surfaceVariant)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.onSecondaryContainer, colors.secondaryContainer)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('lifts chips off the card they sit on', () => {
    expect(luminance(colors.secondaryContainer)).toBeGreaterThan(luminance(colors.elevation.level1));
  });

  it('keeps an outlined input border visible (3:1) on the background', () => {
    expect(contrast(colors.outline, colors.background)).toBeGreaterThanOrEqual(3);
  });
});
