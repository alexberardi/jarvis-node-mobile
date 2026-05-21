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
  // True when the node has no K2 secrets-encryption key yet — gates the
  // settings gear so the user can pair K2 even on a fresh device.
  needs_k2: boolean;
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
 * Delete a node from the household. Best-effort publishes a factory-reset
 * MQTT to wipe the device, then unconditionally removes the household and
 * auth records — so it succeeds even when the node is offline or has
 * already been reflashed.
 */
export const deleteNode = async (nodeId: string): Promise<void> => {
  await apiClient.delete(
    `${getCommandCenterUrl()}/api/v0/admin/nodes/${nodeId}`,
  );
};

/**
 * Update a node's config.json settings via MQTT.
 *
 * The node merges the settings into config.json and applies live where
 * possible. ``restart`` is only honored when one of the touched keys is
 * in the node's ``_KEYS_REQUIRING_RESTART`` set (currently just
 * ``wake_word_model``) — for everything else the value is read fresh
 * the next time the node consumes it.
 */
export const updateNodeConfig = async (
  nodeId: string,
  settings: Record<string, number | string | boolean>,
  restart: boolean = false,
): Promise<void> => {
  await apiClient.post(
    `${getCommandCenterUrl()}/api/v0/nodes/${nodeId}/node-config`,
    { settings, restart },
  );
};

/**
 * Preview an LED pattern on the node for ``duration_seconds`` then revert.
 * Ephemeral — does not persist any state. Drives the Test LEDs picker.
 */
export const previewLedPattern = async (
  nodeId: string,
  pattern: string,
  durationSeconds: number = 3.0,
): Promise<void> => {
  await apiClient.post(
    `${getCommandCenterUrl()}/api/v0/nodes/${nodeId}/led/preview`,
    { pattern, duration_seconds: durationSeconds },
  );
};

export interface AmbientNoiseResult {
  success: boolean;
  duration_seconds?: number;
  chunks?: number;
  p50_rms?: number;
  p75_rms?: number;
  p95_rms?: number;
  max_rms?: number;
  suggested_silence_threshold?: number;
  error?: string;
}

export interface AmbientNoisePollResponse {
  request_id: string;
  status: 'pending' | 'completed';
  completed_at?: string | null;
  result?: AmbientNoiseResult | null;
}

/**
 * Ask the node to measure the current ambient noise floor.
 * Returns a request_id that the caller polls via {@link pollAmbientNoiseResult}.
 */
export const triggerAmbientNoiseMeasurement = async (
  nodeId: string,
  durationSeconds: number = 3.0,
): Promise<{ request_id: string }> => {
  const res = await apiClient.post<{ request_id: string; status: string }>(
    `${getCommandCenterUrl()}/api/v0/nodes/${nodeId}/ambient-noise-measurements`,
    { duration_seconds: durationSeconds },
  );
  return { request_id: res.data.request_id };
};

export const pollAmbientNoiseResult = async (
  nodeId: string,
  requestId: string,
): Promise<AmbientNoisePollResponse> => {
  const res = await apiClient.get<AmbientNoisePollResponse>(
    `${getCommandCenterUrl()}/api/v0/nodes/${nodeId}/ambient-noise-measurements/${requestId}`,
  );
  return res.data;
};
