/**
 * Suppressed suggestions (jarvis-command-center).
 *
 * Talks to CC's `/api/v0/mobile/proposal-suppressions` endpoints — the
 * household's "never suggest this again" blocklist for agent-proposed action
 * cards. Authorized by the caller's role in the household; `household_id` is a
 * query param (mirrors memoriesApi). The JWT is attached automatically by
 * apiClient.
 */
import { getCommandCenterUrl } from '../config/serviceConfig';
import type { ProposalSuppression } from '../types/ProposalSuppression';
import apiClient from './apiClient';

const base = () => `${getCommandCenterUrl()}/api/v0/mobile/proposal-suppressions`;

/** The household's suppressed suggestions, newest first. */
export const listProposalSuppressions = async (
  householdId: string,
  command?: string,
): Promise<ProposalSuppression[]> => {
  const res = await apiClient.get<{ suppressions: ProposalSuppression[] }>(base(), {
    params: { household_id: householdId, ...(command ? { command } : {}) },
  });
  return res.data.suppressions;
};

/** Un-block a suppressed suggestion so it can be proposed again. 404 if gone. */
export const deleteProposalSuppression = async (
  householdId: string,
  id: string,
): Promise<void> => {
  await apiClient.delete<{ deleted: boolean }>(`${base()}/${id}`, {
    params: { household_id: householdId },
  });
};
