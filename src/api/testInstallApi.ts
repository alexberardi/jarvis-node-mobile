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

/** A run of a test-installed command during the node's test window (jarvisd records them). */
export interface TestRun {
  command: string;
  arguments: unknown;
  output: unknown;
  at: string;
}

/** The runs so far, from the same poll route. */
export const fetchTestRuns = async (nodeId: string, requestId: string): Promise<TestRun[]> =>
  (await fetchTestActivity(nodeId, requestId)).runs;

/**
 * The runs and how many node events there are (the test install's log lines, device scans and
 * controls, which Send to Forge includes), from the same poll route.
 */
export const fetchTestActivity = async (
  nodeId: string,
  requestId: string,
): Promise<{ runs: TestRun[]; events: number }> => {
  const res = await apiClient.get<{ runs?: TestRun[]; events?: unknown[] }>(
    `${getBaseUrl()}/api/v0/nodes/${nodeId}/test-install/${requestId}`,
  );
  return { runs: res.data.runs ?? [], events: res.data.events?.length ?? 0 };
};

/** Send to Forge: jarvisd sends the install result, the runs and the note to the draft. */
/** Asks the node to run the draft's background agents now; their runs reach Send to Forge as events. */
export const runTestAgents = async (nodeId: string, requestId: string): Promise<void> => {
  await apiClient.post(`${getBaseUrl()}/api/v0/nodes/${nodeId}/test-install/${requestId}/run-agents`);
};

export const sendToForge = async (nodeId: string, requestId: string, note: string): Promise<void> => {
  await apiClient.post(
    `${getBaseUrl()}/api/v0/nodes/${nodeId}/test-install/${requestId}/feedback`,
    note.trim() ? { note: note.trim() } : {},
  );
};
