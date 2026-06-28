import { renderHook, act } from '@testing-library/react-native';

import { useChat } from '../../src/hooks/useChat';
import { sendChatMessage, fetchNodeTools, warmupChat } from '../../src/api/chatApi';

// REGRESSION — the "0 tools loaded after pairing until app restart" self-heal.
// A freshly-provisioned node goes "online" BEFORE its command discovery + MQTT
// tool handler are ready, so the first fetchNodeTools/warmupChat report 0 tools.
// useChat used to freeze there forever. It now polls the node in the background
// (bounded backoff) until tools appear, then re-warms so the count AND the
// cached CC conversation pick them up — no app restart. These tests drive the
// REAL useChat state machine with fake timers; only the chatApi leaves are
// mocked. Kept in a SEPARATE file from chatSendFlow.test.tsx (which relies on
// real-timer waitFor) so the two timer regimes never collide.

jest.mock('../../src/api/chatApi', () => ({
  sendChatMessage: jest.fn(),
  fetchNodeTools: jest.fn(),
  warmupChat: jest.fn(),
}));
jest.mock('../../src/contexts/ToolsContext', () => ({
  useToolsVersion: () => ({ toolsVersion: 0 }),
}));

const OPTS = { nodeId: 'n1', householdId: 'hh1', accessToken: 'tok' };

const weatherTool = { type: 'function', function: { name: 'get_weather', description: 'Weather' } };

const empty = { client_tools: [], available_commands: [], cached: false };
const withTools = { client_tools: [weatherTool], available_commands: [{ name: 'get_weather' }], cached: false };

// The bounded backoff schedule mirrored from useChat (sum = 58000ms).
const DELAYS = [2000, 2000, 3000, 3000, 4000, 5000, 6000, 8000, 10000, 15000];
const TOTAL_BACKOFF = DELAYS.reduce((a, b) => a + b, 0);

// Flush the async startup (fetchNodeTools → warmupChat) without advancing any
// retry timer. advanceTimersByTimeAsync(0) flushes the pending microtasks.
const settle = async () => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
};

const advance = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

describe('useChat — tool self-heal poll (post-pairing 0-tools window)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (sendChatMessage as jest.Mock).mockImplementation(() => new Promise<void>(() => {}));
    (fetchNodeTools as jest.Mock).mockResolvedValue(empty);
    (warmupChat as jest.Mock).mockResolvedValue({ conversation_id: 'warm-1', tools_loaded: 0 });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('retries after a 0-tool start, backfills the count, and re-warms (A+B)', async () => {
    (fetchNodeTools as jest.Mock)
      .mockResolvedValueOnce(empty) // initial startup fetch — node still booting
      .mockResolvedValueOnce(withTools); // first background poll — tools ready
    (warmupChat as jest.Mock)
      .mockResolvedValueOnce({ conversation_id: 'warm-1', tools_loaded: 0 }) // startup warmup
      .mockResolvedValueOnce({ conversation_id: 'warm-2', tools_loaded: 1 }); // poll re-warm

    const { result } = renderHook(() => useChat(OPTS));
    await settle();

    // Startup settled to a 0-tool "ready" — but we're still polling, so the UI
    // shows a spinner (toolsPending), not a misleading "0 tools loaded".
    expect(result.current.warmupState).toBe('ready');
    expect(result.current.toolCount).toBe(0);
    expect(result.current.toolsPending).toBe(true);
    expect(result.current.conversationId).toBe('warm-1');
    expect(fetchNodeTools).toHaveBeenCalledTimes(1);

    // First backoff tick: node now reports tools → backfill + re-warm.
    await advance(DELAYS[0]);

    expect(fetchNodeTools).toHaveBeenCalledTimes(2);
    expect(warmupChat).toHaveBeenCalledTimes(2);
    expect(result.current.toolCount).toBe(1);
    expect(result.current.toolNames).toEqual(['get_weather']);
    expect(result.current.toolsPending).toBe(false);
    // Re-warm adopted (user hadn't started chatting).
    expect(result.current.conversationId).toBe('warm-2');
  });

  it('does NOT re-warm or clobber the conversation once the user has sent a message (C)', async () => {
    (fetchNodeTools as jest.Mock)
      .mockResolvedValueOnce(empty)
      .mockResolvedValueOnce(withTools);

    const { result } = renderHook(() => useChat(OPTS));
    await settle();
    expect(result.current.conversationId).toBe('warm-1');

    // User starts chatting during the 0-tools window. sendChatMessage never
    // resolves, so the conversation stays in-flight on 'warm-1'.
    act(() => result.current.sendMessage('hi'));
    expect(result.current.conversationId).toBe('warm-1');

    const warmupCallsBefore = (warmupChat as jest.Mock).mock.calls.length;

    // Poll finds tools — it must backfill the count but NOT re-warm/adopt a new
    // conversation over the user's in-flight one.
    await advance(DELAYS[0]);

    expect(result.current.toolCount).toBe(1);
    expect(result.current.toolNames).toEqual(['get_weather']);
    expect(result.current.toolsPending).toBe(false);
    expect(result.current.conversationId).toBe('warm-1'); // not clobbered
    expect((warmupChat as jest.Mock).mock.calls.length).toBe(warmupCallsBefore); // no re-warm
  });

  it('falls back to a truthful "0 tools" (toolsPending=false) after exhausting retries (D)', async () => {
    (fetchNodeTools as jest.Mock).mockResolvedValue(empty); // never reports tools

    const { result } = renderHook(() => useChat(OPTS));
    await settle();
    expect(result.current.toolsPending).toBe(true);

    // Burn through the entire backoff schedule.
    await advance(TOTAL_BACKOFF + 1000);

    // 1 startup fetch + DELAYS.length background polls, then it gives up.
    expect(fetchNodeTools).toHaveBeenCalledTimes(1 + DELAYS.length);
    expect(result.current.toolsPending).toBe(false);
    expect(result.current.toolCount).toBe(0);
  });

  it('never polls when the node reports tools on the first fetch (E)', async () => {
    (fetchNodeTools as jest.Mock).mockResolvedValue(withTools);
    (warmupChat as jest.Mock).mockResolvedValue({ conversation_id: 'warm-1', tools_loaded: 1 });

    const { result } = renderHook(() => useChat(OPTS));
    await settle();

    expect(result.current.toolCount).toBe(1);
    expect(result.current.toolsPending).toBe(false);

    await advance(TOTAL_BACKOFF + 1000);

    expect(fetchNodeTools).toHaveBeenCalledTimes(1); // no background polling
    expect(result.current.toolsPending).toBe(false);
  });

  it('keeps the warmup count when a later warmup under-reports the fetched tools (Math.max guard)', async () => {
    // fetch finds tools, but warmup races the node and reports 0 — the count
    // must not regress to 0.
    (fetchNodeTools as jest.Mock).mockResolvedValue(withTools);
    (warmupChat as jest.Mock).mockResolvedValue({ conversation_id: 'warm-1', tools_loaded: 0 });

    const { result } = renderHook(() => useChat(OPTS));
    await settle();

    expect(result.current.toolCount).toBe(1);
    expect(result.current.toolsPending).toBe(false);
  });

  it('does NOT re-mint the conversation on pull-to-refresh once the user is chatting (G)', async () => {
    // Healthy node (tools on first fetch, so no background poll). The user
    // starts a conversation, then pull-to-refresh re-runs the startup effect —
    // it must refresh tools WITHOUT discarding the in-progress conversation.
    (fetchNodeTools as jest.Mock).mockResolvedValue(withTools);
    (warmupChat as jest.Mock)
      .mockResolvedValueOnce({ conversation_id: 'warm-1', tools_loaded: 1 })
      .mockResolvedValueOnce({ conversation_id: 'warm-2', tools_loaded: 1 });

    const { result } = renderHook(() => useChat(OPTS));
    await settle();
    expect(result.current.conversationId).toBe('warm-1');

    // User sends a message (sendChatMessage never resolves → conversation is
    // in-flight on warm-1).
    act(() => result.current.sendMessage('hi'));
    expect(result.current.conversationId).toBe('warm-1');

    // Pull-to-refresh → re-runs the effect (warmupChat → warm-2) but must keep
    // the user's conversation.
    act(() => result.current.refreshTools());
    await settle();

    expect(warmupChat).toHaveBeenCalledTimes(2); // it re-warmed…
    expect(result.current.conversationId).toBe('warm-1'); // …but did NOT adopt warm-2
  });

  it('cancels the pending poll on unmount (no further fetches, no leak) (F)', async () => {
    (fetchNodeTools as jest.Mock).mockResolvedValue(empty);

    const { result, unmount } = renderHook(() => useChat(OPTS));
    await settle();
    expect(result.current.toolsPending).toBe(true);
    expect(fetchNodeTools).toHaveBeenCalledTimes(1);

    unmount();
    await advance(TOTAL_BACKOFF + 1000);

    expect(fetchNodeTools).toHaveBeenCalledTimes(1); // pending timer was cleared
  });
});
