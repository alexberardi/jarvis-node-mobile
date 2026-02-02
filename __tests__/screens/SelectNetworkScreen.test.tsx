import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import SelectNetworkScreen from '../../src/screens/Provisioning/SelectNetworkScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockNavigation = { navigate: mockNavigate, goBack: mockGoBack } as any;

const mockNetworks = [
  { ssid: 'HomeNetwork', signal_strength: -45, security: 'WPA2' },
  { ssid: 'Neighbor5G', signal_strength: -72, security: 'WPA2' },
];

const mockSelectNetwork = jest.fn();
const mockFetchNetworks = jest.fn();

jest.mock('../../src/contexts/ProvisioningContext', () => ({
  useProvisioningContext: () => ({
    networks: mockNetworks,
    selectNetwork: mockSelectNetwork,
    fetchNetworks: mockFetchNetworks,
    isLoading: false,
    error: null,
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('SelectNetworkScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display available networks', () => {
    const { getByText } = render(
      <SelectNetworkScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText('HomeNetwork')).toBeTruthy();
    expect(getByText('Neighbor5G')).toBeTruthy();
  });

  it('should display signal strength values', () => {
    const { getByText } = render(
      <SelectNetworkScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText(/-45/)).toBeTruthy();
    expect(getByText(/-72/)).toBeTruthy();
  });

  it('should display security type', () => {
    const { getAllByText } = render(
      <SelectNetworkScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getAllByText('WPA2').length).toBe(2);
  });

  it('should navigate to EnterPassword when network is selected', () => {
    const { getByText } = render(
      <SelectNetworkScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    fireEvent.press(getByText('HomeNetwork'));

    expect(mockSelectNetwork).toHaveBeenCalledWith(mockNetworks[0]);
    expect(mockNavigate).toHaveBeenCalledWith('EnterPassword');
  });
});
