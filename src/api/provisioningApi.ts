import axios, { AxiosInstance } from 'axios';

import {
  USE_MOCK,
  mockGetNodeInfo,
  mockScanNetworks,
  mockProvision,
  mockGetStatus,
  mockProvisionK2,
} from './mockProvisioningApi';
import {
  NodeInfo,
  Network,
  ProvisioningRequest,
  ProvisioningResult,
  ProvisioningStatus,
  ScanNetworksResponse,
  ApiProvisioningRequest,
  ApiProvisionResponse,
  ApiProvisioningStatus,
  K2ProvisioningRequest,
  K2ProvisioningResponse,
} from '../types/Provisioning';
import { COMMAND_CENTER_URL } from '../config/env';

// Default node IP (AP mode address for real Pi, or simulator IP)
let nodeIp = '192.168.4.1';
let nodePort = 8080;

const createNodeApi = (): AxiosInstance =>
  axios.create({
    baseURL: `http://${nodeIp}:${nodePort}`,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const setNodeIp = (ip: string, port: number = 8080): void => {
  nodeIp = ip;
  nodePort = port;
};

export const getNodeIp = (): string => nodeIp;

export const getNodeInfo = async (): Promise<NodeInfo> => {
  if (USE_MOCK) {
    return mockGetNodeInfo();
  }

  const api = createNodeApi();
  const response = await api.get<NodeInfo>('/api/v1/info');
  return response.data;
};

export const scanNetworks = async (): Promise<Network[]> => {
  if (USE_MOCK) {
    return mockScanNetworks();
  }

  const api = createNodeApi();
  const response = await api.get<ScanNetworksResponse>('/api/v1/scan-networks');
  return response.data.networks;
};

export const provision = async (
  request: ProvisioningRequest
): Promise<ProvisioningResult> => {
  if (USE_MOCK) {
    return mockProvision(request);
  }

  const api = createNodeApi();

  // Transform to API format
  const apiRequest: ApiProvisioningRequest = {
    wifi_ssid: request.ssid,
    wifi_password: request.password,
    room: request.room_name,
    command_center_url: request.command_center_url || COMMAND_CENTER_URL,
    household_id: request.household_id,
  };

  const response = await api.post<ApiProvisionResponse>('/api/v1/provision', apiRequest);

  // Transform response to internal format
  return {
    success: response.data.success,
    node_id: '', // Will be populated from node info
    room_name: request.room_name,
    message: response.data.message,
  };
};

// Map API state to UI state
const mapApiStateToUiState = (apiState: string): ProvisioningStatus['state'] => {
  switch (apiState) {
    case 'AP_MODE':
      return 'idle';
    case 'CONNECTING':
      return 'provisioning';
    case 'REGISTERING':
      return 'verifying';
    case 'PROVISIONED':
      return 'success';
    case 'ERROR':
      return 'error';
    default:
      return 'provisioning';
  }
};

export const getProvisioningStatus = async (): Promise<ProvisioningStatus> => {
  if (USE_MOCK) {
    return mockGetStatus();
  }

  const api = createNodeApi();
  const response = await api.get<ApiProvisioningStatus>('/api/v1/status');

  // Transform API response to internal format
  return {
    state: mapApiStateToUiState(response.data.state),
    progress: response.data.progress_percent,
    message: response.data.message,
    error: response.data.error || undefined,
  };
};

/**
 * Provision K2 encryption key to the node
 * Must be called while connected to the node's AP
 */
export const provisionK2 = async (
  request: K2ProvisioningRequest
): Promise<K2ProvisioningResponse> => {
  if (USE_MOCK) {
    return mockProvisionK2(request);
  }

  const api = createNodeApi();
  const response = await api.post<K2ProvisioningResponse>(
    '/api/v1/provision/k2',
    {
      node_id: request.nodeId,
      kid: request.kid,
      k2: request.k2,
      created_at: request.createdAt,
    }
  );

  return response.data;
};
