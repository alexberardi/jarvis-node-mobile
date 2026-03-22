import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import HomeScreen from '../../src/screens/Home/HomeScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
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

jest.mock('../../src/hooks/useChat', () => ({
  useChat: () => ({
    messages: [],
    conversationId: null,
    isLoading: false,
    warmupState: 'idle',
    toolCount: 0,
    toolNames: [],
    sendMessage: mockSendMessage,
    clearConversation: mockClearConversation,
    refreshTools: mockRefreshTools,
  }),
}));

jest.mock('../../src/hooks/useVoiceRecording', () => ({
  useVoiceRecording: () => ({
    isRecording: false,
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
  }),
}));

const mockGetUnreadCount = jest.fn().mockResolvedValue(0);
jest.mock('../../src/api/inboxApi', () => ({
  getUnreadCount: (...args: any[]) => mockGetUnreadCount(...args),
}));

jest.mock('../../src/api/commandCenterApi', () => ({
  sendNodeAction: jest.fn(),
}));

jest.mock('../../src/api/chatApi', () => ({
  getTTSConfig: jest.fn(),
  transcribeAudio: jest.fn(),
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

jest.mock('../../src/components/NodeSelector', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ selectedNodeId, onSelectNode }: any) => (
      <Text
        testID="node-selector"
        onPress={() => onSelectNode('node-1')}
      >
        {selectedNodeId ? `Selected: ${selectedNodeId}` : 'No node selected'}
      </Text>
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
    mockGetUnreadCount.mockResolvedValue(0);
  });

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

  it('should show "Message Jarvis..." placeholder when a node is selected', () => {
    const { getByTestId, getByPlaceholderText } = render(
      <HomeScreen />,
      { wrapper },
    );

    // Select a node via the mocked NodeSelector
    fireEvent.press(getByTestId('node-selector'));

    expect(getByPlaceholderText('Message Jarvis...')).toBeTruthy();
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

  it('should enable text input when a node is selected', () => {
    const { getByTestId, getByPlaceholderText } = render(
      <HomeScreen />,
      { wrapper },
    );

    fireEvent.press(getByTestId('node-selector'));

    const input = getByPlaceholderText('Message Jarvis...');
    expect(input.props.editable).toBe(true);
  });
});
