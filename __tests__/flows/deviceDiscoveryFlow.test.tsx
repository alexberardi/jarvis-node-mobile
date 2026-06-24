import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import DeviceDiscoveryScreen from '../../src/screens/SmartHome/DeviceDiscoveryScreen';
import { lightTheme } from '../../src/theme';
import * as smartHomeApi from '../../src/api/smartHomeApi';

// L1 FLOW INTEGRATION — the device-discovery scan/import surface (no prior
// coverage): the mount scan (requestDeviceScan → pollDeviceScan poll loop), the
// pending→completed transition (driven by a real ~2s poll tick to terminal,
// real timers), the results render + selection state (row toggle, domain filter
// chip + select-all), the two import branches keyed off the route stack
// (Devices stack → importDevices(householdId, items) + Snackbar; SmartHome setup
// → navigation.navigate('DeviceRoomAssignment', …)), the failed-scan + error
// branches (Retry re-arms requestDeviceScan, Back → goBack), and the give-up
// timeout path (fake timers, isolated). Real screen + real selection/poll state;
// nav/route are passed as props; only smartHomeApi (scan/import) + auth are
// mocked. NOTE: registered devices are excluded from selection/import.

let mockAuthState: any;
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: mockAuthState }),
}));

jest.mock('../../src/api/smartHomeApi');

const requestDeviceScan = smartHomeApi.requestDeviceScan as jest.Mock;
const pollDeviceScan = smartHomeApi.pollDeviceScan as jest.Mock;
const importDevices = smartHomeApi.importDevices as jest.Mock;

const HH = 'hh-1';
const NODE = 'node-1';

// A selectable WiFi light + a switch + an already-registered light (excluded
// from selection/import).
const LIGHT = {
  name: 'Living Room Light',
  domain: 'light',
  manufacturer: 'Lifx',
  model: 'A19',
  protocol: 'lifx',
  entity_id: 'light.living',
  local_ip: '192.168.1.50',
  mac_address: 'AA:BB:CC',
  cloud_id: null,
  device_class: null,
  is_controllable: true,
  already_registered: false,
  existing_device_id: null,
};
const SWITCH = {
  name: 'Fan Switch',
  domain: 'switch',
  manufacturer: 'Kasa',
  model: 'HS200',
  protocol: 'kasa',
  entity_id: 'switch.fan',
  local_ip: '192.168.1.51',
  mac_address: 'DD:EE:FF',
  cloud_id: null,
  device_class: null,
  is_controllable: true,
  already_registered: false,
  existing_device_id: null,
};
const REGISTERED = {
  ...LIGHT,
  name: 'Bedroom Light',
  entity_id: 'light.bedroom',
  already_registered: true,
  existing_device_id: 'dev-9',
};

// nav whose getState includes 'DevicesList' → the screen treats it as the
// Devices stack (direct import). Drop that route for the SmartHome setup flow.
const makeNav = (routes: { name: string }[] = [{ name: 'DevicesList' }]) =>
  ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    getState: jest.fn(() => ({ routes })),
  }) as any;

const renderScreen = (
  { nav = makeNav() }: { nav?: any } = {},
) => {
  const utils = render(
    <PaperProvider theme={lightTheme}>
      <DeviceDiscoveryScreen
        navigation={nav}
        route={{ params: { nodeId: NODE }, key: 'k', name: 'DeviceDiscovery' } as any}
      />
    </PaperProvider>,
  );
  return { ...utils, nav };
};

// Resolve the scan request, then resolve the poll to a terminal 'completed'
// carrying the given devices. Mount fires requestDeviceScan → poll once.
const completeScanWith = (devices: any[]) => {
  requestDeviceScan.mockResolvedValue({ id: 'req-1', status: 'pending' });
  pollDeviceScan.mockResolvedValue({
    status: 'completed',
    request_id: 'req-1',
    devices,
    device_count: devices.length,
  });
};

describe('Device discovery — flow integration (scan poll, select/filter, import branches, errors, timeout)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = {
      accessToken: 'tok',
      activeHouseholdId: HH,
      households: [{ id: HH, name: 'Home', role: 'admin' }],
    };
    importDevices.mockResolvedValue({ created: 1, updated: 0 });
  });

  it('mount: requestDeviceScan(nodeId) then a completed poll renders the results', async () => {
    completeScanWith([LIGHT, SWITCH]);
    const { findByText, getByTestId } = renderScreen();

    // Terminal render after the (real) poll tick resolves.
    await findByText('Discovered Devices');
    expect(requestDeviceScan).toHaveBeenCalledWith(NODE);
    expect(pollDeviceScan).toHaveBeenCalledWith(NODE, 'req-1');
    expect(getByTestId('device-row-light.living')).toBeTruthy();
    expect(getByTestId('device-row-switch.fan')).toBeTruthy();
  });

  it('pending → completed: the poll loops past a pending tick before rendering results', async () => {
    requestDeviceScan.mockResolvedValue({ id: 'req-1', status: 'pending' });
    // First poll pending, second poll completed → proves the loop continues.
    pollDeviceScan
      .mockResolvedValueOnce({ status: 'pending', request_id: 'req-1' })
      .mockResolvedValue({
        status: 'completed',
        request_id: 'req-1',
        devices: [LIGHT],
        device_count: 1,
      });

    const { findByText } = renderScreen();

    // Still scanning right after mount (first tick was pending).
    await findByText('Scanning for devices...');
    // The second poll (after the ~2s interval) lands the results.
    await waitFor(() => expect(pollDeviceScan).toHaveBeenCalledTimes(2), {
      timeout: 8000,
    });
    await findByText('Discovered Devices');
  });

  it('row press toggles selection — the import label tracks selectable rows only', async () => {
    completeScanWith([LIGHT, SWITCH, REGISTERED]);
    const { findByText, getByText, getByTestId } = renderScreen();
    await findByText('Discovered Devices');

    // 3 found, but the registered one is excluded from selection; none selected yet.
    expect(getByText('3 devices found. 0 selected for import.')).toBeTruthy();

    fireEvent.press(getByTestId('device-row-light.living'));
    await waitFor(() => expect(getByText('Import 1 Device')).toBeTruthy());

    fireEvent.press(getByTestId('device-row-switch.fan'));
    await waitFor(() => expect(getByText('Import 2 Devices')).toBeTruthy());

    // Pressing the already-registered row is a no-op (still 2).
    fireEvent.press(getByTestId('device-row-light.bedroom'));
    await waitFor(() => expect(getByText('Import 2 Devices')).toBeTruthy());
  });

  it('domain filter chip reveals select-all, which selects every device in the domain', async () => {
    // Two lights so the domain has >1 row to bulk-select.
    const light2 = { ...LIGHT, entity_id: 'light.kitchen', name: 'Kitchen Light' };
    completeScanWith([LIGHT, light2, SWITCH]);
    const { findByText, getByText, getByTestId } = renderScreen();
    await findByText('Discovered Devices');

    // Filter to lights → the select-all affordance appears.
    fireEvent.press(getByTestId('domain-chip-light'));
    await waitFor(() => expect(getByTestId('select-all-button')).toBeTruthy());

    // Select-all over the light domain → both lights selected (switch untouched).
    fireEvent.press(getByTestId('select-all-button'));
    await waitFor(() => expect(getByText('Import 2 Devices')).toBeTruthy());
  });

  it('Devices stack import: importDevices(householdId, items) with the direct item shape + Snackbar', async () => {
    completeScanWith([LIGHT]);
    const { findByText, getByText, getByTestId } = renderScreen({
      nav: makeNav([{ name: 'DevicesList' }]),
    });
    await findByText('Discovered Devices');

    fireEvent.press(getByTestId('device-row-light.living'));
    await waitFor(() => expect(getByText('Import 1 Device')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId('import-devices-button'));
    });

    expect(importDevices).toHaveBeenCalledTimes(1);
    const [hh, items] = importDevices.mock.calls[0];
    expect(hh).toBe(HH);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      entity_id: 'light.living',
      name: 'Living Room Light',
      domain: 'light',
      manufacturer: 'Lifx',
      model: 'A19',
      protocol: 'lifx',
      local_ip: '192.168.1.50',
      mac_address: 'AA:BB:CC',
      source: 'direct',
    });

    // Success Snackbar reflects the created count.
    await findByText('Imported 1 device');
  });

  it('SmartHome setup import: navigates to DeviceRoomAssignment with the serialized selection', async () => {
    completeScanWith([LIGHT]);
    // No 'DevicesList' route → the SmartHome setup branch.
    const nav = makeNav([{ name: 'SmartHomeSetup' }]);
    const { findByText, getByText, getByTestId } = renderScreen({ nav });
    await findByText('Discovered Devices');

    fireEvent.press(getByTestId('device-row-light.living'));
    await waitFor(() => expect(getByText('Import 1 Device')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId('import-devices-button'));
    });

    expect(importDevices).not.toHaveBeenCalled();
    expect(nav.navigate).toHaveBeenCalledTimes(1);
    const [target, params] = nav.navigate.mock.calls[0];
    expect(target).toBe('DeviceRoomAssignment');
    expect(params.source).toBe('direct');
    const parsed = JSON.parse(params.selectedDevices);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      entity_id: 'light.living',
      name: 'Living Room Light',
      domain: 'light',
      selected: true,
    });
    expect(params.areas).toBe(JSON.stringify([]));
  });

  it('failed scan: shows the error message, Retry re-fires requestDeviceScan, Back → goBack', async () => {
    requestDeviceScan.mockResolvedValue({ id: 'req-1', status: 'pending' });
    pollDeviceScan.mockResolvedValueOnce({
      status: 'failed',
      request_id: 'req-1',
      error_message: 'Node offline',
    });

    const { findByText, getByText, getByTestId, nav } = renderScreen();

    // Error view from the failed terminal status.
    await findByText('Node offline');

    // Retry re-arms the scan → this time it completes.
    pollDeviceScan.mockResolvedValue({
      status: 'completed',
      request_id: 'req-1',
      devices: [LIGHT],
      device_count: 1,
    });
    await act(async () => {
      fireEvent.press(getByTestId('retry-scan-button'));
    });
    await findByText('Discovered Devices');
    // requestDeviceScan fired on mount + on retry.
    expect(requestDeviceScan).toHaveBeenCalledTimes(2);

    // Re-scan from results re-arms again, then assert Back wiring via the error view.
    // (Back on the error view goes through error-back-button.)
    pollDeviceScan.mockResolvedValueOnce({
      status: 'failed',
      request_id: 'req-1',
      error_message: 'Node offline again',
    });
    await act(async () => {
      fireEvent.press(getByText('Re-scan'));
    });
    await findByText('Node offline again');
    fireEvent.press(getByTestId('error-back-button'));
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('import with no household selected surfaces the no-household Snackbar', async () => {
    mockAuthState = { ...mockAuthState, activeHouseholdId: null };
    completeScanWith([LIGHT]);
    const { findByText, getByText, getByTestId } = renderScreen();
    await findByText('Discovered Devices');

    fireEvent.press(getByTestId('device-row-light.living'));
    await waitFor(() => expect(getByText('Import 1 Device')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId('import-devices-button'));
    });

    expect(importDevices).not.toHaveBeenCalled();
    await findByText('No household selected');
  });

  it('scan timeout: the poll loop gives up after POLL_TIMEOUT_MS → timeout error view', async () => {
    // Genuine give-up path. The screen measures elapsed via Date.now() vs a
    // captured startTime, and re-schedules the next poll with setTimeout. We
    // fake setTimeout (so the 2s interval is instant) AND drive Date.now()
    // forward by hand so the elapsed check trips on the second poll.
    jest.useFakeTimers();
    let now = 1_000_000;
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);

    requestDeviceScan.mockResolvedValue({ id: 'req-1', status: 'pending' });
    // Always pending → the loop keeps re-scheduling until the timeout trips.
    pollDeviceScan.mockResolvedValue({ status: 'pending', request_id: 'req-1' });

    const nav = makeNav();
    const { getByText } = render(
      <PaperProvider theme={lightTheme}>
        <DeviceDiscoveryScreen
          navigation={nav}
          route={{ params: { nodeId: NODE }, key: 'k', name: 'DeviceDiscovery' } as any}
        />
      </PaperProvider>,
    );

    // Flush the mount scan: requestDeviceScan resolves, first poll runs (elapsed
    // 0 < timeout → still pending), and schedules the next poll via setTimeout.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getByText('Scanning for devices...')).toBeTruthy();

    // Jump the clock past the 2-minute give-up window, then fire the scheduled
    // poll → its elapsed check trips → timeout view.
    now += 130_000;
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getByText('Scan timed out. Is the node online?')).toBeTruthy();

    dateSpy.mockRestore();
    jest.useRealTimers();
  });
});
