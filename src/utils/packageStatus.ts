/**
 * Pure helpers for the package install/health UI — status mapping for the
 * install-progress flow, badge selection for node settings cards, and
 * revert-target/health aggregation for the store detail screen. Kept free
 * of React so they're trivially unit-testable.
 */
import type { InstalledPackage } from '../api/chatApi';
import type { InstallStatusValue } from '../types/Package';
import { compareSemver } from './semver';

/** States that stop the install-progress polling loop. `restarting` is
 * deliberately NOT terminal — the node posts the real result post-boot. */
export const TERMINAL_INSTALL_STATES: ReadonlySet<InstallStatusValue> = new Set([
  'completed',
  'failed',
  'expired',
]);

export const isTerminalInstallStatus = (status: InstallStatusValue): boolean =>
  TERMINAL_INSTALL_STATES.has(status);

/** Row label for an install-progress card. */
export const installStatusLabel = (
  status: InstallStatusValue,
  pollError: boolean,
  errorMessage?: string | null,
): string => {
  switch (status) {
    case 'pending':
      return pollError ? 'Status unknown' : 'Installing...';
    case 'restarting':
      return pollError ? 'Status unknown' : 'Restarting node…';
    case 'completed':
      return 'Installed successfully';
    case 'failed':
      return errorMessage || 'Installation failed';
    case 'expired':
      return 'Request timed out — node may be offline';
  }
};

export interface ConfigErrorBadge {
  label: string;
  /** True when the package failed to import at boot (`import_failed:` tag
   * from the node) rather than a field-level snapshot failure. Same red
   * badge, clearer label. */
  importFailed: boolean;
}

/** Pick the red-badge label for an entry's `_errors` tags from the node. */
export const configErrorBadge = (errors?: string[]): ConfigErrorBadge | null => {
  if (!errors || errors.length === 0) return null;
  if (errors.some((e) => e.startsWith('import_failed:'))) {
    return { label: 'Failed to load', importFailed: true };
  }
  const shown = errors.slice(0, 3).join(', ');
  const overflow = errors.length > 3 ? '…' : '';
  return { label: `Configuration error: ${shown}${overflow}`, importFailed: false };
};

/** Amber badge label for an agent the node listed as unconfigured. */
export const needsSetupLabel = (missingSecrets?: string[]): string => {
  if (!missingSecrets || missingSecrets.length === 0) return 'Needs setup';
  return `Needs setup — missing ${missingSecrets.join(', ')}`;
};

export interface RevertTarget {
  nodeIds: string[];
  previousVersion: string;
}

/** Nodes whose installed_packages entry carries a previous_version (i.e. the
 * node kept a `.previous` rollback snapshot). When nodes disagree mid-rollout,
 * label the action with the newest previous version. */
export const getRevertTarget = (
  packagesByNode: Record<string, InstalledPackage | null | undefined>,
): RevertTarget | null => {
  const nodeIds: string[] = [];
  let previousVersion: string | null = null;
  for (const [nodeId, pkg] of Object.entries(packagesByNode)) {
    if (!pkg?.previous_version) continue;
    nodeIds.push(nodeId);
    if (!previousVersion || compareSemver(pkg.previous_version, previousVersion) > 0) {
      previousVersion = pkg.previous_version;
    }
  }
  return previousVersion ? { nodeIds, previousVersion } : null;
};

/** True when any node reports the package's components failed to load. */
export const anyHealthFailed = (
  packagesByNode: Record<string, InstalledPackage | null | undefined>,
): boolean => Object.values(packagesByNode).some((pkg) => pkg?.health === 'failed');
