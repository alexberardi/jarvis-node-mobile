import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

export interface SettingsRequestResponse {
  request_id: string;
}

export interface SettingsSnapshotData {
  snapshot_id: string;
  ciphertext: string;
  nonce: string;
  tag: string;
  aad: {
    node_id: string;
    schema_version: number;
    commands_schema_version: number;
    revision: number;
    request_id: string;
  };
  created_at: string;
}

export interface SettingsResultResponse {
  status: 'pending' | 'fulfilled';
  request_id: string;
  snapshot?: SettingsSnapshotData;
}

/**
 * Request a settings snapshot from a node.
 * CC creates the request and notifies the node via MQTT.
 */
export const requestSettingsSnapshot = async (
  nodeId: string,
  includeValues: boolean = false,
): Promise<SettingsRequestResponse> => {
  const params = includeValues ? '?include_values=true' : '';
  const res = await apiClient.post<SettingsRequestResponse>(
    `${getCommandCenterUrl()}/api/v0/nodes/${nodeId}/settings/requests${params}`,
    {},
  );
  return res.data;
};

/**
 * Poll for snapshot result.
 * Returns 202 (status: pending) or 200 (status: fulfilled) with encrypted data.
 */
export const pollSettingsResult = async (
  nodeId: string,
  requestId: string,
): Promise<SettingsResultResponse> => {
  const res = await apiClient.get<SettingsResultResponse>(
    `${getCommandCenterUrl()}/api/v0/nodes/${nodeId}/settings/requests/${requestId}/result`,
  );
  return res.data;
};

/**
 * Provision K2 encryption key to a node via CC MQTT relay.
 * Used for Docker/headless nodes that aren't reachable via direct AP.
 */
export const provisionK2ToNode = async (
  nodeId: string,
  k2: string,
  kid: string,
  createdAt: string,
): Promise<void> => {
  await apiClient.post(
    `${getCommandCenterUrl()}/api/v0/nodes/${nodeId}/k2`,
    { k2, kid, created_at: createdAt },
  );
};
