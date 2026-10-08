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
  /**
   * The household's own Twilio account (AD6), used for the phone calls the
   * assistant places. Write-only: the server answers `"********"` once the
   * SID / auth token are set and `null` when they are not — the values are
   * never read back. Each key reads the household's OWN row only (never the
   * install's default account). PUT `""` (or `null`) clears one.
   */
  'phone.twilio_account_sid': string | null;
  'phone.twilio_auth_token': string | null;
  /** The Twilio number calls are placed from, E.164 (`+15551234567`); not secret. */
  'phone.twilio_from_number': string | null;
}

/** The three Twilio keys, which only work as a set (one account). */
export const TWILIO_KEYS = [
  'phone.twilio_account_sid',
  'phone.twilio_auth_token',
  'phone.twilio_from_number',
] as const;

/** What a secret household setting reads back as once it is set. */
export const MASKED_SECRET = '********';

/**
 * E.164, exactly as the server checks the from number
 * (jarvisd `internal/modules/cc/household_settings.go`).
 */
export const E164_PATTERN = /^\+[1-9][0-9]{6,14}$/;

/**
 * The user-facing message from a failed household-settings write: the server's
 * `detail` string, a FastAPI-style 422 `detail: [{msg}]`, or CC's validation
 * envelope `{message, details: [...]}`. Falls back to `fallback`.
 */
export const settingErrorMessage = (error: unknown, fallback: string): string => {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  const obj = (data ?? {}) as { detail?: unknown; message?: unknown; details?: unknown };
  if (typeof obj.detail === 'string' && obj.detail.trim()) return obj.detail;
  if (Array.isArray(obj.detail)) {
    const msg = obj.detail
      .map((d) => (d as { msg?: unknown })?.msg)
      .find((m) => typeof m === 'string' && m.trim());
    if (typeof msg === 'string') return msg;
  }
  if (Array.isArray(obj.details)) {
    const first = obj.details.find((d) => typeof d === 'string' && d.trim());
    if (typeof first === 'string') return first;
  }
  if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
  return fallback;
};

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
