/**
 * Test install API client — install Forge drafts to nodes via share codes.
 *
 * Uses the CC test-install endpoints (JWT-authenticated).
 */
import { getServiceConfig } from '../config/serviceConfig';
import type { InstallStatus } from '../types/Package';
import apiClient from './apiClient';

const getBaseUrl = (): string => {
  const { commandCenterUrl } = getServiceConfig();
  if (!commandCenterUrl) {
    throw new Error('Command center URL not configured');
  }
  return commandCenterUrl;
};

export interface TestInstallResponse {
  id: string;
  status: string;
  package_name: string;
  created_at: string;
}

export const requestTestInstall = async (
  nodeId: string,
  shareCode: string,
): Promise<TestInstallResponse> => {
  const res = await apiClient.post<TestInstallResponse>(
    `${getBaseUrl()}/api/v0/nodes/${nodeId}/test-install`,
    { share_code: shareCode },
  );
  return res.data;
};

export const pollTestInstallStatus = async (
  nodeId: string,
  requestId: string,
): Promise<InstallStatus> => {
  const res = await apiClient.get<{
    status: InstallStatus['status'];
    request_id: string;
    package_name: string;
    error_message: string | null;
    details: Record<string, unknown> | null;
  }>(
    `${getBaseUrl()}/api/v0/nodes/${nodeId}/test-install/${requestId}`,
  );
  return {
    status: res.data.status,
    request_id: res.data.request_id,
    command_name: res.data.package_name,
    error_message: res.data.error_message,
    details: res.data.details,
  };
};
