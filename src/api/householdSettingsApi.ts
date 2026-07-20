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
  /**
   * Where the household is, as a free-text locality ("Springfield, IL 62704").
   * Biases business lookups so a phone call reaches the nearby branch —
   * a search for "Tony's Pizzeria" once resolved to Maryland for a New
   * Jersey household. Deliberately NOT a street address.
   */
  'household.location': string;
}

/** Values the allowlisted settings can hold. */
export type HouseholdSettingValue = HouseholdSettings[keyof HouseholdSettings];

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
export const setHouseholdSetting = async <K extends keyof HouseholdSettings>(
  householdId: string,
  key: K,
  value: HouseholdSettings[K],
): Promise<void> => {
  await apiClient.put(`${base(householdId)}/${key}`, { value });
};
