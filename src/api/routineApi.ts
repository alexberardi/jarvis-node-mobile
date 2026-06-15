/**
 * Routines API — server-owned, per-household routines in command-center.
 *
 * Replaces the old phone-local AsyncStorage store. Mobile is a thin CRUD client;
 * the server fans out an MQTT nudge to household nodes on every mutation, and
 * nodes pull + execute on-node. Run-now fires a routine immediately on a node.
 */
import { getCommandCenterUrl } from '../config/serviceConfig';
import type {
  ResponseLength,
  Routine,
  RoutineSchedule,
  RoutineStep,
} from '../types/Routine';
import apiClient from './apiClient';

const base = (householdId: string) =>
  `${getCommandCenterUrl()}/api/v0/households/${householdId}/routines`;

export interface RoutineWrite {
  name: string;
  trigger_phrases: string[];
  steps: RoutineStep[];
  response_instruction: string;
  response_length: ResponseLength;
  schedule: RoutineSchedule | null;
  enabled?: boolean;
}

export const listRoutines = async (householdId: string): Promise<Routine[]> => {
  const res = await apiClient.get<{ routines: Routine[] }>(base(householdId));
  return res.data.routines;
};

export const getRoutine = async (
  householdId: string,
  routineId: string,
): Promise<Routine> => {
  const res = await apiClient.get<Routine>(`${base(householdId)}/${routineId}`);
  return res.data;
};

export const createRoutine = async (
  householdId: string,
  body: RoutineWrite,
): Promise<Routine> => {
  const res = await apiClient.post<Routine>(base(householdId), body);
  return res.data;
};

export const updateRoutine = async (
  householdId: string,
  routineId: string,
  body: Partial<RoutineWrite>,
): Promise<Routine> => {
  const res = await apiClient.patch<Routine>(
    `${base(householdId)}/${routineId}`,
    body,
  );
  return res.data;
};

export const deleteRoutine = async (
  householdId: string,
  routineId: string,
): Promise<void> => {
  await apiClient.delete(`${base(householdId)}/${routineId}`);
};

export interface RunNowResult {
  success: boolean;
  status: 'success' | 'partial' | 'failed' | 'timeout';
  message: string | null;
  passed: number;
  failed: number;
}

export const runRoutineNow = async (
  householdId: string,
  routineId: string,
  nodeId?: string | null,
): Promise<RunNowResult> => {
  const res = await apiClient.post<RunNowResult>(
    `${base(householdId)}/${routineId}/run-now`,
    { node_id: nodeId ?? null },
  );
  return res.data;
};
