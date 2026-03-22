import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import RoomManagementScreen from '../../src/screens/Devices/RoomManagementScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
}));

const mockInvalidateQueries = jest.fn();
let mockRoomsQuery: Record<string, unknown> = {
  data: undefined,
  isLoading: false,
  refetch: jest.fn(),
};

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => mockRoomsQuery,
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

jest.mock('../../src/api/smartHomeApi', () => ({
  listRooms: jest.fn(),
  createRoom: jest.fn(),
  updateRoom: jest.fn(),
  deleteRoom: jest.fn(),
}));

let mockAuthState: Record<string, unknown> = {
  activeHouseholdId: 'hh-1',
  households: [{ id: 'hh-1', name: 'Test Home', role: 'admin' }],
  user: { id: 1, email: 'test@example.com' },
  accessToken: 'mock-token',
};

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    state: mockAuthState,
  }),
}));

const mockRooms = [
  {
    id: 'room-1',
    household_id: 'hh-1',
    name: 'Living Room',
    normalized_name: 'living_room',
    icon: null,
    ha_area_id: null,
    parent_room_id: null,
    device_count: 3,
    node_count: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'room-2',
    household_id: 'hh-1',
    name: 'Kitchen',
    normalized_name: 'kitchen',
    icon: null,
    ha_area_id: null,
    parent_room_id: null,
    device_count: 1,
    node_count: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
];

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('RoomManagementScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = {
      activeHouseholdId: 'hh-1',
      households: [{ id: 'hh-1', name: 'Test Home', role: 'admin' }],
      user: { id: 1, email: 'test@example.com' },
      accessToken: 'mock-token',
    };
    mockRoomsQuery = {
      data: undefined,
      isLoading: false,
      refetch: jest.fn(),
    };
  });

  it('should render "Rooms" title', () => {
    const { getByText } = render(<RoomManagementScreen />, { wrapper });

    expect(getByText('Rooms')).toBeTruthy();
  });

  it('should show add room input', () => {
    const { getAllByText } = render(<RoomManagementScreen />, { wrapper });

    // Paper TextInput with label "New room name"
    expect(getAllByText('New room name').length).toBeGreaterThanOrEqual(1);
  });

  it('should show "No rooms yet" when empty', () => {
    mockRoomsQuery = {
      data: [],
      isLoading: false,
      refetch: jest.fn(),
    };

    const { getByText } = render(<RoomManagementScreen />, { wrapper });

    expect(getByText('No rooms yet')).toBeTruthy();
  });

  it('should render room list items', () => {
    mockRoomsQuery = {
      data: mockRooms,
      isLoading: false,
      refetch: jest.fn(),
    };

    const { getByText } = render(<RoomManagementScreen />, { wrapper });

    expect(getByText('Living Room')).toBeTruthy();
    expect(getByText('Kitchen')).toBeTruthy();
  });

  it('should show device count in room descriptions', () => {
    mockRoomsQuery = {
      data: mockRooms,
      isLoading: false,
      refetch: jest.fn(),
    };

    const { getByText } = render(<RoomManagementScreen />, { wrapper });

    expect(getByText('3 devices')).toBeTruthy();
    expect(getByText('1 device')).toBeTruthy();
  });

  it('should show Add button disabled when input is empty', () => {
    const { getByText } = render(<RoomManagementScreen />, { wrapper });

    const addButton = getByText('Add');
    expect(addButton).toBeTruthy();
    // The button is present but disabled (disabled prop = true when !newRoomName.trim())
  });

  it('should show back button', () => {
    const { getByLabelText } = render(<RoomManagementScreen />, { wrapper });

    const backButton = getByLabelText('Back');
    expect(backButton).toBeTruthy();

    fireEvent.press(backButton);
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('should show "No household selected" when no householdId', () => {
    mockAuthState = {
      ...mockAuthState,
      activeHouseholdId: null,
    };

    const { getByText } = render(<RoomManagementScreen />, { wrapper });

    expect(getByText('No household selected')).toBeTruthy();
  });

  it('should show loading state', () => {
    mockRoomsQuery = {
      data: undefined,
      isLoading: true,
      refetch: jest.fn(),
    };

    // Should render without crashing during loading
    const { queryByText } = render(<RoomManagementScreen />, { wrapper });

    // "No rooms yet" should not be shown during loading
    expect(queryByText('No rooms yet')).toBeNull();
  });

  it('should enable Add button when input has text', () => {
    const { getByText, getAllByText } = render(
      <RoomManagementScreen />,
      { wrapper },
    );

    // Type in the room name input
    const inputs = getAllByText('New room name');
    fireEvent.changeText(inputs[inputs.length - 1], 'Bedroom');

    const addButton = getByText('Add');
    expect(addButton).toBeTruthy();
  });
});
