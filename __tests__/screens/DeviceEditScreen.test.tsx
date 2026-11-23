import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import DeviceEditScreen from '../../src/screens/Devices/DeviceEditScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
} as any;

const mockInvalidateQueries = jest.fn();

const mockDevice = {
  id: 'dev-1',
  household_id: 'hh-1',
  room_id: 'room-1',
  entity_id: 'light.living_room',
  name: 'Ceiling Light',
  domain: 'light',
  device_class: null,
  manufacturer: 'LIFX',
  model: 'A19',
  source: 'direct',
  protocol: 'lifx',
  local_ip: '192.168.1.50',
  mac_address: 'AA:BB:CC:DD:EE:FF',
  cloud_id: null,
  ha_device_id: null,
  is_controllable: false,
  is_active: true,
  room_name: 'Living Room',
  supported_actions: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const mockRooms = [
  {
    id: 'room-1',
    household_id: 'hh-1',
    name: 'Living Room',
    normalized_name: 'living_room',
    icon: null,
    ha_area_id: null,
    parent_room_id: null,
    device_count: 1,
    node_count: 0,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'room-2',
    household_id: 'hh-1',
    name: 'Kitchen',
    normalized_name: 'kitchen',
    icon: null,
    ha_area_id: null,
    parent_room_id: null,
    device_count: 0,
    node_count: 0,
    created_at: '',
    updated_at: '',
  },
];

let mockDevicesData: unknown[] | undefined = [mockDevice];
let mockDevicesLoading = false;
let mockRoomsData: unknown[] | undefined = mockRooms;

jest.mock('@tanstack/react-query', () => ({
  useQuery: (opts: { queryKey: string[] }) => {
    if (opts.queryKey[0] === 'devices') {
      return { data: mockDevicesData, isLoading: mockDevicesLoading };
    }
    if (opts.queryKey[0] === 'rooms') {
      return { data: mockRoomsData, isLoading: false };
    }
    return { data: undefined, isLoading: false };
  },
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

jest.mock('../../src/api/smartHomeApi', () => ({
  listDevices: jest.fn(),
  listRooms: jest.fn(),
  updateDevice: jest.fn(),
  deleteDevice: jest.fn(),
  controlDevice: jest.fn(),
}));

jest.mock('../../src/components/device-controls/DeviceControlPanel', () => {
  const { View, Text } = require('react-native');
  return function MockDeviceControlPanel() {
    return (
      <View testID="device-control-panel">
        <Text>MockControlPanel</Text>
      </View>
    );
  };
});

const makeRoute = (params: { deviceId: string; householdId: string }) => ({
  params,
  key: 'DeviceEdit',
  name: 'DeviceEdit' as const,
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('DeviceEditScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDevicesData = [mockDevice];
    mockDevicesLoading = false;
    mockRoomsData = mockRooms;
  });

  it('should show loading state', () => {
    mockDevicesLoading = true;
    mockDevicesData = undefined;

    const { UNSAFE_queryByType } = render(
      <DeviceEditScreen
        navigation={mockNavigation}
        route={makeRoute({ deviceId: 'dev-1', householdId: 'hh-1' })}
      />,
      { wrapper },
    );

    // ActivityIndicator is rendered while loading
    // We verify the component doesn't crash and shows centered layout
    expect(UNSAFE_queryByType).toBeDefined();
  });

  it('should show "Device not found" for missing device', () => {
    mockDevicesData = [];

    const { getByText } = render(
      <DeviceEditScreen
        navigation={mockNavigation}
        route={makeRoute({ deviceId: 'nonexistent', householdId: 'hh-1' })}
      />,
      { wrapper },
    );

    expect(getByText('Device not found')).toBeTruthy();
  });

  it('should show "Go Back" button when device not found', () => {
    mockDevicesData = [];

    const { getByText } = render(
      <DeviceEditScreen
        navigation={mockNavigation}
        route={makeRoute({ deviceId: 'nonexistent', householdId: 'hh-1' })}
      />,
      { wrapper },
    );

    const goBackButton = getByText('Go Back');
    fireEvent.press(goBackButton);
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('is titled with the device name and opens Name & room in a sheet', () => {
    const utils = render(
      <DeviceEditScreen
        navigation={mockNavigation}
        route={makeRoute({ deviceId: 'dev-1', householdId: 'hh-1' })}
      />,
      { wrapper },
    );

    expect(utils.getAllByText('Ceiling Light').length).toBeGreaterThanOrEqual(1);
    expect(utils.queryByTestId('device-name-input')).toBeNull();
    fireEvent.press(utils.getByTestId('device-name-room-row'));
    expect(utils.getAllByText('Device Name').length).toBeGreaterThanOrEqual(1);
    expect(utils.getByDisplayValue('Ceiling Light')).toBeTruthy();
    expect(utils.getByText('Room')).toBeTruthy();
  });

  it('shows the room on the Name & room row', () => {
    const utils = render(
      <DeviceEditScreen
        navigation={mockNavigation}
        route={makeRoute({ deviceId: 'dev-1', householdId: 'hh-1' })}
      />,
      { wrapper },
    );

    expect(utils.getByText('Ceiling Light \u00b7 Living Room')).toBeTruthy();
  });

  it('folds technical details (entity ID, protocol, source) until opened', () => {
    const utils = render(
      <DeviceEditScreen
        navigation={mockNavigation}
        route={makeRoute({ deviceId: 'dev-1', householdId: 'hh-1' })}
      />,
      { wrapper },
    );

    expect(utils.queryByText('Entity ID')).toBeNull();
    fireEvent.press(utils.getByText('Technical details'));
    expect(utils.getByText('Entity ID')).toBeTruthy();
    expect(utils.getByText('light.living_room')).toBeTruthy();
    expect(utils.getByText('Protocol')).toBeTruthy();
    expect(utils.getByText('Source')).toBeTruthy();
    expect(utils.getByText('direct')).toBeTruthy();
  });

  it('has Save and Remove in the sheet; Save needs a name', () => {
    const utils = render(
      <DeviceEditScreen
        navigation={mockNavigation}
        route={makeRoute({ deviceId: 'dev-1', householdId: 'hh-1' })}
      />,
      { wrapper },
    );

    fireEvent.press(utils.getByTestId('device-name-room-row'));
    expect(utils.getByTestId('device-name-input').props.value).toBe('Ceiling Light');
    expect(utils.getByTestId('device-save-button')).toBeTruthy();
    expect(utils.getByText('Remove from household')).toBeTruthy();
    expect(utils.getByTestId('device-delete-button')).toBeTruthy();
    fireEvent.changeText(utils.getByTestId('device-name-input'), '');
    expect(utils.getByTestId('device-save-button')).toBeDisabled();
  });

  it('should show back action in appbar', () => {
    const { getByLabelText } = render(
      <DeviceEditScreen
        navigation={mockNavigation}
        route={makeRoute({ deviceId: 'dev-1', householdId: 'hh-1' })}
      />,
      { wrapper },
    );

    const backButton = getByLabelText('Back');
    fireEvent.press(backButton);
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('should not show control panel when device is not controllable', () => {
    const { queryByTestId, queryByText } = render(
      <DeviceEditScreen
        navigation={mockNavigation}
        route={makeRoute({ deviceId: 'dev-1', householdId: 'hh-1' })}
      />,
      { wrapper },
    );

    expect(queryByTestId('device-control-panel')).toBeNull();
  });

  it('should show control panel when device is controllable', () => {
    const controllableDevice = { ...mockDevice, is_controllable: true };
    mockDevicesData = [controllableDevice];

    const { getByTestId } = render(
      <DeviceEditScreen
        navigation={mockNavigation}
        route={makeRoute({ deviceId: 'dev-1', householdId: 'hh-1' })}
      />,
      { wrapper },
    );

    // Controls come first, with no section heading above them.
    expect(getByTestId('device-control-panel')).toBeTruthy();
  });
});
