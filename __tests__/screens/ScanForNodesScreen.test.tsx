import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import ScanForNodesScreen from '../../src/screens/Provisioning/ScanForNodesScreen';
import { TestWrapper } from '../testUtils';

const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate } as any;

describe('ScanForNodesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render connect button for AP mode', () => {
    const { getByTestId } = render(
      <TestWrapper>
        <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
      </TestWrapper>
    );

    expect(getByTestId('connect-button')).toBeTruthy();
  });

  it('should display provisioning instructions', () => {
    const { getByText } = render(
      <TestWrapper>
        <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
      </TestWrapper>
    );

    expect(getByText(/Power on your new Jarvis node/)).toBeTruthy();
    expect(getByText(/Connect to its WiFi network/)).toBeTruthy();
  });

  it('should have developer options toggle', () => {
    const { getByText } = render(
      <TestWrapper>
        <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
      </TestWrapper>
    );

    expect(getByText(/Developer Options/)).toBeTruthy();
  });

  it('should show IP input when developer options expanded', () => {
    const { getByText, getByTestId } = render(
      <TestWrapper>
        <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
      </TestWrapper>
    );

    // Expand developer options
    fireEvent.press(getByText(/Show Developer Options/));

    // Now IP input should be visible
    expect(getByTestId('ip-input')).toBeTruthy();
    expect(getByTestId('port-input')).toBeTruthy();
  });

  it('should navigate to NodeInfo on successful connection', async () => {
    const { getByTestId } = render(
      <TestWrapper>
        <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
      </TestWrapper>
    );

    const connectButton = getByTestId('connect-button');
    fireEvent.press(connectButton);

    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith('NodeInfo');
      },
      { timeout: 2000 }
    );
  });
});
