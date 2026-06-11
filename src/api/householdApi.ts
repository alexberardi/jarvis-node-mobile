import authApi from './authApi';

export interface HouseholdMember {
  user_id: number;
  username: string;
  email: string;
  role: string;
}

/**
 * List the members of a household (jarvis-auth). Used to populate
 * "user"-type secret pickers and to resolve stored user-id secret
 * values back to display names.
 */
export const listHouseholdMembers = async (
  householdId: string,
  accessToken: string,
): Promise<HouseholdMember[]> => {
  const res = await authApi.get<HouseholdMember[]>(
    `/households/${householdId}/members`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  return res.data;
};
