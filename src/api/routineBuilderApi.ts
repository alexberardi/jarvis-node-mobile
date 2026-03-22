/**
 * Routine Builder API client — SSE streaming to command center.
 *
 * Uses apiClient (JWT auth) since these are CC endpoints.
 */
import { getCommandCenterUrl } from '../config/serviceConfig';
import { getCurrentAccessToken } from './apiClient';

export interface RoutineChatRequest {
  message: string;
  node_id: string;
  household_id: string;
  conversation_id?: string;
  provider: 'jarvis' | 'claude' | 'openai';
  api_key?: string;
  timezone?: string;
}

export interface RoutineTestRequest {
  routine: Record<string, unknown>;
  node_id: string;
  household_id: string;
}

export interface RoutineChatDoneEvent {
  type: 'done';
  conversation_id: string;
  full_text: string;
  routine?: GeneratedRoutine;
  validation_warnings?: string[];
}

export interface GeneratedRoutine {
  id: string;
  name: string;
  trigger_phrases: string[];
  steps: Array<{
    command: string;
    args: Array<{ key: string; value: string }>;
    label: string;
  }>;
  response_instruction: string;
  response_length: 'short' | 'medium' | 'long';
  background: null;
}

export interface StepResult {
  step_index: number;
  command: string;
  label: string;
  arguments: Record<string, string>;
  success: boolean;
  error: string | null;
  output: unknown;
}

export type RoutineStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'delta'; text: string }
  | RoutineChatDoneEvent
  | { type: 'error'; message: string; conversation_id?: string }
  | { type: 'step_start'; step_index: number; command: string; label: string }
  | { type: 'step_result' } & StepResult
  | { type: 'test_done'; results: StepResult[]; passed: number; total: number };

/**
 * Send a message to the routine builder chat endpoint.
 * Returns an XHR that streams SSE events. Call onEvent for each parsed event.
 */
export const sendRoutineBuilderMessage = (
  request: RoutineChatRequest,
  onEvent: (event: RoutineStreamEvent) => void,
  onError: (error: string) => void,
): XMLHttpRequest => {
  const baseUrl = getCommandCenterUrl();
  const url = `${baseUrl}/api/v0/mobile/routines/chat`;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  const token = getCurrentAccessToken();
  if (token) {
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  }

  let lastIndex = 0;

  xhr.onprogress = () => {
    const text = xhr.responseText.substring(lastIndex);
    lastIndex = xhr.responseText.length;

    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const dataStr = trimmed.substring(6);
      try {
        const event = JSON.parse(dataStr) as RoutineStreamEvent;
        onEvent(event);
      } catch {
        // Skip unparseable lines
      }
    }
  };

  xhr.onerror = () => {
    onError('Network error');
  };

  xhr.onloadend = () => {
    if (xhr.status !== 200 && xhr.status !== 0) {
      onError(`Request failed: ${xhr.status}`);
    }
  };

  xhr.send(JSON.stringify(request));
  return xhr;
};

/**
 * Test a routine by executing each step on the node.
 * Returns an XHR that streams step-by-step results.
 */
export const testRoutine = (
  request: RoutineTestRequest,
  onEvent: (event: RoutineStreamEvent) => void,
  onError: (error: string) => void,
): XMLHttpRequest => {
  const baseUrl = getCommandCenterUrl();
  const url = `${baseUrl}/api/v0/mobile/routines/test`;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  const token = getCurrentAccessToken();
  if (token) {
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  }

  let lastIndex = 0;

  xhr.onprogress = () => {
    const text = xhr.responseText.substring(lastIndex);
    lastIndex = xhr.responseText.length;

    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const dataStr = trimmed.substring(6);
      try {
        const event = JSON.parse(dataStr) as RoutineStreamEvent;
        onEvent(event);
      } catch {
        // Skip unparseable lines
      }
    }
  };

  xhr.onerror = () => {
    onError('Network error');
  };

  xhr.onloadend = () => {
    if (xhr.status !== 200 && xhr.status !== 0) {
      onError(`Request failed: ${xhr.status}`);
    }
  };

  xhr.send(JSON.stringify(request));
  return xhr;
};
