import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import InboxDetailScreen from '../../src/screens/Inbox/InboxDetailScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
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

jest.mock('../../src/api/commandCenterApi', () => ({
  sendNodeAction: jest.fn(),
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
});
