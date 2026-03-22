import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import LockControl from '../../src/components/device-controls/LockControl';
import { lightTheme } from '../../src/theme';
import { controlDevice } from '../../src/api/smartHomeApi';
import type { DeviceState } from '../../src/types/SmartHome';

jest.mock('../../src/api/smartHomeApi', () => ({
  controlDevice: jest.fn(),
}));

const mockedControl = controlDevice as jest.MockedFunction<typeof controlDevice>;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const makeState = (overrides: Partial<DeviceState> = {}): DeviceState => ({
  entity_id: 'lock.front_door',
  domain: 'lock',
  state: null,
  ui_hints: null,
  error: null,
  ...overrides,
});

describe('LockControl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedControl.mockResolvedValue({
      success: true,
      entity_id: 'lock.front_door',
      action: 'lock',
      error: null,
    });
  });

  it('shows both Lock and Unlock buttons when no live state', () => {
    const state = makeState({ state: null });
    const { getByText } = render(
      <LockControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );
    expect(getByText('Lock')).toBeTruthy();
    expect(getByText('Unlock')).toBeTruthy();
  });

  it('shows "Locked" status with Unlock button when locked', () => {
    const state = makeState({ state: { is_locked: true } });
    const { getByText } = render(
      <LockControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );
    expect(getByText('Locked')).toBeTruthy();
    expect(getByText('Unlock')).toBeTruthy();
  });

  it('shows "Unlocked" status with Lock button when unlocked', () => {
    const state = makeState({ state: { is_locked: false } });
    const { getByText } = render(
      <LockControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );
    expect(getByText('Unlocked')).toBeTruthy();
    expect(getByText('Lock')).toBeTruthy();
  });

  it('calls controlDevice with lock action when Lock is pressed (no live state)', async () => {
    const onStateChange = jest.fn();
    const state = makeState({ state: null });
    const { getByText } = render(
      <LockControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={onStateChange}
      />,
      { wrapper },
    );

    fireEvent.press(getByText('Lock'));

    await waitFor(() => {
      expect(mockedControl).toHaveBeenCalledWith('hh-1', 'dev-1', 'lock');
    });

    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalled();
    });
  });

  it('detects locked state from state string "locked"', () => {
    const state = makeState({ state: { state: 'locked' } });
    const { getByText } = render(
      <LockControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );
    expect(getByText('Locked')).toBeTruthy();
  });
});
