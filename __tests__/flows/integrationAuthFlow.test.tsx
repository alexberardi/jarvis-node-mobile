import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import IntegrationAuthScreen from '../../src/screens/Settings/IntegrationAuthScreen';
import { lightTheme } from '../../src/theme';

// L1 FLOW INTEGRATION — the generic JCC-backed OAuth IntegrationAuth surface (no
// prior coverage). The real multi-phase state machine is driven against the real
// screen: discovery-on-mount → createAuthSession → WebBrowser.openAuthSessionAsync
// → (exchangeCode when requires_code_exchange) → poll getAuthSessionStatus to a
// TERMINAL status → "Connected!" done render. We assert the exact api call shapes,
// the pending→active poll transition (chained mockResolvedValueOnce on a single
// REAL ~1.5s poll tick — no fake timers), the relay code-exchange branch, the
// discovery-miss → manual_entry → handleManualConnect URL normalization, the
// WebBrowser-cancel return-to-entry (no poll), and the createAuthSession error →
// Alert + error text + phase reset. Only nav/route, expo-web-browser, the
// network discovery service, and the authSession api leaves are mocked; the
// screen renders for real.

const mockGoBack = jest.fn();
const mockNavigation = { navigate: jest.fn(), goBack: mockGoBack };

// route.params is reassigned per-test (some tests drop discovery_port).
let mockRouteParams: any;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockRouteParams }),
}));

const mockOpenAuthSessionAsync = jest.fn();
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: any[]) => mockOpenAuthSessionAsync(...args),
}));

const mockDiscoverService = jest.fn();
jest.mock('../../src/services/networkDiscoveryService', () => ({
  discoverService: (...args: any[]) => mockDiscoverService(...args),
  getIpAddressAsync: jest.fn().mockResolvedValue('192.168.1.10'),
}));

const mockCreateAuthSession = jest.fn();
const mockGetAuthSessionStatus = jest.fn();
const mockExchangeCode = jest.fn();
jest.mock('../../src/api/authSessionApi', () => ({
  createAuthSession: (...args: any[]) => mockCreateAuthSession(...args),
  getAuthSessionStatus: (...args: any[]) => mockGetAuthSessionStatus(...args),
  exchangeCode: (...args: any[]) => mockExchangeCode(...args),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

// authConfig with a discovery_port → discovery runs on mount.
const discoverableAuthConfig = {
  type: 'oauth',
  provider: 'home_assistant',
  friendly_name: 'Home Assistant',
  client_id: 'cid',
  keys: ['access_token'],
  discovery_port: 8123,
  discovery_probe_path: '/api/',
};

// authConfig WITHOUT discovery → startAuthFlow fires straight from mount.
const externalAuthConfig = {
  type: 'oauth',
  provider: 'spotify',
  friendly_name: 'Spotify',
  client_id: 'cid',
  keys: ['access_token'],
};

const makeParams = (authConfig: object, extra: Record<string, any> = {}) => ({
  authConfig: JSON.stringify(authConfig),
  nodeId: 'node-1',
  accessToken: 'tok',
  ...extra,
});

const renderScreen = () => render(<IntegrationAuthScreen />, { wrapper });

describe('IntegrationAuth — flow integration (discovery, session, exchange, poll, cancel, error)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = makeParams(discoverableAuthConfig);
    // Sensible happy-path defaults; individual tests override.
    mockDiscoverService.mockResolvedValue({ found: true, url: 'http://192.168.1.50:8123' });
    mockCreateAuthSession.mockResolvedValue({
      session_id: 'sess-1',
      authorize_url: 'http://192.168.1.50:8123/authorize?x=1',
      requires_code_exchange: false,
    });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'jarvis://auth-complete?code=xyz',
    });
    mockGetAuthSessionStatus.mockResolvedValue({
      session_id: 'sess-1',
      status: 'active',
      provider: 'home_assistant',
    });
  });

  it('discovery → createAuthSession → WebBrowser → poll pending→active → Connected!', async () => {
    // First poll returns pending, second returns active → proves the real
    // ~1.5s poll-tick transition without fake timers.
    mockGetAuthSessionStatus
      .mockResolvedValueOnce({ session_id: 'sess-1', status: 'pending', provider: 'home_assistant' })
      .mockResolvedValueOnce({ session_id: 'sess-1', status: 'active', provider: 'home_assistant' });

    const { getByText } = renderScreen();

    // discoverService probes the configured port + path with a progress cb.
    await waitFor(() => expect(mockDiscoverService).toHaveBeenCalledTimes(1));
    expect(mockDiscoverService).toHaveBeenCalledWith(8123, '/api/', expect.any(Function));

    // createAuthSession gets the discovered base URL + the full auth config shape.
    await waitFor(() => expect(mockCreateAuthSession).toHaveBeenCalledTimes(1));
    expect(mockCreateAuthSession).toHaveBeenCalledWith({
      provider: 'home_assistant',
      nodeId: 'node-1',
      providerBaseUrl: 'http://192.168.1.50:8123',
      authConfig: discoverableAuthConfig,
    });

    // The browser opens the authorize_url with the default custom-scheme redirect.
    await waitFor(() => expect(mockOpenAuthSessionAsync).toHaveBeenCalledTimes(1));
    expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
      'http://192.168.1.50:8123/authorize?x=1',
      'jarvis://auth-complete',
    );

    // No relay bounce → no code exchange.
    expect(mockExchangeCode).not.toHaveBeenCalled();

    // Terminal render after the pending→active transition (real poll tick).
    await waitFor(() => expect(getByText('Connected!')).toBeTruthy(), { timeout: 8000 });
    // Polled at least twice (pending then active).
    expect(mockGetAuthSessionStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mockGetAuthSessionStatus).toHaveBeenCalledWith('sess-1');
  });

  it('relay bounce: requires_code_exchange → exchangeCode with the callback code, then active', async () => {
    mockCreateAuthSession.mockResolvedValueOnce({
      session_id: 'sess-relay',
      authorize_url: 'https://accounts.spotify.com/authorize?x=1',
      requires_code_exchange: true,
    });
    mockOpenAuthSessionAsync.mockResolvedValueOnce({
      type: 'success',
      url: 'jarvis://auth-complete?code=abc123&state=s',
    });
    mockGetAuthSessionStatus.mockResolvedValue({
      session_id: 'sess-relay',
      status: 'active',
      provider: 'spotify',
    });

    // External provider — no discovery, session created straight from mount.
    mockRouteParams = makeParams(externalAuthConfig);

    const { getByText } = renderScreen();

    await waitFor(() => expect(mockCreateAuthSession).toHaveBeenCalledTimes(1));
    expect(mockDiscoverService).not.toHaveBeenCalled();

    // The code is parsed out of the callback URL and exchanged with JCC.
    await waitFor(() => expect(mockExchangeCode).toHaveBeenCalledTimes(1));
    expect(mockExchangeCode).toHaveBeenCalledWith('sess-relay', 'abc123');

    await waitFor(() => expect(getByText('Connected!')).toBeTruthy(), { timeout: 8000 });
  });

  it('discovery miss → manual_entry → Connect normalizes the IP into a base URL', async () => {
    mockDiscoverService.mockResolvedValueOnce({ found: false, url: null });

    const { getByText, getByTestId } = renderScreen();

    // Falls back to manual entry when nothing is found.
    await waitFor(() => expect(getByText(/not found on your network/i)).toBeTruthy());
    // No session attempted yet.
    expect(mockCreateAuthSession).not.toHaveBeenCalled();

    // Connect is gated until a value is entered.
    expect(
      getByTestId('integration-auth-connect-button').props.accessibilityState?.disabled,
    ).toBe(true);

    fireEvent.changeText(getByTestId('integration-auth-manual-url-input'), '192.168.1.77');
    await waitFor(() =>
      expect(
        getByTestId('integration-auth-connect-button').props.accessibilityState?.disabled,
      ).toBe(false),
    );

    await act(async () => {
      fireEvent.press(getByTestId('integration-auth-connect-button'));
    });

    // A bare IP is normalized to http://IP:discovery_port and used as the base URL.
    await waitFor(() => expect(mockCreateAuthSession).toHaveBeenCalledTimes(1));
    expect(mockCreateAuthSession).toHaveBeenCalledWith(
      expect.objectContaining({ providerBaseUrl: 'http://192.168.1.77:8123' }),
    );
    await waitFor(() => expect(getByText('Connected!')).toBeTruthy(), { timeout: 8000 });
  });

  it('WebBrowser cancel returns to manual_entry without polling', async () => {
    mockOpenAuthSessionAsync.mockResolvedValueOnce({ type: 'cancel' });

    const { getByText, getByTestId } = renderScreen();

    await waitFor(() => expect(mockOpenAuthSessionAsync).toHaveBeenCalledTimes(1));

    // discovery_port is set → cancel routes back to the manual-entry screen.
    await waitFor(() =>
      expect(getByTestId('integration-auth-manual-url-input')).toBeTruthy(),
    );
    // Never polled, never reached done.
    expect(mockGetAuthSessionStatus).not.toHaveBeenCalled();
    expect(() => getByText('Connected!')).toThrow();
  });

  it('createAuthSession error → Alert + error text + reset to manual_entry', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockCreateAuthSession.mockRejectedValueOnce(new Error('JCC unavailable'));

    const { getByTestId } = renderScreen();

    await waitFor(() => expect(mockCreateAuthSession).toHaveBeenCalledTimes(1));

    // Error surfaced via Alert.
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Error', 'JCC unavailable'),
    );
    // ...and rendered inline (testID error text).
    await waitFor(() =>
      expect(getByTestId('integration-auth-error-text')).toHaveTextContent(
        'JCC unavailable',
      ),
    );
    // discovery_port set → phase resets to manual_entry (the input is back).
    await waitFor(() =>
      expect(getByTestId('integration-auth-manual-url-input')).toBeTruthy(),
    );
    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('Done after success and Back during entry both call navigation.goBack()', async () => {
    const { getByText, getByTestId } = renderScreen();

    // Drive to the done phase, then tap Done.
    await waitFor(() => expect(getByText('Connected!')).toBeTruthy(), { timeout: 8000 });
    fireEvent.press(getByTestId('integration-auth-done-button'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);

    // Now a manual-entry render where the Back button is shown, and it also goes back.
    mockGoBack.mockClear();
    mockDiscoverService.mockResolvedValueOnce({ found: false, url: null });
    const second = renderScreen();
    await waitFor(() =>
      expect(second.getByTestId('integration-auth-back-button')).toBeTruthy(),
    );
    fireEvent.press(second.getByTestId('integration-auth-back-button'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});
