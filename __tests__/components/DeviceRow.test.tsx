import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import DeviceRow, { describeState } from '../../src/components/DeviceRow';
import { controlDevice, getDeviceState } from '../../src/api/smartHomeApi';
import { lightTheme } from '../../src/theme';

jest.mock('../../src/api/smartHomeApi', () => ({ controlDevice: jest.fn(), getDeviceState: jest.fn() }));

const state = (domain: string, s: Record<string, unknown> | null) =>
  ({ entity_id: 'x', domain, state: s, ui_hints: null, error: null }) as any;

describe('describeState', () => {
  it('reads lights with brightness, switches, locks and thermostats', () => {
    expect(describeState('light', state('light', { state: 'on', brightness: 80 }))).toEqual({ label: 'On · 80%', on: true });
    expect(describeState('light', state('light', { state: 'off' }))).toEqual({ label: 'Off', on: false });
    expect(describeState('switch', state('switch', { state: 'on' }))).toEqual({ label: 'On', on: true });
    expect(describeState('lock', state('lock', { is_locked: true }))).toEqual({ label: 'Locked', on: true });
    expect(describeState('lock', state('lock', { state: 'unlocked' }))).toEqual({ label: 'Unlocked', on: false });
    expect(describeState('climate', state('climate', { mode: 'heat', target_temperature: 21, current_temperature: 19 })).label)
      .toBe('Heat to 21° · 19° now');
  });

  it('says so when the node gave no state, or an unreadable one', () => {
    expect(describeState('light', state('light', null))).toEqual({ label: 'Not responding', on: null });
    expect(describeState('light', state('light', { state: 'unavailable' }))).toEqual({ label: 'Unknown', on: null });
    expect(describeState('kettle', state('kettle', { state: 'keep_warm' })).label).toBe('Keep warm');
  });
});

const device = (over: Record<string, unknown> = {}) =>
  ({
    id: 'd1', household_id: 'hh', name: 'Lamp', domain: 'light', is_controllable: true,
    entity_id: 'light.lamp', manufacturer: null, protocol: 'lifx', ...over,
  }) as any;

let client: QueryClient;
afterEach(() => client?.clear());

const renderRow = (d = device()) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <PaperProvider theme={lightTheme}>
        <DeviceRow device={d} icon="lightbulb" onPress={jest.fn()} />
      </PaperProvider>
    </QueryClientProvider>,
  );
};

describe('DeviceRow', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the live state and turns a light off from its switch', async () => {
    (getDeviceState as jest.Mock).mockResolvedValue(state('light', { state: 'on', brightness: 60 }));
    (controlDevice as jest.Mock).mockResolvedValue({ success: true });
    const utils = renderRow();
    expect(utils.getByText('Checking…')).toBeTruthy();
    expect(await utils.findByText('On · 60%')).toBeTruthy();
    fireEvent(utils.getByTestId('device-switch-d1'), 'valueChange', false);
    await waitFor(() => expect(controlDevice).toHaveBeenCalledWith('hh', 'd1', 'turn_off'));
  });

  it('asks before unlocking a lock', async () => {
    (getDeviceState as jest.Mock).mockResolvedValue(state('lock', { is_locked: true }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const utils = renderRow(device({ domain: 'lock', name: 'Front Door' }));
    await utils.findByText('Locked');
    fireEvent(utils.getByTestId('device-switch-d1'), 'valueChange', false);
    expect(alert).toHaveBeenCalledWith('Unlock?', 'Unlock Front Door?', expect.any(Array));
    expect(controlDevice).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('says Not responding and greys out the switch when the node does not answer', async () => {
    (getDeviceState as jest.Mock).mockRejectedValue(new Error('timeout'));
    const utils = renderRow();
    expect(utils.getByTestId('device-switch-d1').props.disabled).toBe(true); // still checking
    expect(await utils.findByText('Not responding')).toBeTruthy();
    expect(utils.getByTestId('device-switch-d1').props.disabled).toBe(true);
  });

  it('gives a thermostat no switch, only its screen', async () => {
    (getDeviceState as jest.Mock).mockResolvedValue(state('climate', { mode: 'heat', target_temperature: 21 }));
    const utils = renderRow(device({ domain: 'climate' }));
    await utils.findByText('Heat to 21\u00b0');
    expect(utils.queryByTestId('device-switch-d1')).toBeNull();
  });

  it('does not ask a device that cannot be controlled', () => {
    const utils = renderRow(device({ is_controllable: false, manufacturer: 'Acme' }));
    expect(utils.getByText('Acme · lifx')).toBeTruthy();
    expect(getDeviceState).not.toHaveBeenCalled();
  });
});
