import { useEffect, useRef, useState } from 'react';

import { listNodes } from '../api/nodeApi';
import type { NodeKindFields } from '../utils/nodeKind';

export type NodeKindMap = Record<string, NodeKindFields>;

/**
 * Kind fields (node_kind, install_mode) for nodes listed by an API that
 * doesn't carry them — the chat node selector's smart-home config and the
 * command-data node list. Looked up from the household's node list, again
 * only when an id shows up that it hasn't seen. Best effort: on a failure
 * the map stays as it is and those nodes show the Raspberry Pi icon.
 */
export const useNodeKinds = (
  householdId: string | null | undefined,
  nodeIds: string[],
): NodeKindMap => {
  const [kinds, setKinds] = useState<NodeKindMap>({});
  const kindsRef = useRef(kinds);
  kindsRef.current = kinds;
  const key = [...nodeIds].sort().join(',');

  useEffect(() => {
    if (!key) return;
    const ids = key.split(',');
    if (ids.every((id) => id in kindsRef.current)) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => listNodes(householdId ?? undefined))
      .then((nodes) => {
        if (cancelled || !Array.isArray(nodes)) return;
        const next: NodeKindMap = {};
        for (const n of nodes) {
          next[n.node_id] = { node_kind: n.node_kind, install_mode: n.install_mode };
        }
        setKinds(next);
      })
      .catch(() => {
        // Keep what we have — unknown nodes fall back to the Pi icon.
      });
    return () => {
      cancelled = true;
    };
  }, [householdId, key]);

  return kinds;
};
