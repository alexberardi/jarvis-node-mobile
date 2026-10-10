import React from 'react';
import { AppState } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import HomeScreen from '../../src/screens/Home/HomeScreen';
import { setPendingIntent } from '../../src/navigation/deepLinks';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
  useIsFocused: () => true,
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => {
      cb();
    }, []);
  },
}));

const mockSendMessage = jest.fn();
const mockClearConversation = jest.fn();
const mockRefreshTools = jest.fn();

const mockUseChatBase = {
  messages: [] as unknown[],
  conversationId: null,
  isLoading: false,
  warmupState: 'idle',
  toolCount: 0,
  toolNames: [] as string[],
  toolInfos: [] as unknown[],
  toolsPending: false,
  sendMessage: mockSendMessage,
  clearConversation: mockClearConversation,
  refreshTools: mockRefreshTools,
};
// Mutable per-test useChat state. `mock`-prefixed so jest allows the factory
// to reference it. Reset to base in beforeEach; override via setUseChat().
let mockUseChatState: Record<string, unknown> = { ...mockUseChatBase };
const setUseChat = (overrides: Record<string, unknown>) => {
  mockUseChatState = { ...mockUseChatBase, ...overrides };
};

// The options HomeScreen passed to useChat on the latest render (lets tests
// fire onImagesRejected as the hook would on a 422).
let mockUseChatOpts: Record<string, any> = {};
jest.mock('../../src/hooks/useChat', () => ({
  useChat: (opts: Record<string, any>) => {
    mockUseChatOpts = opts;
    return mockUseChatState;
  },
}));

const mockStartRecording = jest.fn().mockResolvedValue(true);
const mockStopRecording = jest.fn().mockResolvedValue(null);
jest.mock('../../src/hooks/useVoiceRecording', () => ({
  useVoiceRecording: () => ({
    isRecording: false,
    startRecording: mockStartRecording,
    stopRecording: mockStopRecording,
  }),
}));

const mockGetUnreadCount = jest.fn().mockResolvedValue(0);
jest.mock('../../src/api/inboxApi', () => ({
  getUnreadCount: (...args: any[]) => mockGetUnreadCount(...args),
}));

jest.mock('../../src/api/commandCenterApi', () => ({
  sendNodeAction: jest.fn(),
}));

const NO_CAPS = { images: false, max_images: 0, max_image_bytes: 0 };
const IMAGE_CAPS = { images: true, max_images: 4, max_image_bytes: 2097152 };
// Default: a legacy server (capabilities read failed/404 → no images).
const mockFetchChatCapabilities = jest.fn().mockResolvedValue(NO_CAPS);
jest.mock('../../src/api/chatApi', () => ({
  getTTSConfig: jest.fn(),
  transcribeAudio: jest.fn(),
  fetchChatCapabilities: (...args: any[]) => mockFetchChatCapabilities(...args),
  getCachedChatCapabilities: () => null,
  NO_CHAT_CAPABILITIES: { images: false, max_images: 0, max_image_bytes: 0 },
}));

const mockPickChatImages = jest.fn();
const mockPrepareChatImage = jest.fn();
jest.mock('../../src/services/chatImageService', () => ({
  pickChatImages: (...args: any[]) => mockPickChatImages(...args),
  prepareChatImage: (...args: any[]) => mockPrepareChatImage(...args),
}));

jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn(),
    },
    Recording: jest.fn(),
    requestPermissionsAsync: jest.fn(),
    setAudioModeAsync: jest.fn(),
  },
}));

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    state: {
      isAuthenticated: true,
      accessToken: 'mock-token',
      activeHouseholdId: 'household-1',
      households: [{ id: 'household-1', name: 'Home', role: 'admin' }],
      user: { id: 1, email: 'test@test.com' },
    },
    logout: jest.fn(),
  }),
}));

const mockNodeSelectorRefresh = jest.fn().mockResolvedValue(undefined);
let mockTriggerPendingReady: ((node: any) => void) | null = null;
// Controls the readiness the mocked NodeSelector reports when a node is picked.
// Default true (node is a live household member); set false to simulate a
// still-provisioning / offline / wrong-household node.
let mockNodeReady = true;
jest.mock('../../src/components/NodeSelector', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(
      ({ selectedNodeId, onSelectNode, onPendingNodeReady, onSelectedNodeReadyChange }: any, ref: any) => {
        React.useImperativeHandle(ref, () => ({ refresh: mockNodeSelectorRefresh }), []);
        mockTriggerPendingReady = onPendingNodeReady ?? null;
        return (
          <Text
            testID="node-selector"
            onPress={() => {
              onSelectNode('node-1');
              onSelectedNodeReadyChange?.(mockNodeReady);
            }}
          >
            {selectedNodeId ? `Selected: ${selectedNodeId}` : 'No node selected'}
          </Text>
        );
      },
    ),
  };
});

jest.mock('../../src/components/QuickActions', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: () => <Text testID="quick-actions">QuickActions</Text>,
  };
});

jest.mock('../../src/components/ChatBubble', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ message }: any) => <Text>{message.content}</Text>,
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setUseChat({});
    mockNodeReady = true;
    mockFetchChatCapabilities.mockResolvedValue(NO_CAPS);
    mockPickChatImages.mockResolvedValue([]);
    mockPrepareChatImage.mockImplementation(async (img: { uri: string }) => ({
      mime: 'image/jpeg',
      data: `b64:${img.uri}`,
    }));
    mockGetUnreadCount.mockResolvedValue(0);
    mockStartRecording.mockResolvedValue(true);
    setPendingIntent(null);
    // Auto-listen only starts when the app is foreground-active.
    (AppState as unknown as { currentState: string }).currentState = 'active';
  });
  afterEach(() => setPendingIntent(null));

  it('should render the Jarvis header', () => {
    const { getByText } = render(<HomeScreen />, { wrapper });
    expect(getByText('Jarvis')).toBeTruthy();
  });

  it('should render the settings button', () => {
    const { getByTestId } = render(<HomeScreen />, { wrapper });
    expect(getByTestId('settings-button')).toBeTruthy();
  });

  it('should render the inbox button', () => {
    const { getByTestId } = render(<HomeScreen />, { wrapper });
    expect(getByTestId('inbox-button')).toBeTruthy();
  });

  it('should navigate to Settings on settings button press', () => {
    const { getByTestId } = render(<HomeScreen />, { wrapper });
    fireEvent.press(getByTestId('settings-button'));
    expect(mockNavigate).toHaveBeenCalledWith('Settings');
  });

  it('should navigate to Inbox on inbox button press', () => {
    const { getByTestId } = render(<HomeScreen />, { wrapper });
    fireEvent.press(getByTestId('inbox-button'));
    expect(mockNavigate).toHaveBeenCalledWith('Inbox', { screen: 'InboxList' });
  });

  it('arms voice capture for a pending stt quick-open once a node is selected', async () => {
    // Intent stashed before the screen exists — e.g. a link that arrived
    // while logged out, now replayed after auth lands the user on Home.
    setPendingIntent('stt');

    const { getByTestId } = render(<HomeScreen />, { wrapper });

    // Drained on focus, but no node yet -> waits, does not record.
    expect(mockStartRecording).not.toHaveBeenCalled();

    // Node auto-select (simulated) resolves -> recording starts.
    fireEvent.press(getByTestId('node-selector'));
    await waitFor(() => {
      expect(mockStartRecording).toHaveBeenCalled();
    });
  });

  it('does not arm voice capture for a chat-only quick-open', async () => {
    setPendingIntent('chat');

    const { getByTestId } = render(<HomeScreen />, { wrapper });
    fireEvent.press(getByTestId('node-selector'));

    // Give the effects a chance to run, then confirm no recording started.
    await waitFor(() => {
      expect(getByTestId('node-selector')).toBeTruthy();
    });
    expect(mockStartRecording).not.toHaveBeenCalled();
  });

  it('should show badge when unread count > 0', async () => {
    mockGetUnreadCount.mockResolvedValue(5);

    const { findByText } = render(<HomeScreen />, { wrapper });

    await waitFor(() => {
      expect(mockGetUnreadCount).toHaveBeenCalled();
    });

    const badge = await findByText('5');
    expect(badge).toBeTruthy();
  });

  it('should not show badge when unread count is 0', async () => {
    mockGetUnreadCount.mockResolvedValue(0);

    const { queryByText } = render(<HomeScreen />, { wrapper });

    await waitFor(() => {
      expect(mockGetUnreadCount).toHaveBeenCalled();
    });

    // Badge should not be rendered for 0
    expect(queryByText('0')).toBeNull();
  });

  it('should show "Select a node first" placeholder when no node is selected', () => {
    const { getByPlaceholderText } = render(
      <HomeScreen />,
      { wrapper },
    );
    expect(getByPlaceholderText('Select a node first')).toBeTruthy();
  });

  it('should show "Message Jarvis..." placeholder when a node is selected and tools are ready', () => {
    setUseChat({ warmupState: 'ready', toolCount: 3, toolsPending: false });
    const { getByTestId, getByPlaceholderText } = render(
      <HomeScreen />,
      { wrapper },
    );

    // Select a node via the mocked NodeSelector
    fireEvent.press(getByTestId('node-selector'));

    expect(getByPlaceholderText('Message Jarvis...')).toBeTruthy();
  });

  it('should disable the input and show "Waiting for node…" while the node is still coming online', () => {
    // Tools may even have reported, but the node is not yet a live member of the
    // household (still provisioning / offline / wrong household) — sending would
    // 404, so the composer must stay disabled.
    setUseChat({ warmupState: 'ready', toolCount: 15, toolsPending: false });
    mockNodeReady = false;
    const { getByTestId, getByPlaceholderText } = render(
      <HomeScreen />,
      { wrapper },
    );

    fireEvent.press(getByTestId('node-selector'));

    const input = getByPlaceholderText('Waiting for node…');
    expect(input.props.editable).toBe(false);
  });

  it('should disable the input and show "Loading tools…" while the node has not reported tools', () => {
    setUseChat({ warmupState: 'ready', toolCount: 0, toolsPending: true });
    const { getByTestId, getByPlaceholderText } = render(
      <HomeScreen />,
      { wrapper },
    );

    fireEvent.press(getByTestId('node-selector'));

    const input = getByPlaceholderText('Loading tools…');
    expect(input.props.editable).toBe(false);
  });

  it('should show QuickActions when there are no messages', () => {
    const { getByTestId } = render(<HomeScreen />, { wrapper });
    expect(getByTestId('quick-actions')).toBeTruthy();
  });

  it('should render the NodeSelector', () => {
    const { getByTestId } = render(<HomeScreen />, { wrapper });
    expect(getByTestId('node-selector')).toBeTruthy();
  });

  it('should disable text input when no node is selected', () => {
    const { getByPlaceholderText } = render(<HomeScreen />, { wrapper });
    const input = getByPlaceholderText('Select a node first');
    expect(input.props.editable).toBe(false);
  });

  it('should enable text input when a node is selected and tools are ready', () => {
    setUseChat({ warmupState: 'ready', toolCount: 3, toolsPending: false });
    const { getByTestId, getByPlaceholderText } = render(
      <HomeScreen />,
      { wrapper },
    );

    fireEvent.press(getByTestId('node-selector'));

    const input = getByPlaceholderText('Message Jarvis...');
    expect(input.props.editable).toBe(true);
  });

  it('pull-to-refresh re-fetches the node list via the NodeSelector ref', async () => {
    const { getByTestId } = render(<HomeScreen />, { wrapper });

    const list = getByTestId('chat-list');
    await act(async () => {
      await list.props.refreshControl.props.onRefresh();
    });

    expect(mockNodeSelectorRefresh).toHaveBeenCalled();
  });

  it('shows a ready snackbar when a provisioned node comes online', async () => {
    const { findByText } = render(<HomeScreen />, { wrapper });

    expect(mockTriggerPendingReady).toBeTruthy();
    act(() => {
      mockTriggerPendingReady!({
        node_id: 'node-new',
        room: 'living_room',
        online: true,
        last_seen: null,
      });
    });

    expect(await findByText('Living Room is ready — say hi to Jarvis!')).toBeTruthy();
  });

  describe('image attachments', () => {
    const PHOTO = { uri: 'file:///photo-1.jpg', width: 4000, height: 3000 };
    const PHOTO2 = { uri: 'file:///photo-2.jpg', width: 800, height: 600 };

    // Render with a node selected + tools ready, and let the capabilities read land.
    const renderReadyChat = async () => {
      setUseChat({ warmupState: 'ready', toolCount: 3, toolsPending: false });
      const utils = render(<HomeScreen />, { wrapper });
      fireEvent.press(utils.getByTestId('node-selector'));
      await waitFor(() => expect(mockFetchChatCapabilities).toHaveBeenCalled());
      return utils;
    };

    const attachFromLibrary = async (utils: ReturnType<typeof render>) => {
      fireEvent.press(utils.getByTestId('attach-image-button'));
      fireEvent.press(await utils.findByTestId('attach-library'));
    };

    it('hides the attach button on a legacy server (no images capability)', async () => {
      const { queryByTestId } = await renderReadyChat();
      expect(queryByTestId('attach-image-button')).toBeNull();
    });

    it('hides the attach button when the server reports images: false', async () => {
      mockFetchChatCapabilities.mockResolvedValue({ ...IMAGE_CAPS, images: false });
      const { queryByTestId } = await renderReadyChat();
      expect(queryByTestId('attach-image-button')).toBeNull();
    });

    it('shows the attach button when the server supports images', async () => {
      mockFetchChatCapabilities.mockResolvedValue(IMAGE_CAPS);
      const { findByTestId } = await renderReadyChat();
      expect(await findByTestId('attach-image-button')).toBeTruthy();
    });

    it('picks from the library with the remaining slot count, then shows and removes thumbnails', async () => {
      mockFetchChatCapabilities.mockResolvedValue(IMAGE_CAPS);
      mockPickChatImages.mockResolvedValueOnce([PHOTO, PHOTO2]);
      const utils = await renderReadyChat();
      await utils.findByTestId('attach-image-button');

      await attachFromLibrary(utils);

      await waitFor(() => expect(mockPickChatImages).toHaveBeenCalledWith('library', 4));
      await waitFor(() => expect(utils.getAllByTestId('pending-image-thumb')).toHaveLength(2));

      fireEvent.press(utils.getByTestId('remove-image-0'));
      const thumbs = utils.getAllByTestId('pending-image-thumb');
      expect(thumbs).toHaveLength(1);
      expect(thumbs[0].props.source).toEqual({ uri: PHOTO2.uri });
    });

    it('waits for the attach sheet to close before opening the picker (iOS "Unable to Load Photos")', async () => {
      mockFetchChatCapabilities.mockResolvedValue(IMAGE_CAPS);
      const utils = await renderReadyChat();
      await utils.findByTestId('attach-image-button');
      await attachFromLibrary(utils);

      // Not in the same tick as the tap: the sheet is still animating out.
      expect(mockPickChatImages).not.toHaveBeenCalled();
      await waitFor(() => expect(mockPickChatImages).toHaveBeenCalledWith('library', 4));
    });

    it('offers the camera as a source', async () => {
      mockFetchChatCapabilities.mockResolvedValue(IMAGE_CAPS);
      const utils = await renderReadyChat();
      fireEvent.press(await utils.findByTestId('attach-image-button'));
      fireEvent.press(await utils.findByTestId('attach-camera'));
      await waitFor(() => expect(mockPickChatImages).toHaveBeenCalledWith('camera', 4));
    });

    it('sends an image with no text: resizes each image, then sends refs + payload', async () => {
      mockFetchChatCapabilities.mockResolvedValue(IMAGE_CAPS);
      mockPickChatImages.mockResolvedValueOnce([PHOTO]);
      const utils = await renderReadyChat();
      await utils.findByTestId('attach-image-button');
      await attachFromLibrary(utils);
      await utils.findByTestId('pending-image-thumb');

      await act(async () => {
        fireEvent.press(utils.getByTestId('send-button'));
      });

      expect(mockPrepareChatImage).toHaveBeenCalledWith(PHOTO, IMAGE_CAPS.max_image_bytes);
      expect(mockSendMessage).toHaveBeenCalledWith('', {
        refs: [{ uri: PHOTO.uri, width: PHOTO.width, height: PHOTO.height }],
        payload: [{ mime: 'image/jpeg', data: `b64:${PHOTO.uri}` }],
      });
      expect(utils.queryByTestId('pending-image-thumb')).toBeNull();
    });

    it('refuses to send and keeps the draft when an image cannot be shrunk enough', async () => {
      mockFetchChatCapabilities.mockResolvedValue(IMAGE_CAPS);
      mockPickChatImages.mockResolvedValueOnce([PHOTO]);
      mockPrepareChatImage.mockRejectedValueOnce(new Error('This image is too large to send.'));
      const utils = await renderReadyChat();
      await utils.findByTestId('attach-image-button');
      await attachFromLibrary(utils);
      await utils.findByTestId('pending-image-thumb');

      await act(async () => {
        fireEvent.press(utils.getByTestId('send-button'));
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(await utils.findByText('This image is too large to send.')).toBeTruthy();
      expect(utils.getByTestId('pending-image-thumb')).toBeTruthy();
    });

    it('on a 422 images_unavailable: hides the button, re-reads capabilities, tells the user', async () => {
      mockFetchChatCapabilities.mockResolvedValue(IMAGE_CAPS);
      const utils = await renderReadyChat();
      await utils.findByTestId('attach-image-button');
      mockFetchChatCapabilities.mockClear();
      mockFetchChatCapabilities.mockResolvedValue({ ...IMAGE_CAPS, images: false });

      act(() => mockUseChatOpts.onImagesRejected('images_unavailable'));

      expect(utils.queryByTestId('attach-image-button')).toBeNull();
      expect(mockFetchChatCapabilities).toHaveBeenCalledTimes(1);
      expect(await utils.findByText('Images are turned off on the Jarvis server.')).toBeTruthy();
    });

    it('on a 422 images_invalid: keeps images available and shows a clear message', async () => {
      mockFetchChatCapabilities.mockResolvedValue(IMAGE_CAPS);
      const utils = await renderReadyChat();
      await utils.findByTestId('attach-image-button');

      act(() => mockUseChatOpts.onImagesRejected('images_invalid'));

      expect(
        await utils.findByText('The server rejected those images. Try fewer or smaller photos.'),
      ).toBeTruthy();
      expect(utils.getByTestId('attach-image-button')).toBeTruthy();
    });

    it('legacy server: text send is unchanged (no images argument)', async () => {
      const utils = await renderReadyChat();
      fireEvent.changeText(utils.getByPlaceholderText('Message Jarvis...'), 'hello');
      await act(async () => {
        fireEvent.press(utils.getByTestId('send-button'));
      });
      expect(mockSendMessage).toHaveBeenCalledWith('hello');
      expect(mockPrepareChatImage).not.toHaveBeenCalled();
    });
  });
});
