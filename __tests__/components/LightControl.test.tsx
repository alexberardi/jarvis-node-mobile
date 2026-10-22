import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import LightControl from '../../src/components/device-controls/LightControl';
import { lightTheme } from '../../src/theme';
import { controlDevice } from '../../src/api/smartHomeApi';
import type { DeviceState } from '../../src/types/SmartHome';

// The on/off switch .maestro/devices-light-toggle.yaml drives by testID.

jest.mock('../../src/api/smartHomeApi', () => ({
  controlDevice: jest.fn(),
}));

jest.mock('@react-native-community/slider', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: (props: any) => <View {...props} /> };
});

const mockedControl = controlDevice as jest.MockedFunction<typeof controlDevice>;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const makeState = (overrides: Partial<DeviceState> = {}): DeviceState => ({
  entity_id: 'light.kitchen_ceiling',
  domain: 'light',
  state: null,
  ui_hints: null,
  error: null,
  ...overrides,
});

describe('LightControl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedControl.mockResolvedValue({
      success: true,
      entity_id: 'light.kitchen_ceiling',
      action: 'turn_on',
      error: null,
    });
  });

  it('turns the light on from light-power-switch when it has live state', async () => {
    const onStateChange = jest.fn();
    const { getByTestId, getByText } = render(
      <LightControl
        householdId="hh-1"
        deviceId="dev-1"
        state={makeState({ state: { state: 'off' } })}
        onStateChange={onStateChange}
      />,
      { wrapper },
    );

    expect(getByText('Off')).toBeTruthy();
    fireEvent(getByTestId('light-power-switch'), 'valueChange', true);

    await waitFor(() => expect(mockedControl).toHaveBeenCalledWith('hh-1', 'dev-1', 'turn_on', undefined));
    await waitFor(() => expect(onStateChange).toHaveBeenCalled());
  });

  it('has no light-power-switch without live state', () => {
    const { queryByTestId } = render(
      <LightControl
        householdId="hh-1"
        deviceId="dev-1"
        state={makeState()}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );

    expect(queryByTestId('light-power-switch')).toBeNull();
  });
});
