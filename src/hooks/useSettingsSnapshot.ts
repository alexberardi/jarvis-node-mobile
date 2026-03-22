/**
 * Shared hook for requesting, polling, and decrypting a node's settings snapshot.
 *
 * Replaces the duplicated polling pattern in NodeSettingsScreen and RoutineEditScreen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { listNodes } from '../api/nodeApi';
import {
  requestSettingsSnapshot,
  pollSettingsResult,
} from '../api/nodeSettingsApi';
import {
  decryptSettingsSnapshot,
  type SettingsSnapshot,
} from '../services/settingsDecryptService';

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30000;

export type SnapshotState = 'idle' | 'loading' | 'loaded' | 'timeout' | 'error';

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

  return { snapshot, state, error, resolvedNodeId, refetch: fetch };
}
