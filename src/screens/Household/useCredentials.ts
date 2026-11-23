import { useQueries, useQuery } from '@tanstack/react-query';

import { listNodes, type NodeInfo } from '../../api/nodeApi';
import { useAuth } from '../../auth/AuthContext';
import { hasK2 } from '../../services/k2Service';
import { fetchSettingsSnapshot } from '../../services/settingsSnapshotFetch';
import type { SettingsSnapshot } from '../../services/settingsDecryptService';
import { collectCredentials, type Credential } from '../../utils/credentials';
import { nodeDisplayName } from '../../utils/nodeKind';

export class NoKeyError extends Error {}

export type NodeReadState = 'checking' | 'loaded' | 'no_key' | 'error';

export interface NodeRead {
  node: NodeInfo;
  name: string;
  state: NodeReadState;
  error?: string;
}

export const snapshotQueryKey = (nodeId: string) => ['settingsSnapshot', nodeId];

/**
 * Credentials across the household's nodes (or one node): each node this phone holds a key
 * for is asked for its settings, and the answers are merged by service. Nodes answer in their
 * own time, so the list fills in; refetches keep the previous answer on screen.
 */
export function useCredentials(onlyNodeId?: string) {
  const { state: authState } = useAuth();
  const householdId = authState.activeHouseholdId;
  const nodesQuery = useQuery({
    queryKey: ['nodes', householdId],
    queryFn: () => listNodes(householdId ?? undefined),
    enabled: !!householdId,
  });
  const nodes = (nodesQuery.data ?? []).filter((n) => !onlyNodeId || n.node_id === onlyNodeId);
  const snapshots = useQueries({
    queries: nodes.map((n) => ({
      queryKey: snapshotQueryKey(n.node_id),
      queryFn: async (): Promise<SettingsSnapshot> => {
        if (!(await hasK2(n.node_id))) throw new NoKeyError('This phone has no key for it');
        return fetchSettingsSnapshot(n.node_id);
      },
      staleTime: 60_000,
      retry: 0,
    })),
  });

  const reads: NodeRead[] = nodes.map((n, i) => {
    const q = snapshots[i];
    const name = nodeDisplayName(n, n.node_id.slice(0, 8));
    if (q.data) return { node: n, name, state: 'loaded' };
    if (q.error instanceof NoKeyError) return { node: n, name, state: 'no_key' };
    if (q.error) return { node: n, name, state: 'error', error: q.error instanceof Error ? q.error.message : 'Failed' };
    return { node: n, name, state: 'checking' };
  });

  // Cheap to rebuild: a few nodes' worth of settings.
  const credentials: Credential[] = collectCredentials(
    nodes.flatMap((n, i) => (snapshots[i].data ? [{ nodeId: n.node_id, snapshot: snapshots[i].data! }] : [])),
  );

  const nameOf = (nodeId: string) => reads.find((r) => r.node.node_id === nodeId)?.name ?? nodeId.slice(0, 8);
  return {
    householdId,
    reads,
    credentials,
    nameOf,
    nodesLoading: nodesQuery.isPending,
    refreshing: snapshots.some((q) => q.isFetching && !!q.data),
    refetchAll: () => {
      nodesQuery.refetch();
      snapshots.forEach((q) => q.refetch());
    },
  };
}

/** "Kitchen", "Kitchen and Office", "Kitchen, Office and Den". */
export const joinNames = (names: string[]): string =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
