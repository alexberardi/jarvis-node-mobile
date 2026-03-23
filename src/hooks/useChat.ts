/**
 * Chat state management hook.
 *
 * Manages messages, conversation lifecycle, SSE streaming,
 * and preemptive conversation warmup.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ChatMessage,
  ChatStreamEvent,
  fetchNodeTools,
  NodeToolsResponse,
  sendChatMessage,
  warmupChat,
} from '../api/chatApi';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Extract tool names from OpenAI-format tool definitions. */
function extractToolNames(tools: Record<string, unknown>[]): string[] {
  return tools
    .map((t) => {
      const fn = t.function as Record<string, unknown> | undefined;
      return (fn?.name as string) ?? '';
    })
    .filter(Boolean);
}

export type WarmupState = 'idle' | 'loading_tools' | 'warming_up' | 'ready';

interface UseChatOptions {
  nodeId: string | null;
  householdId: string | null;
  accessToken: string | null;
  timezone?: string;
  onAssistantDone?: (text: string) => void;
}

interface UseChatReturn {
  messages: ChatMessage[];
  conversationId: string | null;
  isLoading: boolean;
  warmupState: WarmupState;
  toolCount: number;
  toolNames: string[];
  /** Non-null when the command center is unreachable. */
  connectionError: string | null;
  sendMessage: (text: string) => void;
  clearConversation: () => void;
  /** Force re-warmup (e.g., after installing a new command). */
  refreshTools: () => void;
}

export function useChat({
  nodeId,
  householdId,
  accessToken,
  timezone = 'America/New_York',
  onAssistantDone,
}: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [warmupState, setWarmupState] = useState<WarmupState>('idle');
  const [toolCount, setToolCount] = useState(0);
  const [toolNames, setToolNames] = useState<string[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const toolsRef = useRef<NodeToolsResponse | null>(null);

  // Preemptive startup: fetch tools → warmup conversation
  useEffect(() => {
    if (!nodeId || !householdId || !accessToken) {
      toolsRef.current = null;
      setWarmupState('idle');
      setToolCount(0);
      setConnectionError(null);
      return;
    }

    let cancelled = false;

    const startup = async () => {
      setConnectionError(null);
      setToolCount(0);
      setToolNames([]);
      setWarmupState('loading_tools');

      // Fetch tools fresh from CC (MQTT to node — no caching).
      try {
        const fresh = await fetchNodeTools(nodeId);
        if (!cancelled && fresh.client_tools.length > 0) {
          toolsRef.current = fresh;
          setToolCount(fresh.client_tools.length);
          setToolNames(extractToolNames(fresh.client_tools));
          setConnectionError(null);
        }
      } catch {
        // Network error — proceed with warmup anyway
      }

      if (cancelled) return;

      // Preemptive warmup — kick off conversation so first message is fast.
      // CC fetches tools directly from the node via MQTT.
      setWarmupState('warming_up');
      try {
        const result = await warmupChat(
          nodeId,
          householdId,
          undefined,
          undefined,
          timezone,
        );
        if (!cancelled) {
          setConversationId(result.conversation_id);
          setToolCount(result.tools_loaded);
          setWarmupState('ready');
          setConnectionError(null);
        }
      } catch {
        // Warmup failed — will do inline warmup on first message
        if (!cancelled) {
          setWarmupState('ready');
          setConnectionError('Could not reach Jarvis server.');
        }
      }
    };

    startup();
    return () => {
      cancelled = true;
    };
  }, [nodeId, householdId, accessToken, timezone]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!nodeId || !householdId || !accessToken || isLoading) return;

      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      };

      const assistantId = generateId();
      assistantIdRef.current = assistantId;

      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const handleEvent = (event: ChatStreamEvent) => {
        switch (event.type) {
          case 'status':
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.id === assistantIdRef.current && last.content === '') {
                return [
                  ...prev.slice(0, -1),
                  { ...last, role: 'status' as const, content: event.message ?? '' },
                ];
              }
              return prev;
            });
            break;

          case 'delta':
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id === assistantIdRef.current) {
                  return {
                    ...msg,
                    role: 'assistant' as const,
                    content: (msg.role === 'status' ? '' : msg.content) + (event.text ?? ''),
                  };
                }
                return msg;
              }),
            );
            break;

          case 'done':
            if (event.conversation_id) {
              setConversationId(event.conversation_id);
            }
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id === assistantIdRef.current) {
                  return {
                    ...msg,
                    role: 'assistant' as const,
                    content: event.full_text ?? msg.content,
                    actions: event.actions,
                    actionContext: event.action_context,
                    actionPreview: event.action_preview,
                  };
                }
                return msg;
              }),
            );
            setIsLoading(false);
            setConnectionError(null);
            if (event.full_text && onAssistantDone) {
              onAssistantDone(event.full_text);
            }
            break;

          case 'error':
            if (event.conversation_id) {
              setConversationId(event.conversation_id);
            }
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id === assistantIdRef.current) {
                  return {
                    ...msg,
                    role: 'assistant' as const,
                    content: event.message ?? 'Something went wrong.',
                  };
                }
                return msg;
              }),
            );
            setIsLoading(false);
            break;
        }
      };

      // Include cached tools only on first message without a warmed conversation
      const tools = toolsRef.current;
      const includeTools = !conversationId && tools && tools.client_tools.length > 0;

      sendChatMessage(
        {
          message: text.trim(),
          node_id: nodeId,
          household_id: householdId,
          conversation_id: conversationId ?? undefined,
          timezone,
          ...(includeTools
            ? {
                client_tools: tools.client_tools,
                available_commands: tools.available_commands,
              }
            : {}),
        },
        accessToken,
        handleEvent,
        controller.signal,
      ).catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        const errorMsg = err instanceof Error ? err.message : 'Connection failed.';
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === assistantIdRef.current) {
              return {
                ...msg,
                role: 'assistant' as const,
                content: errorMsg,
              };
            }
            return msg;
          }),
        );
        setIsLoading(false);
        setConnectionError('Could not reach Jarvis server.');
      });
    },
    [nodeId, householdId, accessToken, conversationId, isLoading, timezone],
  );

  const doWarmup = useCallback(() => {
    if (!nodeId || !householdId || !accessToken) return;
    setWarmupState('warming_up');
    // CC fetches tools from node via MQTT — no caching
    warmupChat(nodeId, householdId, undefined, undefined, timezone)
      .then((result) => {
        setConversationId(result.conversation_id);
        setToolCount(result.tools_loaded);
        setWarmupState('ready');
      })
      .catch(() => {
        setWarmupState('ready');
      });
  }, [nodeId, householdId, accessToken, timezone]);

  const clearConversation = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setIsLoading(false);
    setWarmupState('idle');
    doWarmup();
  }, [doWarmup]);

  const refreshTools = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setIsLoading(false);
    setWarmupState('idle');
    doWarmup();
  }, [doWarmup]);

  return {
    messages,
    conversationId,
    isLoading,
    warmupState,
    toolCount,
    toolNames,
    connectionError,
    sendMessage,
    clearConversation,
    refreshTools,
  };
}
