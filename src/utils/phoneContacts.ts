/**
 * Display helpers for the phonebook (businesses Jarvis can call).
 *
 * Formatting is presentation-only — the stored value is always what the
 * server accepted (E.164), and that's what gets dialed.
 */
import type { PhoneContact, PhoneContactSource } from '../api/phoneContactsApi';

/**
 * '+15551234567' → '(555) 123-4567'.
 *
 * Only US/NANP numbers get prettified; anything else is returned untouched
 * rather than mangled into a shape it doesn't have.
 */
export const formatPhoneNumber = (raw: string): string => {
  const value = (raw ?? '').trim();
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  const national =
    digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) return value;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
};

/** Short badge text explaining how a contact got into the phonebook. */
export const sourceLabel = (source: PhoneContactSource | string): string => {
  switch (source) {
    case 'call':
      return 'saved from a call';
    case 'web':
      return 'found by search';
    case 'manual':
      return 'added by you';
    default:
      return String(source || 'saved');
  }
};

/** Icon for the source badge, matching the repo's MaterialCommunityIcons set. */
export const sourceIcon = (source: PhoneContactSource | string): string => {
  switch (source) {
    case 'call':
      return 'phone-check';
    case 'web':
      return 'magnify';
    default:
      return 'account-edit';
  }
};

/** Case-insensitive name sort, so the list order is stable and predictable. */
export const sortContacts = (contacts: PhoneContact[]): PhoneContact[] =>
  [...contacts].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }),
  );

/**
 * Client-side check for the required fields.
 *
 * Deliberately shallow: the server owns real number validation (E.164
 * normalization, emergency/short-code/premium denial), and duplicating those
 * rules here would guarantee drift. This only catches empty submissions.
 */
export const validateContactDraft = (draft: {
  name: string;
  number: string;
}): { name?: string; number?: string } => {
  const errors: { name?: string; number?: string } = {};
  if (!draft.name.trim()) errors.name = 'Name is required';
  if (!draft.number.trim()) errors.number = 'Phone number is required';
  return errors;
};
