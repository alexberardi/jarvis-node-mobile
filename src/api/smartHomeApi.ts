import { getCommandCenterUrl } from '../config/serviceConfig';
import {
  Room,
  RoomCreateRequest,
  DeviceImportItem,
  DeviceListItem,
  DeviceListPollResponse,
  DeviceScanPollResponse,
  DeviceState,
  ConfigPushRequest,
  RoomUpdateRequest,
} from '../types/SmartHome';
import apiClient from './apiClient';

const getBaseUrl = () => getCommandCenterUrl();

// =============================================================================
// Rooms
// =============================================================================

export const listRooms = async (
  householdId: string,
): Promise<Room[]> => {
  const res = await apiClient.get<Room[]>(
    `${getBaseUrl()}/api/v0/households/${householdId}/rooms`,
  );
  return res.data;
};

export const createRoom = async (
  householdId: string,
  room: RoomCreateRequest,
): Promise<Room> => {
  const res = await apiClient.post<Room>(
    `${getBaseUrl()}/api/v0/households/${householdId}/rooms`,
    room,
  );
  return res.data;
};

export const updateRoom = async (
  householdId: string,
  roomId: string,
  data: RoomUpdateRequest,
): Promise<Room> => {
  const res = await apiClient.patch<Room>(
    `${getBaseUrl()}/api/v0/households/${householdId}/rooms/${roomId}`,
    data,
  );
  return res.data;
};

export const deleteRoom = async (
  householdId: string,
  roomId: string,
): Promise<void> => {
  await apiClient.delete(
    `${getBaseUrl()}/api/v0/households/${householdId}/rooms/${roomId}`,
  );
};

// =============================================================================
// Devices
// =============================================================================

export const listDevices = async (
  householdId: string,
  filters?: { room_id?: string; domain?: string; source?: string },
): Promise<DeviceListItem[]> => {
  const res = await apiClient.get<DeviceListItem[]>(
    `${getBaseUrl()}/api/v0/households/${householdId}/devices`,
    { params: filters },
  );
  return res.data;
};

export const updateDevice = async (
  householdId: string,
  deviceId: string,
  data: { name?: string; room_id?: string | null },
): Promise<DeviceListItem> => {
  const res = await apiClient.patch<DeviceListItem>(
    `${getBaseUrl()}/api/v0/households/${householdId}/devices/${deviceId}`,
    data,
  );
  return res.data;
};

export const deleteDevice = async (
  householdId: string,
  deviceId: string,
): Promise<void> => {
  await apiClient.delete(
    `${getBaseUrl()}/api/v0/households/${householdId}/devices/${deviceId}`,
  );
};

export const importDevices = async (
  householdId: string,
  devices: DeviceImportItem[],
): Promise<{ created: number; updated: number }> => {
  const res = await apiClient.post<{ created: number; updated: number }>(
    `${getBaseUrl()}/api/v0/households/${householdId}/devices/import`,
    { devices },
    { timeout: 30000 },
  );
  return res.data;
};

// =============================================================================
// Device Control (synchronous: mobile -> CC -> MQTT -> node -> result -> mobile)
// =============================================================================

export interface DeviceControlResponse {
  success: boolean;
  entity_id: string;
  action: string;
  error: string | null;
}

export const controlDevice = async (
  householdId: string,
  deviceId: string,
  action: string,
  data?: Record<string, unknown>,
): Promise<DeviceControlResponse> => {
  const res = await apiClient.post<DeviceControlResponse>(
    `${getBaseUrl()}/api/v0/households/${householdId}/devices/${deviceId}/control`,
    { action, data },
    { timeout: 15000 }, // 15s to accommodate the 10s MQTT wait
  );
  return res.data;
};

// =============================================================================
// Device State (mobile -> CC -> MQTT -> node -> CC -> mobile)
// =============================================================================

export const getDeviceState = async (
  householdId: string,
  deviceId: string,
): Promise<DeviceState> => {
  const res = await apiClient.get<DeviceState>(
    `${getBaseUrl()}/api/v0/households/${householdId}/devices/${deviceId}/state`,
    { timeout: 15000 }, // 15s for 10s MQTT wait + overhead
  );
  return res.data;
};

// =============================================================================
// Device Scan (user-driven: mobile -> CC -> MQTT -> node -> CC -> mobile)
// =============================================================================

export const requestDeviceScan = async (
  nodeId: string,
): Promise<{ id: string; status: string }> => {
  const res = await apiClient.post<{ id: string; status: string }>(
    `${getBaseUrl()}/api/v0/nodes/${nodeId}/device-scan/request`,
  );
  return res.data;
};

export const pollDeviceScan = async (
  nodeId: string,
  requestId: string,
): Promise<DeviceScanPollResponse> => {
  const res = await apiClient.get<DeviceScanPollResponse>(
    `${getBaseUrl()}/api/v0/nodes/${nodeId}/device-scan/${requestId}`,
  );
  return res.data;
};

// =============================================================================
// Smart Home Config (device manager + primary node)
// =============================================================================

export interface NodeOption {
  node_id: string;
  room: string | null;
  online: boolean;
  last_seen: string | null;
}

export interface SmartHomeConfig {
  device_manager: string;
  primary_node_id: string;
  use_external_devices: boolean;
  nodes: NodeOption[];
}

export const getSmartHomeConfig = async (
  householdId: string,
): Promise<SmartHomeConfig> => {
  const res = await apiClient.get<SmartHomeConfig>(
    `${getBaseUrl()}/api/v0/households/${householdId}/smart-home/config`,
  );
  return res.data;
};

export const updateSmartHomeConfig = async (
  householdId: string,
  updates: { device_manager?: string; primary_node_id?: string; use_external_devices?: boolean },
): Promise<{ device_manager: string; primary_node_id: string; use_external_devices: boolean }> => {
  const res = await apiClient.put(
    `${getBaseUrl()}/api/v0/households/${householdId}/smart-home/config`,
    updates,
  );
  return res.data;
};

// =============================================================================
// Device List (external devices via MQTT: mobile → CC → MQTT → node → CC → mobile)
// =============================================================================

export const requestDeviceList = async (
  nodeId: string,
): Promise<{ id: string; status: string }> => {
  const res = await apiClient.post<{ id: string; status: string }>(
    `${getBaseUrl()}/api/v0/nodes/${nodeId}/device-list/request`,
  );
  return res.data;
};

export const pollDeviceList = async (
  nodeId: string,
  requestId: string,
): Promise<DeviceListPollResponse> => {
  const res = await apiClient.get<DeviceListPollResponse>(
    `${getBaseUrl()}/api/v0/nodes/${nodeId}/device-list/${requestId}`,
  );
  return res.data;
};

// =============================================================================
// External Device Control (non-persisted devices via MQTT)
// =============================================================================

export const controlExternalDevice = async (
  householdId: string,
  entityId: string,
  action: string,
  source: string,
  data?: {
    protocol?: string;
    cloud_id?: string;
    model?: string;
    local_ip?: string;
    mac_address?: string;
    [key: string]: unknown;
  },
): Promise<DeviceControlResponse> => {
  const res = await apiClient.post<DeviceControlResponse>(
    `${getBaseUrl()}/api/v0/households/${householdId}/devices/control-external`,
    { entity_id: entityId, action, source, ...data },
    { timeout: 15000 },
  );
  return res.data;
};

// =============================================================================
// Config Push (encrypted relay to node)
// =============================================================================

export const pushConfigToNode = async (
  nodeId: string,
  config: ConfigPushRequest,
): Promise<{ id: string; status: string }> => {
  const res = await apiClient.post(
    `${getBaseUrl()}/api/v0/nodes/${nodeId}/config/push`,
    config,
  );
  return res.data;
};
