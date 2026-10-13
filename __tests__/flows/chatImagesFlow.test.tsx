import { renderHook, act, waitFor } from '@testing-library/react-native';

import { IMAGE_ERROR_MESSAGES, useChat } from '../../src/hooks/useChat';
import {
  ChatRequestError,
  fetchNodeTools,
  sendChatMessage,
  warmupChat,
} from '../../src/api/chatApi';

// useChat with image attachments: payload shape on the wire, local URIs on the
// user's bubble, image-only sends, and the 422 image rejections. Only the
// network leaves are mocked; ChatRequestError is the real class.

jest.mock('../../src/api/chatApi', () => ({
  ChatRequestError: jest.requireActual('../../src/api/chatApi').ChatRequestError,
  sendChatMessage: jest.fn(),
  fetchNodeTools: jest.fn(),
  warmupChat: jest.fn(),
}));
jest.mock('../../src/contexts/ToolsContext', () => ({
  useToolsVersion: () => ({ toolsVersion: 0 }),
}));

const IMAGES = {
  refs: [{ uri: 'file:///local/a.jpg', width: 800, height: 600 }],
  payload: [{ mime: 'image/jpeg' as const, data: 'QUJD' }],
};

const renderReady = async (extra: Record<string, unknown> = {}) => {
  const hook = renderHook(() =>
    useChat({ nodeId: 'n1', householdId: 'hh1', accessToken: 'tok', ...extra }),
  );
  await waitFor(() => expect(hook.result.current.warmupState).toBe('ready'));
  return hook;
};

describe('useChat — image attachments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchNodeTools as jest.Mock).mockResolvedValue({ client_tools: [], available_commands: [] });
    (warmupChat as jest.Mock).mockResolvedValue({ conversation_id: 'warm-1', tools_loaded: 0 });
    (sendChatMessage as jest.Mock).mockImplementation(() => new Promise<void>(() => {}));
  });

  it('sends base64 images alongside the text and shows local URIs on the user bubble', async () => {
    const { result } = await renderReady();
    act(() => result.current.sendMessage('what is this?', IMAGES));

    const req = (sendChatMessage as jest.Mock).mock.calls[0][0];
    expect(req).toMatchObject({
      message: 'what is this?',
      images: [{ mime: 'image/jpeg', data: 'QUJD' }],
    });
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'what is this?',
      images: [{ uri: 'file:///local/a.jpg' }],
    });
  });

  it('allows an image-only send with an empty message', async () => {
    const { result } = await renderReady();
    act(() => result.current.sendMessage('', IMAGES));

    expect(sendChatMessage).toHaveBeenCalledTimes(1);
    const req = (sendChatMessage as jest.Mock).mock.calls[0][0];
    expect(req.message).toBe('');
    expect(req.images).toHaveLength(1);
  });

  it('still ignores an empty send with no images', async () => {
    const { result } = await renderReady();
    act(() => result.current.sendMessage('   '));
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it('omits the images key entirely for a text-only send (legacy wire shape)', async () => {
    const { result } = await renderReady();
    act(() => result.current.sendMessage('hi'));
    const req = (sendChatMessage as jest.Mock).mock.calls[0][0];
    expect(req).not.toHaveProperty('images');
    expect(result.current.messages[0]).not.toHaveProperty('images');
  });

  it.each(['images_unavailable', 'images_invalid'] as const)(
    'handles a 422 %s without flagging the server unreachable',
    async (code) => {
      (sendChatMessage as jest.Mock).mockRejectedValue(
        new ChatRequestError(422, JSON.stringify({ code, detail: 'x' })),
      );
      const onImagesRejected = jest.fn();
      const { result } = await renderReady({ onImagesRejected });

      await act(async () => {
        result.current.sendMessage('look', IMAGES);
      });

      await waitFor(() => expect(onImagesRejected).toHaveBeenCalledWith(code));
      expect(result.current.isLoading).toBe(false);
      expect(result.current.connectionError).toBeNull();
      expect(result.current.messages[1].content).toBe(IMAGE_ERROR_MESSAGES[code]);
    },
  );

  it('treats a 422 without an image code as an ordinary failure', async () => {
    (sendChatMessage as jest.Mock).mockRejectedValue(
      new ChatRequestError(422, JSON.stringify({ detail: 'bad' })),
    );
    const onImagesRejected = jest.fn();
    const { result } = await renderReady({ onImagesRejected });
    await act(async () => {
      result.current.sendMessage('hi');
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(onImagesRejected).not.toHaveBeenCalled();
    expect(result.current.connectionError).toBe('Could not reach Jarvis server.');
  });
});
