import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';

import RoomManagementScreen from '../../src/screens/Devices/RoomManagementScreen';
import RoomDetailScreen from '../../src/screens/Devices/RoomDetailScreen';
import { lightTheme } from '../../src/theme';
import {
  controlDevice,
  createRoom,
  deleteRoom,
  getDeviceState,
  listDevices,
  listRooms,
  updateDevice,
  updateRoom,
} from '../../src/api/smartHomeApi';

// Rooms as floors (RoomManagementScreen) and a room's own screen (RoomDetailScreen): a real
// QueryClient; only the smartHomeApi calls, auth and navigation are mocked.

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockParams: any;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: mockParams }),
}));
let mockAuthState: Record<string, unknown>;
jest.mock('../../src/auth/AuthContext', () => ({ useAuth: () => ({ state: mockAuthState }) }));
jest.mock('../../src/api/smartHomeApi', () => ({
  listRooms: jest.fn(),
  listDevices: jest.fn(),
  createRoom: jest.fn(),
  updateRoom: jest.fn(),
  deleteRoom: jest.fn(),
  updateDevice: jest.fn(),
  controlDevice: jest.fn(),
  getDeviceState: jest.fn(),
}));

const HH = 'hh-1';
const room = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, household_id: HH, name, normalized_name: id, icon: null, ha_area_id: null, parent_room_id: null,
  device_count: 0, node_count: 0, created_at: '', updated_at: '', ...over,
});
const device = (id: string, name: string, roomId: string | null, domain = 'light') => ({
  id, household_id: HH, name, domain, room_id: roomId, is_controllable: true, entity_id: `${domain}.${id}`,
});

const UP = room('up', 'Upstairs', { icon: 'floor' });
const BED = room('bed', 'Bedroom', { parent_room_id: 'up' });
const KITCHEN = room('kit', 'Kitchen');
const LAMP = device('lamp', 'Bedroom Lamp', 'bed');
const CEIL = device('ceil', 'Kitchen Ceiling', 'kit');
const PORCH = device('porch', 'Porch Light', null);

let client: QueryClient;
afterEach(() => client?.clear());
const renderWith = (el: React.ReactElement) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <PaperProvider theme={lightTheme}>{el}</PaperProvider>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = undefined;
  mockAuthState = { activeHouseholdId: HH, households: [{ id: HH, role: 'admin' }], user: { id: 1 } };
  (listRooms as jest.Mock).mockResolvedValue([UP, BED, KITCHEN]);
  (listDevices as jest.Mock).mockResolvedValue([LAMP, CEIL, PORCH]);
  (getDeviceState as jest.Mock).mockImplementation(async (_h: string, id: string) => ({
    entity_id: id, domain: 'light', state: { state: id === 'ceil' ? 'on' : 'off' }, ui_hints: null, error: null,
  }));
  (controlDevice as jest.Mock).mockResolvedValue({ success: true });
  (updateDevice as jest.Mock).mockResolvedValue({});
  (createRoom as jest.Mock).mockResolvedValue(room('new', 'New'));
  (updateRoom as jest.Mock).mockResolvedValue(UP);
  (deleteRoom as jest.Mock).mockResolvedValue(undefined);
});

describe('Rooms: floors', () => {
  it('draws floors with their rooms, the rest under Other rooms, and what is on', async () => {
    const utils = renderWith(<RoomManagementScreen />);
    expect(await utils.findByText('UPSTAIRS')).toBeTruthy();
    expect(utils.getByText('OTHER ROOMS')).toBeTruthy();
    expect(utils.getByText('Bedroom')).toBeTruthy();
    expect(await utils.findByText('1 on')).toBeTruthy(); // the kitchen ceiling
    expect(utils.getByText('1 device not in a room')).toBeTruthy();
    fireEvent.press(utils.getByTestId('room-item-bed'));
    expect(mockNavigate).toHaveBeenCalledWith('RoomDetail', { roomId: 'bed' });
  });

  it('turns a floor’s lights off', async () => {
    const utils = renderWith(<RoomManagementScreen />);
    await utils.findByText('UPSTAIRS');
    await act(async () => {
      fireEvent.press(utils.getByTestId('floor-off-up'));
    });
    expect(controlDevice).toHaveBeenCalledWith(HH, 'lamp', 'turn_off');
    expect(controlDevice).not.toHaveBeenCalledWith(HH, 'ceil', 'turn_off');
  });

  it('in Arrange, moves a device by tapping it then a room, and files unassigned ones', async () => {
    const utils = renderWith(<RoomManagementScreen />);
    fireEvent.press(await utils.findByTestId('rooms-arrange'));
    fireEvent.press(await utils.findByTestId('room-device-porch'));
    expect(utils.getByText('Tap a room to move Porch Light there, or tap it again to put it down.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(utils.getByTestId('room-item-kit'));
    });
    expect(updateDevice).toHaveBeenCalledWith(HH, 'porch', { room_id: 'kit' });
  });

  it('adds a floor, marked with the floor icon', async () => {
    const utils = renderWith(<RoomManagementScreen />);
    fireEvent.press(await utils.findByTestId('rooms-arrange'));
    fireEvent.press(utils.getByTestId('rooms-add-floor'));
    fireEvent.changeText(await utils.findByTestId('room-edit-name-input'), 'Downstairs');
    await act(async () => {
      fireEvent.press(utils.getByTestId('room-edit-save'));
    });
    expect(createRoom).toHaveBeenCalledWith(HH, { name: 'Downstairs', icon: 'floor' });
  });

  it('adds a room on a floor', async () => {
    const utils = renderWith(<RoomManagementScreen />);
    fireEvent.press(await utils.findByTestId('rooms-arrange'));
    fireEvent.press(utils.getByTestId('rooms-add-room-up'));
    fireEvent.changeText(await utils.findByTestId('room-edit-name-input'), 'Guest Room');
    await act(async () => {
      fireEvent.press(utils.getByTestId('room-edit-save'));
    });
    expect(createRoom).toHaveBeenCalledWith(HH, { name: 'Guest Room', parent_room_id: 'up' });
  });

  it('removes a room after asking', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      (buttons as { text: string; onPress?: () => void }[])?.find((b) => b.text === 'Remove')?.onPress?.();
    });
    const utils = renderWith(<RoomManagementScreen />);
    fireEvent.press(await utils.findByTestId('rooms-arrange'));
    fireEvent.press(utils.getByTestId('room-item-kit'));
    await act(async () => {
      fireEvent.press(await utils.findByTestId('room-delete-kit'));
    });
    await waitFor(() => expect(deleteRoom).toHaveBeenCalledWith(HH, 'kit'));
    alert.mockRestore();
  });

  it('gates on a household', () => {
    mockAuthState = { activeHouseholdId: null, households: [] };
    const utils = renderWith(<RoomManagementScreen />);
    expect(utils.getByText('No household selected')).toBeTruthy();
    expect(listRooms).not.toHaveBeenCalled();
  });
});

describe('A room', () => {
  beforeEach(() => {
    mockParams = { roomId: 'kit' };
  });

  it('lists its devices, turns them all on, and moves another device in', async () => {
    const utils = renderWith(<RoomDetailScreen />);
    expect(await utils.findByText('Kitchen Ceiling')).toBeTruthy();
    await act(async () => {
      fireEvent.press(utils.getByTestId('room-all-on'));
    });
    expect(controlDevice).toHaveBeenCalledWith(HH, 'ceil', 'turn_on');
    fireEvent.press(utils.getByTestId('room-move-here'));
    await act(async () => {
      fireEvent.press(await utils.findByText('Porch Light'));
    });
    expect(updateDevice).toHaveBeenCalledWith(HH, 'porch', { room_id: 'kit' });
  });

  it('renames it and puts it on a floor', async () => {
    const utils = renderWith(<RoomDetailScreen />);
    fireEvent.press(await utils.findByTestId('room-name-place'));
    fireEvent.changeText(utils.getByTestId('room-name-input'), 'Kitchen & Dining');
    fireEvent.press(utils.getByText('Nothing (top level)'));
    fireEvent.press(await utils.findByText('Upstairs'));
    await act(async () => {
      fireEvent.press(utils.getByTestId('room-save'));
    });
    expect(updateRoom).toHaveBeenCalledWith(HH, 'kit', { name: 'Kitchen & Dining', parent_room_id: 'up' });
  });
});
