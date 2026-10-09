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
  NodeRegistrationStatus,
} from '../types/Provisioning';
import { getCommandCenterUrl, getServiceConfig } from '../config/serviceConfig';

// Default node IP (AP mode address for real Pi, or simulator IP)
let nodeIp = '192.168.4.1';
let nodePort = 8080;

const createNodeApi = (timeout: number = 10000): AxiosInstance =>
  axios.create({
    baseURL: `http://${nodeIp}:${nodePort}`,
    timeout,
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
    command_center_url: request.command_center_url || getCommandCenterUrl(),
    config_service_url: request.config_service_url || getServiceConfig().configServiceUrl || undefined,
    household_id: request.household_id,
    node_id: request.node_id,
    provisioning_token: request.provisioning_token,
  };

  const response = await api.post<ApiProvisionResponse>('/api/v1/provision', apiRequest);

  // Transform response to internal format
  return {
    success: response.data.success,
    node_id: request.node_id,
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

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

/**
 * Parse the node's `GET /api/v1/status` body defensively.
 *
 * Current firmware returns `{state, message, progress_percent, error}`, where a
 * failed WiFi join or registration lands in `state: "ERROR"` with `error` set.
 * Newer firmware additionally exposes `registration_failed` (and drops back to
 * AP mode, so `state` may read `AP_MODE`). The new field is feature-detected:
 * accepted as a boolean (reason in `registration_error` / `failure_reason` /
 * `reason` / `error`), a reason string, or an object with a `reason`/`error`.
 */
export const parseNodeRegistrationStatus = (raw: unknown): NodeRegistrationStatus => {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const nodeState = nonEmptyString(body.state) ?? 'UNKNOWN';
  const message = nonEmptyString(body.message) ?? '';
  const flag = body.registration_failed;

  let registrationFailed = false;
  let reason: string | null = null;

  if (flag === true) {
    registrationFailed = true;
  } else if (typeof flag === 'string' && flag.trim()) {
    registrationFailed = true;
    reason = flag.trim();
  } else if (flag && typeof flag === 'object') {
    registrationFailed = true;
    const obj = flag as Record<string, unknown>;
    reason = nonEmptyString(obj.reason) ?? nonEmptyString(obj.error) ?? nonEmptyString(obj.message);
  }

  if (registrationFailed && !reason) {
    reason =
      nonEmptyString(body.registration_error) ??
      nonEmptyString(body.failure_reason) ??
      nonEmptyString(body.reason) ??
      nonEmptyString(body.error);
  }

  // Legacy firmware: ERROR + error string is the only failure signal.
  if (!registrationFailed && nodeState === 'ERROR') {
    registrationFailed = true;
    reason = nonEmptyString(body.error) ?? (message || null);
  }

  return { nodeState, message, registrationFailed, failureReason: reason };
};

/**
 * Read the node's provisioning status over its setup hotspot.
 * Only reachable while the phone is on the node's AP; callers must treat a
 * throw as "node not reachable right now", not as a failure.
 */
export const getNodeRegistrationStatus = async (
  timeoutMs: number = 3000,
): Promise<NodeRegistrationStatus> => {
  if (USE_MOCK) {
    return { nodeState: 'PROVISIONED', message: '', registrationFailed: false, failureReason: null };
  }
  const api = createNodeApi(timeoutMs);
  const response = await api.get<unknown>('/api/v1/status');
  return parseNodeRegistrationStatus(response.data);
};
