import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import NodeInfoScreen from '../../src/screens/Provisioning/NodeInfoScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockNavigation = { navigate: mockNavigate, goBack: mockGoBack } as any;

const mockNodeInfo = {
  node_id: 'jarvis-mock-1234',
  firmware_version: '1.0.0',
  hardware: 'pi-zero-w',
  mac_address: 'b8:27:eb:aa:bb:cc',
  capabilities: ['voice', 'speaker'],
  state: 'AP_MODE' as const,
};

const mockFetchNetworks = jest.fn().mockResolvedValue(true);

jest.mock('../../src/contexts/ProvisioningContext', () => ({
  useProvisioningContext: () => ({
    nodeInfo: mockNodeInfo,
    fetchNetworks: mockFetchNetworks,
    isLoading: false,
    error: null,
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('NodeInfoScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display node ID', () => {
    const { getByText } = render(
      <NodeInfoScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText('jarvis-mock-1234')).toBeTruthy();
  });

  it('should display firmware version', () => {
    const { getByText } = render(
      <NodeInfoScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText('1.0.0')).toBeTruthy();
  });

  it('should display hardware type', () => {
    const { getByText } = render(
      <NodeInfoScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText('pi-zero-w')).toBeTruthy();
  });

  it('should display capabilities', () => {
    const { getByText } = render(
      <NodeInfoScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText('voice')).toBeTruthy();
    expect(getByText('speaker')).toBeTruthy();
  });

  it('should have continue button', () => {
    const { getByTestId } = render(
      <NodeInfoScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByTestId('continue-button')).toBeTruthy();
  });

  it('should navigate to SelectNetwork on continue', async () => {
    const { getByTestId } = render(
      <NodeInfoScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    fireEvent.press(getByTestId('continue-button'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('SelectNetwork');
    });
  });
});
