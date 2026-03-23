import axios from 'axios';

import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

export interface NodeInfo {
  node_id: string;
  room: string | null;
  user: string | null;
  voice_mode: string;
  adapter_hash: string | null;
  household_id: string | null;
  online: boolean;
  last_seen: string | null;
  // Heartbeat status fields (populated when backend supports enriched heartbeats)
  uptime_seconds: number | null;
  command_count: number | null;
  routine_count: number | null;
  python_version: string | null;
  platform: string | null;
}

export const listNodes = async (householdId?: string): Promise<NodeInfo[]> => {
  // listNodes uses the admin endpoint which doesn't require JWT
  const params = householdId ? `?household_id=${householdId}` : '';
  const res = await axios.get<NodeInfo[]>(
    `${getCommandCenterUrl()}/api/v0/admin/nodes${params}`,
    { timeout: 10000 },
  );
  return res.data;
};

export const getNode = async (nodeId: string): Promise<NodeInfo> => {
  const nodes = await listNodes();
  const node = nodes.find((n) => n.node_id === nodeId);
  if (!node) {
    throw new Error('Node not found');
  }
  return node;
};

export const deleteNode = async (
  nodeId: string,
): Promise<void> => {
  await apiClient.delete(
    `${getCommandCenterUrl()}/api/v0/admin/nodes/${nodeId}`,
  );
};
