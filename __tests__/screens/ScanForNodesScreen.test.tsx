import React from 'react';
import { render, fireEvent, waitFor, act, within } from '@testing-library/react-native';
import { Linking, Platform } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import ScanForNodesScreen from '../../src/screens/Provisioning/ScanForNodesScreen';
import { HelpProvider } from '../../src/components/HelpProvider';
import { lightTheme } from '../../src/theme';
import { SEARCH_GRACE_MS } from '../../src/hooks/useSetupNodeDiscovery';

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
// Set to make `new Zeroconf()` throw, as a missing native module does.
let mockZeroconfMissing = false;

jest.mock('react-native-zeroconf', () => ({
  __esModule: true,
  default: class MockZeroconf {
    constructor() {
      if (mockZeroconfMissing) throw new Error('RNZeroconf native module is null');
    }
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
    mockZeroconfMissing = false;
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
  describe('LAN browse state (shown even with no node found)', () => {
    const renderScreen = () =>
      render(
        <PaperProvider theme={lightTheme}>
          <HelpProvider>
            <ScanForNodesScreen navigation={mockNavigation} route={{} as any} />
          </HelpProvider>
        </PaperProvider>
      );

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('shows the browse searching on mount, before any result', () => {
      const { getByTestId, getByText, queryByTestId } = renderScreen();

      expect(getByTestId('lan-discovery-searching')).toBeTruthy();
      expect(getByText(/Looking for nodes on your Wi-Fi/)).toBeTruthy();
      expect(queryByTestId('lan-discovery-empty')).toBeNull();
    });

    it('says nothing was found once the browse has had time, and that a Wi-Fi node raises no hotspot', () => {
      jest.useFakeTimers();
      const { getByTestId, getByText, queryByTestId } = renderScreen();

      act(() => {
        jest.advanceTimersByTime(SEARCH_GRACE_MS);
      });

      expect(queryByTestId('lan-discovery-searching')).toBeNull();
      expect(getByTestId('lan-discovery-empty')).toBeTruthy();
      expect(getByText(/No nodes found yet/)).toBeTruthy();
      expect(getByText(/already joined to your Wi-Fi won't raise one/)).toBeTruthy();
    });

    it('says nothing was found when the browse stops with no node', () => {
      const { getByTestId } = renderScreen();

      emitZeroconf('stop', undefined);

      expect(getByTestId('lan-discovery-empty')).toBeTruthy();
    });

    it('still lists a node that resolves after nothing was found', () => {
      jest.useFakeTimers();
      const { getByTestId, queryByTestId } = renderScreen();
      act(() => {
        jest.advanceTimersByTime(SEARCH_GRACE_MS);
      });

      emitZeroconf('resolved', resolvedNode);

      expect(getByTestId('discovered-node-node-abc')).toBeTruthy();
      expect(queryByTestId('lan-discovery-empty')).toBeNull();
    });

    it('on iOS, a browse error names Settings > Jarvis Automation > Local Network', () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      const openSettings = jest
        .spyOn(Linking, 'openSettings')
        .mockResolvedValue(undefined);
      const { getByTestId, getByText, queryByTestId } = renderScreen();

      emitZeroconf('error', new Error('-72008'));

      expect(getByTestId('lan-discovery-error')).toBeTruthy();
      expect(queryByTestId('lan-discovery-searching')).toBeNull();
      expect(
        getByText(/Settings > Jarvis Automation > Local Network/),
      ).toBeTruthy();
      fireEvent.press(getByTestId('lan-open-settings'));
      expect(openSettings).toHaveBeenCalled();
    });

    it('on Android, a browse error says it could not search, with the reason', () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      const { getByTestId, getByText, queryByTestId } = renderScreen();

      emitZeroconf('error', new Error('discovery failed: 0'));

      expect(getByTestId('lan-discovery-error')).toBeTruthy();
      expect(getByText(/Couldn't search your Wi-Fi.*discovery failed: 0/)).toBeTruthy();
      expect(queryByTestId('lan-open-settings')).toBeNull();
    });

    it('says the browse is unavailable when the native module is missing', () => {
      mockZeroconfMissing = true;
      const { getByTestId, getByText } = renderScreen();

      expect(getByTestId('lan-discovery-unavailable')).toBeTruthy();
      expect(getByText(/isn't available in this build/)).toBeTruthy();
      // The hotspot path is still offered, as the primary action.
      expect(getByTestId('prepare-button')).toBeTruthy();
    });

    it('says the browse is unavailable when the scan cannot start', () => {
      mockScan.mockImplementationOnce(() => {
        throw new Error('scan failed');
      });
      const { getByTestId } = renderScreen();

      expect(getByTestId('lan-discovery-unavailable')).toBeTruthy();
    });

    it('puts one discovered node first, above the hotspot card', () => {
      const { getByTestId, getAllByTestId } = renderScreen();

      emitZeroconf('resolved', resolvedNode);

      const lanCard = getByTestId('lan-discovery-card');
      expect(within(lanCard).getByTestId('setup-node-node-abc')).toBeTruthy();
      expect(within(lanCard).getByText(/ready to set up. No hotspot needed/)).toBeTruthy();
      // Tree order: the LAN card renders before the hotspot card.
      expect(
        getAllByTestId(/^(lan-discovery-card|hotspot-card)$/).map((n) => n.props.testID),
      ).toEqual(['lan-discovery-card', 'hotspot-card']);
    });
  });
});
