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
  // Version info reported by the node (nullable for pre-upgrade nodes)
  last_seen_version: string | null;
  install_mode: string | null;
  git_sha: string | null;
  is_busy: boolean;
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
  const res = await axios.get<NodeInfo>(
    `${getCommandCenterUrl()}/api/v0/admin/nodes/${nodeId}`,
    { timeout: 10000 },
  );
  return res.data;
};

/**
 * Begin a factory reset for a node. Creates a tracked task on the
 * command center, publishes the MQTT trigger, and returns the task id
 * so the caller can poll progress.
 *
 * The node will report status updates (in_progress → success | failed)
 * back to CC during the reset; on success the node row is marked
 * inactive and the device reboots into provisioning mode.
 */
export const factoryResetNode = async (
  nodeId: string,
): Promise<{ task_id: string }> => {
  const res = await apiClient.post<{ task_id: string; reset_token: string }>(
    `${getCommandCenterUrl()}/api/v0/admin/nodes/${nodeId}/factory-reset`,
  );
  // reset_token is for the node's status callbacks — the mobile client
  // doesn't need it.
  return { task_id: res.data.task_id };
};

export interface NodeTask {
  id: string;
  node_id: string;
  kind: string;
  state: 'pending' | 'dispatched' | 'in_progress' | 'success' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export const getNodeTask = async (taskId: string): Promise<NodeTask> => {
  const res = await apiClient.get<NodeTask>(
    `${getCommandCenterUrl()}/api/v0/tasks/${taskId}`,
  );
  return res.data;
};

/**
 * Update a node's config.json settings via MQTT.
 * The node merges the settings and optionally restarts.
 */
export const updateNodeConfig = async (
  nodeId: string,
  settings: Record<string, number | string | boolean>,
  restart: boolean = true,
): Promise<void> => {
  await apiClient.post(
    `${getCommandCenterUrl()}/api/v0/nodes/${nodeId}/node-config`,
    { settings, restart },
  );
};
