import {
  NodeInfo,
  Network,
  ProvisioningRequest,
  ProvisioningResult,
  ProvisioningStatus,
  K2ProvisioningRequest,
  K2ProvisioningResponse,
} from '../types/Provisioning';

// Easy swap: change USE_MOCK to false when real API ready
export const USE_MOCK = true;

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
  mockProvisioningState = { state: 'provisioning', progress: 75, message: 'Registering with command center...' };

  await mockDelay(200);
  mockProvisioningState = { state: 'success', progress: 100, message: 'Provisioning complete!' };

  return {
    success: true,
    node_id: MOCK_NODE.node_id,
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

export const mockProvisionK2 = async (
  request: K2ProvisioningRequest
): Promise<K2ProvisioningResponse> => {
  await mockDelay(300);

  // Simulate successful K2 provisioning
  console.log('[Mock] K2 provisioned for node:', request.nodeId);
  console.log('[Mock] Key ID:', request.kid);

  return {
    success: true,
    message: 'K2 key received and stored successfully',
  };
};
