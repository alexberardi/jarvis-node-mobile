import { renderHook, act } from '@testing-library/react-native';

import { useProvisioning } from '../../src/hooks/useProvisioning';
import { MOCK_NODE, MOCK_NETWORKS, resetMockState } from '../../src/api/mockProvisioningApi';
import * as provisioningApi from '../../src/api/provisioningApi';
import * as k2Service from '../../src/services/k2Service';
import * as commandCenterApi from '../../src/api/commandCenterApi';

// Mock the provisioning API
jest.mock('../../src/api/provisioningApi', () => ({
  ...jest.requireActual('../../src/api/provisioningApi'),
  getNodeInfo: jest.fn(),
  scanNetworks: jest.fn(),
  provision: jest.fn(),
  getProvisioningStatus: jest.fn(),
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

      // Call confirmWifiSwitched to complete provisioning
      act(() => {
        result.current.confirmWifiSwitched();
      });

      expect(result.current.state).toBe('success');
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
      act(() => {
        result.current.confirmWifiSwitched();
      });

      // Now progress should be 100
      expect(result.current.progress).toBe(100);
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
});
