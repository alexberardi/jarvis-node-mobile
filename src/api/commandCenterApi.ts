import axios from 'axios';

import { getCommandCenterUrl } from '../config/serviceConfig';

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

export const requestProvisioningToken = async (
  request: ProvisioningTokenRequest,
  accessToken: string
): Promise<ProvisioningTokenResponse> => {
  const baseUrl = getCommandCenterUrl();
  const response = await axios.post<ProvisioningTokenResponse>(
    `${baseUrl}/api/v1/provisioning/token`,
    request,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 10000,
    }
  );
  return response.data;
};
