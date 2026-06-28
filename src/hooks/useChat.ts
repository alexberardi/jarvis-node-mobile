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
import { useToolsVersion } from '../contexts/ToolsContext';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export interface ToolInfo {
  name: string;
  description: string;
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

/** Extract name + description pairs from OpenAI-format tool definitions. */
function extractToolInfos(tools: Record<string, unknown>[]): ToolInfo[] {
  return tools
    .map((t) => {
      const fn = t.function as Record<string, unknown> | undefined;
      const name = (fn?.name as string) ?? '';
      const description = (fn?.description as string) ?? '';
      return name ? { name, description } : null;
    })
    .filter((t): t is ToolInfo => t !== null);
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
  toolInfos: ToolInfo[];
  /** True while we're still polling a freshly-provisioned node for its tools
   * (it went online before its command discovery finished). The UI shows a
   * "Loading tools…" spinner instead of a misleading "0 tools loaded". */
  toolsPending: boolean;
  /** Non-null when the command center is unreachable. */
  connectionError: string | null;
  sendMessage: (text: string) => void;
  clearConversation: () => void;
  /** Manually re-run the tool fetch + warmup (wired to pull-to-refresh). */
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
  const [toolInfos, setToolInfos] = useState<ToolInfo[]>([]);
  const [toolsPending, setToolsPending] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  // Manual refresh trigger (pull-to-refresh) — bumping it re-runs the startup
  // effect, reusing its cancellation/teardown machinery.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const sendTimestampRef = useRef<number>(0);
  const toolsRef = useRef<NodeToolsResponse | null>(null);
  // True once the user has sent a message in the current conversation. The
  // background tool poll and startup re-warm use this to avoid clobbering an
  // in-progress conversation when they re-warm after tools become available.
  const messagesStartedRef = useRef(false);
  // Identity of the conversation's node/household. Lets us reset
  // messagesStartedRef only on a genuine node/household switch — NOT on a
  // tool refresh (refreshNonce) or Pantry install (toolsVersion), which re-run
  // the effect but must preserve an in-progress conversation.
  const conversationIdentityRef = useRef<string | null>(null);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  // Track auth readiness (changes once: false → true), not the token value (changes on every refresh)
  const isAuthenticated = !!accessToken;
  // Re-warmup only when tools change (Pantry install/uninstall), not on every tab nav
  const { toolsVersion } = useToolsVersion();

  const refreshTools = useCallback(() => setRefreshNonce((n) => n + 1), []);

  // Preemptive startup: fetch tools → warmup conversation, then self-heal.
  // Runs on first mount + when node/household changes + when toolsVersion bumps
  // + on manual refresh. Does NOT re-run on tab navigation (state persists
  // since HomeScreen stays mounted).
  //
  // Self-heal: a freshly-provisioned node goes "online" (heartbeat) BEFORE its
  // command discovery + MQTT tool handler are ready, so the first fetch often
  // reports 0 tools. The effect used to freeze there ("0 tools loaded") until
  // the app was killed and relaunched. We now keep polling the node in the
  // background until its tools appear, then re-warm so the count — and the
  // cached CC conversation — pick them up without an app restart.
  useEffect(() => {
    if (!nodeId || !householdId || !isAuthenticated) {
      toolsRef.current = null;
      setWarmupState('idle');
      setToolCount(0);
      setToolsPending(false);
      setConnectionError(null);
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    // Backoff schedule for re-asking a still-booting node for its tools.
    // Front-loaded: most nodes finish command discovery within ~10-20s, so the
    // first few retries are quick to catch that case fast; the tail backs off
    // for a genuinely slow Pi Zero. Bounded (~58s total) — then we give up and
    // show the truthful "0 tools loaded".
    const TOOL_POLL_DELAYS_MS = [2000, 2000, 3000, 3000, 4000, 5000, 6000, 8000, 10000, 15000];
    let pollAttempt = 0;

    const applyTools = (fresh: NodeToolsResponse) => {
      toolsRef.current = fresh;
      setToolCount(fresh.client_tools.length);
      setToolNames(extractToolNames(fresh.client_tools));
      setToolInfos(extractToolInfos(fresh.client_tools));
    };

    const pollForTools = async () => {
      if (cancelled) return;

      let fresh: NodeToolsResponse | null = null;
      try {
        fresh = await fetchNodeTools(nodeId);
      } catch {
        // Transient network/MQTT error — keep polling.
      }
      if (cancelled) return;

      if (fresh && fresh.client_tools.length > 0) {
        applyTools(fresh);
        // The CC cached a tool-less warm conversation (get_tools returns []),
        // and its /chat path only re-warms when the cache is *absent*. So we
        // must re-warm to give that conversation its tools. Only do so if the
        // user hasn't started chatting — don't clobber an in-progress
        // conversation (guard on messages, not conversationId, since the
        // initial warmup already set a conversationId).
        if (!messagesStartedRef.current) {
          try {
            const result = await warmupChat(nodeId, householdId, undefined, undefined, timezone);
            if (!cancelled && !messagesStartedRef.current) {
              setConversationId(result.conversation_id);
              setToolCount(Math.max(result.tools_loaded, fresh.client_tools.length));
            }
          } catch {
            // Re-warm failed — drop the tool-less warm conversation so the next
            // send cold-starts a fresh one carrying the freshly-fetched tools
            // inline (sendMessage's first-message include-tools path).
            if (!cancelled && !messagesStartedRef.current) {
              setConversationId(null);
            }
          }
        }
        if (!cancelled) setToolsPending(false);
        return;
      }

      // Still no tools — schedule the next attempt, or give up (truthful "0").
      if (pollAttempt < TOOL_POLL_DELAYS_MS.length) {
        pollTimer = setTimeout(pollForTools, TOOL_POLL_DELAYS_MS[pollAttempt++]);
      } else if (!cancelled) {
        setToolsPending(false);
      }
    };

    const startup = async () => {
      setConnectionError(null);
      setToolCount(0);
      setToolNames([]);
      setToolInfos([]);
      setToolsPending(false);
      setWarmupState('loading_tools');

      // Fetch tools fresh from CC (MQTT to node — no caching).
      let fetchedCount = 0;
      try {
        const fresh = await fetchNodeTools(nodeId);
        if (!cancelled && fresh.client_tools.length > 0) {
          applyTools(fresh);
          fetchedCount = fresh.client_tools.length;
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
          // Adopt the freshly warmed conversation only if the user hasn't
          // started chatting — a tool refresh / Pantry install re-runs this
          // effect and must not silently drop an in-progress conversation's
          // server-side context (the visible history stays either way).
          if (!messagesStartedRef.current) {
            setConversationId(result.conversation_id);
          }
          // Don't let a warmup that under-reports clobber a good fetch count.
          setToolCount(Math.max(result.tools_loaded, fetchedCount));
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

      // Node reported no tools yet (freshly provisioned + still booting). Keep
      // polling in the background until they appear (self-heal, no app restart).
      if (!cancelled && fetchedCount === 0) {
        setToolsPending(true);
        pollTimer = setTimeout(pollForTools, TOOL_POLL_DELAYS_MS[pollAttempt++]);
      }
    };

    // Only treat this as a brand-new conversation (clearing the user-chat flag)
    // when the node/household actually changed — not on a refresh/toolsVersion
    // re-run, which must preserve an in-progress conversation.
    const identity = `${nodeId}|${householdId}`;
    if (conversationIdentityRef.current !== identity) {
      conversationIdentityRef.current = identity;
      messagesStartedRef.current = false;
    }

    startup();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [nodeId, householdId, isAuthenticated, timezone, toolsVersion, refreshNonce]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!nodeId || !householdId || !accessTokenRef.current || isLoading) return;

      // Mark the conversation as user-started so the background tool poll won't
      // re-warm over it once the node's tools become available.
      messagesStartedRef.current = true;

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

      sendTimestampRef.current = Date.now();
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

          case 'acknowledgment':
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id === assistantIdRef.current) {
                  return {
                    ...msg,
                    role: 'acknowledgment' as const,
                    content: event.text ?? '',
                  };
                }
                return msg;
              }),
            );
            break;

          case 'delta':
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id === assistantIdRef.current) {
                  return {
                    ...msg,
                    role: 'assistant' as const,
                    content:
                      (msg.role === 'status' || msg.role === 'acknowledgment' ? '' : msg.content) +
                      (event.text ?? ''),
                  };
                }
                return msg;
              }),
            );
            break;

          case 'done': {
            const roundTripMs = Date.now() - sendTimestampRef.current;
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
                    roundTripMs,
                    actions: event.actions,
                    actionContext: event.action_context,
                    actionPreview: event.action_preview,
                    reasoning: event.reasoning,
                    traceSummary: event.trace_summary,
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
          }

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
                    traceSummary: event.trace_summary,
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
          include_reasoning: true,
          ...(includeTools
            ? {
                client_tools: tools.client_tools,
                available_commands: tools.available_commands,
              }
            : {}),
        },
        accessTokenRef.current!,
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
    [nodeId, householdId, conversationId, isLoading, timezone],
  );

  const doWarmup = useCallback(() => {
    if (!nodeId || !householdId || !accessTokenRef.current) return;
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
  }, [nodeId, householdId, timezone]);

  const clearConversation = useCallback(() => {
    abortRef.current?.abort();
    messagesStartedRef.current = false;
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
    toolInfos,
    toolsPending,
    connectionError,
    sendMessage,
    clearConversation,
    refreshTools,
  };
}
