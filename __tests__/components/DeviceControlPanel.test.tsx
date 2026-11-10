import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import DeviceControlPanel from '../../src/components/device-controls/DeviceControlPanel';
import { lightTheme } from '../../src/theme';
import { getDeviceState } from '../../src/api/smartHomeApi';
import type { DeviceListItem } from '../../src/types/SmartHome';

jest.mock('../../src/api/smartHomeApi', () => ({
  getDeviceState: jest.fn(),
  controlDevice: jest.fn(),
}));

const mockedGetState = getDeviceState as jest.MockedFunction<typeof getDeviceState>;

const makeDevice = (overrides: Partial<DeviceListItem> = {}): DeviceListItem => ({
  id: 'dev-1',
  household_id: 'hh-1',
  room_id: null,
  entity_id: 'switch.desk_lamp',
  name: 'Desk Lamp',
  domain: 'switch',
  device_class: null,
  manufacturer: null,
  model: null,
  source: 'direct',
  protocol: null,
  local_ip: null,
  mac_address: null,
  cloud_id: null,
  ha_device_id: null,
  is_controllable: true,
  is_active: true,
  room_name: null,
  supported_actions: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const clients: QueryClient[] = [];

const renderPanel = (device: DeviceListItem) => {
  const client = new QueryClient();
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <PaperProvider theme={lightTheme}>
        <DeviceControlPanel
          householdId="hh-1"
          deviceId={device.id}
          device={device}
          fallbackActions={null}
          onAction={jest.fn()}
          actionLoading={null}
        />
      </PaperProvider>
    </QueryClientProvider>,
  );
};

// A device whose state can't be read (the query fails, or returns no state)
// shows Unknown with Turn On / Turn Off, not two bare buttons.
describe('DeviceControlPanel with an unreadable state', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    clients.splice(0).forEach((c) => c.clear());
  });

  it.each([
    ['switch', 'switch.desk_lamp'],
    ['light', 'light.kitchen_ceiling'],
  ])('shows Unknown for a %s when the state query fails', async (domain, entityId) => {
    mockedGetState.mockRejectedValue(new Error('Device unreachable'));
    const { findByText, getByText } = renderPanel(makeDevice({ domain, entity_id: entityId }));

    // The panel retries the query once (about 1 s) before it gives up.
    expect(await findByText('Unknown', {}, { timeout: 5000 })).toBeTruthy();
    expect(getByText('Turn On')).toBeTruthy();
    expect(getByText('Turn Off')).toBeTruthy();
  }, 10_000);

  it('shows Unknown for a switch when the state comes back empty', async () => {
    mockedGetState.mockResolvedValue({
      entity_id: 'switch.desk_lamp',
      domain: 'switch',
      state: null,
      ui_hints: null,
      error: 'Device did not respond',
    });
    const { findByText, getByText } = renderPanel(makeDevice());

    await waitFor(() => expect(mockedGetState).toHaveBeenCalled());
    expect(await findByText('Unknown')).toBeTruthy();
    expect(getByText('Turn On')).toBeTruthy();
    expect(getByText('Turn Off')).toBeTruthy();
  });
});
