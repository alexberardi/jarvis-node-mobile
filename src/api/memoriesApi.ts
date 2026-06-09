import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

export type MemoryScope = 'user' | 'household';

export interface Memory {
  id: number;
  user_id: number | null;
  household_id: string;
  category: string;
  key: string | null;
  content: string;
  source: string;
  is_active: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  editable: boolean;
}

export interface MemoryCreatePayload {
  content: string;
  category?: string;
  key?: string | null;
  is_pinned?: boolean;
  scope?: MemoryScope;
}

export interface MemoryUpdatePayload {
  content?: string;
  category?: string;
  is_active?: boolean;
  is_pinned?: boolean;
}

const getBaseUrl = (): string => {
  const url = getCommandCenterUrl();
  if (!url) {
    throw new Error('Command center service not available');
  }
  return url;
};

export const listMemories = async (
  householdId: string,
  params?: { category?: string; include_household?: boolean },
): Promise<Memory[]> => {
  const res = await apiClient.get<Memory[]>(`${getBaseUrl()}/api/v0/mobile/memories`, {
    params: { household_id: householdId, ...params },
  });
  return res.data;
};

export const getMemory = async (
  memoryId: number,
  householdId: string,
): Promise<Memory> => {
  const res = await apiClient.get<Memory>(
    `${getBaseUrl()}/api/v0/mobile/memories/${memoryId}`,
    { params: { household_id: householdId } },
  );
  return res.data;
};

export const createMemory = async (
  householdId: string,
  payload: MemoryCreatePayload,
): Promise<Memory> => {
  const res = await apiClient.post<Memory>(
    `${getBaseUrl()}/api/v0/mobile/memories`,
    payload,
    { params: { household_id: householdId } },
  );
  return res.data;
};

export const updateMemory = async (
  memoryId: number,
  householdId: string,
  payload: MemoryUpdatePayload,
): Promise<Memory> => {
  const res = await apiClient.put<Memory>(
    `${getBaseUrl()}/api/v0/mobile/memories/${memoryId}`,
    payload,
    { params: { household_id: householdId } },
  );
  return res.data;
};

export const deleteMemory = async (
  memoryId: number,
  householdId: string,
): Promise<void> => {
  await apiClient.delete(`${getBaseUrl()}/api/v0/mobile/memories/${memoryId}`, {
    params: { household_id: householdId },
  });
};
