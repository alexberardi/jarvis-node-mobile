import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

export interface ProvisioningTokenRequest {
  household_id: string;
  room?: string;
  name?: string;
  node_id?: string; // Only for refresh (reuse existing UUID)
}

export interface ProvisioningTokenResponse {
  token: string;
  node_id: string;
  expires_at: string;
  expires_in: number;
}

export interface SendActionRequest {
  command_name: string;
  action_name: string;
  context?: Record<string, any>;
}

export interface SendActionResponse {
  status: string;
  request_id: string;
}

/**
 * Send an interactive action (e.g. Send/Cancel button tap) to a node via CC.
 */
export const sendNodeAction = async (
  nodeId: string,
  action: SendActionRequest,
): Promise<SendActionResponse> => {
  const response = await apiClient.post<SendActionResponse>(
    `${getCommandCenterUrl()}/api/v0/nodes/${nodeId}/actions`,
    action,
  );
  return response.data;
};

export const requestProvisioningToken = async (
  request: ProvisioningTokenRequest,
): Promise<ProvisioningTokenResponse> => {
  const response = await apiClient.post<ProvisioningTokenResponse>(
    `${getCommandCenterUrl()}/api/v0/provisioning/token`,
    request,
  );
  return response.data;
};
