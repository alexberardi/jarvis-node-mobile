import type { HouseholdMember } from '../api/householdApi';

/** Display name for a household member — username preferred, email fallback. */
export function memberDisplayName(member: HouseholdMember): string {
  return member.username || member.email;
}

/**
 * Resolve a stored "user"-type secret value (a user id as a string) to the
 * matching household member's display name. Falls back to "User {id}" when
 * the id doesn't match any member (e.g. the member left the household or
 * the members list couldn't be loaded).
 */
export function userSecretDisplayValue(
  value: string,
  members: HouseholdMember[] | null | undefined,
): string {
  const member = members?.find((m) => String(m.user_id) === value);
  return member ? memberDisplayName(member) : `User ${value}`;
}
