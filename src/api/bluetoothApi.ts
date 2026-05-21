/**
 * Bluetooth management API — scan, pair, disconnect, discoverable, status.
 *
 * Uses the request/poll pattern: initiate → poll until completed/failed/expired.
 * All endpoints require JWT auth (via apiClient).
 */

import apiClient from './apiClient';
import { getCommandCenterUrl } from '../config/serviceConfig';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BluetoothDevice {
  name: string;
  mac_address: string;
  device_type: string;
  paired: boolean;
  connected: boolean;
  /**
   * Whether the node should auto-reconnect to this device on boot and
   * during the periodic reconnect loop. Currently best-effort —
   * the status endpoint doesn't include this yet, so the UI assumes
   * `true` (the node's default) until the user toggles it.
   */
  auto_connect?: boolean;
}

export interface BluetoothScanResponse {
  id: string;
  status: string;
  created_at: string;
}

export interface BluetoothScanPollResponse {
  status: 'pending' | 'completed' | 'failed';
  request_id: string;
  devices?: BluetoothDevice[];
  device_count?: number;
  error_message?: string;
}

export interface BluetoothPairResponse {
  id: string;
  status: string;
  created_at: string;
}

export interface BluetoothPairPollResponse {
  status: 'pending' | 'completed' | 'failed';
  request_id: string;
  device_name?: string;
  error_message?: string;
}

export interface BluetoothStatusResponse {
  available: boolean;
  connected: BluetoothDevice[];
  paired: BluetoothDevice[];
}

// ── Scan ───────────────────────────────────────────────────────────────────

/**
 * Initiate a Bluetooth scan on a node. Returns a request ID for polling.
 */
export const requestBluetoothScan = async (
  nodeId: string,
  role: string = 'source',
): Promise<BluetoothScanResponse> => {
  const baseUrl = getCommandCenterUrl();
  const res = await apiClient.post<BluetoothScanResponse>(
    `${baseUrl}/api/v0/nodes/${nodeId}/bluetooth-scan/request`,
    { role },
  );
  return res.data;
};

/**
 * Poll for Bluetooth scan results. Returns pending until node finishes.
 */
export const pollBluetoothScan = async (
  nodeId: string,
  requestId: string,
): Promise<BluetoothScanPollResponse> => {
  const baseUrl = getCommandCenterUrl();
  const res = await apiClient.get<BluetoothScanPollResponse>(
    `${baseUrl}/api/v0/nodes/${nodeId}/bluetooth-scan/${requestId}`,
  );
  return res.data;
};

// ── Pair ───────────────────────────────────────────────────────────────────

/**
 * Initiate pairing with a specific Bluetooth device on a node.
 */
export const pairBluetoothDevice = async (
  nodeId: string,
  macAddress: string,
  role: string = 'source',
): Promise<BluetoothPairResponse> => {
  const baseUrl = getCommandCenterUrl();
  const res = await apiClient.post<BluetoothPairResponse>(
    `${baseUrl}/api/v0/nodes/${nodeId}/bluetooth/pair`,
    { mac_address: macAddress, role },
  );
  return res.data;
};

/**
 * Poll for Bluetooth pair result.
 */
export const pollBluetoothPair = async (
  nodeId: string,
  requestId: string,
): Promise<BluetoothPairPollResponse> => {
  const baseUrl = getCommandCenterUrl();
  const res = await apiClient.get<BluetoothPairPollResponse>(
    `${baseUrl}/api/v0/nodes/${nodeId}/bluetooth/pair/${requestId}`,
  );
  return res.data;
};

// ── Disconnect / Discoverable / Status ─────────────────────────────────────

/**
 * Disconnect a Bluetooth device on a node (fire-and-forget).
 */
export const disconnectBluetoothDevice = async (
  nodeId: string,
  macAddress: string,
): Promise<void> => {
  const baseUrl = getCommandCenterUrl();
  await apiClient.post(`${baseUrl}/api/v0/nodes/${nodeId}/bluetooth/disconnect`, {
    mac_address: macAddress,
  });
};

/**
 * Release a Bluetooth device.
 *
 * forget=false (default): disconnect + disable auto-reconnect, but keep
 * the pair so the user can reconnect with one tap. Use this to free the
 * device for the user's phone temporarily.
 *
 * forget=true: full unpair (removes bluez bond + saved record). User
 * must put the device back in pairing mode and re-pair from scratch.
 */
export const releaseBluetoothDevice = async (
  nodeId: string,
  macAddress: string,
  forget: boolean = false,
): Promise<void> => {
  const baseUrl = getCommandCenterUrl();
  await apiClient.post(`${baseUrl}/api/v0/nodes/${nodeId}/bluetooth/release`, {
    mac_address: macAddress,
    forget,
  });
};

/**
 * Toggle whether the node auto-reconnects to this device on boot.
 *
 * Pairing stays intact either way — this only controls the periodic
 * reconnect loop. Useful for devices the user shares between the Pi
 * and another host (phone, etc.).
 */
export const setBluetoothAutoConnect = async (
  nodeId: string,
  macAddress: string,
  enabled: boolean,
): Promise<void> => {
  const baseUrl = getCommandCenterUrl();
  await apiClient.post(`${baseUrl}/api/v0/nodes/${nodeId}/bluetooth/auto-connect`, {
    mac_address: macAddress,
    enabled,
  });
};

/**
 * Make a node discoverable for Bluetooth pairing (phone → Pi flow).
 */
export const makeDiscoverable = async (nodeId: string): Promise<void> => {
  const baseUrl = getCommandCenterUrl();
  await apiClient.post(`${baseUrl}/api/v0/nodes/${nodeId}/bluetooth/discoverable`);
};

/**
 * Get current Bluetooth status (paired + connected devices).
 */
export const getBluetoothStatus = async (
  nodeId: string,
): Promise<BluetoothStatusResponse> => {
  const baseUrl = getCommandCenterUrl();
  const res = await apiClient.get<BluetoothStatusResponse>(
    `${baseUrl}/api/v0/nodes/${nodeId}/bluetooth/status`,
  );
  return res.data;
};
