import {
  requestBluetoothScan,
  pollBluetoothScan,
  pairBluetoothDevice,
  getBluetoothStatus,
  setBluetoothAutoConnect,
} from '../../src/api/bluetoothApi';
import apiClient from '../../src/api/apiClient';

// Mock apiClient (matches the house pattern in commandCenterApi.test.ts)
jest.mock('../../src/api/apiClient', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    defaults: { headers: {} },
  },
  configureApiClient: jest.fn(),
}));

// Mock serviceConfig so getCommandCenterUrl returns a stable base URL.
jest.mock('../../src/config/serviceConfig', () => ({
  ...jest.requireActual('../../src/config/serviceConfig'),
  getCommandCenterUrl: jest.fn().mockReturnValue('http://192.168.1.10:8002'),
}));

const NODE = 'node-uuid-1';
const MAC = 'AA:BB:CC:DD:EE:FF';

describe('bluetoothApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('scan (request/poll pattern)', () => {
    it('POSTs a scan request with the default role and returns the request envelope', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({
        data: { id: 'req-1', status: 'pending', created_at: 't0' },
      });

      const res = await requestBluetoothScan(NODE);

      expect(apiClient.post).toHaveBeenCalledWith(
        'http://192.168.1.10:8002/api/v0/nodes/node-uuid-1/bluetooth-scan/request',
        { role: 'source' },
      );
      expect(res.id).toBe('req-1');
    });

    it('GETs scan poll results by request id and returns the poll body', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: { status: 'completed', request_id: 'req-1', devices: [], device_count: 0 },
      });

      const res = await pollBluetoothScan(NODE, 'req-1');

      expect(apiClient.get).toHaveBeenCalledWith(
        'http://192.168.1.10:8002/api/v0/nodes/node-uuid-1/bluetooth-scan/req-1',
      );
      expect(res.status).toBe('completed');
    });

    it('propagates errors from a failed scan poll', async () => {
      (apiClient.get as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(pollBluetoothScan(NODE, 'req-1')).rejects.toThrow('Network error');
    });
  });

  describe('pair', () => {
    it('POSTs a pair request with the mac address and role', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({
        data: { id: 'pair-1', status: 'pending', created_at: 't0' },
      });

      await pairBluetoothDevice(NODE, MAC);

      expect(apiClient.post).toHaveBeenCalledWith(
        'http://192.168.1.10:8002/api/v0/nodes/node-uuid-1/bluetooth/pair',
        { mac_address: MAC, role: 'source' },
      );
    });
  });

  describe('status + auto-connect', () => {
    it('GETs bluetooth status', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: { available: true, connected: [], paired: [] },
      });

      const res = await getBluetoothStatus(NODE);

      expect(apiClient.get).toHaveBeenCalledWith(
        'http://192.168.1.10:8002/api/v0/nodes/node-uuid-1/bluetooth/status',
      );
      expect(res.available).toBe(true);
    });

    it('POSTs the auto-connect toggle with the enabled flag', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({ data: {} });

      await setBluetoothAutoConnect(NODE, MAC, false);

      expect(apiClient.post).toHaveBeenCalledWith(
        'http://192.168.1.10:8002/api/v0/nodes/node-uuid-1/bluetooth/auto-connect',
        { mac_address: MAC, enabled: false },
      );
    });
  });
});
