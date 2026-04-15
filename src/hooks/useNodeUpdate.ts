import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getNodeTask,
  isTerminalState,
  NodeTask,
  requestNodeUpdate,
} from '../api/nodeUpdateApi';

type TriggerFn = (targetVersion?: string | null) => Promise<NodeTask>;

interface UseNodeUpdate {
  task: NodeTask | null;
  error: string | null;
  loading: boolean;
  /** Queue an update on the CC. The polling effect takes over from there. */
  trigger: TriggerFn;
  /** Drop the local reference to a completed task (so the UI resets). */
  reset: () => void;
}

const ACTIVE_POLL_MS = 4000;

export const useNodeUpdate = (nodeId: string): UseNodeUpdate => {
  const [task, setTask] = useState<NodeTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollTask = useCallback(
    async (taskId: string) => {
      try {
        const fresh = await getNodeTask(taskId);
        setTask(fresh);
        if (!isTerminalState(fresh.state)) {
          pollRef.current = setTimeout(() => pollTask(taskId), ACTIVE_POLL_MS);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not fetch task status');
      }
    },
    [],
  );

  const trigger: TriggerFn = useCallback(
    async (targetVersion = null) => {
      setLoading(true);
      setError(null);
      try {
        const created = await requestNodeUpdate(nodeId, targetVersion ?? null);
        setTask(created);
        if (!isTerminalState(created.state)) {
          pollRef.current = setTimeout(() => pollTask(created.id), ACTIVE_POLL_MS);
        }
        return created;
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
        const fallback = e instanceof Error ? e.message : 'Update request failed';
        const final = typeof msg === 'string' ? msg : fallback;
        setError(final);
        throw new Error(final);
      } finally {
        setLoading(false);
      }
    },
    [nodeId, pollTask],
  );

  const reset = useCallback(() => {
    stopPolling();
    setTask(null);
    setError(null);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { task, error, loading, trigger, reset };
};
