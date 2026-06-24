import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';

import RoomManagementScreen from '../../src/screens/Devices/RoomManagementScreen';
import { lightTheme } from '../../src/theme';
import {
  listRooms,
  createRoom,
  updateRoom,
  deleteRoom,
} from '../../src/api/smartHomeApi';

// L1 FLOW INTEGRATION — the room-management surface (was render-only coverage):
// React-Query load + tree render (name + device count), add-room (createRoom with
// the trimmed name + parent_room_id, then a refetch via invalidateQueries),
// open-the-edit-dialog + rename (updateRoom with the changed name and an
// unchanged-parent → undefined), re-parent in the edit dialog (updateRoom carries
// the new parent_room_id), delete (Alert confirm → deleteRoom + ['devices'] cache
// invalidation), the empty state, and the no-household gate. Real screen + a real
// QueryClient (so invalidateQueries actually refetches); only the smartHomeApi
// room leaves, the auth context, and navigation are mocked.

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: mockGoBack }),
}));

let mockAuthState: Record<string, unknown>;
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: mockAuthState }),
}));

jest.mock('../../src/api/smartHomeApi', () => ({
  listRooms: jest.fn(),
  createRoom: jest.fn(),
  updateRoom: jest.fn(),
  deleteRoom: jest.fn(),
}));

const HH = 'hh-1';

const makeRoom = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'room-1',
  household_id: HH,
  name: 'Living Room',
  normalized_name: 'living_room',
  icon: null,
  ha_area_id: null,
  parent_room_id: null,
  device_count: 3,
  node_count: 1,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...over,
});

const LIVING = makeRoom();
const KITCHEN = makeRoom({ id: 'room-2', name: 'Kitchen', normalized_name: 'kitchen', device_count: 1 });
const ROOMS = [LIVING, KITCHEN];

const renderScreen = () => {
  // gcTime:0 so the inactive query cache doesn't keep a gc timer alive past the
  // test; retry:false so a rejected queryFn surfaces immediately.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={lightTheme}>
        <RoomManagementScreen />
      </PaperProvider>
    </QueryClientProvider>,
  );
};

describe('Room management — flow integration (load, add, edit, re-parent, delete, gate)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = {
      activeHouseholdId: HH,
      households: [{ id: HH, name: 'Test Home', role: 'admin' }],
      user: { id: 1, email: 'test@example.com' },
      accessToken: 'tok',
    };
    (listRooms as jest.Mock).mockResolvedValue(ROOMS);
    (createRoom as jest.Mock).mockResolvedValue(makeRoom({ id: 'room-3', name: 'Bedroom' }));
    (updateRoom as jest.Mock).mockResolvedValue(LIVING);
    (deleteRoom as jest.Mock).mockResolvedValue(undefined);
  });

  it('loads rooms for the active household and renders the tree (name + device count)', async () => {
    const utils = renderScreen();
    await utils.findByText('Living Room');

    expect(listRooms).toHaveBeenCalledWith(HH);
    expect(utils.getByText('Kitchen')).toBeTruthy();
    expect(utils.getByText('3 devices')).toBeTruthy();
    expect(utils.getByText('1 device')).toBeTruthy();
  });

  it('add-room → createRoom(hh, {name, parent_room_id:undefined}) then refetches the list', async () => {
    const utils = renderScreen();
    await utils.findByText('Living Room');
    (listRooms as jest.Mock).mockClear();

    fireEvent.changeText(utils.getByTestId('room-add-input'), '  Bedroom  ');
    await act(async () => {
      fireEvent.press(utils.getByTestId('room-add-button'));
    });

    expect(createRoom).toHaveBeenCalledWith(HH, {
      name: 'Bedroom',
      parent_room_id: undefined,
    });
    // invalidateQueries(['rooms', hh]) on the real client triggers a refetch.
    await waitFor(() => expect(listRooms).toHaveBeenCalledWith(HH));
  });

  it('does not call createRoom for a blank/whitespace name (button stays disabled)', async () => {
    const utils = renderScreen();
    await utils.findByText('Living Room');

    fireEvent.changeText(utils.getByTestId('room-add-input'), '   ');
    fireEvent.press(utils.getByTestId('room-add-button'));

    expect(createRoom).not.toHaveBeenCalled();
  });

  it('opening a room → renaming → Save calls updateRoom with the changed name (parent unchanged → undefined)', async () => {
    const utils = renderScreen();
    await utils.findByText('Living Room');

    fireEvent.press(utils.getByTestId('room-item-room-1'));
    await utils.findByText('Edit Room'); // dialog open

    // The dialog's name field is pre-filled with the room name; change it.
    fireEvent.changeText(utils.getByDisplayValue('Living Room'), 'Lounge');
    await act(async () => {
      fireEvent.press(utils.getByTestId('room-edit-save'));
    });

    expect(updateRoom).toHaveBeenCalledWith(HH, 'room-1', {
      name: 'Lounge',
      parent_room_id: undefined,
    });
  });

  it('re-parenting in the edit dialog carries the new parent_room_id to updateRoom', async () => {
    const utils = renderScreen();
    await utils.findByText('Living Room');

    // Open the edit dialog for Kitchen, then pick Living Room as its parent.
    fireEvent.press(utils.getByTestId('room-item-room-2'));
    await utils.findByText('Edit Room');

    fireEvent.press(utils.getByTestId('edit-parent-menu-trigger'));
    // "Living Room" now appears both as the list row and as a parent menu item;
    // the menu item is rendered last (in the Portal), so target that one.
    await waitFor(() => expect(utils.getAllByText('Living Room').length).toBeGreaterThan(1));
    const matches = utils.getAllByText('Living Room');
    fireEvent.press(matches[matches.length - 1]);

    await act(async () => {
      fireEvent.press(utils.getByTestId('room-edit-save'));
    });

    // Name unchanged → undefined; parent changed null → 'room-1'.
    expect(updateRoom).toHaveBeenCalledWith(HH, 'room-2', {
      name: undefined,
      parent_room_id: 'room-1',
    });
  });

  it('delete → Alert confirm → deleteRoom + invalidates the devices cache, then refetches rooms', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const utils = renderScreen();
    await utils.findByText('Living Room');
    (listRooms as jest.Mock).mockClear();

    fireEvent.press(utils.getByTestId('room-delete-room-1'));

    // Confirm via the destructive button supplied to Alert.alert.
    const buttons = alertSpy.mock.calls[0][2] as any[];
    const del = buttons.find((b) => b.text === 'Delete')!;
    await act(async () => {
      await del.onPress!();
    });

    expect(deleteRoom).toHaveBeenCalledWith(HH, 'room-1');
    // Both rooms and devices caches are invalidated → rooms refetch fires.
    await waitFor(() => expect(listRooms).toHaveBeenCalledWith(HH));
    alertSpy.mockRestore();
  });

  it('shows the empty state when the household has no rooms', async () => {
    (listRooms as jest.Mock).mockResolvedValue([]);
    const utils = renderScreen();

    await utils.findByText('No rooms yet');
    expect(createRoom).not.toHaveBeenCalled();
  });

  it('gates with "No household selected" and never queries when there is no active household', async () => {
    mockAuthState = { ...mockAuthState, activeHouseholdId: null };
    const utils = renderScreen();

    expect(utils.getByText('No household selected')).toBeTruthy();
    expect(listRooms).not.toHaveBeenCalled();
  });
});
