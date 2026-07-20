/**
 * Phonebook — the businesses Jarvis is allowed to call (jarvis-command-center).
 *
 * Household-scoped and authorized by the caller's membership, same as
 * `householdSettingsApi`. Entries arrive three ways, recorded in `source`:
 * saved automatically after a successful call, found by web search during
 * call planning, or added by hand here. The JWT is attached automatically by
 * apiClient — never call these endpoints with raw fetch/axios.
 */
import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

/** How a contact got into the phonebook. */
export type PhoneContactSource = 'manual' | 'call' | 'web';

export interface PhoneContact {
  id: string;
  name: string;
  number: string;
  address: string | null;
  source: PhoneContactSource;
  line_type: string | null;
  /** When true, Jarvis refuses to call this business. */
  do_not_call: boolean;
  notes: string | null;
  verified_at: string | null;
  created_at: string;
}

export interface PhoneContactCreatePayload {
  name: string;
  number: string;
  address?: string;
  notes?: string;
}

export interface PhoneContactUpdatePayload {
  name?: string;
  number?: string;
  address?: string;
  notes?: string;
  do_not_call?: boolean;
}

const base = (householdId: string): string => {
  const url = getCommandCenterUrl();
  if (!url) {
    throw new Error('Command center service not available');
  }
  return `${url}/api/v0/mobile/household/${householdId}/phone-contacts`;
};

export const listPhoneContacts = async (
  householdId: string,
): Promise<PhoneContact[]> => {
  const res = await apiClient.get<{ contacts: PhoneContact[] }>(base(householdId));
  return res.data?.contacts ?? [];
};

export const createPhoneContact = async (
  householdId: string,
  payload: PhoneContactCreatePayload,
): Promise<PhoneContact> => {
  const res = await apiClient.post<PhoneContact>(base(householdId), payload);
  return res.data;
};

export const updatePhoneContact = async (
  householdId: string,
  contactId: string,
  payload: PhoneContactUpdatePayload,
): Promise<PhoneContact> => {
  const res = await apiClient.patch<PhoneContact>(
    `${base(householdId)}/${contactId}`,
    payload,
  );
  return res.data;
};

export const deletePhoneContact = async (
  householdId: string,
  contactId: string,
): Promise<void> => {
  await apiClient.delete(`${base(householdId)}/${contactId}`);
};

/**
 * The server's own message for a rejected save, tagged with the field it
 * belongs to, or null when the failure wasn't the user's to fix.
 *
 * These are the errors the user can actually correct from the form, so they
 * belong inline on the offending field rather than in a generic banner:
 *   400 → an invalid phone number (or a name with no alphanumerics)
 *   409 → a duplicate business name (create) or a rename collision (patch)
 */
export type FieldRejection = { field: 'number' | 'name'; message: string };

export const fieldRejection = (error: unknown): FieldRejection | null => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 409) {
    return {
      field: 'name',
      message:
        serverMessage(error) ?? 'You already have a business with that name.',
    };
  }
  const message = numberRejectionMessage(error);
  return message ? { field: 'number', message } : null;
};

/** Raw server message from an error body, if it carries one. */
const serverMessage = (error: unknown): string | null => {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  const detail = (data as { detail?: unknown })?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  const message = (data as { message?: unknown })?.message;
  if (typeof message === 'string' && message.trim()) return message;
  return null;
};

/**
 * The server's own validation message for a rejected number, or null when
 * the failure wasn't a 400.
 *
 * A bad number is the one error the user can actually fix from the form, so
 * it belongs inline on the field rather than in a generic error banner.
 */
export const numberRejectionMessage = (error: unknown): string | null => {
  const response = (error as { response?: { status?: number; data?: unknown } })
    ?.response;
  if (response?.status !== 400) return null;
  const data = response.data as
    | { detail?: unknown; message?: unknown }
    | string
    | undefined;
  if (typeof data === 'string' && data.trim()) return data;
  const detail = (data as { detail?: unknown })?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  // FastAPI validation errors arrive as [{msg, loc}, …].
  if (Array.isArray(detail)) {
    const msg = detail
      .map((d) => (d as { msg?: unknown })?.msg)
      .find((m) => typeof m === 'string' && m.trim());
    if (typeof msg === 'string') return msg;
  }
  const message = (data as { message?: unknown })?.message;
  if (typeof message === 'string' && message.trim()) return message;
  return 'That phone number looks invalid.';
};
