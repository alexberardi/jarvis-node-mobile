import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';

import ProvisioningNavigator from '../../src/navigation/ProvisioningNavigator';
import { HelpProvider } from '../../src/components/HelpProvider';
import { lightTheme } from '../../src/theme';
import { MOCK_NODE, MOCK_NETWORKS, resetMockState } from '../../src/api/mockProvisioningApi';
import * as provisioningApi from '../../src/api/provisioningApi';
import * as commandCenterApi from '../../src/api/commandCenterApi';
import * as k2Service from '../../src/services/k2Service';

// L1 FLOW INTEGRATION — the seam the per-screen tests never cross.
// Every existing provisioning screen test stubs useProvisioningContext (a
// pass-through to useProvisioning), so the real hook + the cross-screen flow
// are never exercised. Here we mount the REAL ProvisioningNavigator (real
// ProvisioningProvider → real useProvisioning hook → real screens → real
// native-stack navigation) and intercept only the HTTP/native leaves, so the
// whole wizard is driven end-to-end through real state + navigation.

jest.mock('../../src/api/provisioningApi', () => ({
  ...jest.requireActual('../../src/api/provisioningApi'),
  getNodeInfo: jest.fn(),
  scanNetworks: jest.fn(),
  provision: jest.fn(),
  provisionK2: jest.fn(),
  setNodeIp: jest.fn(),
}));

jest.mock('../../src/services/k2Service', () => ({
  generateK2: jest.fn(),
  storeK2: jest.fn(),
}));

jest.mock('../../src/api/commandCenterApi', () => ({
  requestProvisioningToken: jest.fn(),
}));

jest.mock('../../src/config/serviceConfig', () => ({
  ...jest.requireActual('../../src/config/serviceConfig'),
  getCommandCenterUrl: jest.fn().mockReturnValue('http://192.168.1.50:7703'),
}));

// Provisioning requires a logged-in user with an active household.
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

// SuccessScreen flags the freshly-provisioned node pending on mount.
const mockMarkPending = jest.fn();
jest.mock('../../src/contexts/PendingNodeContext', () => ({
  usePendingNode: () => ({ markPending: mockMarkPending }),
}));

const renderFlow = () =>
  render(
    <NavigationContainer>
      <PaperProvider theme={lightTheme}>
        <HelpProvider>
          <ProvisioningNavigator />
        </HelpProvider>
      </PaperProvider>
    </NavigationContainer>,
  );

describe('Provisioning wizard — flow integration (real hook, real screens, real navigation)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockState();
    (provisioningApi.getNodeInfo as jest.Mock).mockResolvedValue(MOCK_NODE);
    (provisioningApi.scanNetworks as jest.Mock).mockResolvedValue(MOCK_NETWORKS);
    (provisioningApi.provision as jest.Mock).mockResolvedValue({
      success: true,
      node_id: 'cc-node-1',
      room_name: 'living_room',
      message: 'ok',
    });
    (provisioningApi.provisionK2 as jest.Mock).mockResolvedValue({
      success: true,
      node_id: 'cc-node-1',
      kid: 'kid-1',
    });
    (k2Service.generateK2 as jest.Mock).mockResolvedValue({
      nodeId: 'cc-node-1',
      kid: 'kid-1',
      k2: 'k2-base64',
      createdAt: new Date().toISOString(),
    });
    (k2Service.storeK2 as jest.Mock).mockResolvedValue(undefined);
    (commandCenterApi.requestProvisioningToken as jest.Mock).mockResolvedValue({
      token: 'tok-1',
      node_id: 'cc-node-1',
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      expires_in: 3600,
    });
  });

  it('drives ScanForNodes → NodeInfo → SelectNetwork → EnterPassword → Progress → Success', async () => {
    const { getByTestId, getByText, findByTestId, findByText } = renderFlow();

    // 1. ScanForNodes — prepare (fetch CC token), then connect (fetch node info).
    fireEvent.press(getByTestId('prepare-button'));
    fireEvent.press(await findByTestId('connect-button'));

    // 2. NodeInfo — the real getNodeInfo() result crossed the navigation boundary.
    const continueBtn = await findByTestId('continue-button');
    expect(getByText(MOCK_NODE.node_id)).toBeTruthy();
    fireEvent.press(continueBtn);

    // 3. SelectNetwork — the list came from the real fetchNetworks() → scanNetworks().
    fireEvent.press(await findByText(MOCK_NETWORKS[0].ssid));

    // 4. EnterPassword — enter the WiFi password and provision (room defaults to living_room).
    fireEvent.changeText(await findByTestId('password-input'), 'password123');
    fireEvent.press(getByTestId('provision-button'));

    // 5. ProvisioningProgress — the node drops its AP after accepting creds; the hook
    //    parks at awaiting_wifi_switch. Confirm reconnection → state success.
    fireEvent.press(await findByText(/I've Reconnected/i));

    // 6. Success — we landed on the final screen; the node was flagged pending.
    expect(await findByText('Success!')).toBeTruthy();
    expect(getByText('cc-node-1')).toBeTruthy();
    expect(mockMarkPending).toHaveBeenCalledWith('cc-node-1', 'test-household-123');

    // The real hook ran the entire pipeline across the wizard:
    expect(commandCenterApi.requestProvisioningToken).toHaveBeenCalled();
    expect(provisioningApi.getNodeInfo).toHaveBeenCalled();
    expect(provisioningApi.scanNetworks).toHaveBeenCalled();
    expect(k2Service.generateK2).toHaveBeenCalledWith('cc-node-1');
    expect(provisioningApi.provisionK2).toHaveBeenCalled();
    expect(k2Service.storeK2).toHaveBeenCalled();
    expect(provisioningApi.provision).toHaveBeenCalledWith(
      expect.objectContaining({
        ssid: MOCK_NETWORKS[0].ssid,
        password: 'password123',
        node_id: 'cc-node-1',
        provisioning_token: 'tok-1',
      }),
    );
  });

  it('still completes to Success when provision() throws (the node drops its AP)', async () => {
    // The load-bearing invariant, proven end-to-end through the UI: a thrown
    // provision() is EXPECTED (the node tears down its AP the instant it accepts
    // the creds, killing the socket), so the wizard must still reach Success —
    // not an error screen.
    (provisioningApi.provision as jest.Mock).mockRejectedValue(new Error('Network Error'));
    const { getByTestId, findByTestId, findByText } = renderFlow();

    fireEvent.press(getByTestId('prepare-button'));
    fireEvent.press(await findByTestId('connect-button'));
    fireEvent.press(await findByTestId('continue-button'));
    fireEvent.press(await findByText(MOCK_NETWORKS[0].ssid));
    fireEvent.changeText(await findByTestId('password-input'), 'password123');
    fireEvent.press(getByTestId('provision-button'));
    fireEvent.press(await findByText(/I've Reconnected/i));

    expect(await findByText('Success!')).toBeTruthy();
    expect(provisioningApi.provision).toHaveBeenCalled();
  });

  it('halts on NodeInfo (does not advance to SelectNetwork) when the network scan fails', async () => {
    (provisioningApi.scanNetworks as jest.Mock).mockRejectedValue(new Error('scan failed'));
    const { getByTestId, findByTestId, queryByText } = renderFlow();

    fireEvent.press(getByTestId('prepare-button'));
    fireEvent.press(await findByTestId('connect-button'));
    fireEvent.press(await findByTestId('continue-button'));

    // fetchNetworks() failed → handleContinue does not navigate; we stay on NodeInfo.
    await waitFor(() => {
      expect(provisioningApi.scanNetworks).toHaveBeenCalled();
    });
    expect(queryByText(MOCK_NETWORKS[0].ssid)).toBeNull(); // SelectNetwork never reached
    expect(getByTestId('continue-button')).toBeTruthy(); // still on NodeInfo
  });
});
