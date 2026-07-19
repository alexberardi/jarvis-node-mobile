import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

export interface ProvisioningTokenRequest {
  household_id: string;
  room?: string;
  name?: string;
  node_id?: string; // Only for refresh (reuse existing UUID)
}

export interface ProvisioningTokenResponse {
  token: string;
  node_id: string;
  expires_at: string;
  expires_in: number;
}

export interface SendActionRequest {
  command_name: string;
  action_name: string;
  context?: Record<string, any>;
}

export interface SendActionResponse {
  status: string;
  request_id: string;
  success?: boolean;
  error?: string | null;
}

/**
 * Send an interactive action (e.g. Send/Cancel button tap) to a node via CC.
 */
export const sendNodeAction = async (
  nodeId: string,
  action: SendActionRequest,
): Promise<SendActionResponse> => {
  const response = await apiClient.post<SendActionResponse>(
    `${getCommandCenterUrl()}/api/v0/nodes/${nodeId}/actions`,
    action,
    { timeout: 15000 }, // CC waits up to 10s for node response
  );
  return response.data;
};

/** Renderer hint chosen by the command at element-creation time. */
export type NavigationType = 'stack' | 'new_notification' | 'popover';

/**
 * Interactive element embedded in an inbox item's metadata.
 *
 * Tapping one POSTs an `InteractiveCallbackRequest` to CC. Two dispatch
 * planes, chosen by the element's `target`:
 *   - node plane (default, `target` absent or "node"): CC signals the item's
 *     node over MQTT; the node dispatches the command's @callback-decorated
 *     method. Requires the item's `metadata.node_id`.
 *   - server plane (`target: "server"`, CC PR #55): CC executes a registered
 *     server-side handler itself — no node involved. The request carries the
 *     inbox item's `household_id` instead of `target_node_id`. Used by CC
 *     server tools (phone-call confirm/escalation cards).
 *
 * `navigation_type` controls what happens on tap:
 *   - "stack" — push a new screen onto the inbox stack; mobile polls the
 *     callback status endpoint and renders the result inline.
 *   - "new_notification" (default for back-compat) — fire-and-forget; a
 *     fresh inbox item lands when the job completes.
 *   - "popover" — present a modal sheet over the current screen with the
 *     same poll/render semantics as "stack" (not implemented yet).
 */
export interface InteractiveElement {
  id: string;            // unique within the inbox item (React key + tap dedup)
  label: string;         // primary display text, e.g. "Tom Hanks"
  sublabel?: string;     // optional secondary text, e.g. "as Forrest Gump"
  kind?: string;         // optional visual category (actor, movie, director, ...)
  command: string;       // target command_name
  callback: string;      // target @callback name on that command
  data: Record<string, any>;  // payload forwarded to the callback method
  navigation_type?: NavigationType;
  /** Dispatch plane — absent/"node" = node plane; "server" = CC executes. */
  target?: 'node' | 'server';
}

/**
 * Exactly one of `target_node_id` (node plane) or `household_id` (server
 * plane) is present — CC branches on `target_node_id`'s absence.
 */
export interface InteractiveCallbackRequest {
  command_name: string;
  callback_name: string;
  data: Record<string, any>;
  target_node_id?: string;
  household_id?: string;
  navigation_type?: NavigationType;
}

export interface InteractiveCallbackResponse {
  id: string;
  status: string;
  navigation_type: NavigationType;
  created_at: string;
}

/**
 * Shape returned by GET /api/v0/callbacks/{job_id}/status — used by the
 * stacked result screen to poll for completion. `context_data.inbox`
 * carries the renderable block (title, summary, body, metadata) once the
 * job's status leaves "pending".
 */
export interface InteractiveCallbackStatus {
  id: string;
  status: 'pending' | 'completed' | 'failed' | 'expired';
  navigation_type: NavigationType;
  completed_at: string | null;
  error_message: string | null;
  context_data: Record<string, any> | null;
}

/**
 * Trigger a `@callback` on a command by id. Returns the job id immediately —
 * what happens next depends on `navigation_type` in the request:
 *   - "new_notification" (default): the node completes asynchronously and
 *     a fresh inbox item lands; mobile doesn't need to do anything.
 *   - "stack" / "popover": mobile should navigate to the result screen
 *     and call `getInteractiveCallbackStatus(id)` on a polling loop.
 */
export const sendInteractiveCallback = async (
  request: InteractiveCallbackRequest,
): Promise<InteractiveCallbackResponse> => {
  const response = await apiClient.post<InteractiveCallbackResponse>(
    `${getCommandCenterUrl()}/api/v0/callbacks`,
    request,
    { timeout: 10000 },
  );
  return response.data;
};

/** Poll the user-JWT'd status endpoint for a callback's final result. */
export const getInteractiveCallbackStatus = async (
  jobId: string,
): Promise<InteractiveCallbackStatus> => {
  const response = await apiClient.get<InteractiveCallbackStatus>(
    `${getCommandCenterUrl()}/api/v0/callbacks/${jobId}/status`,
    { timeout: 5000 },
  );
  return response.data;
};

export const requestProvisioningToken = async (
  request: ProvisioningTokenRequest,
): Promise<ProvisioningTokenResponse> => {
  const response = await apiClient.post<ProvisioningTokenResponse>(
    `${getCommandCenterUrl()}/api/v0/provisioning/token`,
    request,
  );
  return response.data;
};

/**
 * Defensive parse of `metadata.interactive_elements`. Producers are supposed
 * to send unique `id`s (React key + tap dedup), but the renderer must not
 * break when one doesn't: a missing or duplicate id is filled with a stable
 * derived fallback, and entries without the required label/command/callback
 * are dropped. Found live 2026-07-19: an id-less two-chip card made both
 * chips share `undefined`, so one tap marked BOTH as sent.
 */
export function normalizeInteractiveElements(raw: unknown): InteractiveElement[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: InteractiveElement[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const el = entry as Partial<InteractiveElement>;
    if (
      typeof el.label !== 'string' ||
      typeof el.command !== 'string' ||
      typeof el.callback !== 'string'
    ) {
      return;
    }
    let id =
      typeof el.id === 'string' && el.id.length > 0
        ? el.id
        : `${el.command}:${el.callback}:${index}`;
    if (seen.has(id)) id = `${id}#${index}`;
    seen.add(id);
    out.push({
      ...(el as InteractiveElement),
      id,
      data:
        el.data && typeof el.data === 'object'
          ? (el.data as Record<string, any>)
          : {},
    });
  });
  return out;
}
