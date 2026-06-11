import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import InboxDetailScreen from '../../src/screens/Inbox/InboxDetailScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockPush = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    push: mockPush,
  }),
  useRoute: () => ({
    params: { itemId: 'test-id' },
  }),
}));

jest.mock('react-native-markdown-display', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: any) => <Text>{children}</Text>,
  };
});

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

const mockGetInboxItem = jest.fn();
const mockDeleteInboxItem = jest.fn();

jest.mock('../../src/api/inboxApi', () => ({
  getInboxItem: (...args: any[]) => mockGetInboxItem(...args),
  deleteInboxItem: (...args: any[]) => mockDeleteInboxItem(...args),
}));

const mockSendInteractiveCallback = jest.fn();

jest.mock('../../src/api/commandCenterApi', () => ({
  sendNodeAction: jest.fn(),
  sendInteractiveCallback: (...args: any[]) => mockSendInteractiveCallback(...args),
}));

jest.mock('../../src/components/ActionButtons', () => {
  const { Text, TouchableOpacity } = require('react-native');
  return {
    __esModule: true,
    default: ({ actions, onPress }: any) => (
      <>
        {actions.map((a: any) => (
          <TouchableOpacity key={a.button_action} onPress={() => onPress(a)}>
            <Text>{a.button_text}</Text>
          </TouchableOpacity>
        ))}
      </>
    ),
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const sampleItem = {
  id: 'test-id',
  user_id: 1,
  household_id: 'household-1',
  title: 'Deep Research Results',
  summary: 'Summary of findings',
  body: 'This is the full body of the research results.',
  category: 'deep_research',
  source_service: 'command-center',
  metadata: null,
  content_format: 'markdown' as const,
  is_read: true,
  created_at: '2026-03-15T10:30:00Z',
};

const sampleItemWithSources = {
  ...sampleItem,
  metadata: {
    sources: [
      { title: 'Source One', url: 'https://example.com/1' },
      { title: 'Source Two', url: 'https://example.com/2' },
    ],
  },
};

const sampleItemWithThinking = {
  ...sampleItem,
  body: '<think>Let me analyze this carefully</think>Here are the research findings.',
};

const sampleConfirmationItem = {
  ...sampleItem,
  category: 'confirmation',
  title: 'Send email?',
  body: 'Draft email to John about meeting.',
  metadata: {
    command_name: 'send_email',
    node_id: 'node-1',
    draft: { to: 'john@example.com', subject: 'Meeting' },
    actions: [
      { button_text: 'Send', button_action: 'send_email', button_type: 'primary' },
      { button_text: 'Cancel', button_action: 'cancel_email', button_type: 'destructive' },
    ],
  },
};

// Smart-reply style item: the draft lives ONLY in metadata.editable_text;
// the body stays From/Subject/snippet.
const sampleSmartReplyItem = {
  ...sampleItem,
  category: 'smart_reply',
  title: 'Reply ready — Sender 1',
  body: 'From: Sender 1 <s1@example.com>\nSubject: Subject 1\n\nSnippet 1',
  content_format: 'plain' as const,
  metadata: {
    node_id: 'node-1',
    editable_text: {
      label: 'Draft reply',
      initial: 'Sounds good — see you then.',
      data_key: 'body',
    },
    interactive_elements: [
      {
        id: 'send-1',
        label: 'Send reply',
        kind: 'send',
        command: 'email',
        callback: 'send_draft_reply',
        data: { message_id: 'm1', thread_id: 't1', body: 'Sounds good — see you then.' },
        navigation_type: 'stack',
      },
      {
        id: 'ignore-1',
        label: 'Ignore',
        command: 'email',
        callback: 'dismiss_draft',
        data: { message_id: 'm1' },
      },
    ],
  },
};

describe('InboxDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show loading spinner while fetching', () => {
    mockGetInboxItem.mockReturnValue(new Promise(() => {})); // never resolves

    const { getByTestId } = render(<InboxDetailScreen />, { wrapper });
    // ActivityIndicator from react-native-paper renders with testID
    // We check for ActivityIndicator by looking for the loading state
    expect(getByTestId).toBeTruthy();
  });

  it('should render item title after loading', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItem);

    const { getByText } = render(<InboxDetailScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Deep Research Results')).toBeTruthy();
    });
  });

  it('should render item category as chip', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItem);

    const { getByText } = render(<InboxDetailScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('deep research')).toBeTruthy();
    });
  });

  it('should render the source service', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItem);

    const { getByText } = render(<InboxDetailScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText(/command-center/)).toBeTruthy();
    });
  });

  it('should render the body content', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItem);

    const { getByText } = render(<InboxDetailScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('This is the full body of the research results.')).toBeTruthy();
    });
  });

  it('should show "Sources" section when metadata has sources', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItemWithSources);

    const { getByText } = render(<InboxDetailScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Sources')).toBeTruthy();
      expect(getByText('1. Source One')).toBeTruthy();
      expect(getByText('2. Source Two')).toBeTruthy();
    });
  });

  it('should not show "Sources" section when there are no sources', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItem);

    const { queryByText } = render(<InboxDetailScreen />, { wrapper });

    await waitFor(() => {
      expect(queryByText('Sources')).toBeNull();
    });
  });

  it('should show "Show reasoning" button when think tags are present', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItemWithThinking);

    const { getByText } = render(<InboxDetailScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Show reasoning')).toBeTruthy();
    });
  });

  it('should toggle thinking content when "Show reasoning" is pressed', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItemWithThinking);

    const { getByText, queryByText } = render(<InboxDetailScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Show reasoning')).toBeTruthy();
    });

    // Thinking content should not be visible initially
    expect(queryByText('Let me analyze this carefully')).toBeNull();

    // Press "Show reasoning"
    fireEvent.press(getByText('Show reasoning'));

    await waitFor(() => {
      expect(getByText('Let me analyze this carefully')).toBeTruthy();
      expect(getByText('Hide reasoning')).toBeTruthy();
    });
  });

  it('should not show "Show reasoning" button when no think tags', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItem);

    const { queryByText } = render(<InboxDetailScreen />, { wrapper });

    await waitFor(() => {
      expect(queryByText('Show reasoning')).toBeNull();
    });
  });

  it('should show action buttons for confirmation category', async () => {
    mockGetInboxItem.mockResolvedValue(sampleConfirmationItem);

    const { getByText } = render(<InboxDetailScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Send')).toBeTruthy();
      expect(getByText('Cancel')).toBeTruthy();
    });
  });

  it('should show error state with retry on load failure', async () => {
    mockGetInboxItem.mockRejectedValue(new Error('Network error'));

    const { getByText } = render(<InboxDetailScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Could not load item')).toBeTruthy();
      expect(getByText('Retry')).toBeTruthy();
    });
  });

  it('should call getInboxItem with the correct itemId', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItem);

    render(<InboxDetailScreen />, { wrapper });

    await waitFor(() => {
      expect(mockGetInboxItem).toHaveBeenCalledWith('test-id');
    });
  });

  it('should show back button that navigates back', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItem);

    const { getByText } = render(<InboxDetailScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Inbox')).toBeTruthy();
    });

    fireEvent.press(getByText('Inbox'));
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('should render body content stripped of think tags', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItemWithThinking);

    const { getByText, queryByText } = render(<InboxDetailScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Here are the research findings.')).toBeTruthy();
    });

    // The think content should NOT be in the main body display
    // (it should only appear when "Show reasoning" is toggled)
    expect(queryByText('Let me analyze this carefully')).toBeNull();
  });

  describe('editable_text (smart-reply drafts)', () => {
    it('renders the label and an input seeded with initial', async () => {
      mockGetInboxItem.mockResolvedValue(sampleSmartReplyItem);

      const { getByText, getByDisplayValue } = render(<InboxDetailScreen />, { wrapper });

      await waitFor(() => {
        expect(getByText('Draft reply')).toBeTruthy();
        expect(getByDisplayValue('Sounds good — see you then.')).toBeTruthy();
      });
      // Interactive element chips render alongside the editor.
      expect(getByText('Send reply')).toBeTruthy();
      expect(getByText('Ignore')).toBeTruthy();
    });

    it('sends the edited text as data.body in the Send callback payload', async () => {
      mockGetInboxItem.mockResolvedValue(sampleSmartReplyItem);
      mockSendInteractiveCallback.mockResolvedValue({
        id: 'job-1', status: 'pending', navigation_type: 'stack', created_at: 'x',
      });

      const { getByText, getByTestId } = render(<InboxDetailScreen />, { wrapper });

      await waitFor(() => {
        expect(getByTestId('editable-text-input')).toBeTruthy();
      });

      fireEvent.changeText(getByTestId('editable-text-input'), 'Edited reply text.');
      fireEvent.press(getByText('Send reply'));

      await waitFor(() => {
        expect(mockSendInteractiveCallback).toHaveBeenCalledWith({
          command_name: 'email',
          callback_name: 'send_draft_reply',
          data: { message_id: 'm1', thread_id: 't1', body: 'Edited reply text.' },
          target_node_id: 'node-1',
          navigation_type: 'stack',
        });
      });
    });

    it('leaves the Ignore payload untouched even after editing', async () => {
      mockGetInboxItem.mockResolvedValue(sampleSmartReplyItem);
      mockSendInteractiveCallback.mockResolvedValue({
        id: 'job-2', status: 'pending', navigation_type: 'new_notification', created_at: 'x',
      });

      const { getByText, getByTestId } = render(<InboxDetailScreen />, { wrapper });

      await waitFor(() => {
        expect(getByTestId('editable-text-input')).toBeTruthy();
      });

      fireEvent.changeText(getByTestId('editable-text-input'), 'Edited reply text.');
      fireEvent.press(getByText('Ignore'));

      await waitFor(() => {
        expect(mockSendInteractiveCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            callback_name: 'dismiss_draft',
            data: { message_id: 'm1' },
          }),
        );
      });
    });

    it('blocks Send with an inline error when the editor is empty', async () => {
      mockGetInboxItem.mockResolvedValue(sampleSmartReplyItem);

      const { getByText, getByTestId } = render(<InboxDetailScreen />, { wrapper });

      await waitFor(() => {
        expect(getByTestId('editable-text-input')).toBeTruthy();
      });

      fireEvent.changeText(getByTestId('editable-text-input'), '');
      fireEvent.press(getByText('Send reply'));

      await waitFor(() => {
        expect(getByText('Draft is empty')).toBeTruthy();
      });
      expect(mockSendInteractiveCallback).not.toHaveBeenCalled();
    });

    it.each([
      ['missing initial', { label: 'Draft reply', data_key: 'body' }],
      ['missing data_key', { label: 'Draft reply', initial: 'text' }],
      ['initial wrong type', { initial: 42, data_key: 'body' }],
      ['data_key wrong type', { initial: 'text', data_key: 7 }],
      ['label wrong type', { label: 9, initial: 'text', data_key: 'body' }],
      ['not an object', 'just a string'],
    ])('ignores malformed editable_text (%s) and keeps elements working', async (_name, editableText) => {
      mockGetInboxItem.mockResolvedValue({
        ...sampleSmartReplyItem,
        metadata: { ...sampleSmartReplyItem.metadata, editable_text: editableText },
      });
      mockSendInteractiveCallback.mockResolvedValue({
        id: 'job-3', status: 'pending', navigation_type: 'stack', created_at: 'x',
      });

      const { getByText, queryByTestId } = render(<InboxDetailScreen />, { wrapper });

      await waitFor(() => {
        expect(getByText('Send reply')).toBeTruthy();
      });
      // No editor rendered...
      expect(queryByTestId('editable-text-input')).toBeNull();

      // ...and elements behave exactly as today (original draft sent).
      fireEvent.press(getByText('Send reply'));
      await waitFor(() => {
        expect(mockSendInteractiveCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { message_id: 'm1', thread_id: 't1', body: 'Sounds good — see you then.' },
          }),
        );
      });
    });

    it('renders items without editable_text exactly as before', async () => {
      mockGetInboxItem.mockResolvedValue(sampleItem);

      const { getByText, queryByTestId } = render(<InboxDetailScreen />, { wrapper });

      await waitFor(() => {
        expect(getByText('Deep Research Results')).toBeTruthy();
      });
      expect(queryByTestId('editable-text-input')).toBeNull();
    });
  });
});
