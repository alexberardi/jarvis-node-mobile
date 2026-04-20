/**
 * Adapter proposal / deployment API (Phase 7.3).
 *
 * Wraps the three command-center endpoints that back the user-approved
 * adapter deploy flow:
 *   - POST /api/v0/adapters/proposals/{id}/apply
 *   - POST /api/v0/adapters/proposals/{id}/dismiss
 *   - POST /api/v0/adapters/deployments/{hash}/revert
 */
import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

export interface PerCommandDelta {
  before: { success_rate: number; passed: number; total: number };
  after: { success_rate: number; passed: number; total: number };
  delta_pp: number;
}

export interface AdapterProposal {
  id: string;
  household_id: string;
  adapter_hash: string;
  provider_name_before: string | null;
  provider_name_after: string | null;
  pass_rate_before: number | null;
  pass_rate_after: number | null;
  latency_before_s: number | null;
  latency_after_s: number | null;
  per_command_delta: Record<string, PerCommandDelta> | null;
  trained_on_examples: number | null;
  status: 'pending' | 'applied' | 'dismissed' | 'expired' | 'superseded';
  inbox_item_id: string | null;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
}

export interface ApplyResult {
  proposal: AdapterProposal;
  adapter_hash: string;
  pass_rate: number | null;
  trained_on_examples: number | null;
  deployed_at: string;
  provider_name: string | null;
  deployed_inbox_item_id: string | null;
}

export interface RevertResult {
  restored_adapter_hash: string | null;
  restored_pass_rate: number | null;
  restored_provider_name: string | null;
  reverted_inbox_item_id: string | null;
}

const getBaseUrl = (): string => {
  const url = getCommandCenterUrl();
  if (!url) {
    throw new Error('Command center service not available');
  }
  return url;
};

export const getProposal = async (
  proposalId: string,
): Promise<AdapterProposal> => {
  const res = await apiClient.get<AdapterProposal>(
    `${getBaseUrl()}/api/v0/adapters/proposals/${proposalId}`,
  );
  return res.data;
};

export const applyProposal = async (
  proposalId: string,
): Promise<ApplyResult> => {
  const res = await apiClient.post<ApplyResult>(
    `${getBaseUrl()}/api/v0/adapters/proposals/${proposalId}/apply`,
    {},
  );
  return res.data;
};

export const dismissProposal = async (
  proposalId: string,
): Promise<AdapterProposal> => {
  const res = await apiClient.post<AdapterProposal>(
    `${getBaseUrl()}/api/v0/adapters/proposals/${proposalId}/dismiss`,
    {},
  );
  return res.data;
};

export const revertDeployment = async (
  adapterHash: string,
  householdId: string,
): Promise<RevertResult> => {
  const res = await apiClient.post<RevertResult>(
    `${getBaseUrl()}/api/v0/adapters/deployments/${adapterHash}/revert`,
    { household_id: householdId },
  );
  return res.data;
};
