import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getNodeTask,
  isTerminalState,
  listNodeTasks,
  NodeTask,
  requestNodeUpdate,
} from '../api/nodeUpdateApi';

type TriggerFn = (targetVersion?: string | null) => Promise<NodeTask>;

interface UseNodeUpdate {
  task: NodeTask | null;
  error: string | null;
  /** True while the trigger() call is in flight. */
  loading: boolean;
  /** True while we check the server for an in-flight task on mount. */
  rehydrating: boolean;
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
  const [rehydrating, setRehydrating] = useState(true);
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

  // On mount (or nodeId change) check the server for an already-running
  // update task. If one exists, seed state from it and resume polling so
  // navigating away + back doesn't lose progress or show the Update button
  // for an install that's still in flight.
  useEffect(() => {
    let cancelled = false;
    setRehydrating(true);
    listNodeTasks(nodeId, 5)
      .then((tasks) => {
        if (cancelled) return;
        const active = tasks.find(
          (t) => t.kind === 'update' && !isTerminalState(t.state),
        );
        if (active) {
          setTask(active);
          pollRef.current = setTimeout(() => pollTask(active.id), ACTIVE_POLL_MS);
        }
      })
      .catch(() => {
        // Non-fatal — just means the user has to tap Update if there
        // wasn't an in-flight task they missed.
      })
      .finally(() => {
        if (!cancelled) setRehydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId, pollTask]);

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
        const status = (e as { response?: { status?: number } })?.response?.status;
        const detail =
          (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;

        // 409 means an update is already queued/in-progress. The detail is an
        // object {message, task_id, state} — re-attach to the existing task and
        // poll it so the UI shows live progress instead of an error.
        if (
          status === 409 &&
          detail &&
          typeof detail === 'object' &&
          'task_id' in (detail as Record<string, unknown>)
        ) {
          const taskId = String((detail as { task_id: unknown }).task_id);
          try {
            const existing = await getNodeTask(taskId);
            setTask(existing);
            if (!isTerminalState(existing.state)) {
              pollRef.current = setTimeout(
                () => pollTask(existing.id),
                ACTIVE_POLL_MS,
              );
            }
            return existing;
          } catch (fetchErr) {
            const msg =
              fetchErr instanceof Error
                ? fetchErr.message
                : 'Update is in progress but status is unavailable';
            setError(msg);
            throw new Error(msg);
          }
        }

        const detailMsg =
          detail && typeof detail === 'object' && 'message' in (detail as Record<string, unknown>)
            ? String((detail as { message: unknown }).message)
            : typeof detail === 'string'
            ? detail
            : null;
        const fallback = e instanceof Error ? e.message : 'Update request failed';
        const final = detailMsg ?? fallback;
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

  return { task, error, loading, rehydrating, trigger, reset };
};
