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

jest.mock('../../src/contexts/ProvisioningContext', () => ({
  useProvisioningContext: () => ({
    provisioningResult: {
      success: true,
      node_id: 'jarvis-mock-1234',
      room_name: 'kitchen',
      message: 'Node provisioned successfully',
    },
    reset: mockResetContext,
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('SuccessScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
