import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

import ThinkingWave from '../../src/components/ThinkingWave';

// The bars animate forever by design; fake timers keep the loop from running during assertions.
jest.useFakeTimers();

const barsOf = (tree: any): any[] => (Array.isArray(tree?.children) ? tree.children : []);
const flatStyle = (node: any): Record<string, unknown> =>
  Object.assign({}, ...[node?.props?.style].flat(Infinity).filter(Boolean));

describe('ThinkingWave', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders five bars in the colour it is given', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const { toJSON } = render(<ThinkingWave color="#B39DDB" />);
    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());

    const bars = barsOf(toJSON());
    expect(bars).toHaveLength(5);
    bars.forEach((bar) => expect(flatStyle(bar).backgroundColor).toBe('#B39DDB'));
  });

  it('is hidden from screen readers, which read the status text beside it instead', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const { toJSON } = render(<ThinkingWave color="#B39DDB" />);
    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());

    const row: any = toJSON();
    expect(row.props.accessibilityElementsHidden).toBe(true);
    expect(row.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('stretches the bars when motion is allowed', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const { toJSON } = render(<ThinkingWave color="#B39DDB" />);
    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());

    const style = flatStyle(barsOf(toJSON())[0]);
    expect(style.transform).toBeDefined();
    expect(style.opacity).toBeUndefined();
  });

  it('pulses opacity instead of stretching when reduce motion is on', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { toJSON } = render(<ThinkingWave color="#B39DDB" />);
    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());

    const bars = barsOf(toJSON());
    expect(bars).toHaveLength(5);
    bars.forEach((bar) => {
      const style = flatStyle(bar);
      expect(style.opacity).toBeDefined();
      expect(style.transform).toBeUndefined();
    });
  });

  it('falls back to full motion when the accessibility query fails', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValue(new Error('nope'));
    const { toJSON } = render(<ThinkingWave color="#B39DDB" />);
    await waitFor(() => expect(flatStyle(barsOf(toJSON())[0]).transform).toBeDefined());
  });
});
