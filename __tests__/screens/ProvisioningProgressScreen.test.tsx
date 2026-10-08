import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
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
  failureReason?: string | null;
  retryVerification?: jest.Mock;
  checkNodeStatus?: jest.Mock;
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

  it('shows a spinner (not the WiFi prompt) while waiting for the node to register', () => {
    mockContextValue = {
      ...mockContextValue,
      state: 'verifying',
      progress: 85,
      statusMessage: 'Waiting for your node to join WiFi and register...',
    };

    const { getByTestId, getByText, queryByTestId } = render(
      <ProvisioningProgressScreen navigation={mockNavigation} route={{} as any} />,
      { wrapper }
    );

    expect(getByTestId('verifying-indicator')).toBeTruthy();
    expect(getByText('Waiting for your node to join WiFi and register...')).toBeTruthy();
    expect(queryByTestId('wifi-reconnected-button')).toBeNull();
    expect(queryByTestId('registration-failed')).toBeNull();
  });

  describe('registration failed', () => {
    const failedState = (failureReason: string | null) => ({
      ...mockContextValue,
      state: 'registration_failed' as const,
      progress: 85,
      statusMessage: 'The node did not finish setting up',
      error: "The node couldn't register — reconnect to its setup hotspot and try again.",
      failureReason,
      retryVerification: jest.fn(),
      checkNodeStatus: jest.fn().mockResolvedValue(null),
    });

    it('shows the actionable message and the reason the node reported', () => {
      mockContextValue = failedState('Invalid or expired provisioning token');

      const { getByText, getByTestId, queryByTestId } = render(
        <ProvisioningProgressScreen navigation={mockNavigation} route={{} as any} />,
        { wrapper }
      );

      expect(getByTestId('registration-failed')).toBeTruthy();
      expect(
        getByText("The node couldn't register — reconnect to its setup hotspot and try again."),
      ).toBeTruthy();
      expect(getByTestId('node-failure-reason')).toHaveTextContent(
        'The node reported: Invalid or expired provisioning token',
      );
      expect(queryByTestId('verifying-indicator')).toBeNull();
    });

    it('omits the reason line when the node reported none', () => {
      mockContextValue = failedState(null);

      const { queryByTestId } = render(
        <ProvisioningProgressScreen navigation={mockNavigation} route={{} as any} />,
        { wrapper }
      );

      expect(queryByTestId('node-failure-reason')).toBeNull();
    });

    it('Try Again resets and restarts the flow from Prepare (fresh token)', () => {
      mockContextValue = failedState(null);

      const { getByTestId } = render(
        <ProvisioningProgressScreen navigation={mockNavigation} route={{} as any} />,
        { wrapper }
      );

      fireEvent.press(getByTestId('start-over-button'));
      expect(mockContextValue.reset).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('ScanForNodes');
    });

    it('Check Node Status and Keep Waiting call through to the hook', async () => {
      mockContextValue = failedState(null);

      const { getByTestId } = render(
        <ProvisioningProgressScreen navigation={mockNavigation} route={{} as any} />,
        { wrapper }
      );

      fireEvent.press(getByTestId('check-node-button'));
      await waitFor(() => expect(mockContextValue.checkNodeStatus).toHaveBeenCalled());

      fireEvent.press(getByTestId('keep-waiting-button'));
      expect(mockContextValue.retryVerification).toHaveBeenCalled();
    });
  });
});
