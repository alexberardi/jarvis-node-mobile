import {
  NodeInfo,
  Network,
  ProvisioningState,
  ProvisioningStatus,
  ProvisioningRequest,
  NodeCapability,
  HardwareType,
} from '../../src/types/Provisioning';

describe('Provisioning Types', () => {
  describe('NodeInfo', () => {
    it('should have required fields', () => {
      const node: NodeInfo = {
        node_id: 'jarvis-test-1234',
        firmware_version: '1.0.0',
        hardware: 'pi-zero-w',
        mac_address: 'b8:27:eb:aa:bb:cc',
        capabilities: ['voice', 'speaker'],
        state: 'AP_MODE',
      };

      expect(node.node_id).toBe('jarvis-test-1234');
      expect(node.firmware_version).toBe('1.0.0');
      expect(node.hardware).toBe('pi-zero-w');
      expect(node.mac_address).toBe('b8:27:eb:aa:bb:cc');
      expect(node.capabilities).toContain('voice');
      expect(node.capabilities).toContain('speaker');
      expect(node.state).toBe('AP_MODE');
    });

    it('should support all hardware types', () => {
      const hardwareTypes: HardwareType[] = ['pi-zero-w', 'pi-zero-2w', 'pi-4', 'pi-5'];
      hardwareTypes.forEach((hw) => {
        const node: NodeInfo = {
          node_id: 'test',
          firmware_version: '1.0.0',
          hardware: hw,
          mac_address: 'aa:bb:cc:dd:ee:ff',
          capabilities: [],
          state: 'AP_MODE',
        };
        expect(node.hardware).toBe(hw);
      });
    });

    it('should support all node capabilities', () => {
      const capabilities: NodeCapability[] = ['voice', 'speaker', 'display', 'camera'];
      const node: NodeInfo = {
        node_id: 'test',
        firmware_version: '1.0.0',
        hardware: 'pi-zero-w',
        mac_address: 'aa:bb:cc:dd:ee:ff',
        capabilities,
        state: 'AP_MODE',
      };
      expect(node.capabilities).toHaveLength(4);
    });
  });

  describe('Network', () => {
    it('should have required fields', () => {
      const network: Network = {
        ssid: 'HomeNetwork',
        signal_strength: -45,
        security: 'WPA2',
      };

      expect(network.ssid).toBe('HomeNetwork');
      expect(network.signal_strength).toBe(-45);
      expect(network.security).toBe('WPA2');
    });

    it('should support different security types', () => {
      const securityTypes = ['OPEN', 'WEP', 'WPA', 'WPA2', 'WPA3'];
      securityTypes.forEach((security) => {
        const network: Network = {
          ssid: 'Test',
          signal_strength: -50,
          security,
        };
        expect(network.security).toBe(security);
      });
    });
  });

  describe('ProvisioningState', () => {
    it('should have all state values', () => {
      const states: ProvisioningState[] = [
        'idle',
        'connecting',
        'fetching_info',
        'scanning_networks',
        'configuring',
        'provisioning',
        'verifying',
        'success',
        'error',
      ];

      expect(states).toHaveLength(9);
    });
  });

  describe('ProvisioningStatus', () => {
    it('should have required fields for success', () => {
      const status: ProvisioningStatus = {
        state: 'success',
        progress: 100,
        message: 'Provisioning complete',
      };

      expect(status.state).toBe('success');
      expect(status.progress).toBe(100);
      expect(status.message).toBe('Provisioning complete');
    });

    it('should support error state with error field', () => {
      const status: ProvisioningStatus = {
        state: 'error',
        progress: 50,
        message: 'Failed to connect',
        error: 'Connection timeout',
      };

      expect(status.state).toBe('error');
      expect(status.error).toBe('Connection timeout');
    });
  });

  describe('ProvisioningRequest', () => {
    it('should have required fields', () => {
      const request: ProvisioningRequest = {
        ssid: 'HomeNetwork',
        password: 'secret123',
        room_name: 'kitchen',
        household_id: 'test-household-123',
      };

      expect(request.ssid).toBe('HomeNetwork');
      expect(request.password).toBe('secret123');
      expect(request.room_name).toBe('kitchen');
      expect(request.household_id).toBe('test-household-123');
    });

    it('should support optional command_center_url', () => {
      const request: ProvisioningRequest = {
        ssid: 'HomeNetwork',
        password: 'secret123',
        room_name: 'kitchen',
        household_id: 'test-household-456',
        command_center_url: 'http://192.168.1.10:8002',
      };

      expect(request.command_center_url).toBe('http://192.168.1.10:8002');
      expect(request.household_id).toBe('test-household-456');
    });
  });
});
