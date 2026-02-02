// Known hardware types (extensible - backend may return others like 'macos', 'arm-linux')
export type HardwareType =
  | 'pi-zero-w'
  | 'pi-zero-2w'
  | 'pi-4'
  | 'pi-5'
  | 'raspberry-pi'
  | 'arm-linux'
  | 'macos'
  | string;

export type NodeCapability = 'voice' | 'speaker' | 'display' | 'camera';

// Backend node states (from API)
export type NodeState = 'AP_MODE' | 'CONNECTING' | 'REGISTERING' | 'PROVISIONED' | 'ERROR';

export interface NodeInfo {
  node_id: string;
  firmware_version: string;
  hardware: HardwareType;
  mac_address: string;
  capabilities: NodeCapability[];
  state: NodeState;
}

export interface Network {
  ssid: string;
  signal_strength: number;
  security: string;
}

// Response wrapper for scan-networks
export interface ScanNetworksResponse {
  networks: Network[];
}

// UI state machine states (internal to app)
export type ProvisioningState =
  | 'idle'
  | 'connecting'
  | 'fetching_info'
  | 'scanning_networks'
  | 'configuring'
  | 'provisioning'
  | 'verifying'
  | 'success'
  | 'error';

// API status response
export interface ApiProvisioningStatus {
  state: NodeState;
  message: string;
  progress_percent: number;
  error: string | null;
}

// Internal UI status
export interface ProvisioningStatus {
  state: ProvisioningState;
  progress: number;
  message: string;
  error?: string;
}

// API request format
export interface ApiProvisioningRequest {
  wifi_ssid: string;
  wifi_password: string;
  room: string;
  command_center_url: string;
}

// Internal request format (used by UI)
export interface ProvisioningRequest {
  ssid: string;
  password: string;
  room_name: string;
  command_center_url?: string;
}

// API provision response
export interface ApiProvisionResponse {
  success: boolean;
  message: string;
}

export interface ProvisioningResult {
  success: boolean;
  node_id: string;
  room_name: string;
  message?: string;
}

export const ROOM_OPTIONS = [
  'kitchen',
  'bedroom',
  'living_room',
  'office',
  'bathroom',
  'garage',
  'basement',
  'other',
] as const;

export type RoomName = (typeof ROOM_OPTIONS)[number];

// K2 key provisioning types
export interface K2ProvisioningRequest {
  nodeId: string;
  kid: string;
  k2: string; // base64url encoded 32 bytes
  createdAt: string;
}

export interface K2ProvisioningResponse {
  success: boolean;
  node_id?: string;
  kid?: string;
  error?: string;
}
