import { memberDisplayName, userSecretDisplayValue } from '../../src/utils/userSecret';
import type { HouseholdMember } from '../../src/api/householdApi';

const members: HouseholdMember[] = [
  { user_id: 7, username: 'alex', email: 'alex@example.com', role: 'admin' },
  { user_id: 8, username: '', email: 'sam@example.com', role: 'member' },
];

describe('memberDisplayName', () => {
  it('prefers the username', () => {
    expect(memberDisplayName(members[0])).toBe('alex');
  });

  it('falls back to email when username is empty', () => {
    expect(memberDisplayName(members[1])).toBe('sam@example.com');
  });
});

describe('userSecretDisplayValue', () => {
  it('maps a stored user id to the member display name', () => {
    expect(userSecretDisplayValue('7', members)).toBe('alex');
    expect(userSecretDisplayValue('8', members)).toBe('sam@example.com');
  });

  it('falls back to "User {id}" when the id matches no member', () => {
    expect(userSecretDisplayValue('99', members)).toBe('User 99');
  });

  it('falls back to "User {id}" when members are unavailable', () => {
    expect(userSecretDisplayValue('7', null)).toBe('User 7');
    expect(userSecretDisplayValue('7', undefined)).toBe('User 7');
    expect(userSecretDisplayValue('7', [])).toBe('User 7');
  });
});
