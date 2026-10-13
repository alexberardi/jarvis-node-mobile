/**
 * Chat API client for mobile → command center communication.
 *
 * Uses XMLHttpRequest for SSE streaming (React Native's fetch doesn't
 * support ReadableStream). Also provides STT and TTS endpoints.
 */

import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient, { refreshAuthToken } from './apiClient';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatAction {
  button_text: string;
  button_action: string;
  button_type: 'primary' | 'secondary' | 'destructive';
  button_icon?: string;
  completion_message?: string;
}

export interface ChatActionContext {
  command_name: string;
  context: Record<string, unknown>;
}

export interface ServiceHop {
  service: string;
  duration_ms: number;
  status: string;
  steps: string[];
}

export interface TraceSummary {
  total_duration_ms: number;
  span_count: number;
  status: string;
  service_hops: ServiceHop[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'status' | 'acknowledgment';
  content: string;
  timestamp: number;
  roundTripMs?: number;
  actions?: ChatAction[];
  actionContext?: ChatActionContext;
  actionPreview?: string;
  reasoning?: string;
  traceSummary?: TraceSummary;
  /** Images the user attached (local URIs — the server does not persist them). */
  images?: ChatImageRef[];
}

/** A locally-held image shown in a chat bubble. */
export interface ChatImageRef {
  uri: string;
  width?: number;
  height?: number;
}

/** One image as sent on the wire to POST /mobile/chat. */
export interface ChatImagePayload {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Base64 (no data: prefix). */
  data: string;
}

/** GET /mobile/chat/capabilities. */
export interface ChatCapabilities {
  images: boolean;
  max_images: number;
  max_image_bytes: number;
}

export const NO_CHAT_CAPABILITIES: ChatCapabilities = {
  images: false,
  max_images: 0,
  max_image_bytes: 0,
};

/** Error codes the server returns (422) for a rejected image send. */
export type ChatImageErrorCode = 'images_unavailable' | 'images_invalid';

/** A non-2xx response from POST /mobile/chat. `code` is parsed from the JSON body when present. */
export class ChatRequestError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, body: string) {
    super(`Chat request failed (${status})${body ? `: ${body}` : ''}`);
    this.name = 'ChatRequestError';
    this.status = status;
    this.code = parseErrorCode(body);
  }
}

/** Pull `code` out of `{"code": …}` or FastAPI-style `{"detail": {"code": …}}`. */
function parseErrorCode(body: string): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed.code === 'string') return parsed.code;
    const detail = parsed.detail as Record<string, unknown> | undefined;
    if (detail && typeof detail === 'object' && typeof detail.code === 'string') {
      return detail.code;
    }
  } catch {
    // Not JSON
  }
  return null;
}

export interface ChatStreamEvent {
  type: 'status' | 'delta' | 'done' | 'error' | 'acknowledgment';
  text?: string;
  message?: string;
  conversation_id?: string;
  full_text?: string;
  stop_reason?: string;
  validation?: Record<string, unknown>;
  actions?: ChatAction[];
  action_context?: ChatActionContext;
  action_preview?: string;
  reasoning?: string;
  trace_summary?: TraceSummary;
}

export interface SendChatRequest {
  message: string;
  node_id: string;
  household_id: string;
  conversation_id?: string;
  timezone?: string;
  client_tools?: Record<string, unknown>[];
  available_commands?: Record<string, unknown>[];
  include_reasoning?: boolean;
  /** Only sent when the server's capabilities report `images: true`. */
  images?: ChatImagePayload[];
}

export interface InstalledPackage {
  name: string;
  version: string;
  /** Version preserved in the node's `.previous` rollback snapshot. Present
   * only after an update — enables the "Revert to vX" action. */
  previous_version?: string | null;
  /** 'failed' when any of the package's components failed to import at boot. */
  health?: 'ok' | 'failed';
}

export interface NodeToolsResponse {
  client_tools: Record<string, unknown>[];
  available_commands: Record<string, unknown>[];
  installed_packages?: InstalledPackage[];
  cached: boolean;
}

// ─── SSE Helpers ─────────────────────────────────────────────────────────────

/**
 * Parse SSE text into individual events.
 * Each SSE event is "data: {json}\n\n".
 */
function parseSSEChunk(text: string): ChatStreamEvent[] {
  const events: ChatStreamEvent[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data: ')) continue;

    const jsonStr = trimmed.slice(6);
    try {
      events.push(JSON.parse(jsonStr) as ChatStreamEvent);
    } catch {
      // Incomplete JSON — skip
    }
  }

  return events;
}

// ─── Chat API ────────────────────────────────────────────────────────────────

/**
 * Send a chat message and stream the response via SSE.
 *
 * Uses XMLHttpRequest because React Native's fetch doesn't support
 * streaming via ReadableStream. XHR fires onprogress with incremental
 * responseText that we can parse for SSE events.
 */
export const sendChatMessage = (
  req: SendChatRequest,
  accessToken: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const baseUrl = getCommandCenterUrl();
    const url = `${baseUrl}/api/v0/mobile/chat`;

    // This XHR streaming client bypasses the apiClient axios interceptor, so it
    // must handle a stale-token 401 itself: refresh once (shared single-flight,
    // which force-logs-out a genuinely dead session) and retry, rather than
    // surfacing a borked error bubble while the user stays "authenticated".
    const run = (token: string, isRetry: boolean) => {
      const xhr = new XMLHttpRequest();
      let processedLength = 0;

      // Wire up abort signal
      if (signal) {
        signal.addEventListener('abort', () => xhr.abort());
      }

      xhr.open('POST', url);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'text/event-stream');

      // React Native XHR fires onprogress with incremental responseText
      xhr.onprogress = () => {
        const newText = xhr.responseText.slice(processedLength);
        processedLength = xhr.responseText.length;

        if (newText) {
          const events = parseSSEChunk(newText);
          for (const event of events) {
            onEvent(event);
          }
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Process any remaining text not caught by onprogress
          const remaining = xhr.responseText.slice(processedLength);
          if (remaining) {
            const events = parseSSEChunk(remaining);
            for (const event of events) {
              onEvent(event);
            }
          }
          resolve();
        } else if (xhr.status === 401 && !isRetry) {
          // Stale access token — refresh once and retry the stream.
          refreshAuthToken()
            .then((fresh) => {
              if (fresh) {
                run(fresh, true);
              } else {
                // doRefresh already forced a logout if the session is dead.
                reject(new Error(`Chat request failed (${xhr.status})`));
              }
            })
            .catch(() => reject(new Error(`Chat request failed (${xhr.status})`)));
        } else {
          reject(new ChatRequestError(xhr.status, xhr.responseText));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during chat stream'));
      };

      xhr.onabort = () => {
        // Don't reject on intentional abort — just resolve silently
        resolve();
      };

      xhr.send(JSON.stringify(req));
    };

    run(accessToken, false);
  });
};

// ─── Chat Capabilities API ───────────────────────────────────────────────────

// Per-server cache (keyed by command-center base URL) so reopening the chat
// screen renders the attach button immediately while a fresh read is in flight.
const capabilitiesCache = new Map<string, ChatCapabilities>();

/** Last-known capabilities for the current server, or null if never fetched. */
export const getCachedChatCapabilities = (): ChatCapabilities | null =>
  capabilitiesCache.get(getCommandCenterUrl()) ?? null;

/** Test hook. */
export const clearChatCapabilitiesCache = (): void => capabilitiesCache.clear();

/**
 * Read what the chat endpoint accepts beyond text. A legacy server (404) or
 * any failure means "no images" — the chat stays text-only, exactly as before.
 */
export const fetchChatCapabilities = async (): Promise<ChatCapabilities> => {
  const baseUrl = getCommandCenterUrl();
  let caps: ChatCapabilities = NO_CHAT_CAPABILITIES;
  try {
    const res = await apiClient.get<Partial<ChatCapabilities>>(
      `${baseUrl}/api/v0/mobile/chat/capabilities`,
      { timeout: 10000 },
    );
    const d = res.data ?? {};
    const maxImages = typeof d.max_images === 'number' ? d.max_images : 0;
    const maxBytes = typeof d.max_image_bytes === 'number' ? d.max_image_bytes : 0;
    caps = {
      images: d.images === true && maxImages > 0 && maxBytes > 0,
      max_images: maxImages,
      max_image_bytes: maxBytes,
    };
  } catch {
    caps = NO_CHAT_CAPABILITIES;
  }
  capabilitiesCache.set(baseUrl, caps);
  return caps;
};

// ─── Audio API ───────────────────────────────────────────────────────────────

/**
 * Transcribe audio to text via the mobile STT endpoint.
 */
export const transcribeAudio = async (
  audioUri: string,
  householdId: string,
): Promise<{ text: string }> => {
  const baseUrl = getCommandCenterUrl();

  const formData = new FormData();
  formData.append('file', {
    uri: audioUri,
    type: 'audio/wav',
    name: 'recording.wav',
  } as unknown as Blob);
  formData.append('household_id', householdId);

  const res = await apiClient.post<{ text: string }>(
    `${baseUrl}/api/v0/mobile/stt`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    },
  );

  return res.data;
};

/**
 * Get the TTS URL for a given text. Used to fetch audio via raw fetch,
 * then play with expo-av.
 */
export const getTTSConfig = (
  text: string,
  householdId: string,
  accessToken: string,
): { url: string; headers: Record<string, string>; body: string } => {
  const baseUrl = getCommandCenterUrl();
  return {
    url: `${baseUrl}/api/v0/mobile/tts`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ text, household_id: householdId }),
  };
};

// ─── Chat Warmup API ─────────────────────────────────────────────────────────

export interface WarmupResponse {
  conversation_id: string;
  tools_loaded: number;
}

/**
 * Preemptively warm up a conversation so the first message is fast.
 *
 * Called when the app opens or a node is selected. Loads tools, resolves
 * speaker identity, and caches the system prompt on CC.
 */
export const warmupChat = async (
  nodeId: string,
  householdId: string,
  clientTools?: Record<string, unknown>[],
  availableCommands?: Record<string, unknown>[],
  timezone?: string,
): Promise<WarmupResponse> => {
  const baseUrl = getCommandCenterUrl();

  const res = await apiClient.post<WarmupResponse>(
    `${baseUrl}/api/v0/mobile/chat/warmup`,
    {
      node_id: nodeId,
      household_id: householdId,
      timezone: timezone ?? 'America/New_York',
      ...(clientTools ? { client_tools: clientTools } : {}),
      ...(availableCommands ? { available_commands: availableCommands } : {}),
    },
    { timeout: 15000 },
  );

  return res.data;
};

// ─── Node Tools API ──────────────────────────────────────────────────────────

/**
 * Fetch a node's tool definitions from CC.
 *
 * CC checks its in-memory cache first (populated when the node starts
 * a voice conversation), then falls back to an MQTT request to the node.
 */
export const fetchNodeTools = async (
  nodeId: string,
): Promise<NodeToolsResponse> => {
  const baseUrl = getCommandCenterUrl();

  const res = await apiClient.get<NodeToolsResponse>(
    `${baseUrl}/api/v0/mobile/nodes/${nodeId}/tools`,
    { timeout: 15000 }, // 15s to accommodate MQTT round-trip
  );

  return res.data;
};
