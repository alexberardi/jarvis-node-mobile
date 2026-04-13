/**
 * Chat API client for mobile → command center communication.
 *
 * Uses XMLHttpRequest for SSE streaming (React Native's fetch doesn't
 * support ReadableStream). Also provides STT and TTS endpoints.
 */

import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'status' | 'acknowledgment';
  content: string;
  timestamp: number;
  roundTripMs?: number;
  actions?: ChatAction[];
  actionContext?: ChatActionContext;
  actionPreview?: string;
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
}

export interface SendChatRequest {
  message: string;
  node_id: string;
  household_id: string;
  conversation_id?: string;
  timezone?: string;
  client_tools?: Record<string, unknown>[];
  available_commands?: Record<string, unknown>[];
}

export interface NodeToolsResponse {
  client_tools: Record<string, unknown>[];
  available_commands: Record<string, unknown>[];
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

    const xhr = new XMLHttpRequest();
    let processedLength = 0;

    // Wire up abort signal
    if (signal) {
      signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
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
      // Process any remaining text not caught by onprogress
      const remaining = xhr.responseText.slice(processedLength);
      if (remaining) {
        const events = parseSSEChunk(remaining);
        for (const event of events) {
          onEvent(event);
        }
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Chat request failed (${xhr.status}): ${xhr.responseText}`));
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
  });
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
