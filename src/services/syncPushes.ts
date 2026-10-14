/**
 * The `settings:secrets` pushes for "Sync to other nodes".
 *
 * A node files a push that carries `__user_id__` entirely as that user's
 * personal secrets, and a push without it under each key's existing scope
 * (else "integration"): the Python node's `_dispatch_secrets`
 * (jarvis-node-setup services/config_push_service.py) and the desktop agent's
 * `applySecrets` (jarvis-server internal/agent/nodesettings/handler.go) agree.
 * So shared and personal secrets go out as separate pushes; one push for both
 * would file the shared API keys as the user's.
 */

export interface SyncSecret {
  key: string;
  scope?: string;
}

export const buildSyncPushes = (
  secrets: SyncSecret[],
  values: Record<string, string>,
  userId: number | null | undefined,
): Record<string, string>[] => {
  const shared: Record<string, string> = {};
  const personal: Record<string, string> = {};
  for (const s of secrets) {
    const value = values[s.key];
    if (!value) continue;
    if (s.scope === 'user') personal[s.key] = value;
    else shared[s.key] = value;
  }
  const pushes: Record<string, string>[] = [];
  if (Object.keys(shared).length > 0) pushes.push(shared);
  // Without a user there is nobody to file personal secrets under; filing them
  // as shared would hand one member's credentials to everyone.
  if (Object.keys(personal).length > 0 && userId != null) {
    pushes.push({ ...personal, __user_id__: String(userId) });
  }
  return pushes;
};
