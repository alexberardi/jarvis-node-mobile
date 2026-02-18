import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import SafeButton from '../../src/components/SafeButton';
import { lightTheme } from '../../src/theme';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('SafeButton', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should render with children text', () => {
    const { getByText } = render(
      <SafeButton mode="contained">Press Me</SafeButton>,
      { wrapper }
    );

    expect(getByText('Press Me')).toBeTruthy();
  });

  it('should call onPress when pressed', () => {
    const onPress = jest.fn();

    const { getByText } = render(
      <SafeButton mode="contained" onPress={onPress}>
        Click
      </SafeButton>,
      { wrapper }
    );

    fireEvent.press(getByText('Click'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('should prevent double taps within debounce period', () => {
    const onPress = jest.fn();

    const { getByText } = render(
      <SafeButton mode="contained" onPress={onPress} debounceMs={1000}>
        Click
      </SafeButton>,
      { wrapper }
    );

    fireEvent.press(getByText('Click'));
    fireEvent.press(getByText('Click'));
    fireEvent.press(getByText('Click'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('should re-enable after debounce period', async () => {
    const onPress = jest.fn().mockResolvedValue(undefined);

    const { getByText } = render(
      <SafeButton mode="contained" onPress={onPress} debounceMs={500}>
        Click
      </SafeButton>,
      { wrapper }
    );

    // First press (async handler)
    await act(async () => {
      fireEvent.press(getByText('Click'));
    });
    expect(onPress).toHaveBeenCalledTimes(1);

    // Advance past debounce
    act(() => {
      jest.advanceTimersByTime(600);
    });

    // Second press should work now
    await act(async () => {
      fireEvent.press(getByText('Click'));
    });
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('should not call onPress when disabled', () => {
    const onPress = jest.fn();

    const { getByText } = render(
      <SafeButton mode="contained" onPress={onPress} disabled>
        Click
      </SafeButton>,
      { wrapper }
    );

    fireEvent.press(getByText('Click'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('should handle async onPress', async () => {
    const onPress = jest.fn().mockResolvedValue(undefined);

    const { getByText } = render(
      <SafeButton mode="contained" onPress={onPress}>
        Async
      </SafeButton>,
      { wrapper }
    );

    await act(async () => {
      fireEvent.press(getByText('Async'));
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
