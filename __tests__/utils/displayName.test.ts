import { displayNameOf, displayNameOnly, secondaryNameLine } from '../../src/utils/displayName';

const base = { username: 'jordan', email: 'jordan@example.com' };

describe('displayNameOf', () => {
  it('prefers the display name', () => {
    expect(displayNameOf({ ...base, display_name: 'Jordan Avery' })).toBe('Jordan Avery');
  });

  it('trims the display name', () => {
    expect(displayNameOf({ ...base, display_name: '  Jordan  ' })).toBe('Jordan');
  });

  it.each([
    ['missing (older servers)', undefined],
    ['null', null],
    ['blank', '   '],
  ])('falls back to the username when display_name is %s', (_label, display_name) => {
    expect(displayNameOf({ ...base, display_name })).toBe('jordan');
  });

  it('falls back to email, then empty', () => {
    expect(displayNameOf({ email: 'x@example.com' })).toBe('x@example.com');
    expect(displayNameOf(null)).toBe('');
  });
});

describe('displayNameOnly', () => {
  it('is null unless a non-blank name is set', () => {
    expect(displayNameOnly({ ...base, display_name: 'J' })).toBe('J');
    expect(displayNameOnly({ ...base, display_name: '' })).toBeNull();
    expect(displayNameOnly(base)).toBeNull();
    expect(displayNameOnly(undefined)).toBeNull();
  });
});

describe('secondaryNameLine', () => {
  it('shows username and email under a display name', () => {
    expect(secondaryNameLine({ ...base, display_name: 'Jordan' })).toBe(
      'jordan · jordan@example.com',
    );
  });

  it('shows only the email when the username is already the title', () => {
    expect(secondaryNameLine(base)).toBe('jordan@example.com');
  });

  it('is empty when the email is already the title', () => {
    expect(secondaryNameLine({ email: 'x@example.com' })).toBe('');
    expect(secondaryNameLine(null)).toBe('');
  });
});
