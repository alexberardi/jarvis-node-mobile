/**
 * Pantry API client — public endpoints, no auth required.
 *
 * Uses raw axios (not apiClient) because the Pantry catalog is public.
 */
import axios from 'axios';

import { PANTRY_URL } from '../config/env';
import { getServiceConfig } from '../config/serviceConfig';
import type {
  PackageCategory,
  PackageDetail,
  PackageDownloadInfo,
  PackageSummary,
} from '../types/Package';

const getBaseUrl = (): string => {
  // Prefer config-service discovery, fall back to EXPO_PUBLIC_PANTRY_URL env var
  const { pantryUrl } = getServiceConfig();
  const url = pantryUrl || PANTRY_URL;
  if (!url) {
    throw new Error('Pantry service URL not configured — set EXPO_PUBLIC_PANTRY_URL or register jarvis-pantry in config-service');
  }
  return url;
};

interface BrowseResponse {
  commands: PackageSummary[];
  total: number;
  page: number;
  per_page: number;
}

interface CategoriesResponse {
  categories: PackageCategory[];
}

export const browsePackages = async (params?: {
  q?: string;
  category?: string;
  sort?: 'popular' | 'newest' | 'name';
  page?: number;
  per_page?: number;
}): Promise<BrowseResponse> => {
  const res = await axios.get<BrowseResponse>(`${getBaseUrl()}/v1/commands`, {
    params,
    timeout: 10000,
  });
  return res.data;
};

export const getPackageDetail = async (
  commandName: string,
): Promise<PackageDetail> => {
  const res = await axios.get<PackageDetail>(
    `${getBaseUrl()}/v1/commands/${commandName}`,
    { timeout: 10000 },
  );
  return res.data;
};

export const getCategories = async (): Promise<PackageCategory[]> => {
  const res = await axios.get<CategoriesResponse>(
    `${getBaseUrl()}/v1/categories`,
    { timeout: 10000 },
  );
  return res.data.categories;
};

export const getDownloadInfo = async (
  commandName: string,
  version?: string,
): Promise<PackageDownloadInfo> => {
  const res = await axios.get<PackageDownloadInfo>(
    `${getBaseUrl()}/v1/commands/${commandName}/download`,
    { params: version ? { version } : undefined, timeout: 10000 },
  );
  return res.data;
};

// ─── AI Routine Generation ──────────────────────────────────────────────────

export interface RoutineModelInfo {
  id: string;
  display_name: string;
  provider: string;
  estimated_cost: string;
  estimated_cost_usd: number;
}

export interface GenerateRoutinesRequest {
  available_commands: Record<string, unknown>[];
  model: string;
  llm_api_key: string;
  user_prompt?: string;
}

export interface GeneratedRoutine {
  id: string;
  name: string;
  trigger_phrases: string[];
  steps: Array<{
    command: string;
    args: Array<{ key: string; value: string }>;
    label: string;
  }>;
  response_instruction: string;
  response_length: 'short' | 'medium' | 'long';
  background: null;  // AI-generated routines are always on-demand
}

export interface GenerateRoutinesResponse {
  routines: GeneratedRoutine[];
  explanation: string;
  validation_warnings: string[];
}

export const getRoutineModels = async (): Promise<RoutineModelInfo[]> => {
  const res = await axios.get<{ models: RoutineModelInfo[] }>(
    `${getBaseUrl()}/v1/routines/models`,
    { timeout: 10000 },
  );
  return res.data.models;
};

export const generateRoutines = async (
  request: GenerateRoutinesRequest,
): Promise<GenerateRoutinesResponse> => {
  const res = await axios.post<GenerateRoutinesResponse>(
    `${getBaseUrl()}/v1/routines/generate`,
    request,
    { timeout: 120000 },  // 120s — LLM generation can take time
  );
  return res.data;
};
