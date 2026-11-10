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

  it('shows Unknown with Turn On and Turn Off buttons when no live state', () => {
    const state = makeState({ state: null, error: 'Device unreachable' });
    const { getByText } = render(
      <SwitchControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );
    expect(getByText('Unknown')).toBeTruthy();
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

  // The action comes from the Switch's new value, not from the believed state,
  // so a wrong believed state can't turn "switch off" into turn_on (#518).
  it.each([
    ['off', false, 'turn_off'],
    ['on', false, 'turn_off'],
    ['off', true, 'turn_on'],
    ['on', true, 'turn_on'],
  ])('believed %s, switch set to %s sends %s', async (believed, value, action) => {
    const { getByTestId } = render(
      <SwitchControl
        householdId="hh-1"
        deviceId="dev-1"
        state={makeState({ state: { state: believed } })}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );

    fireEvent(getByTestId('switch-power-switch'), 'valueChange', value);

    await waitFor(() => expect(mockedControl).toHaveBeenCalledWith('hh-1', 'dev-1', action));
    expect(mockedControl).toHaveBeenCalledTimes(1);
  });

  it('shows an unknown state as indeterminate, with Turn On and Turn Off', async () => {
    const onStateChange = jest.fn();
    const { getByTestId, getByText, queryByTestId, queryByText } = render(
      <SwitchControl
        householdId="hh-1"
        deviceId="dev-1"
        state={makeState({ state: { state: 'unknown' } })}
        onStateChange={onStateChange}
      />,
      { wrapper },
    );

    expect(getByText('Unknown')).toBeTruthy();
    expect(queryByText('Off')).toBeNull();
    expect(queryByText('On')).toBeNull();
    expect(queryByTestId('switch-power-switch')).toBeNull();

    fireEvent.press(getByTestId('switch-power-off'));
    await waitFor(() => expect(mockedControl).toHaveBeenCalledWith('hh-1', 'dev-1', 'turn_off'));
    await waitFor(() => expect(onStateChange).toHaveBeenCalled());
    fireEvent.press(getByTestId('switch-power-on'));
    await waitFor(() => expect(mockedControl).toHaveBeenCalledWith('hh-1', 'dev-1', 'turn_on'));
  });
});
