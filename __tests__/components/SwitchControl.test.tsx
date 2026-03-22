import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import SwitchControl from '../../src/components/device-controls/SwitchControl';
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
  entity_id: 'switch.desk_lamp',
  domain: 'switch',
  state: null,
  ui_hints: null,
  error: null,
  ...overrides,
});

describe('SwitchControl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedControl.mockResolvedValue({
      success: true,
      entity_id: 'switch.desk_lamp',
      action: 'turn_on',
      error: null,
    });
  });

  it('shows Turn On and Turn Off buttons when no live state', () => {
    const state = makeState({ state: null });
    const { getByText } = render(
      <SwitchControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );
    expect(getByText('Turn On')).toBeTruthy();
    expect(getByText('Turn Off')).toBeTruthy();
  });

  it('shows toggle switch when live state is available (on)', () => {
    const state = makeState({ state: { state: 'on' } });
    const { getByText } = render(
      <SwitchControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );
    expect(getByText('On')).toBeTruthy();
  });

  it('shows "Off" text when live state is off', () => {
    const state = makeState({ state: { state: 'off' } });
    const { getByText } = render(
      <SwitchControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );
    expect(getByText('Off')).toBeTruthy();
  });

  it('calls controlDevice with turn_on when Turn On button pressed', async () => {
    const onStateChange = jest.fn();
    const state = makeState({ state: null });
    const { getByText } = render(
      <SwitchControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={onStateChange}
      />,
      { wrapper },
    );

    fireEvent.press(getByText('Turn On'));

    await waitFor(() => {
      expect(mockedControl).toHaveBeenCalledWith('hh-1', 'dev-1', 'turn_on');
    });

    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalled();
    });
  });
});
