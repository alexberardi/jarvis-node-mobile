import axios from 'axios';

import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';
import { getNodeTask, isTerminalState, type NodeTask } from './nodeUpdateApi';

export interface NodeInfo {
  node_id: string;
  room: string | null;
  user: string | null;
  voice_mode: string;
  adapter_hash: string | null;
  household_id: string | null;
  online: boolean;
  last_seen: string | null;
  // Heartbeat status fields (populated when backend supports enriched heartbeats)
  uptime_seconds: number | null;
  command_count: number | null;
  routine_count: number | null;
  python_version: string | null;
  platform: string | null;
  // Version info reported by the node (nullable for pre-upgrade nodes)
  last_seen_version: string | null;
  install_mode: string | null;
  git_sha: string | null;
  is_busy: boolean;
  // True when the node has no K2 secrets-encryption key yet — gates the
  // settings gear so the user can pair K2 even on a fresh device.
  needs_k2: boolean;
}

export const listNodes = async (householdId?: string): Promise<NodeInfo[]> => {
  const params = householdId ? `?household_id=${householdId}` : '';
  const res = await apiClient.get<NodeInfo[]>(
    `${getCommandCenterUrl()}/api/v0/admin/nodes${params}`,
    { timeout: 10000 },
  );
  return res.data;
};

export const getNode = async (nodeId: string): Promise<NodeInfo> => {
  const res = await apiClient.get<NodeInfo>(
    `${getCommandCenterUrl()}/api/v0/admin/nodes/${nodeId}`,
    { timeout: 10000 },
  );
  return res.data;
};

/**
 * Factory reset (the "Delete node" action) — jarvisd's tracked flow (D10).
 *
 * `POST /api/v0/admin/nodes/{id}/factory-reset` creates a persisted
 * `factory_reset` task (one in flight per node) and publishes the reset to the
 * node; the node reports progress against that task and, on success, is marked
 * inactive (dropped from the node list) and its auth revoked. The phone polls
 * the task with `GET /api/v0/tasks/{task_id}`. An offline node keeps the task
 * open (the reset token is persisted) and completes it when it reconnects;
 * jarvisd fails it after 7 days. See jarvis-server internal/modules/cc/reset.go.
 *
 * Replaces the old `DELETE /admin/nodes/{id}` + untracked verify-reset flow.
 */
export interface FactoryResetStart {
  taskId: string;
  /** True when a reset was already in flight and we resumed tracking it (409). */
  alreadyInFlight: boolean;
}

export const startFactoryReset = async (nodeId: string): Promise<FactoryResetStart> => {
  try {
    const res = await apiClient.post<{ task_id: string }>(
      `${getCommandCenterUrl()}/api/v0/admin/nodes/${nodeId}/factory-reset`,
    );
    return { taskId: res.data.task_id, alreadyInFlight: false };
  } catch (err) {
    // 409 {detail: {message, task_id, state}}: one is already in flight — track it.
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      const detail = (err.response.data as { detail?: { task_id?: unknown } } | undefined)?.detail;
      if (detail && typeof detail.task_id === 'string') {
        return { taskId: detail.task_id, alreadyInFlight: true };
      }
    }
    throw err;
  }
};

export interface WaitForFactoryResetOptions {
  /** Stop polling after this long and return the last state seen. */
  timeoutMs: number;
  intervalMs?: number;
  /** Called with every task state read. */
  onUpdate?: (task: NodeTask) => void;
  /** Return true to stop polling early (e.g. the screen unmounted). */
  isCancelled?: () => boolean;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Poll a factory-reset task until it reaches `success`/`failed` or the
 * deadline passes. Returns the last task read — still `pending`/`dispatched`
 * on a timeout, which means the node hasn't picked the reset up (usually
 * offline) — or null if no read ever succeeded. Transient read errors are
 * retried until the deadline.
 */
export const waitForFactoryReset = async (
  taskId: string,
  {
    timeoutMs,
    intervalMs = 2000,
    onUpdate,
    isCancelled = () => false,
    sleep = defaultSleep,
    now = Date.now,
  }: WaitForFactoryResetOptions,
): Promise<NodeTask | null> => {
  const deadline = now() + timeoutMs;
  let last: NodeTask | null = null;
  for (;;) {
    if (isCancelled()) return last;
    try {
      last = await getNodeTask(taskId);
      onUpdate?.(last);
      if (isTerminalState(last.state)) return last;
    } catch {
      // transient — keep polling until the deadline
    }
    if (now() + intervalMs > deadline) return last;
    await sleep(intervalMs);
  }
};

/**
 * Remove a node that will never answer its factory reset (the Pi is gone or
 * dead) — the fallback behind "Remove anyway", never the default path.
 *
 * jarvisd's `DELETE /api/v0/admin/nodes/{id}` (internal/modules/cc/reset.go,
 * handleDeleteNode; power_user in the node's household): publishes a
 * best-effort untracked reset whose token lives only 5 minutes in memory,
 * deactivates the node's registration in auth (its key stops working), and
 * hard-deletes the node row with its sessions, config pushes, settings
 * requests/snapshots and tasks. Answers `{message: "Deleted"}`; 404/403 as
 * `{detail: "<message>"}`.
 */
export const removeNode = async (nodeId: string): Promise<void> => {
  await apiClient.delete(`${getCommandCenterUrl()}/api/v0/admin/nodes/${nodeId}`);
};

/** The server's `{detail: "<message>"}` from a failed call, else the error's own message. */
export const nodeErrorMessage = (err: unknown, fallback: string): string => {
  if (axios.isAxiosError(err)) {
    const d = (err.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof d === 'string' && d.trim()) return d;
  }
  return err instanceof Error && err.message ? err.message : fallback;
};

/**
 * Update a node's config.json settings via MQTT.
 *
 * The node merges the settings into config.json and applies live where
 * possible. ``restart`` is only honored when one of the touched keys is
 * in the node's ``_KEYS_REQUIRING_RESTART`` set (currently just
 * ``wake_word_model``) — for everything else the value is read fresh
 * the next time the node consumes it.
 */
export const updateNodeConfig = async (
  nodeId: string,
  settings: Record<string, number | string | boolean>,
  restart: boolean = false,
): Promise<void> => {
  await apiClient.post(
    `${getCommandCenterUrl()}/api/v0/nodes/${nodeId}/node-config`,
    { settings, restart },
  );
};

/**
 * Preview an LED pattern on the node for ``duration_seconds`` then revert.
 * Ephemeral — does not persist any state. Drives the Test LEDs picker.
 */
export const previewLedPattern = async (
  nodeId: string,
  pattern: string,
  durationSeconds: number = 3.0,
): Promise<void> => {
  await apiClient.post(
    `${getCommandCenterUrl()}/api/v0/nodes/${nodeId}/led/preview`,
    { pattern, duration_seconds: durationSeconds },
  );
};

export interface AmbientNoiseResult {
  success: boolean;
  duration_seconds?: number;
  chunks?: number;
  p50_rms?: number;
  p75_rms?: number;
  p95_rms?: number;
  max_rms?: number;
  suggested_silence_threshold?: number;
  error?: string;
}

export interface AmbientNoisePollResponse {
  request_id: string;
  status: 'pending' | 'completed';
  completed_at?: string | null;
  result?: AmbientNoiseResult | null;
}

/**
 * Ask the node to measure the current ambient noise floor.
 * Returns a request_id that the caller polls via {@link pollAmbientNoiseResult}.
 */
export const triggerAmbientNoiseMeasurement = async (
  nodeId: string,
  durationSeconds: number = 3.0,
): Promise<{ request_id: string }> => {
  const res = await apiClient.post<{ request_id: string; status: string }>(
    `${getCommandCenterUrl()}/api/v0/nodes/${nodeId}/ambient-noise-measurements`,
    { duration_seconds: durationSeconds },
  );
  return { request_id: res.data.request_id };
};

export const pollAmbientNoiseResult = async (
  nodeId: string,
  requestId: string,
): Promise<AmbientNoisePollResponse> => {
  const res = await apiClient.get<AmbientNoisePollResponse>(
    `${getCommandCenterUrl()}/api/v0/nodes/${nodeId}/ambient-noise-measurements/${requestId}`,
  );
  return res.data;
};
