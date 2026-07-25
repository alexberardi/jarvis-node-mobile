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
  /**
   * The household's speaking-voice persona — free text that shapes how Jarvis
   * TALKS (tone, warmth, wit), never what it can do. The backend fences it into
   * a <personality> block walled off from tool-calling and safety. Defaults to a
   * warm, folksy voice; length-capped (see PersonaPresets.max_chars). Empty
   * clears the voice layer back to the plain assistant.
   */
  'persona.household_prompt': string;
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

/** A tappable starter voice for the persona editor. */
export interface PersonaPreset {
  /** Stable id (e.g. "warm_folksy"). */
  id: string;
  /** Chip label (e.g. "Warm & folksy"). */
  label: string;
  /** The persona text this preset loads into the editor. */
  text: string;
}

/** Starter presets + the default, for the persona editor chips. */
export interface PersonaPresets {
  presets: PersonaPreset[];
  /** Which preset is "the default" — re-loading it is the reset affordance. */
  default_preset_id: string;
  /** The default persona text (the setting's default). */
  default_text: string;
  /** Max characters the persona box accepts. */
  max_chars: number;
}

/**
 * Fetch the starter persona presets for the mobile chips. Any household member
 * may read. The editor loads a preset's `text` into the box on tap; the user
 * tweaks and saves. Best-effort: if this fails the box still works, just without
 * chips.
 */
export const getPersonaPresets = async (
  householdId: string,
): Promise<PersonaPresets> => {
  const res = await apiClient.get<PersonaPresets>(
    `${getCommandCenterUrl()}/api/v0/mobile/household/${householdId}/persona/presets`,
  );
  return res.data;
};
