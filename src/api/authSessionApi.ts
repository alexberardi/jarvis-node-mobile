/**
 * Auth session API: JCC-backed OAuth flow.
 *
 * Mobile creates a session, JCC builds the authorize URL and handles
 * the callback/token exchange. Mobile just opens the URL and polls status.
 */
import { getCommandCenterUrl } from '../config/serviceConfig';
import type { AuthenticationConfig } from '../types/SmartHome';
import apiClient from './apiClient';

export interface CreateAuthSessionParams {
  provider: string;
  nodeId: string;
  providerBaseUrl?: string;
  authConfig: AuthenticationConfig;
}

export interface CreateAuthSessionResponse {
  session_id: string;
  authorize_url: string;
  requires_code_exchange: boolean;
}

export interface AuthSessionStatus {
  session_id: string;
  status: 'pending' | 'active' | 'consumed' | 'expired';
  provider: string;
}

export const createAuthSession = async (
  params: CreateAuthSessionParams,
): Promise<CreateAuthSessionResponse> => {
  const res = await apiClient.post<CreateAuthSessionResponse>(
    `${getCommandCenterUrl()}/api/v0/oauth/sessions`,
    {
      provider: params.provider,
      node_id: params.nodeId,
      provider_base_url: params.providerBaseUrl ?? null,
      auth_config: params.authConfig,
    },
  );
  return res.data;
};

export const exchangeCode = async (
  sessionId: string,
  code: string,
): Promise<void> => {
  await apiClient.post(
    `${getCommandCenterUrl()}/api/v0/oauth/sessions/${sessionId}/exchange`,
    { code },
    { timeout: 15000 },
  );
};

export const getAuthSessionStatus = async (
  sessionId: string,
): Promise<AuthSessionStatus> => {
  const res = await apiClient.get<AuthSessionStatus>(
    `${getCommandCenterUrl()}/api/v0/oauth/sessions/${sessionId}`,
  );
  return res.data;
};
