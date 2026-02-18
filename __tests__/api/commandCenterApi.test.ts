import axios from 'axios';

import { requestProvisioningToken, ProvisioningTokenRequest } from '../../src/api/commandCenterApi';
import * as serviceConfig from '../../src/config/serviceConfig';

// Mock axios
jest.mock('axios', () => ({
  post: jest.fn(),
  create: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
    defaults: { baseURL: '' },
  })),
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

    const mockAccessToken = 'test-access-token';

    it('should request a provisioning token with correct parameters', async () => {
      const mockResponse = {
        data: {
          token: 'provisioning-token-abc',
          node_id: 'node-uuid-123',
          expires_at: '2026-02-18T01:00:00Z',
          expires_in: 3600,
        },
      };

      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await requestProvisioningToken(mockRequest, mockAccessToken);

      expect(axios.post).toHaveBeenCalledWith(
        'http://192.168.1.10:8002/api/v1/provisioning/token',
        mockRequest,
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-access-token',
          },
          timeout: 10000,
        })
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('should propagate errors from the API', async () => {
      (axios.post as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(
        requestProvisioningToken(mockRequest, mockAccessToken)
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

      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await requestProvisioningToken(refreshRequest, mockAccessToken);

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

      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      await requestProvisioningToken(mockRequest, mockAccessToken);

      expect(axios.post).toHaveBeenCalledWith(
        'http://custom-host:9002/api/v1/provisioning/token',
        expect.anything(),
        expect.anything()
      );
    });
  });
});
