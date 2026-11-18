import { compareSemver, isUpdateAvailable } from './semver';

/** Where a package stands on one node. */
export type NodePackageState = 'installed' | 'update' | 'install' | 'locked';

/**
 * A node's state for a package: its installed version ('unknown' when only its tools show it,
 * null when absent) against the store's latest, and why it can't take this store's copy.
 */
export const nodePackageState = (
  version: string | null | undefined,
  latest: string,
  lockReason?: string | null,
): NodePackageState => {
  if (lockReason) return 'locked';
  if (version == null) return 'install';
  if (version === 'unknown') return 'update';
  return compareSemver(version, latest) >= 0 ? 'installed' : 'update';
};

/** Whether a package manifest declares secrets or a sign-in anywhere (a component's or its own). */
export const manifestNeedsSetup = (manifest: unknown): boolean => {
  if (!manifest || typeof manifest !== 'object') return false;
  if (Array.isArray(manifest)) return manifest.some(manifestNeedsSetup);
  return Object.entries(manifest as Record<string, unknown>).some(([key, value]) =>
    (key === 'secrets' && Array.isArray(value) && value.length > 0) ||
    (key === 'authentication' && !!value) ||
    (typeof value === 'object' && manifestNeedsSetup(value)),
  );
};

/** Any node behind the latest version. */
export const anyUpdate = (versions: (string | null | undefined)[], latest: string): boolean =>
  versions.some((v) => v != null && v !== 'unknown' && isUpdateAvailable(v, latest));

const names = (list: string[]): string =>
  list.length <= 2 ? list.join(' and ') : `${list.length} nodes`;

/** The install button for the ticked nodes: "Install on Living room · Update Office". */
export const installLabel = (installs: string[], updates: string[]): string => {
  if (installs.length === 0 && updates.length === 0) return 'Choose nodes';
  const parts = [
    installs.length ? `Install on ${names(installs)}` : null,
    updates.length ? `Update ${names(updates)}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
};
