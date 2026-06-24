import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import DeviceRoomAssignmentScreen from '../../src/screens/SmartHome/DeviceRoomAssignmentScreen';
import { lightTheme } from '../../src/theme';
import * as smartHomeApi from '../../src/api/smartHomeApi';
import { encryptAndPushConfig } from '../../src/services/configPushService';

// L1 FLOW INTEGRATION — the HA/direct device→room assignment surface (no prior
// coverage): the add-local-room gate + dedup, the per-device room picker
// (ActionSheet-style Alert with the rooms list as buttons), the Save pipeline
// (createRoom only for *used* rooms, with ha_area_id derived from the HA-area id;
// importDevices with the full per-source item shape; the source==='home_assistant'
// + nodeId branch that fires encryptAndPushConfig; the success Alert → parent
// goBack), the 409-conflict re-listRooms fallback, the direct-source mount load of
// listRooms, and the error Alert. Real screen + real form state; nav/route are
// passed as props; only the smartHomeApi client, the crypto-wrapping config-push
// service, and the auth context are mocked (no native crypto runs).

let mockAuthState: any;
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: mockAuthState }),
}));

jest.mock('../../src/api/smartHomeApi');
jest.mock('../../src/services/configPushService', () => ({
  encryptAndPushConfig: jest.fn(),
}));

const listRooms = smartHomeApi.listRooms as jest.Mock;
const createRoom = smartHomeApi.createRoom as jest.Mock;
const importDevices = smartHomeApi.importDevices as jest.Mock;
const pushConfig = encryptAndPushConfig as jest.Mock;

const HH = 'hh-1';

const makeNav = (parent?: any) =>
  ({
    goBack: jest.fn(),
    navigate: jest.fn(),
    setOptions: jest.fn(),
    getParent: jest.fn(() => parent ?? null),
  }) as any;

// A device with a pre-assigned HA area_id → maps to room ha_kitchen on mount.
const HA_DEVICE = {
  entity_id: 'light.kitchen',
  name: 'Kitchen Light',
  domain: 'light',
  device_class: null,
  manufacturer: 'Acme',
  model: 'A1',
  ha_device_id: 'dev-1',
  area_id: 'kitchen',
  area_name: 'Kitchen',
  state: 'on',
  selected: true,
};

// A device with no area → starts unassigned (null).
const ORPHAN_DEVICE = {
  entity_id: 'switch.fan',
  name: 'Fan Switch',
  domain: 'switch',
  device_class: null,
  manufacturer: null,
  model: null,
  ha_device_id: null,
  area_id: null,
  area_name: null,
  state: 'off',
  selected: true,
};

const KITCHEN_AREA = {
  area_id: 'kitchen',
  name: 'Kitchen',
  aliases: [],
  picture: null,
};

const renderScreen = (
  params: any,
  { nav = makeNav() }: { nav?: any } = {},
) => {
  const utils = render(
    <PaperProvider theme={lightTheme}>
      <DeviceRoomAssignmentScreen
        navigation={nav}
        route={{ params, key: 'k', name: 'DeviceRoomAssignment' } as any}
      />
    </PaperProvider>,
  );
  return { ...utils, nav };
};

// HA-source params: devices + areas serialized (nav params must be strings).
const haParams = (
  devices: any[] = [HA_DEVICE],
  areas: any[] = [KITCHEN_AREA],
  extra: Record<string, any> = {},
) => ({
  selectedDevices: JSON.stringify(devices),
  areas: JSON.stringify(areas),
  source: 'home_assistant',
  haUrl: 'http://192.168.1.50:8123',
  haToken: 'ha-secret-token',
  ...extra,
});

// direct-source params: no HA areas; rooms come from listRooms on mount.
const directParams = (devices: any[] = [ORPHAN_DEVICE]) => ({
  selectedDevices: JSON.stringify(devices),
  areas: JSON.stringify([]),
  source: 'direct',
});

describe('Device room assignment — flow integration (add room, picker, save pipeline, push, conflict, errors)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = {
      accessToken: 'tok',
      activeHouseholdId: HH,
      households: [{ id: HH, name: 'Home', role: 'admin' }],
    };
    listRooms.mockResolvedValue([]);
    createRoom.mockResolvedValue({ id: 'cc-room-1', name: 'Kitchen' });
    importDevices.mockResolvedValue({ created: 1, updated: 0 });
    pushConfig.mockResolvedValue(undefined);
  });

  it('renders the device rows + count from the serialized params', () => {
    const { getByTestId, getByText } = renderScreen(
      haParams([HA_DEVICE, ORPHAN_DEVICE]),
    );

    expect(getByTestId('device-room-assignment-device-row-light.kitchen')).toBeTruthy();
    expect(getByTestId('device-room-assignment-device-row-switch.fan')).toBeTruthy();
    expect(getByText('2 devices to assign')).toBeTruthy();
    // No CC calls on mount for an HA source (areas come from params).
    expect(listRooms).not.toHaveBeenCalled();
  });

  it('Add-room button is gated until the input is non-blank, then adds a local room', async () => {
    const { getByTestId } = renderScreen(haParams());

    expect(
      getByTestId('device-room-assignment-add-room-button').props.accessibilityState
        ?.disabled,
    ).toBe(true);

    fireEvent.changeText(
      getByTestId('device-room-assignment-add-room-input'),
      'Garage',
    );
    await waitFor(() =>
      expect(
        getByTestId('device-room-assignment-add-room-button').props
          .accessibilityState?.disabled,
      ).toBe(false),
    );

    fireEvent.press(getByTestId('device-room-assignment-add-room-button'));
    // input clears after a successful add (local-only, no api)
    await waitFor(() =>
      expect(
        getByTestId('device-room-assignment-add-room-input').props.value,
      ).toBe(''),
    );
    expect(createRoom).not.toHaveBeenCalled();
  });

  it('the device room picker (Alert) lists the HA area + a newly-added room and reassigns', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByTestId } = renderScreen(haParams([ORPHAN_DEVICE]));

    // Add a local room so it shows up in the picker.
    fireEvent.changeText(
      getByTestId('device-room-assignment-add-room-input'),
      'Office',
    );
    fireEvent.press(getByTestId('device-room-assignment-add-room-button'));

    fireEvent.press(
      getByTestId('device-room-assignment-device-room-button-switch.fan'),
    );

    expect(alertSpy).toHaveBeenCalledWith(
      'Assign Room',
      'Select a room for this device',
      expect.any(Array),
    );
    const buttons = alertSpy.mock.calls[0][2] as any[];
    const texts = buttons.map((b) => b.text);
    expect(texts).toContain('No room');
    expect(texts).toContain('Kitchen'); // from the HA area
    expect(texts).toContain('Office'); // the added local room
    expect(texts).toContain('Cancel');

    // Choosing "Office" assigns the device → button label flips to Office.
    const office = buttons.find((b) => b.text === 'Office');
    act(() => {
      office.onPress();
    });
    await waitFor(() =>
      expect(
        getByTestId('device-room-assignment-device-room-button-switch.fan'),
      ).toHaveTextContent('Office'),
    );
    alertSpy.mockRestore();
  });

  it('Save (HA): createRoom only for the USED area (ha_area_id stripped) + importDevices with the HA item shape, then parent goBack', async () => {
    const parent = { goBack: jest.fn() };
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByTestId, nav } = renderScreen(haParams([HA_DEVICE]), {
      nav: makeNav(parent),
    });

    await act(async () => {
      fireEvent.press(getByTestId('device-room-assignment-save-button'));
    });

    // HA_DEVICE is pre-assigned to ha_kitchen → that room is "used".
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(createRoom).toHaveBeenCalledWith(HH, {
      name: 'Kitchen',
      ha_area_id: 'kitchen',
    });

    expect(importDevices).toHaveBeenCalledTimes(1);
    const [hh, items] = importDevices.mock.calls[0];
    expect(hh).toBe(HH);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      entity_id: 'light.kitchen',
      name: 'Kitchen Light',
      domain: 'light',
      room_id: 'cc-room-1', // mapped from createRoom result
      manufacturer: 'Acme',
      model: 'A1',
      ha_device_id: 'dev-1',
      source: 'home_assistant',
    });
    // No node id entered → no config push.
    expect(pushConfig).not.toHaveBeenCalled();

    // Success Alert → OK → parent().goBack()
    const okBtn = (alertSpy.mock.calls.at(-1)?.[2] as any[]).find(
      (b) => b.text === 'OK',
    );
    act(() => {
      okBtn.onPress();
    });
    expect(nav.getParent).toHaveBeenCalled();
    expect(parent.goBack).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('Save (HA) with a node id → pushes encrypted HA config to the node after import', async () => {
    const { getByTestId } = renderScreen(haParams([HA_DEVICE]));

    fireEvent.changeText(
      getByTestId('device-room-assignment-node-id-input'),
      'node-xyz',
    );

    await act(async () => {
      fireEvent.press(getByTestId('device-room-assignment-save-button'));
    });

    expect(importDevices).toHaveBeenCalled();
    expect(pushConfig).toHaveBeenCalledTimes(1);
    expect(pushConfig).toHaveBeenCalledWith('node-xyz', 'home_assistant', {
      HOME_ASSISTANT_REST_URL: 'http://192.168.1.50:8123',
      HOME_ASSISTANT_WS_URL: 'ws://192.168.1.50:8123/api/websocket',
      HOME_ASSISTANT_API_KEY: 'ha-secret-token',
    });
  });

  it('Save: a 409 on createRoom re-lists rooms and maps the device to the existing room id', async () => {
    const conflict: any = new Error('exists');
    conflict.response = { status: 409 };
    createRoom.mockRejectedValueOnce(conflict);
    // First listRooms (none on HA mount); the conflict path lists the existing rooms.
    listRooms.mockResolvedValueOnce([
      {
        id: 'cc-existing',
        name: 'Kitchen',
        normalized_name: 'kitchen',
      },
    ]);

    const { getByTestId } = renderScreen(haParams([HA_DEVICE]));

    await act(async () => {
      fireEvent.press(getByTestId('device-room-assignment-save-button'));
    });

    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(listRooms).toHaveBeenCalledWith(HH);
    const items = importDevices.mock.calls[0][1];
    expect(items[0].room_id).toBe('cc-existing'); // mapped from the 409 fallback
  });

  it('direct source: loads Jarvis rooms via listRooms on mount and auto-assigns the lone device', async () => {
    listRooms.mockResolvedValueOnce([
      {
        id: 'jr-living',
        name: 'Living Room',
        normalized_name: 'living room',
      },
    ]);

    const { getByTestId } = renderScreen(directParams([ORPHAN_DEVICE]));

    await waitFor(() => expect(listRooms).toHaveBeenCalledWith(HH));
    // Single device + a loaded room → auto-assigned → button shows the room name.
    await waitFor(() =>
      expect(
        getByTestId('device-room-assignment-device-room-button-switch.fan'),
      ).toHaveTextContent('Living Room'),
    );
  });

  it('direct source Save: importDevices uses source=direct and carries protocol/local_ip/mac/cloud_id', async () => {
    listRooms.mockResolvedValueOnce([
      { id: 'jr-living', name: 'Living Room', normalized_name: 'living room' },
    ]);
    const directDevice = {
      ...ORPHAN_DEVICE,
      protocol: 'lifx',
      local_ip: '192.168.1.77',
      mac_address: 'AA:BB:CC',
      cloud_id: 'cloud-9',
    };

    const { getByTestId } = renderScreen(directParams([directDevice]));
    await waitFor(() => expect(listRooms).toHaveBeenCalledWith(HH));

    await act(async () => {
      fireEvent.press(getByTestId('device-room-assignment-save-button'));
    });

    // direct rooms have no ha_area_id (id does not start with ha_).
    expect(createRoom).toHaveBeenCalledWith(HH, {
      name: 'Living Room',
      ha_area_id: undefined,
    });
    const item = importDevices.mock.calls[0][1][0];
    expect(item).toMatchObject({
      source: 'direct',
      protocol: 'lifx',
      local_ip: '192.168.1.77',
      mac_address: 'AA:BB:CC',
      cloud_id: 'cloud-9',
    });
    // direct source never pushes HA config even if a (non-rendered) node existed.
    expect(pushConfig).not.toHaveBeenCalled();
  });

  it('Save error: importDevices rejects → error Alert, no parent navigation', async () => {
    const parent = { goBack: jest.fn() };
    importDevices.mockRejectedValueOnce(new Error('CC unavailable'));
    const alertSpy = jest.spyOn(Alert, 'alert');

    const { getByTestId } = renderScreen(haParams([HA_DEVICE]), {
      nav: makeNav(parent),
    });

    await act(async () => {
      fireEvent.press(getByTestId('device-room-assignment-save-button'));
    });

    expect(alertSpy).toHaveBeenCalledWith('Error', 'CC unavailable');
    expect(parent.goBack).not.toHaveBeenCalled();
    // Save button is re-enabled after the failure (saving reset to false).
    await waitFor(() =>
      expect(
        getByTestId('device-room-assignment-save-button').props
          .accessibilityState?.disabled,
      ).toBe(false),
    );
    alertSpy.mockRestore();
  });

  it('Back button calls navigation.goBack()', () => {
    const { getByTestId, nav } = renderScreen(haParams());
    fireEvent.press(getByTestId('device-room-assignment-back-button'));
    expect(nav.goBack).toHaveBeenCalled();
  });
});
