/**
 * Routine execution history API client — JWT-authenticated endpoints on command-center.
 */
import { getServiceConfig } from '../config/serviceConfig';
import apiClient from './apiClient';

export interface StepResult {
  label: string;
  command: string;
  success: boolean;
  error: string | null;
  duration_ms: number | null;
}

export interface RoutineExecution {
  id: string;
  node_id: string;
  routine_name: string;
  status: 'success' | 'partial' | 'failure';
  step_count: number;
  steps_passed: number;
  steps_failed: number;
  duration_ms: number | null;
  steps: StepResult[] | null;
  error_summary: string | null;
  executed_at: string;
  node_room: string | null;
}

export interface RoutineHistoryResponse {
  executions: RoutineExecution[];
  total: number;
  limit: number;
  offset: number;
}

export const fetchRoutineHistory = async (
  routineName: string,
  params?: { limit?: number; offset?: number },
): Promise<RoutineHistoryResponse> => {
  const { commandCenterUrl } = getServiceConfig();
  const res = await apiClient.get<RoutineHistoryResponse>(
    `${commandCenterUrl}/api/v0/routine-executions`,
    { params: { routine_name: routineName, ...params } },
  );
  return res.data;
};
