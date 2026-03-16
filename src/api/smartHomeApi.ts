import { getCommandCenterUrl } from '../config/serviceConfig';
import {
  Room,
  RoomCreateRequest,
  DeviceImportItem,
  DeviceListItem,
  ConfigPushRequest,
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
    `${getBaseUrl()}/api/v1/households/${householdId}/rooms`,
  );
  return res.data;
};

export const createRoom = async (
  householdId: string,
  room: RoomCreateRequest,
): Promise<Room> => {
  const res = await apiClient.post<Room>(
    `${getBaseUrl()}/api/v1/households/${householdId}/rooms`,
    room,
  );
  return res.data;
};

// =============================================================================
// Devices
// =============================================================================

export const listDevices = async (
  householdId: string,
  filters?: { room_id?: string; domain?: string; source?: string },
): Promise<DeviceListItem[]> => {
  const res = await apiClient.get<DeviceListItem[]>(
    `${getBaseUrl()}/api/v1/households/${householdId}/devices`,
    { params: filters },
  );
  return res.data;
};

export const importDevices = async (
  householdId: string,
  devices: DeviceImportItem[],
): Promise<{ created: number; updated: number }> => {
  const res = await apiClient.post<{ created: number; updated: number }>(
    `${getBaseUrl()}/api/v1/households/${householdId}/devices/import`,
    { devices },
    { timeout: 30000 },
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
