/**
 * Household-scoped feature settings (jarvis-command-center).
 *
 * Talks to CC's `/api/v0/mobile/household/{id}/settings*` endpoints, which are
 * authorized by the caller's role IN the household (admin to write) — NOT a
 * global superuser like the raw `/settings/*` router. Powers the toggles on the
 * Household Settings screen. The JWT is attached automatically by apiClient.
 */
import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

/** The household-controllable settings the backend allowlists. */
export interface HouseholdSettings {
  /** Master toggle for web search (quick_search + deep_research). Default off. */
  'web_search.enabled': boolean;
}

const base = (householdId: string) =>
  `${getCommandCenterUrl()}/api/v0/mobile/household/${householdId}/settings`;

/** Fetch the household-controllable settings + their current values. */
export const getHouseholdSettings = async (
  householdId: string,
): Promise<HouseholdSettings> => {
  const res = await apiClient.get<{ household_id: string; settings: HouseholdSettings }>(
    base(householdId),
  );
  return res.data.settings;
};

/** Set one household-controllable setting (requires household admin). */
export const setHouseholdSetting = async (
  householdId: string,
  key: keyof HouseholdSettings,
  value: boolean,
): Promise<void> => {
  await apiClient.put(`${base(householdId)}/${key}`, { value });
};
