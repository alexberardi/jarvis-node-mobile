/**
 * Node kinds: a Raspberry Pi voice node or a desktop agent (the Jarvis
 * Automation agent on someone's computer).
 *
 * jarvisd reports `node_kind: "desktop"` from the agent's heartbeat; an agent
 * that hasn't sent one yet is still recognisable by `install_mode:
 * "desktop-agent"`. This is the same rule as cc's `nodeRow.desktop()`
 * (jarvis-server internal/modules/cc/signout.go).
 */

export interface NodeKindFields {
  node_kind?: string | null;
  install_mode?: string | null;
}

export const isDesktopAgent = (node: NodeKindFields | null | undefined): boolean =>
  !!node && (node.node_kind === 'desktop' || node.install_mode === 'desktop-agent');

/** MaterialCommunityIcons name for the node's kind. */
export const nodeKindIcon = (node: NodeKindFields | null | undefined): string =>
  isDesktopAgent(node) ? 'robot' : 'raspberry-pi';

/** Short name of the node's kind (accessibility labels). */
export const nodeKindLabel = (node: NodeKindFields | null | undefined): string =>
  isDesktopAgent(node) ? 'Computer' : 'Raspberry Pi';

/**
 * Pis first, computers after, each group in its original order. The primary
 * node finds smart-home devices and runs routines that have no node of their
 * own; a computer can't do the first and does the second only while it's on
 * (jarvis-server docs/decisions/2026-10-15-computer-as-primary-node.md). A node
 * whose kind is unknown sorts as a Pi.
 */
export const sortPisFirst = <T,>(
  nodes: readonly T[],
  kindOf: (node: T) => NodeKindFields | null | undefined,
): T[] => [
  ...nodes.filter((n) => !isDesktopAgent(kindOf(n))),
  ...nodes.filter((n) => isDesktopAgent(kindOf(n))),
];

export interface SignOutNodeFields extends NodeKindFields {
  household_id?: string | null;
  owner_user_id?: number | null;
}

export interface HouseholdRoleEntry {
  id: string;
  role: 'admin' | 'power_user' | 'member';
}

/**
 * Who may sign a desktop agent out — cc's `canSignOut`: the member who paired
 * it (`owner_user_id`) while still a member of its household, or an admin of
 * that household. A node without a household is the superuser's; the app
 * doesn't know about superusers, so it never offers it there.
 */
export const canSignOutDesktopAgent = (
  node: SignOutNodeFields,
  userId: number | null | undefined,
  households: HouseholdRoleEntry[],
): boolean => {
  if (userId == null || !node.household_id) return false;
  const membership = households.find((h) => h.id === node.household_id);
  if (!membership) return false;
  if (node.owner_user_id != null && node.owner_user_id === userId) return true;
  return membership.role === 'admin';
};
