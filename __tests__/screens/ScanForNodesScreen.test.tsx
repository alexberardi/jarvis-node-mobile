import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import ScanForNodesScreen from '../../src/screens/Provisioning/ScanForNodesScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate } as any;

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    state: {
      isAuthenticated: true,
      activeHouseholdId: 'test-household-123',
      households: [{ id: 'test-household-123', name: 'Test Home', role: 'admin' }],
      user: { id: 1, email: 'test@example.com' },
      accessToken: 'mock-access-token',
    },
    logout: jest.fn(),
  }),
}));

const mockConnect = jest.fn().mockResolvedValue(true);
const mockFetchProvisioningToken = jest.fn().mockResolvedValue(true);

jest.mock('../../src/contexts/ProvisioningContext', () => ({
  ...jest.requireActual('../../src/contexts/ProvisioningContext'),
  useProvisioningContext: () => ({
    connect: mockConnect,
    fetchProvisioningToken: mockFetchProvisioningToken,
    isLoading: false,
    error: null,
    setError: jest.fn(),
  }),
}));

jest.mock('../../src/theme/ThemeProvider', () => {
  const { lightTheme: lt } = jest.requireActual('../../src/theme');
  return {
    useThemePreference: () => ({
      isDark: false,
      toggleTheme: jest.fn(),
      paperTheme: lt,
      themePreference: 'light',
      setThemePreference: jest.fn(),
    }),
  };
});

describe('ScanForNodesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render prepare button initially', () => {
    const { getByTestId } = render(
      <PaperProvider theme={lightTheme}>
        <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
      </PaperProvider>
    );

    expect(getByTestId('prepare-button')).toBeTruthy();
  });

  it('should display provisioning instructions', () => {
    const { getByText } = render(
      <PaperProvider theme={lightTheme}>
        <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
      </PaperProvider>
    );

    expect(getByText(/Power on your new Jarvis node/)).toBeTruthy();
    expect(getByText(/home WiFi/)).toBeTruthy();
  });

  it('should show connect button after preparing', async () => {
    const { getByTestId, getByText } = render(
      <PaperProvider theme={lightTheme}>
        <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
      </PaperProvider>
    );

    // Phase 1: Prepare (fetch token)
    fireEvent.press(getByTestId('prepare-button'));

    await waitFor(() => {
      expect(mockFetchProvisioningToken).toHaveBeenCalledWith(
        'test-household-123',
      );
    });

    // Phase 2: Connect button should now be visible
    await waitFor(() => {
      expect(getByTestId('connect-button')).toBeTruthy();
      expect(getByText(/Token ready/)).toBeTruthy();
    });
  });

  it('should have developer options toggle', () => {
    const { getByText } = render(
      <PaperProvider theme={lightTheme}>
        <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
      </PaperProvider>
    );

    expect(getByText(/Developer Options/)).toBeTruthy();
  });

  it('should show IP input when developer options expanded', () => {
    const { getByText, getByTestId } = render(
      <PaperProvider theme={lightTheme}>
        <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
      </PaperProvider>
    );

    // Expand developer options
    fireEvent.press(getByText(/Show Developer Options/));

    // Now IP input should be visible
    expect(getByTestId('ip-input')).toBeTruthy();
    expect(getByTestId('port-input')).toBeTruthy();
  });

  it('should navigate to NodeInfo after prepare then connect', async () => {
    const { getByTestId } = render(
      <PaperProvider theme={lightTheme}>
        <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
      </PaperProvider>
    );

    // Phase 1: Prepare
    fireEvent.press(getByTestId('prepare-button'));

    await waitFor(() => {
      expect(getByTestId('connect-button')).toBeTruthy();
    });

    // Phase 2: Connect
    fireEvent.press(getByTestId('connect-button'));

    await waitFor(
      () => {
        expect(mockConnect).toHaveBeenCalledWith('192.168.4.1', 8080);
        expect(mockNavigate).toHaveBeenCalledWith('NodeInfo');
      },
      { timeout: 2000 }
    );
  });
});
