import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import DeviceDiscoveryScreen from '../../src/screens/SmartHome/DeviceDiscoveryScreen';
import * as smartHomeApi from '../../src/api/smartHomeApi';
import * as nodeApi from '../../src/api/nodeApi';
import { lightTheme } from '../../src/theme';

jest.mock('../../src/api/smartHomeApi', () => ({
  requestDeviceScan: jest.fn(),
  pollDeviceScan: jest.fn(),
  importDevices: jest.fn(),
}));

jest.mock('../../src/api/nodeApi', () => ({
  listNodes: jest.fn(),
}));

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: { activeHouseholdId: 'hh-1', accessToken: 't' } }),
}));

const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

const api = smartHomeApi as jest.Mocked<typeof smartHomeApi>;
const nodes = nodeApi as jest.Mocked<typeof nodeApi>;

const node = (node_id: string, room: string, online: boolean) =>
  ({ node_id, room, online, last_seen: null }) as never;

const kettle = {
  name: 'Kettle',
  domain: 'switch',
  manufacturer: 'Govee',
  model: null,
  protocol: 'govee',
  entity_id: 'switch.kettle',
  local_ip: '10.0.0.9',
  mac_address: null,
  cloud_id: null,
  device_class: null,
  is_controllable: true,
  already_registered: false,
  existing_device_id: null,
};

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
// Opened from the Devices tab: the stack holds DevicesList.
const navigation = {
  goBack: mockGoBack,
  navigate: mockNavigate,
  getState: () => ({ routes: [{ name: 'DevicesList' }, { name: 'DeviceDiscovery' }] }),
};

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <DeviceDiscoveryScreen
        navigation={navigation as never}
        route={{ key: 'k', name: 'DeviceDiscovery', params: { nodeId: 'pi4' } } as never}
      />
    </PaperProvider>,
  );

// Lets the pending promises (request, poll) settle under fake timers.
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
};

describe('DeviceDiscoveryScreen (Devices tab scan)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    api.requestDeviceScan.mockResolvedValue({ id: 'req-1', status: 'pending' });
    nodes.listNodes.mockResolvedValue([
      node('pi4', 'Garage', true),
      node('zero', 'Kitchen', true),
      node('old', 'Attic', false),
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('polls until the scan is done, imports, and refreshes the device list', async () => {
    api.pollDeviceScan
      .mockResolvedValueOnce({ status: 'pending' } as never)
      .mockResolvedValueOnce({ status: 'completed', devices: [kettle] } as never);
    api.importDevices.mockResolvedValue({ created: 1, updated: 0 });

    const screen = renderScreen();
    await flush();
    expect(screen.getByText('Scanning for devices...')).toBeTruthy();
    expect(api.requestDeviceScan).toHaveBeenCalledWith('pi4');

    await advance(2000);
    expect(screen.getByText('Kettle')).toBeTruthy();
    expect(api.pollDeviceScan).toHaveBeenCalledTimes(2);

    fireEvent.press(screen.getByTestId('device-row-switch.kettle'));
    fireEvent.press(screen.getByTestId('import-devices-button'));
    await flush();

    expect(api.importDevices).toHaveBeenCalledWith('hh-1', [
      expect.objectContaining({ entity_id: 'switch.kettle', source: 'direct' }),
    ]);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['devices', 'hh-1'] });
    expect(screen.getByText('Imported 1 device')).toBeTruthy();

    await advance(1000);
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('shows the error when the scan fails', async () => {
    api.pollDeviceScan.mockResolvedValue({
      status: 'failed',
      error_message: 'Govee cloud login failed',
    } as never);

    const screen = renderScreen();
    await flush();

    expect(screen.getByText('Govee cloud login failed')).toBeTruthy();
    expect(screen.getByTestId('retry-scan-button')).toBeTruthy();
  });

  it('stops waiting after 30 s when the node never answers', async () => {
    api.pollDeviceScan.mockResolvedValue({ status: 'pending' } as never);

    const screen = renderScreen();
    await flush();
    for (let i = 0; i < 16; i++) await advance(2000);

    expect(screen.getByText("The node didn't answer the scan. Is it online?")).toBeTruthy();
    const polls = api.pollDeviceScan.mock.calls.length;
    await advance(10000);
    expect(api.pollDeviceScan).toHaveBeenCalledTimes(polls);
  });

  it('stops polling once the screen is closed', async () => {
    let resolvePoll: (v: unknown) => void = () => {};
    api.pollDeviceScan.mockImplementation(
      () => new Promise((r) => { resolvePoll = r; }) as never,
    );

    const screen = renderScreen();
    await flush();
    expect(api.pollDeviceScan).toHaveBeenCalledTimes(1);

    // The poll is in flight when the user leaves; its answer must not
    // schedule another one.
    screen.unmount();
    await act(async () => {
      resolvePoll({ status: 'pending' });
    });
    await advance(10000);

    expect(api.pollDeviceScan).toHaveBeenCalledTimes(1);
  });

  it('names the node it scans with', async () => {
    api.pollDeviceScan.mockResolvedValue({ status: 'pending' } as never);

    const screen = renderScreen();
    await flush();

    expect(nodes.listNodes).toHaveBeenCalledWith('hh-1');
    expect(screen.getByText('Scanning with Garage')).toBeTruthy();
  });

  it('after a timeout, lets the user pick another online node and scans with it', async () => {
    api.pollDeviceScan.mockResolvedValue({ status: 'pending' } as never);

    const screen = renderScreen();
    await flush();
    for (let i = 0; i < 16; i++) await advance(2000);
    expect(screen.getByText("The node didn't answer the scan. Is it online?")).toBeTruthy();

    // The node that didn't answer is marked; the offline one is labelled and can't be picked.
    expect(screen.getByText('Scan with another node')).toBeTruthy();
    expect(screen.getByTestId('scan-node-pi4-current')).toBeTruthy();
    expect(screen.getByTestId('scan-node-old-offline')).toBeTruthy();
    fireEvent.press(screen.getByTestId('scan-node-old'));
    await flush();
    expect(api.requestDeviceScan).toHaveBeenCalledTimes(1);

    api.pollDeviceScan.mockResolvedValue({ status: 'completed', devices: [kettle] } as never);
    fireEvent.press(screen.getByTestId('scan-node-zero'));
    await flush();

    expect(api.requestDeviceScan).toHaveBeenLastCalledWith('zero');
    expect(api.pollDeviceScan).toHaveBeenLastCalledWith('zero', 'req-1');
    expect(screen.getByText('Kettle')).toBeTruthy();
  });

  it('Retry scans again with the node the user picked last', async () => {
    api.pollDeviceScan.mockResolvedValue({ status: 'failed', error_message: 'nope' } as never);

    const screen = renderScreen();
    await flush();
    fireEvent.press(screen.getByTestId('scan-node-zero'));
    await flush();
    fireEvent.press(screen.getByTestId('retry-scan-button'));
    await flush();

    expect(api.requestDeviceScan.mock.calls.map((c) => c[0])).toEqual(['pi4', 'zero', 'zero']);
  });

  it('Cancel during a scan stops polling and offers the node choice', async () => {
    api.pollDeviceScan.mockResolvedValue({ status: 'pending' } as never);

    const screen = renderScreen();
    await flush();
    fireEvent.press(screen.getByTestId('cancel-scan-button'));
    await flush();

    expect(screen.getByText('Scan cancelled')).toBeTruthy();
    expect(screen.getByText('Scan with another node')).toBeTruthy();
    const polls = api.pollDeviceScan.mock.calls.length;
    await advance(10000);
    expect(api.pollDeviceScan).toHaveBeenCalledTimes(polls);
  });

  it('still works when the node list cannot be loaded', async () => {
    nodes.listNodes.mockRejectedValue(new Error('offline'));
    api.pollDeviceScan.mockResolvedValue({ status: 'failed', error_message: 'nope' } as never);

    const screen = renderScreen();
    await flush();

    expect(screen.getByTestId('retry-scan-button')).toBeTruthy();
    expect(screen.queryByText('Scan with another node')).toBeNull();
  });
});
