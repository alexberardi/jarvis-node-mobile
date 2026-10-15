/**
 * Shared hook for requesting, polling, and decrypting a node's settings snapshot.
 *
 * Replaces the duplicated polling pattern in NodeSettingsScreen and RoutineEditScreen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { getNode, listNodes } from '../api/nodeApi';
import {
  requestSettingsSnapshot,
  pollSettingsResult,
  provisionK2ToNode,
} from '../api/nodeSettingsApi';
import { generateK2, hasK2, storeK2 } from '../services/k2Service';
import {
  decryptSettingsSnapshot,
  MissingK2KeyError,
  type SettingsSnapshot,
} from '../services/settingsDecryptService';

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30000;

export type SnapshotState =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'timeout'
  | 'error'
  | 'no_access'
  /** Neither this phone nor the node holds an encryption key (K2); see provisionKey. */
  | 'needs_k2';

export const NEEDS_K2_MESSAGE =
  "This device doesn't have an encryption key yet, so it can't share its commands or settings.";

interface UseSettingsSnapshotOptions {
  /** Specific node ID to fetch from. If omitted, uses the first available node. */
  nodeId?: string;
  /** Whether to include sensitive secret values. Default false. */
  includeValues?: boolean;
  /** Skip fetching until this is true. Default true. */
  enabled?: boolean;
}

interface UseSettingsSnapshotReturn {
  snapshot: SettingsSnapshot | null;
  state: SnapshotState;
  error: string | null;
  /** The node ID that was used for the snapshot. */
  resolvedNodeId: string | null;
  /** Re-fetch the snapshot. */
  refetch: () => void;
  /**
   * Set up an encryption key for the node (state 'needs_k2'), as Node Settings'
   * "Generate Encryption Key" does, then fetch the snapshot.
   */
  provisionKey: () => Promise<void>;
}

/**
 * True when neither this phone nor the node has K2. Such a node drops snapshot requests
 * (it has nothing to seal them with), so asking would only time out. A desktop computer
 * gets a new node id each time it signs in again and starts in this state. A node that
 * holds a key from another phone is still asked (it answers; decryption says no_access).
 */
async function keyMissingOnBothSides(nodeId: string): Promise<boolean> {
  if (await hasK2(nodeId)) return false;
  try {
    const node = await getNode(nodeId);
    return node.needs_k2 === true;
  } catch {
    return false; // can't tell: ask the node as before
  }
}

export function useSettingsSnapshot(
  opts: UseSettingsSnapshotOptions = {},
): UseSettingsSnapshotReturn {
  const { nodeId, includeValues = false, enabled = true } = opts;

  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [state, setState] = useState<SnapshotState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [resolvedNodeId, setResolvedNodeId] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const fetch = useCallback(async () => {
    cleanup();
    setState('loading');
    setError(null);

    try {
      // Resolve node ID
      let targetNodeId = nodeId;
      if (!targetNodeId) {
        const nodes = await listNodes();
        if (nodes.length === 0) {
          setState('loaded');
          return;
        }
        targetNodeId = nodes[0].node_id;
      }

      if (!mountedRef.current) return;
      setResolvedNodeId(targetNodeId);

      if (await keyMissingOnBothSides(targetNodeId)) {
        if (mountedRef.current) {
          setError(NEEDS_K2_MESSAGE);
          setState('needs_k2');
        }
        return;
      }

      // Request snapshot
      const { request_id } = await requestSettingsSnapshot(targetNodeId, includeValues);
      const startTime = Date.now();

      // Poll for result
      const poll = async () => {
        if (!mountedRef.current) return;

        if (Date.now() - startTime > POLL_TIMEOUT_MS) {
          console.error('[useSettingsSnapshot] Poll timed out for node', targetNodeId);
          setState('timeout');
          setError('Node did not respond in time. Is it online?');
          return;
        }

        try {
          const result = await pollSettingsResult(targetNodeId!, request_id);

          if (result.status === 'fulfilled' && result.snapshot) {
            try {
              const decrypted = await decryptSettingsSnapshot(
                targetNodeId!,
                result.snapshot.ciphertext,
                result.snapshot.nonce,
                result.snapshot.tag,
              );
              if (mountedRef.current) {
                setSnapshot(decrypted);
                setState('loaded');
              }
            } catch (decryptErr) {
              if (decryptErr instanceof MissingK2KeyError) {
                // Expected when this device didn't provision the node
                // (e.g., node set up on the user's phone, viewed on a
                // simulator or second device). Not an error — just no
                // access. Use debug log so it doesn't surface in LogBox.
                console.debug(
                  '[useSettingsSnapshot] No K2 key on this device for node',
                  decryptErr.nodeId,
                );
                if (mountedRef.current) {
                  setError(
                    'This node was set up on another device. Open the app on that device to view or change its settings.',
                  );
                  setState('no_access');
                }
                return;
              }
              console.error('[useSettingsSnapshot] Decryption failed', decryptErr);
              if (mountedRef.current) {
                setError(
                  'Failed to decrypt settings: ' +
                    (decryptErr instanceof Error ? decryptErr.message : String(decryptErr)),
                );
                setState('error');
              }
            }
            return;
          }

          // Still pending — poll again
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        } catch {
          // Treat as pending (some axios configs throw on 202)
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      await poll();
    } catch (err) {
      console.error('[useSettingsSnapshot] Request failed', err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to request settings');
        setState('error');
      }
    }
  }, [nodeId, includeValues, cleanup]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      fetch();
    }
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [enabled, fetch, cleanup]);

  const provisionKey = useCallback(async () => {
    const target = resolvedNodeId ?? nodeId;
    if (!target) return;
    setState('loading');
    setError(null);
    try {
      const pair = await generateK2(target);
      await provisionK2ToNode(target, pair.k2, pair.kid, pair.createdAt);
      await storeK2(pair); // only once the node has acknowledged it
    } catch (err) {
      console.error('[useSettingsSnapshot] Key setup failed', err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to set up the encryption key');
        setState('error');
      }
      return;
    }
    if (mountedRef.current) await fetch();
  }, [resolvedNodeId, nodeId, fetch]);

  return { snapshot, state, error, resolvedNodeId, refetch: fetch, provisionKey };
}
