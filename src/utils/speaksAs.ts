import { displayNameOnly } from './displayName';

/**
 * Who a desktop agent speaks as. Its voice turns act as the member signed in on it
 * (jarvis-server cc device_owner.go): the node's `owner_user_id`, while that member is still
 * in the node's household. No owner, or an owner who has left, means nobody is signed in, and
 * the computer asks to be signed in again.
 */
export type SpeaksAs = { kind: 'owner'; name: string } | { kind: 'signedOut' } | { kind: 'unknown' };

export interface OwnerCandidate {
  user_id: number;
  username?: string | null;
  display_name?: string | null;
}

export interface Viewer {
  id: number;
  username?: string | null;
  display_name?: string | null;
  email?: string | null;
}

const nameOf = (u: { username?: string | null; display_name?: string | null }): string =>
  displayNameOnly(u) || u.username || 'a household member';

/**
 * @param members the node's household members, or null while unknown (loading or failed).
 *   Only with the list can an owner who left be told apart, so it wins when present.
 */
export const resolveSpeaksAs = (
  ownerUserId: number | null | undefined,
  viewer: Viewer | null | undefined,
  members: OwnerCandidate[] | null,
): SpeaksAs => {
  if (ownerUserId == null || ownerUserId <= 0) return { kind: 'signedOut' };
  if (members) {
    const owner = members.find((m) => m.user_id === ownerUserId);
    return owner ? { kind: 'owner', name: nameOf(owner) } : { kind: 'signedOut' };
  }
  if (viewer && viewer.id === ownerUserId) return { kind: 'owner', name: nameOf(viewer) };
  return { kind: 'unknown' };
};

/** The line on the node detail, or null to show nothing (still unknown). */
export const speaksAsLabel = (s: SpeaksAs): string | null => {
  switch (s.kind) {
    case 'owner':
      return `Speaks as ${s.name}`;
    case 'signedOut':
      return 'Not signed in: sign in on the computer';
    default:
      return null;
  }
};
