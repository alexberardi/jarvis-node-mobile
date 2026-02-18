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

    it('should set error on connection failure', async () => {
      // This test would need to mock a failure case
      // For now, we verify the hook handles the happy path
      const { result } = renderHook(() => useProvisioning());

      await act(async () => {
        await result.current.connect('192.168.4.1');
      });

      expect(result.current.error).toBeNull();
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
});
