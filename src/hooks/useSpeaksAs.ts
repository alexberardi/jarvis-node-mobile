import { useEffect, useState } from 'react';

import { listHouseholdMembers, type HouseholdMember } from '../api/householdApi';
import { useAuth } from '../auth/AuthContext';
import { isDesktopAgent, type SignOutNodeFields } from '../utils/nodeKind';
import { resolveSpeaksAs, type SpeaksAs } from '../utils/speaksAs';

/**
 * Who a desktop agent speaks as (its signed-in member), for the node detail. Looks the owner
 * up in the node's household members, so a name shows and an owner who left reads as signed
 * out. A Pi, or a list that can't be loaded for someone else's computer, gives "unknown" and
 * the line is left out rather than guessed.
 */
export const useSpeaksAs = (node: SignOutNodeFields | null): SpeaksAs => {
  const { state } = useAuth();
  const [members, setMembers] = useState<HouseholdMember[] | null>(null);
  const desktop = isDesktopAgent(node);
  const householdId = node?.household_id ?? null;
  const ownerId = node?.owner_user_id ?? null;
  const token = state.accessToken;

  useEffect(() => {
    setMembers(null);
    if (!desktop || !householdId || ownerId == null || !token) return;
    let cancelled = false;
    listHouseholdMembers(householdId, token)
      .then((list) => {
        if (!cancelled && Array.isArray(list)) setMembers(list);
      })
      .catch(() => {
        // Leave it unknown; the viewer-is-owner shortcut still names them.
      });
    return () => {
      cancelled = true;
    };
  }, [desktop, householdId, ownerId, token]);

  if (!desktop) return { kind: 'unknown' };
  return resolveSpeaksAs(ownerId, state.user, members);
};
