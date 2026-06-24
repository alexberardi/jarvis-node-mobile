import { renderHook, act, waitFor } from '@testing-library/react-native';

import { useChat } from '../../src/hooks/useChat';
import { sendChatMessage, fetchNodeTools, warmupChat } from '../../src/api/chatApi';

// L1 FLOW INTEGRATION — the chat send + SSE STREAMING core (the app's primary
// daily flow, with zero prior coverage). Drives the REAL useChat state machine:
// optimistic user+assistant messages, delta accumulation into one assistant
// message, done finalization (conversation_id), error events, stream rejection
// (connectionError), and the in-flight guard. Only the SSE/api leaves are mocked
// — sendChatMessage's onEvent callback is driven directly, which is exactly the
// brittle SSE-parsing seam this test exists to pin.

jest.mock('../../src/api/chatApi', () => ({
  sendChatMessage: jest.fn(),
  fetchNodeTools: jest.fn(),
  warmupChat: jest.fn(),
}));
jest.mock('../../src/contexts/ToolsContext', () => ({
  useToolsVersion: () => ({ toolsVersion: 0 }),
}));

const OPTS = { nodeId: 'n1', householdId: 'hh1', accessToken: 'tok' };

// Wait for the preemptive startup (fetchNodeTools → warmupChat) to settle so its
// async state updates don't leak into the assertions.
const renderReady = async () => {
  const hook = renderHook(() => useChat(OPTS));
  await waitFor(() => expect(hook.result.current.warmupState).toBe('ready'));
  return hook;
};

describe('useChat — send + SSE streaming (chat core flow integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchNodeTools as jest.Mock).mockResolvedValue({ client_tools: [], available_commands: [] });
    (warmupChat as jest.Mock).mockResolvedValue({ conversation_id: 'warm-1', tools_loaded: 0 });
  });

  it('streams delta events into one assistant message and finalizes on done', async () => {
    let onEvent: (e: any) => void = () => {};
    let resolveStream: () => void = () => {};
    (sendChatMessage as jest.Mock).mockImplementation((_req, _tok, cb) => {
      onEvent = cb;
      return new Promise<void>((res) => {
        resolveStream = res;
      });
    });

    const { result } = await renderReady();

    act(() => result.current.sendMessage('hi'));

    // Optimistic: the user message + an empty assistant placeholder, loading.
    expect(result.current.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'hi'],
      ['assistant', ''],
    ]);
    expect(result.current.isLoading).toBe(true);

    // Two streamed deltas accumulate into the SAME assistant message.
    act(() => onEvent({ type: 'delta', text: 'Hello' }));
    act(() => onEvent({ type: 'delta', text: ' world' }));
    expect(result.current.messages[1].content).toBe('Hello world');
    expect(result.current.isLoading).toBe(true);

    // done finalizes content + conversation_id and stops loading.
    act(() => onEvent({ type: 'done', full_text: 'Hello world', conversation_id: 'c1' }));
    act(() => resolveStream());

    expect(result.current.messages[1].content).toBe('Hello world');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.conversationId).toBe('c1');
    expect(sendChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'hi', node_id: 'n1', household_id: 'hh1' }),
      'tok',
      expect.any(Function),
      expect.anything(),
    );
  });

  it('renders an error event as the assistant message and stops loading', async () => {
    let onEvent: (e: any) => void = () => {};
    (sendChatMessage as jest.Mock).mockImplementation((_req, _tok, cb) => {
      onEvent = cb;
      return new Promise<void>(() => {}); // the error EVENT drives state, not a rejection
    });

    const { result } = await renderReady();
    act(() => result.current.sendMessage('do a thing'));
    act(() => onEvent({ type: 'error', message: 'Tool failed' }));

    expect(result.current.messages[1].content).toBe('Tool failed');
    expect(result.current.isLoading).toBe(false);
  });

  it('sets connectionError + surfaces the failure when the stream rejects', async () => {
    (sendChatMessage as jest.Mock).mockRejectedValue(new Error('Network error during chat stream'));

    const { result } = await renderReady();
    await act(async () => {
      result.current.sendMessage('hi');
    });

    await waitFor(() =>
      expect(result.current.connectionError).toBe('Could not reach Jarvis server.'),
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.messages[1].content).toBe('Network error during chat stream');
  });

  it('ignores a second send while a stream is already in flight', async () => {
    (sendChatMessage as jest.Mock).mockImplementation(() => new Promise<void>(() => {}));

    const { result } = await renderReady();
    act(() => result.current.sendMessage('first'));
    act(() => result.current.sendMessage('second')); // guarded by isLoading

    expect(sendChatMessage).toHaveBeenCalledTimes(1);
    expect(
      result.current.messages.filter((m) => m.role === 'user').map((m) => m.content),
    ).toEqual(['first']);
  });
});
