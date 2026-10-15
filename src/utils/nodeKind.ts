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

export interface NodeNameFields extends NodeKindFields {
  node_id: string;
  room?: string | null;
  /**
   * The node's registered name (jarvisd 2026-10-15): a desktop agent's
   * computer name. Null when registered without one; missing on older servers.
   */
  name?: string | null;
}

/**
 * The label for a node in lists and pickers. Every desktop agent's room is
 * "desktop", so a computer is named by its registered name, then its room,
 * then `fallback` (the short node id by default). A Pi keeps its room label
 * even when it has a name (jarvis-server
 * docs/decisions/2026-10-15-computers-labelled-by-name.md; the admin web app's
 * `nodeLabel` follows the same rule).
 */
export const nodeDisplayName = (node: NodeNameFields, fallback?: string): string => {
  const name = isDesktopAgent(node) ? node.name?.trim() : '';
  if (name) return name;
  const room = node.room?.trim();
  if (room) return room;
  return fallback ?? node.node_id.slice(0, 8);
};

/**
 * A node from an API that doesn't carry kind or name (the command-data node
 * list, older servers' smart-home options), filled in from the household node
 * list's entry (`useNodeKinds`). Fields the node has (null included) win.
 */
export const withKnownKind = <T extends NodeNameFields>(
  node: T,
  known: (NodeKindFields & { name?: string | null }) | null | undefined,
): T => ({
  ...node,
  node_kind: node.node_kind !== undefined ? node.node_kind : known?.node_kind,
  install_mode: node.install_mode !== undefined ? node.install_mode : known?.install_mode,
  name: node.name !== undefined ? node.name : known?.name,
});

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

/** The parts of a Pantry manifest that decide whether a computer can run it. */
export interface ComputerManifestFields {
  targets?: unknown;
  apt_packages?: unknown;
  apt_sources?: unknown;
  post_install?: unknown;
}

const nonEmpty = (v: unknown): boolean => Array.isArray(v) && v.length > 0;

/**
 * Whether a desktop agent can run a package — the rule jarvisd (`piOnlyReason`)
 * and the agent (`Manifest.CheckDesktop`) apply: `targets` that leave out
 * `desktop`, or Pi system setup (apt packages, apt sources, post-install
 * steps), mean Pi only. A package that declares no targets runs on a computer
 * (jarvis-server decision 2026-10-15-store-hides-pi-only-packages).
 */
export const computerCanRun = (manifest: ComputerManifestFields | null | undefined): boolean => {
  if (!manifest) return true;
  const { targets } = manifest;
  if (Array.isArray(targets) && targets.length > 0 && !targets.includes('desktop')) return false;
  return !(nonEmpty(manifest.apt_packages) || nonEmpty(manifest.apt_sources) || nonEmpty(manifest.post_install));
};

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
