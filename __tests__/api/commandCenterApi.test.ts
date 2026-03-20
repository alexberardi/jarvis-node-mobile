import { requestProvisioningToken, ProvisioningTokenRequest } from '../../src/api/commandCenterApi';
import apiClient from '../../src/api/apiClient';
import * as serviceConfig from '../../src/config/serviceConfig';

// Mock apiClient
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

// Mock serviceConfig
jest.mock('../../src/config/serviceConfig', () => ({
  ...jest.requireActual('../../src/config/serviceConfig'),
  getCommandCenterUrl: jest.fn().mockReturnValue('http://192.168.1.10:8002'),
}));

describe('commandCenterApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestProvisioningToken', () => {
    const mockRequest: ProvisioningTokenRequest = {
      household_id: 'household-123',
      room: 'kitchen',
      name: 'Kitchen Node',
    };

    it('should request a provisioning token with correct parameters', async () => {
      const mockResponse = {
        data: {
          token: 'provisioning-token-abc',
          node_id: 'node-uuid-123',
          expires_at: '2026-02-18T01:00:00Z',
          expires_in: 3600,
        },
      };

      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await requestProvisioningToken(mockRequest);

      expect(apiClient.post).toHaveBeenCalledWith(
        'http://192.168.1.10:8002/api/v0/provisioning/token',
        mockRequest,
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('should propagate errors from the API', async () => {
      (apiClient.post as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(
        requestProvisioningToken(mockRequest)
      ).rejects.toThrow('Network error');
    });

    it('should include node_id for token refresh', async () => {
      const refreshRequest: ProvisioningTokenRequest = {
        household_id: 'household-123',
        node_id: 'existing-node-uuid',
      };

      const mockResponse = {
        data: {
          token: 'refreshed-token',
          node_id: 'existing-node-uuid',
          expires_at: '2026-02-18T02:00:00Z',
          expires_in: 3600,
        },
      };

      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await requestProvisioningToken(refreshRequest);

      expect(result.node_id).toBe('existing-node-uuid');
    });

    it('should use command center URL from service config', async () => {
      (serviceConfig.getCommandCenterUrl as jest.Mock).mockReturnValue(
        'http://custom-host:9002'
      );

      const mockResponse = {
        data: {
          token: 'token',
          node_id: 'node',
          expires_at: '2026-02-18T01:00:00Z',
          expires_in: 3600,
        },
      };

      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      await requestProvisioningToken(mockRequest);

      expect(apiClient.post).toHaveBeenCalledWith(
        'http://custom-host:9002/api/v0/provisioning/token',
        expect.anything(),
      );
    });
  });
});
