import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import EnterPasswordScreen from '../../src/screens/Provisioning/EnterPasswordScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockNavigation = { navigate: mockNavigate, goBack: mockGoBack } as any;

const mockStartProvisioning = jest.fn().mockResolvedValue(undefined);

jest.mock('../../src/contexts/ProvisioningContext', () => ({
  useProvisioningContext: () => ({
    selectedNetwork: { ssid: 'HomeNetwork', signal_strength: -45, security: 'WPA2' },
    startProvisioning: mockStartProvisioning,
    isLoading: false,
    error: null,
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('EnterPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display selected network name', () => {
    const { getByText } = render(
      <EnterPasswordScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText(/HomeNetwork/)).toBeTruthy();
  });

  it('should have password input field', () => {
    const { getByTestId } = render(
      <EnterPasswordScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByTestId('password-input')).toBeTruthy();
  });

  it('should have room name selector', () => {
    const { getByTestId } = render(
      <EnterPasswordScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByTestId('room-selector')).toBeTruthy();
  });

  it('should have provision button', () => {
    const { getByTestId } = render(
      <EnterPasswordScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByTestId('provision-button')).toBeTruthy();
  });

  it('should enable provision button when password is entered', () => {
    const { getByTestId } = render(
      <EnterPasswordScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    const passwordInput = getByTestId('password-input');
    fireEvent.changeText(passwordInput, 'password123');

    const provisionButton = getByTestId('provision-button');
    expect(provisionButton).toBeTruthy();
  });

  it('should call startProvisioning and navigate on provision', async () => {
    const { getByTestId } = render(
      <EnterPasswordScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    fireEvent.changeText(getByTestId('password-input'), 'password123');
    fireEvent.press(getByTestId('provision-button'));

    await waitFor(() => {
      expect(mockStartProvisioning).toHaveBeenCalledWith('password123', 'living_room');
      expect(mockNavigate).toHaveBeenCalledWith('ProvisioningProgress');
    });
  });
});
