import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import SuccessScreen from '../../src/screens/Provisioning/SuccessScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockReset = jest.fn();
const mockParentDispatch = jest.fn();
// getParent returns the NodesStack navigator in production. The default
// here returns ``null`` so the SuccessScreen falls through to its
// ``navigation.reset`` fallback — individual tests override getParent to
// exercise the primary "exit provisioning" path.
const mockGetParent: jest.Mock<{ dispatch: jest.Mock } | null> = jest.fn(() => null);
const mockNavigation = {
  reset: mockReset,
  getParent: mockGetParent,
} as any;

const mockResetContext = jest.fn();

// Mutable so a test can exercise the "no node_id" guard.
let mockProvisioningResult: any;
jest.mock('../../src/contexts/ProvisioningContext', () => ({
  useProvisioningContext: () => ({
    provisioningResult: mockProvisioningResult,
    reset: mockResetContext,
  }),
}));

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: { activeHouseholdId: 'hh-1' } }),
}));

const mockMarkPending = jest.fn();
jest.mock('../../src/contexts/PendingNodeContext', () => ({
  usePendingNode: () => ({
    pendingNodeId: null,
    pendingHouseholdId: null,
    markPending: mockMarkPending,
    clearPending: jest.fn(),
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('SuccessScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProvisioningResult = {
      success: true,
      node_id: 'jarvis-mock-1234',
      room_name: 'kitchen',
      message: 'Node provisioned successfully',
    };
  });

  it('should display success message', () => {
    const { getByText } = render(
      <SuccessScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText(/Success/i)).toBeTruthy();
  });

  it('should display node ID', () => {
    const { getByText } = render(
      <SuccessScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText(/jarvis-mock-1234/)).toBeTruthy();
  });

  it('should display room name', () => {
    const { getByText } = render(
      <SuccessScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText(/Kitchen/i)).toBeTruthy();
  });

  it('should have done button', () => {
    const { getByTestId } = render(
      <SuccessScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByTestId('done-button')).toBeTruthy();
  });

  it('should reset navigation on done (fallback when no parent)', () => {
    // getParent returns null → fallback resets the provisioning stack
    mockGetParent.mockReturnValueOnce(null);

    const { getByTestId } = render(
      <SuccessScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    fireEvent.press(getByTestId('done-button'));

    expect(mockResetContext).toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalled();
  });

  it('should exit provisioning back to NodeList when parent stack is present', () => {
    // Production path: getParent returns the NodesStack navigator,
    // SuccessScreen dispatches a reset to NodeList on that parent
    // instead of bouncing back to ScanForNodes inside ProvisioningNavigator.
    mockGetParent.mockReturnValueOnce({ dispatch: mockParentDispatch });

    const { getByTestId } = render(
      <SuccessScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    fireEvent.press(getByTestId('done-button'));

    expect(mockResetContext).toHaveBeenCalled();
    expect(mockParentDispatch).toHaveBeenCalled();
    const action = mockParentDispatch.mock.calls[0][0];
    expect(action.payload?.routes?.[0]?.name).toBe('NodeList');
    // Fallback navigation.reset must NOT fire when parent handled it
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('lands on the Home (chat) tab on done so the node reveal is visible', () => {
    mockGetParent.mockReturnValueOnce({ dispatch: mockParentDispatch });

    const { getByTestId } = render(
      <SuccessScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    fireEvent.press(getByTestId('done-button'));

    expect(mockNavigate).toHaveBeenCalledWith('Main', { screen: 'HomeTab' });
  });

  it('marks the provisioned node pending (scoped to the household) on mount', () => {
    render(
      <SuccessScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(mockMarkPending).toHaveBeenCalledTimes(1);
    expect(mockMarkPending).toHaveBeenCalledWith('jarvis-mock-1234', 'hh-1');
  });

  it('does not mark pending when there is no node_id', () => {
    mockProvisioningResult = { success: true, room_name: 'kitchen' };

    render(
      <SuccessScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(mockMarkPending).not.toHaveBeenCalled();
  });
});
