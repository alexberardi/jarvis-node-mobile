import type { PhoneContact } from '../../src/api/phoneContactsApi';
import {
  formatPhoneNumber,
  sortContacts,
  sourceIcon,
  sourceLabel,
  validateContactDraft,
} from '../../src/utils/phoneContacts';

const contact = (over: Partial<PhoneContact>): PhoneContact => ({
  id: 'c1',
  name: 'Business',
  number: '+15551234567',
  address: null,
  source: 'manual',
  line_type: null,
  do_not_call: false,
  notes: null,
  verified_at: null,
  created_at: '2026-07-20T00:00:00Z',
  ...over,
});

describe('formatPhoneNumber', () => {
  it('formats an E.164 US number', () => {
    expect(formatPhoneNumber('+15551234567')).toBe('(555) 123-4567');
  });

  it('formats a bare 10-digit number', () => {
    expect(formatPhoneNumber('5551234567')).toBe('(555) 123-4567');
  });

  it('leaves non-NANP numbers untouched rather than mangling them', () => {
    expect(formatPhoneNumber('+442071234567')).toBe('+442071234567');
  });

  it('handles empty input', () => {
    expect(formatPhoneNumber('')).toBe('');
  });
});

describe('sourceLabel / sourceIcon', () => {
  it.each([
    ['call', 'saved from a call'],
    ['web', 'found by search'],
    ['manual', 'added by you'],
  ])('labels %s', (source, expected) => {
    expect(sourceLabel(source)).toBe(expected);
  });

  it('falls back gracefully on an unknown source', () => {
    expect(sourceLabel('imported')).toBe('imported');
  });

  it('gives each source a distinct icon', () => {
    const icons = new Set([sourceIcon('call'), sourceIcon('web'), sourceIcon('manual')]);
    expect(icons.size).toBe(3);
  });
});

describe('sortContacts', () => {
  it('sorts by name, case-insensitively, without mutating the input', () => {
    const input = [
      contact({ id: 'b', name: 'zebra grill' }),
      contact({ id: 'a', name: 'Apple Dental' }),
    ];
    const sorted = sortContacts(input);
    expect(sorted.map((c) => c.id)).toEqual(['a', 'b']);
    expect(input[0].id).toBe('b'); // original untouched
  });
});

describe('validateContactDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateContactDraft({ name: 'Tony', number: '+15551234567' })).toEqual({});
  });

  it('flags missing name and number', () => {
    expect(validateContactDraft({ name: '  ', number: '' })).toEqual({
      name: 'Name is required',
      number: 'Phone number is required',
    });
  });

  it('does not second-guess the server on number shape', () => {
    // Server owns E.164 / emergency / premium-rate rules; duplicating them
    // here would drift. Anything non-empty passes the client check.
    expect(validateContactDraft({ name: 'X', number: '911' })).toEqual({});
  });
});
