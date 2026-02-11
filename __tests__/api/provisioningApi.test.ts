import {
  USE_MOCK,
  MOCK_NODE,
  MOCK_NETWORKS,
  mockGetNodeInfo,
  mockScanNetworks,
  mockProvision,
  mockGetStatus,
  mockDelay,
} from '../../src/api/mockProvisioningApi';
import {
  getNodeInfo,
  scanNetworks,
  provision,
  getProvisioningStatus,
  setNodeIp,
} from '../../src/api/provisioningApi';
import { ProvisioningRequest } from '../../src/types/Provisioning';

describe('Mock Provisioning API', () => {
  describe('Mock Constants', () => {
    it('should export USE_MOCK flag', () => {
      expect(typeof USE_MOCK).toBe('boolean');
      expect(USE_MOCK).toBe(false);
    });

    it('should export MOCK_NODE with correct structure', () => {
      expect(MOCK_NODE).toEqual({
        node_id: 'jarvis-mock-1234',
        firmware_version: '1.0.0',
        hardware: 'pi-zero-w',
        mac_address: 'b8:27:eb:aa:bb:cc',
        capabilities: ['voice', 'speaker'],
        state: 'AP_MODE',
      });
    });

    it('should export MOCK_NETWORKS array', () => {
      expect(Array.isArray(MOCK_NETWORKS)).toBe(true);
      expect(MOCK_NETWORKS.length).toBeGreaterThan(0);
      expect(MOCK_NETWORKS[0]).toHaveProperty('ssid');
      expect(MOCK_NETWORKS[0]).toHaveProperty('signal_strength');
      expect(MOCK_NETWORKS[0]).toHaveProperty('security');
    });
  });

  describe('mockGetNodeInfo', () => {
    it('should return node info after delay', async () => {
      const result = await mockGetNodeInfo();
      expect(result).toEqual(MOCK_NODE);
    });
  });

  describe('mockScanNetworks', () => {
    it('should return networks array after delay', async () => {
      const result = await mockScanNetworks();
      expect(result).toEqual(MOCK_NETWORKS);
    });
  });

  describe('mockProvision', () => {
    it('should accept provisioning request and return success', async () => {
      const request: ProvisioningRequest = {
        ssid: 'TestNetwork',
        password: 'password123',
        room_name: 'kitchen',
        household_id: 'test-household-123',
        node_id: 'test-node-id',
        provisioning_token: 'test-token',
      };

      const result = await mockProvision(request);
      expect(result.success).toBe(true);
      expect(result.node_id).toBe('test-node-id');
      expect(result.room_name).toBe('kitchen');
    });
  });

  describe('mockGetStatus', () => {
    it('should return current provisioning status', async () => {
      const status = await mockGetStatus();
      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('progress');
      expect(status).toHaveProperty('message');
    });
  });

  describe('mockDelay', () => {
    it('should delay for specified milliseconds', async () => {
      const start = Date.now();
      await mockDelay(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });
});

// These tests require a real node or mock mode enabled
// Skip when USE_MOCK is false (real network calls would timeout)
const describeWithMock = USE_MOCK ? describe : describe.skip;

describeWithMock('Provisioning API (requires mock or real node)', () => {
  beforeEach(() => {
    setNodeIp('192.168.4.1');
  });

  describe('getNodeInfo', () => {
    it('should return node info', async () => {
      const result = await getNodeInfo();
      expect(result).toHaveProperty('node_id');
      expect(result).toHaveProperty('firmware_version');
      expect(result).toHaveProperty('hardware');
    });
  });

  describe('scanNetworks', () => {
    it('should return array of networks', async () => {
      const result = await scanNetworks();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('provision', () => {
    it('should provision node with credentials', async () => {
      const request: ProvisioningRequest = {
        ssid: 'HomeNetwork',
        password: 'secret',
        room_name: 'office',
        household_id: 'test-household-456',
        node_id: 'test-node-id',
        provisioning_token: 'test-token',
      };

      const result = await provision(request);
      expect(result.success).toBe(true);
    });
  });

  describe('getProvisioningStatus', () => {
    it('should return current status', async () => {
      const status = await getProvisioningStatus();
      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('progress');
    });
  });

  describe('setNodeIp', () => {
    it('should update the node IP address', () => {
      setNodeIp('192.168.1.100');
      // This is a configuration function, just verify it doesn't throw
      expect(true).toBe(true);
    });
  });
});
