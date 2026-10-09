import { renderHook, act, waitFor } from '@testing-library/react-native';

import {
  useProvisioning,
  parseServerTimestamp,
  tokenExpiresAt,
  REGISTRATION_FAILED_MESSAGE,
  TOKEN_EXPIRED_MESSAGE,
  TOKEN_REFRESH_TIMEOUT_MS,
  VERIFY_POLL_MS,
  VERIFY_TIMEOUT_MS,
} from '../../src/hooks/useProvisioning';
import { getServiceConfig, setServiceConfig } from '../../src/config/serviceConfig';
import * as serviceConfig from '../../src/config/serviceConfig';
import { LOOPBACK_NODE_URL_MESSAGE } from '../../src/utils/nodeUrl';
import { MOCK_NODE, MOCK_NETWORKS, resetMockState } from '../../src/api/mockProvisioningApi';
import * as provisioningApi from '../../src/api/provisioningApi';
import * as k2Service from '../../src/services/k2Service';
import * as commandCenterApi from '../../src/api/commandCenterApi';
import * as smartHomeApi from '../../src/api/smartHomeApi';

// Mock the provisioning API
jest.mock('../../src/api/provisioningApi', () => ({
  ...jest.requireActual('../../src/api/provisioningApi'),
  getNodeInfo: jest.fn(),
  scanNetworks: jest.fn(),
  provision: jest.fn(),
  getProvisioningStatus: jest.fn(),
  getNodeRegistrationStatus: jest.fn(),
  provisionK2: jest.fn(),
  setNodeIp: jest.fn(),
}));

// Mock the K2 service
jest.mock('../../src/services/k2Service', () => ({
  generateK2: jest.fn(),
  storeK2: jest.fn(),
}));

// Mock the command center API
jest.mock('../../src/api/commandCenterApi', () => ({
  requestProvisioningToken: jest.fn(),
}));

// The post-send verification polls the household's node list.
jest.mock('../../src/api/smartHomeApi', () => ({
  getSmartHomeConfig: jest.fn(),
}));

// Mock serviceConfig so getCommandCenterUrl returns a valid URL
jest.mock('../../src/config/serviceConfig', () => ({
  ...jest.requireActual('../../src/config/serviceConfig'),
  getCommandCenterUrl: jest.fn().mockReturnValue('http://192.168.1.50:7703'),
}));

describe('useProvisioning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockState();

    // Set up default mocks
    (provisioningApi.getNodeInfo as jest.Mock).mockResolvedValue(MOCK_NODE);
    (provisioningApi.scanNetworks as jest.Mock).mockResolvedValue(MOCK_NETWORKS);
    (provisioningApi.provision as jest.Mock).mockResolvedValue({
      success: true,
      node_id: MOCK_NODE.node_id,
      room_name: 'kitchen',
      message: 'Provisioned',
    });
    (provisioningApi.provisionK2 as jest.Mock).mockResolvedValue({
      success: true,
      node_id: MOCK_NODE.node_id,
      kid: 'mock-kid',
    });
    (k2Service.generateK2 as jest.Mock).mockResolvedValue({
      nodeId: MOCK_NODE.node_id,
      kid: 'mock-kid',
      k2: 'mock-k2-base64',
      createdAt: new Date().toISOString(),
    });
    (k2Service.storeK2 as jest.Mock).mockResolvedValue(undefined);
    (commandCenterApi.requestProvisioningToken as jest.Mock).mockResolvedValue({
      token: 'mock-provisioning-token',
      node_id: 'cc-assigned-node-id',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      expires_in: 3600,
    });
    // By default the node registers right away and is not reachable over its hotspot.
    (smartHomeApi.getSmartHomeConfig as jest.Mock).mockResolvedValue({
      device_manager: 'jarvis',
      primary_node_id: '',
      use_external_devices: false,
      nodes: [{ node_id: 'cc-assigned-node-id', room: 'kitchen', online: true, last_seen: null }],
    });
    (provisioningApi.getNodeRegistrationStatus as jest.Mock).mockRejectedValue(
      new Error('Network Error'),
    );
  });

  describe('initial state', () => {
    it('should start in idle state', () => {
      const { result } = renderHook(() => useProvisioning());

      expect(result.current.state).toBe('idle');
      expect(result.current.nodeInfo).toBeNull();
      expect(result.current.networks).toEqual([]);
      expect(result.current.selectedNetwork).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('connect', () => {
    it('should connect to node and fetch info', async () => {
      const { result } = renderHook(() => useProvisioning());

      await act(async () => {
        await result.current.connect('192.168.4.1');
      });

      expect(result.current.nodeInfo).toEqual(MOCK_NODE);
      expect(result.current.state).toBe('fetching_info');
    });

    it('sets error state and returns false after exhausting connect retries', async () => {
      // connect() retries getNodeInfo MAX_RETRIES (3) times with a 2000ms backoff
      // between attempts; use fake timers so the test doesn't wait ~4s of real time.
      (provisioningApi.getNodeInfo as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
      jest.useFakeTimers();
      try {
        const { result } = renderHook(() => useProvisioning());

        let connectResult: boolean | undefined;
        await act(async () => {
          const pending = result.current.connect('192.168.4.1');
          await jest.advanceTimersByTimeAsync(5000); // flush both 2000ms backoffs
          connectResult = await pending;
        });

        expect(connectResult).toBe(false);
        expect(result.current.state).toBe('error');
        expect(result.current.error).toContain('Could not reach node');
        expect(provisioningApi.getNodeInfo).toHaveBeenCalledTimes(3);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('scanNetworks', () => {
    it('should fetch available networks', async () => {
      const { result } = renderHook(() => useProvisioning());

      await act(async () => {
        await result.current.connect('192.168.4.1');
      });

      await act(async () => {
        await result.current.fetchNetworks();
      });

      expect(result.current.networks).toEqual(MOCK_NETWORKS);
      expect(result.current.state).toBe('scanning_networks');
    });
  });

  describe('selectNetwork', () => {
    it('should select a network', async () => {
      const { result } = renderHook(() => useProvisioning());

      await act(async () => {
        await result.current.connect('192.168.4.1');
      });

      await act(async () => {
        await result.current.fetchNetworks();
      });

      act(() => {
        result.current.selectNetwork(MOCK_NETWORKS[0]);
      });

      expect(result.current.selectedNetwork).toEqual(MOCK_NETWORKS[0]);
      expect(result.current.state).toBe('configuring');
    });
  });

  describe('provision', () => {
    it('should provision the node with credentials', async () => {
      const { result } = renderHook(() => useProvisioning());

      await act(async () => {
        await result.current.connect('192.168.4.1');
      });

      // Fetch provisioning token before starting provisioning
      await act(async () => {
        await result.current.fetchProvisioningToken('test-household-123', 'mock-access-token');
      });

      await act(async () => {
        await result.current.fetchNetworks();
      });

      act(() => {
        result.current.selectNetwork(MOCK_NETWORKS[0]);
      });

      await act(async () => {
        await result.current.startProvisioning('password123', 'kitchen', 'test-household-123');
      });

      // After provisioning, state should be awaiting_wifi_switch (user needs to reconnect to home WiFi)
      expect(result.current.state).toBe('awaiting_wifi_switch');
      expect(result.current.provisioningResult).not.toBeNull();
      expect(result.current.provisioningResult?.success).toBe(true);

      // Back on home WiFi: success only once the node shows up in the household.
      await act(async () => {
        result.current.confirmWifiSwitched();
      });

      await waitFor(() => expect(result.current.state).toBe('success'));
    });
  });

  describe('reset', () => {
    it('should reset to initial state', async () => {
      const { result } = renderHook(() => useProvisioning());

      await act(async () => {
        await result.current.connect('192.168.4.1');
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.nodeInfo).toBeNull();
      expect(result.current.networks).toEqual([]);
    });
  });

  describe('progress tracking', () => {
    it('should track provisioning progress', async () => {
      const { result } = renderHook(() => useProvisioning());

      await act(async () => {
        await result.current.connect('192.168.4.1');
      });

      // Fetch provisioning token
      await act(async () => {
        await result.current.fetchProvisioningToken('test-household-456', 'mock-access-token');
      });

      await act(async () => {
        await result.current.fetchNetworks();
      });

      act(() => {
        result.current.selectNetwork(MOCK_NETWORKS[0]);
      });

      await act(async () => {
        await result.current.startProvisioning('password123', 'office', 'test-household-456');
      });

      // After provisioning, progress should be at 75 (awaiting WiFi switch)
      expect(result.current.progress).toBe(75);

      // Complete provisioning flow
      await act(async () => {
        result.current.confirmWifiSwitched();
      });

      // Now progress should be 100
      await waitFor(() => expect(result.current.progress).toBe(100));
    });
  });

  describe('error handling', () => {
    it('should clear error when reset is called', async () => {
      const { result } = renderHook(() => useProvisioning());

      // Manually set an error state for testing
      act(() => {
        result.current.setError('Test error');
      });

      expect(result.current.error).toBe('Test error');

      act(() => {
        result.current.reset();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('failure + invariant branches', () => {
    // Drive the hook to where startProvisioning() can run:
    // connected → token fetched → networks scanned → network selected.
    const arrangeReadyToProvision = async (
      result: { current: ReturnType<typeof useProvisioning> },
      householdId = 'hh-1',
    ) => {
      await act(async () => {
        await result.current.connect('192.168.4.1');
      });
      await act(async () => {
        await result.current.fetchProvisioningToken(householdId, 'kitchen');
      });
      await act(async () => {
        await result.current.fetchNetworks();
      });
      act(() => {
        result.current.selectNetwork(MOCK_NETWORKS[0]);
      });
    };

    it('treats a provision() network error as SUCCESS (node drops AP after accepting creds)', async () => {
      // The load-bearing invariant (useProvisioning.ts:291-299): a thrown provision()
      // is EXPECTED — the node tears down its AP the instant it accepts the creds,
      // killing the socket — so it must resolve to success, NOT error.
      (provisioningApi.provision as jest.Mock).mockRejectedValue(new Error('Network Error'));
      const { result } = renderHook(() => useProvisioning());
      await arrangeReadyToProvision(result);

      await act(async () => {
        await result.current.startProvisioning('password123', 'kitchen', 'hh-1');
      });

      expect(result.current.state).toBe('awaiting_wifi_switch');
      expect(result.current.error).toBeNull();
      expect(result.current.provisioningResult?.success).toBe(true);
    });

    it('surfaces a K2 provisioning failure as an error and does NOT send WiFi creds', async () => {
      (provisioningApi.provisionK2 as jest.Mock).mockResolvedValue({
        success: false,
        error: 'k2 rejected by node',
      });
      const { result } = renderHook(() => useProvisioning());
      await arrangeReadyToProvision(result);

      await act(async () => {
        await result.current.startProvisioning('password123', 'kitchen', 'hh-1');
      });

      expect(result.current.state).toBe('error');
      expect(result.current.error).toContain('k2 rejected by node');
      expect(provisioningApi.provision).not.toHaveBeenCalled();
    });

    it('refuses to provision without a provisioning token', async () => {
      const { result } = renderHook(() => useProvisioning());
      // Intentionally skip fetchProvisioningToken → provisioningToken stays null.
      await act(async () => {
        await result.current.connect('192.168.4.1');
      });
      await act(async () => {
        await result.current.fetchNetworks();
      });
      act(() => {
        result.current.selectNetwork(MOCK_NETWORKS[0]);
      });

      await act(async () => {
        await result.current.startProvisioning('password123', 'kitchen', 'hh-1');
      });

      expect(result.current.error).toContain('Provisioning token not available');
      expect(provisioningApi.provision).not.toHaveBeenCalled();
    });

    it('refuses to provision with an expired token', async () => {
      (commandCenterApi.requestProvisioningToken as jest.Mock).mockResolvedValue({
        token: 'expired-token',
        node_id: 'cc-assigned-node-id',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        expires_in: 0,
      });
      const { result } = renderHook(() => useProvisioning());
      await arrangeReadyToProvision(result);

      await act(async () => {
        await result.current.startProvisioning('password123', 'kitchen', 'hh-1');
      });

      expect(result.current.error).toContain('expired');
      expect(provisioningApi.provision).not.toHaveBeenCalled();
    });

    it('sets error state when the network scan fails', async () => {
      (provisioningApi.scanNetworks as jest.Mock).mockRejectedValue(new Error('scan failed'));
      const { result } = renderHook(() => useProvisioning());
      await act(async () => {
        await result.current.connect('192.168.4.1');
      });

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.fetchNetworks();
      });

      expect(ok).toBe(false);
      expect(result.current.state).toBe('error');
      expect(result.current.error).toContain('scan failed');
    });

    it('returns false and sets error when the provisioning token request fails', async () => {
      (commandCenterApi.requestProvisioningToken as jest.Mock).mockRejectedValue(
        new Error('token denied'),
      );
      const { result } = renderHook(() => useProvisioning());

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.fetchProvisioningToken('hh-1', 'kitchen');
      });

      expect(ok).toBe(false);
      expect(result.current.error).toContain('token denied');
    });
  });
  describe('token timing (2026-10-08: a 14-min-old token was sent and the node 401d)', () => {
    type Hook = { current: ReturnType<typeof useProvisioning> };
    const tokenResponse = (token: string, ttlSec = 600) => ({
      token,
      node_id: 'cc-assigned-node-id',
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
      expires_in: ttlSec,
    });

    const prepareAndPick = async (result: Hook) => {
      await act(async () => {
        await result.current.fetchProvisioningToken('hh-1');
      });
      await act(async () => {
        await result.current.connect('192.168.4.1');
      });
      await act(async () => {
        await result.current.fetchNetworks();
      });
      act(() => {
        result.current.selectNetwork(MOCK_NETWORKS[0]);
      });
    };

    let now: number;
    beforeEach(() => {
      now = Date.parse('2026-10-08T18:54:00Z');
      jest.spyOn(Date, 'now').mockImplementation(() => now);
    });
    afterEach(() => {
      (Date.now as jest.Mock).mockRestore();
    });

    it('mints a fresh token immediately before sending credentials and sends that one', async () => {
      (commandCenterApi.requestProvisioningToken as jest.Mock)
        .mockResolvedValueOnce(tokenResponse('tok-prepare'))
        .mockResolvedValueOnce(tokenResponse('tok-fresh'));
      const { result } = renderHook(() => useProvisioning());
      await prepareAndPick(result);

      await act(async () => {
        await result.current.startProvisioning('pw', 'kitchen', 'hh-1');
      });

      const tokenCalls = (commandCenterApi.requestProvisioningToken as jest.Mock).mock;
      expect(tokenCalls.calls).toHaveLength(2);
      // The second request reuses the node_id (refresh) with a short timeout…
      expect(tokenCalls.calls[1]).toEqual([
        { household_id: 'hh-1', node_id: 'cc-assigned-node-id' },
        { timeoutMs: TOKEN_REFRESH_TIMEOUT_MS },
      ]);
      // …is made in the same tap as the send, before anything goes to the node…
      const provisionMock = provisioningApi.provision as jest.Mock;
      expect(tokenCalls.invocationCallOrder[1]).toBeLessThan(
        (provisioningApi.provisionK2 as jest.Mock).mock.invocationCallOrder[0],
      );
      // …and the node gets the fresh token, not the one from Prepare.
      expect(provisionMock).toHaveBeenCalledWith(
        expect.objectContaining({ provisioning_token: 'tok-fresh', node_id: 'cc-assigned-node-id' }),
      );
      expect(result.current.provisioningToken).toBe('tok-fresh');
      expect(result.current.state).toBe('awaiting_wifi_switch');
    });

    it('falls back to the Prepare token on the hotspot while it still has enough life left', async () => {
      (commandCenterApi.requestProvisioningToken as jest.Mock)
        .mockResolvedValueOnce(tokenResponse('tok-prepare'))
        .mockRejectedValue(new Error('Network Error')); // command center unreachable from the hotspot
      const { result } = renderHook(() => useProvisioning());
      await prepareAndPick(result);

      now += 2 * 60 * 1000; // 2 min on the hotspot — 8 min of a 10-min token left
      await act(async () => {
        await result.current.startProvisioning('pw', 'kitchen', 'hh-1');
      });

      expect(provisioningApi.provision).toHaveBeenCalledWith(
        expect.objectContaining({ provisioning_token: 'tok-prepare' }),
      );
      expect(result.current.state).toBe('awaiting_wifi_switch');
    });

    it('refuses to send a token too old to survive registration, before touching the node', async () => {
      (commandCenterApi.requestProvisioningToken as jest.Mock)
        .mockResolvedValueOnce(tokenResponse('tok-prepare'))
        .mockRejectedValue(new Error('Network Error'));
      const { result } = renderHook(() => useProvisioning());
      await prepareAndPick(result);

      now += 6 * 60 * 1000; // e.g. the node was power-cycled mid-setup
      await act(async () => {
        await result.current.startProvisioning('pw', 'kitchen', 'hh-1');
      });

      expect(result.current.state).toBe('error');
      expect(result.current.error).toBe(TOKEN_EXPIRED_MESSAGE);
      expect(provisioningApi.provisionK2).not.toHaveBeenCalled();
      expect(provisioningApi.provision).not.toHaveBeenCalled();
    });

    it('uses a longer-lived (jarvisd 30-min) token from Prepare after a longer detour', async () => {
      (commandCenterApi.requestProvisioningToken as jest.Mock)
        .mockResolvedValueOnce(tokenResponse('tok-prepare', 1800))
        .mockRejectedValue(new Error('Network Error'));
      const { result } = renderHook(() => useProvisioning());
      await prepareAndPick(result);

      now += 14 * 60 * 1000;
      await act(async () => {
        await result.current.startProvisioning('pw', 'kitchen', 'hh-1');
      });

      expect(provisioningApi.provision).toHaveBeenCalledWith(
        expect.objectContaining({ provisioning_token: 'tok-prepare' }),
      );
    });

    it('gets a new token and resends once when the node explicitly rejects the send', async () => {
      (commandCenterApi.requestProvisioningToken as jest.Mock)
        .mockResolvedValueOnce(tokenResponse('tok-prepare'))
        .mockResolvedValueOnce(tokenResponse('tok-fresh'))
        .mockResolvedValueOnce(tokenResponse('tok-retry'));
      (provisioningApi.provision as jest.Mock)
        .mockResolvedValueOnce({ success: false, node_id: 'x', room_name: 'kitchen', message: 'bad request' })
        .mockResolvedValueOnce({ success: true, node_id: 'x', room_name: 'kitchen', message: 'ok' });
      const { result } = renderHook(() => useProvisioning());
      await prepareAndPick(result);

      await act(async () => {
        await result.current.startProvisioning('pw', 'kitchen', 'hh-1');
      });

      const calls = (provisioningApi.provision as jest.Mock).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0][0].provisioning_token).toBe('tok-fresh');
      expect(calls[1][0].provisioning_token).toBe('tok-retry');
      expect(result.current.state).toBe('awaiting_wifi_switch');
    });

    it('never re-mints after a send that threw — the node may already hold that token', async () => {
      (commandCenterApi.requestProvisioningToken as jest.Mock)
        .mockResolvedValueOnce(tokenResponse('tok-prepare'))
        .mockResolvedValueOnce(tokenResponse('tok-fresh'));
      (provisioningApi.provision as jest.Mock).mockRejectedValue(new Error('Network Error'));
      const { result } = renderHook(() => useProvisioning());
      await prepareAndPick(result);

      await act(async () => {
        await result.current.startProvisioning('pw', 'kitchen', 'hh-1');
      });

      expect(provisioningApi.provision).toHaveBeenCalledTimes(1);
      expect(commandCenterApi.requestProvisioningToken).toHaveBeenCalledTimes(2);
      expect(result.current.state).toBe('awaiting_wifi_switch');
    });

    it('does not resend when the node says provisioning is already in progress', async () => {
      (provisioningApi.provision as jest.Mock).mockResolvedValue({
        success: false,
        node_id: 'x',
        room_name: 'kitchen',
        message: 'Provisioning already in progress',
      });
      const { result } = renderHook(() => useProvisioning());
      await prepareAndPick(result);

      await act(async () => {
        await result.current.startProvisioning('pw', 'kitchen', 'hh-1');
      });

      expect(provisioningApi.provision).toHaveBeenCalledTimes(1);
      expect(result.current.state).toBe('awaiting_wifi_switch');
    });
  });

  describe('node URLs (2026-10-09: a USB-tunnelled phone handed the node http://localhost:7703)', () => {
    const LAN_CC = 'http://192.168.1.50:7703';
    const savedConfig = getServiceConfig();
    afterEach(() => {
      setServiceConfig(savedConfig);
      (serviceConfig.getCommandCenterUrl as jest.Mock).mockReturnValue(LAN_CC);
    });

    const phoneReachesServerAs = (cc: string, config: string | null) => {
      (serviceConfig.getCommandCenterUrl as jest.Mock).mockReturnValue(cc);
      setServiceConfig({ ...savedConfig, commandCenterUrl: cc, configServiceUrl: config });
    };

    const tokenWith = (extra: Record<string, string>) => ({
      token: 'tok',
      node_id: 'cc-assigned-node-id',
      expires_at: new Date(Date.now() + 1800_000).toISOString(),
      expires_in: 1800,
      ...extra,
    });

    const run = async () => {
      const { result } = renderHook(() => useProvisioning());
      await act(async () => {
        await result.current.fetchProvisioningToken('hh-1');
      });
      await act(async () => {
        await result.current.connect('192.168.4.1');
      });
      await act(async () => {
        await result.current.fetchNetworks();
      });
      act(() => {
        result.current.selectNetwork(MOCK_NETWORKS[0]);
      });
      await act(async () => {
        await result.current.startProvisioning('pw', 'kitchen', 'hh-1');
      });
      return result;
    };

    it("sends the server's node URLs instead of the phone's localhost ones", async () => {
      phoneReachesServerAs('http://localhost:7703', 'http://localhost:7700');
      (commandCenterApi.requestProvisioningToken as jest.Mock).mockResolvedValue(
        tokenWith({
          node_command_center_url: 'http://10.0.0.122:7703',
          node_config_service_url: 'http://10.0.0.122:7700',
        }),
      );

      const result = await run();

      expect(result.current.error).toBeNull();
      expect(result.current.state).toBe('awaiting_wifi_switch');
      expect(provisioningApi.provision).toHaveBeenCalledWith(
        expect.objectContaining({
          command_center_url: 'http://10.0.0.122:7703',
          config_service_url: 'http://10.0.0.122:7700',
        }),
      );
    });

    it('refuses a loopback command center URL (legacy server, no node URL) before touching the node', async () => {
      phoneReachesServerAs('http://localhost:7703', null);
      (commandCenterApi.requestProvisioningToken as jest.Mock).mockResolvedValue(tokenWith({}));

      const result = await run();

      expect(result.current.state).toBe('error');
      expect(result.current.error).toBe(LOOPBACK_NODE_URL_MESSAGE);
      expect(provisioningApi.provisionK2).not.toHaveBeenCalled();
      expect(provisioningApi.provision).not.toHaveBeenCalled();
    });

    it('refuses a loopback config-service URL too', async () => {
      phoneReachesServerAs('http://localhost:7703', 'http://127.0.0.1:7700');
      // jarvisd knew the CC URL but (say) not the config one.
      (commandCenterApi.requestProvisioningToken as jest.Mock).mockResolvedValue(
        tokenWith({ node_command_center_url: 'http://10.0.0.122:7703' }),
      );

      const result = await run();

      expect(result.current.error).toBe(LOOPBACK_NODE_URL_MESSAGE);
      expect(provisioningApi.provisionK2).not.toHaveBeenCalled();
      expect(provisioningApi.provision).not.toHaveBeenCalled();
    });

    it("keeps working with the legacy server: the phone's LAN URLs are sent as before", async () => {
      phoneReachesServerAs(LAN_CC, 'http://192.168.1.50:7700');
      (commandCenterApi.requestProvisioningToken as jest.Mock).mockResolvedValue(tokenWith({}));

      const result = await run();

      expect(result.current.error).toBeNull();
      expect(provisioningApi.provision).toHaveBeenCalledWith(
        expect.objectContaining({
          command_center_url: LAN_CC,
          config_service_url: 'http://192.168.1.50:7700',
        }),
      );
    });
  });

  describe('token expiry parsing', () => {
    it('reads a naive server timestamp as UTC, not local time', () => {
      expect(parseServerTimestamp('2026-10-08T18:54:00')).toBe(Date.parse('2026-10-08T18:54:00Z'));
      expect(parseServerTimestamp('2026-10-08T18:54:00.123456')).toBe(
        Date.parse('2026-10-08T18:54:00.123Z'),
      );
      expect(parseServerTimestamp('2026-10-08T18:54:00Z')).toBe(Date.parse('2026-10-08T18:54:00Z'));
      expect(parseServerTimestamp('2026-10-08T14:54:00-04:00')).toBe(
        Date.parse('2026-10-08T18:54:00Z'),
      );
      expect(parseServerTimestamp('garbage')).toBeNull();
      expect(parseServerTimestamp(null)).toBeNull();
    });

    it('takes the earlier of expires_in (from receipt) and expires_at', () => {
      const fetchedAt = Date.parse('2026-10-08T18:54:00Z');
      expect(
        tokenExpiresAt({ expires_at: '2026-10-08T19:24:00', expires_in: 600 }, fetchedAt),
      ).toBe(fetchedAt + 600_000);
      expect(
        tokenExpiresAt({ expires_at: '2026-10-08T18:56:00', expires_in: 600 }, fetchedAt),
      ).toBe(Date.parse('2026-10-08T18:56:00Z'));
      expect(tokenExpiresAt({ expires_at: '', expires_in: 0 }, fetchedAt)).toBe(
        fetchedAt + 600_000,
      );
    });
  });

  describe('waiting for the node to register (no infinite spinner)', () => {
    const emptyConfig = {
      device_manager: 'jarvis',
      primary_node_id: '',
      use_external_devices: false,
      nodes: [],
    };

    const provisionAndSwitch = async (result: { current: ReturnType<typeof useProvisioning> }) => {
      await act(async () => {
        await result.current.fetchProvisioningToken('hh-1');
      });
      await act(async () => {
        await result.current.connect('192.168.4.1');
      });
      await act(async () => {
        await result.current.fetchNetworks();
      });
      act(() => {
        result.current.selectNetwork(MOCK_NETWORKS[0]);
      });
      await act(async () => {
        await result.current.startProvisioning('pw', 'kitchen', 'hh-1');
      });
      expect(result.current.state).toBe('awaiting_wifi_switch');
      await act(async () => {
        result.current.confirmWifiSwitched();
      });
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    it('stays in verifying until the node appears in the household, then succeeds', async () => {
      jest.useFakeTimers();
      (smartHomeApi.getSmartHomeConfig as jest.Mock)
        .mockResolvedValueOnce(emptyConfig)
        .mockResolvedValueOnce(emptyConfig)
        .mockResolvedValue({
          ...emptyConfig,
          nodes: [{ node_id: 'cc-assigned-node-id', room: 'kitchen', online: true, last_seen: null }],
        });
      const { result } = renderHook(() => useProvisioning());
      await provisionAndSwitch(result);

      expect(result.current.state).toBe('verifying');
      expect(smartHomeApi.getSmartHomeConfig).toHaveBeenCalledWith('hh-1');

      await act(async () => {
        await jest.advanceTimersByTimeAsync(VERIFY_POLL_MS * 2);
      });

      expect(result.current.state).toBe('success');
      expect(result.current.progress).toBe(100);
    });

    it('gives up after the timeout with an actionable error instead of spinning forever', async () => {
      jest.useFakeTimers();
      (smartHomeApi.getSmartHomeConfig as jest.Mock).mockResolvedValue(emptyConfig);
      const { result } = renderHook(() => useProvisioning());
      await provisionAndSwitch(result);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(VERIFY_TIMEOUT_MS - VERIFY_POLL_MS);
      });
      expect(result.current.state).toBe('verifying');

      await act(async () => {
        await jest.advanceTimersByTimeAsync(VERIFY_POLL_MS * 2);
      });
      expect(result.current.state).toBe('registration_failed');
      expect(result.current.error).toBe(REGISTRATION_FAILED_MESSAGE);
      expect(result.current.failureReason).toBeNull();

      // …and the loop has stopped.
      const calls = (smartHomeApi.getSmartHomeConfig as jest.Mock).mock.calls.length;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(VERIFY_POLL_MS * 5);
      });
      expect((smartHomeApi.getSmartHomeConfig as jest.Mock).mock.calls.length).toBe(calls);
    });

    it('fails fast and shows the reason when the node reports registration_failed over its hotspot', async () => {
      jest.useFakeTimers();
      (smartHomeApi.getSmartHomeConfig as jest.Mock).mockResolvedValue(emptyConfig);
      (provisioningApi.getNodeRegistrationStatus as jest.Mock)
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValue({
          nodeState: 'AP_MODE',
          message: 'Waiting for mobile app connection...',
          registrationFailed: true,
          failureReason: 'Invalid or expired provisioning token',
        });
      const { result } = renderHook(() => useProvisioning());
      await provisionAndSwitch(result);
      expect(result.current.state).toBe('verifying');

      await act(async () => {
        await jest.advanceTimersByTimeAsync(VERIFY_POLL_MS);
      });

      expect(result.current.state).toBe('registration_failed');
      expect(result.current.failureReason).toBe('Invalid or expired provisioning token');
    });

    it('keep waiting restarts the poll; reset cancels it', async () => {
      jest.useFakeTimers();
      (smartHomeApi.getSmartHomeConfig as jest.Mock).mockResolvedValue(emptyConfig);
      const { result } = renderHook(() => useProvisioning());
      await provisionAndSwitch(result);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(VERIFY_TIMEOUT_MS + VERIFY_POLL_MS);
      });
      expect(result.current.state).toBe('registration_failed');

      await act(async () => {
        result.current.retryVerification();
      });
      expect(result.current.state).toBe('verifying');
      expect(result.current.error).toBeNull();

      act(() => {
        result.current.reset();
      });
      const calls = (smartHomeApi.getSmartHomeConfig as jest.Mock).mock.calls.length;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(VERIFY_TIMEOUT_MS * 2);
      });
      expect((smartHomeApi.getSmartHomeConfig as jest.Mock).mock.calls.length).toBe(calls);
      expect(result.current.state).toBe('idle');
    });

    it('checkNodeStatus surfaces the reason the node reports', async () => {
      jest.useFakeTimers();
      (smartHomeApi.getSmartHomeConfig as jest.Mock).mockResolvedValue(emptyConfig);
      const { result } = renderHook(() => useProvisioning());
      await provisionAndSwitch(result);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(VERIFY_TIMEOUT_MS + VERIFY_POLL_MS);
      });
      expect(result.current.failureReason).toBeNull();

      (provisioningApi.getNodeRegistrationStatus as jest.Mock).mockResolvedValue({
        nodeState: 'ERROR',
        message: '',
        registrationFailed: true,
        failureReason: 'Failed to connect to HomeNet',
      });
      await act(async () => {
        await result.current.checkNodeStatus();
      });
      expect(result.current.failureReason).toBe('Failed to connect to HomeNet');
      expect(result.current.state).toBe('registration_failed');
    });
  });
});
