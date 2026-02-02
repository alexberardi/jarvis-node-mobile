import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import ProvisioningProgressScreen from '../../src/screens/Provisioning/ProvisioningProgressScreen';
import { lightTheme } from '../../src/theme';
import { ProvisioningState, ProvisioningResult } from '../../src/types/Provisioning';

const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate } as any;

interface MockContextValue {
  state: ProvisioningState;
  progress: number;
  statusMessage: string;
  provisioningResult: ProvisioningResult | null;
  error: string | null;
  reset: jest.Mock;
}

let mockContextValue: MockContextValue = {
  state: 'provisioning',
  progress: 50,
  statusMessage: 'Configuring node...',
  provisioningResult: null,
  error: null,
  reset: jest.fn(),
};

jest.mock('../../src/contexts/ProvisioningContext', () => ({
  useProvisioningContext: () => mockContextValue,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('ProvisioningProgressScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContextValue = {
      state: 'provisioning',
      progress: 50,
      statusMessage: 'Configuring node...',
      provisioningResult: null,
      error: null,
      reset: jest.fn(),
    };
  });

  it('should display progress indicator', () => {
    const { getByTestId } = render(
      <ProvisioningProgressScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByTestId('progress-indicator')).toBeTruthy();
  });

  it('should display current status message', () => {
    const { getByText } = render(
      <ProvisioningProgressScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText('Configuring node...')).toBeTruthy();
  });

  it('should display progress percentage', () => {
    const { getByText } = render(
      <ProvisioningProgressScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText('50%')).toBeTruthy();
  });

  it('should navigate to Success on completion', async () => {
    mockContextValue = {
      ...mockContextValue,
      state: 'success',
      progress: 100,
      statusMessage: 'Complete!',
      provisioningResult: { success: true, node_id: 'test', room_name: 'kitchen' },
    };

    render(
      <ProvisioningProgressScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Success');
    });
  });

  it('should display error message on failure', () => {
    mockContextValue = {
      ...mockContextValue,
      state: 'error',
      progress: 50,
      statusMessage: 'Failed',
      error: 'Connection timeout',
    };

    const { getByText } = render(
      <ProvisioningProgressScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByText('Connection timeout')).toBeTruthy();
  });
});
