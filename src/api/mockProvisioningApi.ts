import {
  NodeInfo,
  Network,
  ProvisioningRequest,
  ProvisioningResult,
  ProvisioningStatus,
  K2ProvisioningRequest,
  K2ProvisioningResponse,
} from '../types/Provisioning';
import { ProvisioningTokenResponse } from './commandCenterApi';

// Set to true only for development without a real node
export const USE_MOCK = false;

export const MOCK_NODE: NodeInfo = {
  node_id: 'jarvis-mock-1234',
  firmware_version: '1.0.0',
  hardware: 'pi-zero-w',
  mac_address: 'b8:27:eb:aa:bb:cc',
  capabilities: ['voice', 'speaker'],
  state: 'AP_MODE',
};

export const MOCK_NETWORKS: Network[] = [
  { ssid: 'HomeNetwork', signal_strength: -45, security: 'WPA2' },
  { ssid: 'Neighbor5G', signal_strength: -72, security: 'WPA2' },
  { ssid: 'CoffeeShop', signal_strength: -80, security: 'OPEN' },
];

// Simulated delay to mimic network requests
export const mockDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Simulated provisioning state for progress tracking
let mockProvisioningState: ProvisioningStatus = {
  state: 'idle',
  progress: 0,
  message: 'Ready to provision',
};

export const mockGetNodeInfo = async (): Promise<NodeInfo> => {
  await mockDelay(300);
  return MOCK_NODE;
};

export const mockScanNetworks = async (): Promise<Network[]> => {
  await mockDelay(500);
  return MOCK_NETWORKS;
};

export const mockProvision = async (
  request: ProvisioningRequest
): Promise<ProvisioningResult> => {
  // Simulate provisioning progress
  mockProvisioningState = {
    state: 'provisioning',
    progress: 0,
    message: 'Starting provisioning...',
  };

  // Simulate progress updates
  await mockDelay(200);
  mockProvisioningState = { state: 'provisioning', progress: 25, message: 'Connecting to network...' };

  await mockDelay(200);
  mockProvisioningState = { state: 'provisioning', progress: 50, message: 'Configuring node...' };

  await mockDelay(200);
  mockProvisioningState = { state: 'provisioning', progress: 75, message: `Registering with household ${request.household_id}...` };

  await mockDelay(200);
  mockProvisioningState = { state: 'success', progress: 100, message: 'Provisioning complete!' };

  console.log('[Mock] Node provisioned to household:', request.household_id);

  return {
    success: true,
    node_id: request.node_id,
    room_name: request.room_name,
    message: 'Node provisioned successfully',
  };
};

export const mockGetStatus = async (): Promise<ProvisioningStatus> => {
  await mockDelay(100);
  return mockProvisioningState;
};

export const resetMockState = (): void => {
  mockProvisioningState = {
    state: 'idle',
    progress: 0,
    message: 'Ready to provision',
  };
};

export const mockRequestProvisioningToken = async (): Promise<ProvisioningTokenResponse> => {
  await mockDelay(300);

  const mockNodeId = `node-mock-${Date.now().toString(36)}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  console.log('[Mock] Provisioning token issued for node:', mockNodeId);

  return {
    token: `mock-prov-token-${Date.now()}`,
    node_id: mockNodeId,
    expires_at: expiresAt,
    expires_in: 600,
  };
};

export const mockProvisionK2 = async (
  request: K2ProvisioningRequest
): Promise<K2ProvisioningResponse> => {
  await mockDelay(300);

  // Simulate successful K2 provisioning
  console.log('[Mock] K2 provisioned for node:', request.nodeId);
  console.log('[Mock] Key ID:', request.kid);

  return {
    success: true,
    node_id: request.nodeId,
    kid: request.kid,
  };
};
