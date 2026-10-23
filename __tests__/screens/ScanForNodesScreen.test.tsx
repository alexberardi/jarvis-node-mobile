import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import ScanForNodesScreen from '../../src/screens/Provisioning/ScanForNodesScreen';
import { HelpProvider } from '../../src/components/HelpProvider';
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
// The screen derives "token ready" from the context's provisioningToken.
let mockProvisioningToken: string | null = null;
const mockFetchProvisioningToken = jest.fn().mockImplementation(async () => {
  mockProvisioningToken = 'tok-1';
  return true;
});

jest.mock('../../src/contexts/ProvisioningContext', () => ({
  ...jest.requireActual('../../src/contexts/ProvisioningContext'),
  useProvisioningContext: () => ({
    connect: mockConnect,
    fetchProvisioningToken: mockFetchProvisioningToken,
    isLoading: false,
    error: null,
    setError: jest.fn(),
    provisioningToken: mockProvisioningToken,
  }),
}));

// Mock react-native-zeroconf: the native module is absent in jest. The hook
// browses _jarvis-setup._tcp; tests drive it by emitting 'resolved'/'remove'.
type ZeroconfListener = (...args: unknown[]) => void;
let mockZeroconfListeners: Record<string, ZeroconfListener[]> = {};
const mockScan = jest.fn();
const mockStop = jest.fn();
const mockRemoveAllListeners = jest.fn();

jest.mock('react-native-zeroconf', () => ({
  __esModule: true,
  default: class MockZeroconf {
    on(event: string, listener: ZeroconfListener) {
      (mockZeroconfListeners[event] = mockZeroconfListeners[event] ?? []).push(listener);
    }
    scan = mockScan;
    stop = mockStop;
    removeAllListeners = mockRemoveAllListeners;
  },
}));

const emitZeroconf = (event: string, payload: unknown) => {
  act(() => {
    for (const listener of mockZeroconfListeners[event] ?? []) listener(payload);
  });
};

const resolvedNode = {
  name: 'node-abc',
  host: 'node-abc.local.',
  port: 8080,
  addresses: ['10.0.0.179'],
  txt: { node_id: 'node-abc', hardware: 'pi-zero-2w' },
};

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
    mockProvisioningToken = null;
    mockZeroconfListeners = {};
  });

  it('should render prepare button initially', () => {
    const { getByTestId } = render(
      <PaperProvider theme={lightTheme}>
        <HelpProvider>
          <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
        </HelpProvider>
      </PaperProvider>
    );

    expect(getByTestId('prepare-button')).toBeTruthy();
  });

  it('should display provisioning instructions', () => {
    const { getByText } = render(
      <PaperProvider theme={lightTheme}>
        <HelpProvider>
          <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
        </HelpProvider>
      </PaperProvider>
    );

    expect(getByText(/Power on your new Jarvis node/)).toBeTruthy();
    expect(getByText(/home WiFi/)).toBeTruthy();
  });

  it('should show connect button after preparing', async () => {
    const { getByTestId, getByText } = render(
      <PaperProvider theme={lightTheme}>
        <HelpProvider>
          <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
        </HelpProvider>
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

  it('asks for Prepare again once the context token is cleared (e.g. after reset)', () => {
    mockProvisioningToken = 'tok-1';
    const ui = () => (
      <PaperProvider theme={lightTheme}>
        <HelpProvider>
          <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
        </HelpProvider>
      </PaperProvider>
    );
    const { getByTestId, queryByTestId, rerender } = render(ui());
    expect(getByTestId('connect-button')).toBeTruthy();

    mockProvisioningToken = null;
    rerender(ui());
    expect(getByTestId('prepare-button')).toBeTruthy();
    expect(queryByTestId('connect-button')).toBeNull();
  });

  it('should have developer options toggle', () => {
    const { getByText } = render(
      <PaperProvider theme={lightTheme}>
        <HelpProvider>
          <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
        </HelpProvider>
      </PaperProvider>
    );

    expect(getByText(/Developer Options/)).toBeTruthy();
  });

  it('should show IP input when developer options expanded', () => {
    const { getByText, getByTestId } = render(
      <PaperProvider theme={lightTheme}>
        <HelpProvider>
          <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
        </HelpProvider>
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
        <HelpProvider>
          <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
        </HelpProvider>
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

  describe('discovered LAN nodes (_jarvis-setup._tcp)', () => {
    const renderScreen = () =>
      render(
        <PaperProvider theme={lightTheme}>
          <HelpProvider>
            <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
          </HelpProvider>
        </PaperProvider>
      );

    it('browses for _jarvis-setup._tcp on mount and stops on unmount', () => {
      const { unmount } = renderScreen();

      expect(mockScan).toHaveBeenCalledWith('jarvis-setup', 'tcp', 'local.');

      unmount();
      expect(mockRemoveAllListeners).toHaveBeenCalled();
      expect(mockStop).toHaveBeenCalled();
    });

    it('lists a resolved node with node_id, hardware and address:port', () => {
      const { getByText, getByTestId } = renderScreen();

      emitZeroconf('resolved', resolvedNode);

      expect(getByTestId('discovered-node-node-abc')).toBeTruthy();
      expect(getByText('node-abc')).toBeTruthy();
      expect(getByText(/pi-zero-2w/)).toBeTruthy();
      expect(getByText(/10\.0\.0\.179:8080/)).toBeTruthy();
      // The hotspot instructions stay alongside the discovered list.
      expect(getByTestId('prepare-button')).toBeTruthy();
    });

    it('falls back to the instance name when TXT has no node_id', () => {
      const { getByTestId } = renderScreen();

      emitZeroconf('resolved', { ...resolvedNode, txt: undefined });

      expect(getByTestId('discovered-node-node-abc')).toBeTruthy();
    });

    it('sets up a node: fetches the token, connects to its address, navigates', async () => {
      const { getByTestId } = renderScreen();

      emitZeroconf('resolved', resolvedNode);
      fireEvent.press(getByTestId('setup-node-node-abc'));

      await waitFor(() => {
        expect(mockFetchProvisioningToken).toHaveBeenCalledWith(
          'test-household-123',
        );
        expect(mockConnect).toHaveBeenCalledWith('10.0.0.179', 8080);
        expect(mockNavigate).toHaveBeenCalledWith('NodeInfo');
      });
      expect(mockFetchProvisioningToken).toHaveBeenCalledTimes(1);
    });

    it('does not fetch a new token when one is already ready', async () => {
      mockProvisioningToken = 'tok-1';
      const { getByTestId } = renderScreen();

      emitZeroconf('resolved', resolvedNode);
      fireEvent.press(getByTestId('setup-node-node-abc'));

      await waitFor(() => {
        expect(mockConnect).toHaveBeenCalledWith('10.0.0.179', 8080);
      });
      expect(mockFetchProvisioningToken).not.toHaveBeenCalled();
    });

    it('drops a node when mDNS reports it removed', () => {
      const { queryByTestId } = renderScreen();

      emitZeroconf('resolved', resolvedNode);
      expect(queryByTestId('discovered-node-node-abc')).toBeTruthy();

      emitZeroconf('remove', 'node-abc');
      expect(queryByTestId('discovered-node-node-abc')).toBeNull();
    });

    it('dedupes repeated resolutions of the same node by node_id', () => {
      const { getAllByText, getByText } = renderScreen();

      emitZeroconf('resolved', resolvedNode);
      emitZeroconf('resolved', { ...resolvedNode, addresses: ['10.0.0.200'] });

      expect(getAllByText('node-abc')).toHaveLength(1);
      expect(getByText(/10\.0\.0\.200:8080/)).toBeTruthy();
    });
  });
});
