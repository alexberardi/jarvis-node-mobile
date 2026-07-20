/**
 * Call context — the personal details Jarvis may use on a phone call
 * (jarvis-command-center).
 *
 * USER-scoped, not household: an insurance member ID or a callback number is
 * personal, so there is no household in the path — the JWT identifies whose
 * details these are. The JWT is attached automatically by apiClient; never
 * call these endpoints with raw fetch/axios (it would skip the token and the
 * refresh-on-401 retry).
 *
 * This is PII. Anything stored here can be spoken on a call and lands in the
 * transcript and recording. The `tier` control decides whether the agent may
 * volunteer a field or only give it when asked; the gateway enforces it.
 *
 * The store is edited and saved as a unit (PUT replaces the whole list), which
 * is why there is no per-row create/update/delete — the screen holds the list
 * and saves it whole.
 */
import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

/** Whether the agent may state a field freely, or only give it if asked. */
export type CallContextTier = 'state' | 'if_asked';

/** One stored detail. `key` is server-assigned; a new custom row omits it and
 * the server derives it from the label. */
export interface CallContextField {
  key?: string;
  label: string;
  value: string;
  category: string;
  tier: CallContextTier;
}

/** A well-known field the grid can offer as a preset. */
export interface CatalogField {
  key: string;
  label: string;
  category: string;
  tier: CallContextTier;
}

/** An option with a machine value and a human label (category or tier). */
export interface CatalogOption {
  value: string;
  label: string;
}

/** The static vocabulary the grid renders, served so the app can't drift. */
export interface CallContextCatalog {
  well_known: CatalogField[];
  categories: CatalogOption[];
  tiers: CatalogOption[];
}

export interface CallContextResponse {
  fields: CallContextField[];
  catalog: CallContextCatalog;
}

const base = (): string => {
  const url = getCommandCenterUrl();
  if (!url) {
    throw new Error('Command center service not available');
  }
  return `${url}/api/v0/mobile/call-context`;
};

export const getCallContext = async (): Promise<CallContextResponse> => {
  const res = await apiClient.get<CallContextResponse>(base());
  return res.data;
};

/**
 * Replace the stored list. The response is the canonical result — blank rows
 * and duplicate keys come back cleaned, custom rows come back with the key the
 * server derived — so the caller should render what it returns, not what it
 * sent.
 */
export const putCallContext = async (
  fields: CallContextField[],
): Promise<CallContextResponse> => {
  const res = await apiClient.put<CallContextResponse>(base(), { fields });
  return res.data;
};
