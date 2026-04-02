/**
 * Package install API client — JWT-authenticated endpoints on command-center.
 *
 * Uses apiClient (not raw axios) for automatic token refresh.
 */
import { getServiceConfig } from '../config/serviceConfig';
import type { InstallRequest, InstallStatus } from '../types/Package';
import apiClient from './apiClient';

const getBaseUrl = (): string => {
  const { commandCenterUrl } = getServiceConfig();
  if (!commandCenterUrl) {
    throw new Error('Command center URL not configured');
  }
  return commandCenterUrl;
};

export const requestInstall = async (
  nodeId: string,
  commandName: string,
  githubRepoUrl: string,
  gitTag: string | null,
): Promise<InstallRequest> => {
  const res = await apiClient.post<InstallRequest>(
    `${getBaseUrl()}/api/v0/nodes/${nodeId}/package-install`,
    {
      command_name: commandName,
      github_repo_url: githubRepoUrl,
      git_tag: gitTag,
    },
  );
  return res.data;
};

export const pollInstallStatus = async (
  nodeId: string,
  requestId: string,
): Promise<InstallStatus> => {
  const res = await apiClient.get<InstallStatus>(
    `${getBaseUrl()}/api/v0/nodes/${nodeId}/package-install/${requestId}`,
  );
  return res.data;
};

export const requestUninstall = async (
  nodeId: string,
  commandName: string,
): Promise<InstallRequest> => {
  const res = await apiClient.post<InstallRequest>(
    `${getBaseUrl()}/api/v0/nodes/${nodeId}/package-uninstall`,
    { command_name: commandName },
  );
  return res.data;
};

export const pollUninstallStatus = async (
  nodeId: string,
  requestId: string,
): Promise<InstallStatus> => {
  const res = await apiClient.get<InstallStatus>(
    `${getBaseUrl()}/api/v0/nodes/${nodeId}/package-uninstall/${requestId}`,
  );
  return res.data;
};

/** Install a prompt provider directly to the command center (no node/MQTT). */
export const requestCCInstall = async (
  githubRepoUrl: string,
  gitTag: string | null,
): Promise<{ status: string; provider_name: string; package_name: string }> => {
  const res = await apiClient.post(
    `${getBaseUrl()}/api/v0/prompt-providers/install`,
    {
      github_repo_url: githubRepoUrl,
      git_tag: gitTag,
    },
  );
  return res.data;
};
