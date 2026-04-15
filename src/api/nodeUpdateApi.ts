import axios from 'axios';

import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

export type NodeTaskState =
  | 'pending'
  | 'dispatched'
  | 'in_progress'
  | 'success'
  | 'failed';

export interface NodeTask {
  id: string;
  node_id: string;
  kind: string;
  target_version: string | null;
  state: NodeTaskState;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface LatestRelease {
  tag: string;
  version: string;
  published_at: string | null;
}

const base = () => getCommandCenterUrl();

export const getLatestRelease = async (): Promise<LatestRelease | null> => {
  try {
    const res = await axios.get<LatestRelease | null>(
      `${base()}/api/v0/releases/latest`,
      { timeout: 6000 },
    );
    return res.data ?? null;
  } catch {
    return null;
  }
};

export const requestNodeUpdate = async (
  nodeId: string,
  targetVersion: string | null = null,
): Promise<NodeTask> => {
  const body = targetVersion ? { target_version: targetVersion } : {};
  const res = await apiClient.post<NodeTask>(
    `${base()}/api/v0/nodes/${nodeId}/update`,
    body,
    { timeout: 10000 },
  );
  return res.data;
};

export const getNodeTask = async (taskId: string): Promise<NodeTask> => {
  const res = await apiClient.get<NodeTask>(
    `${base()}/api/v0/tasks/${taskId}`,
    { timeout: 10000 },
  );
  return res.data;
};

export const listNodeTasks = async (
  nodeId: string,
  limit = 20,
): Promise<NodeTask[]> => {
  const res = await apiClient.get<NodeTask[]>(
    `${base()}/api/v0/nodes/${nodeId}/tasks?limit=${limit}`,
    { timeout: 10000 },
  );
  return res.data;
};

export const isTerminalState = (state: NodeTaskState): boolean =>
  state === 'success' || state === 'failed';
