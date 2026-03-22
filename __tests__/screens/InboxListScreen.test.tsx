import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import InboxListScreen from '../../src/screens/Inbox/InboxListScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockGetParent = jest.fn().mockReturnValue({ goBack: mockGoBack });

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    getParent: mockGetParent,
  }),
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => {
      cb();
    }, []);
  },
}));

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: any) => <View>{children}</View>,
  };
});

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {},
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

const mockListInboxItems = jest.fn();
const mockDeleteInboxItem = jest.fn();

jest.mock('../../src/api/inboxApi', () => ({
  listInboxItems: (...args: any[]) => mockListInboxItems(...args),
  deleteInboxItem: (...args: any[]) => mockDeleteInboxItem(...args),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const sampleItems = [
  {
    id: 'item-1',
    user_id: 1,
    household_id: 'household-1',
    title: 'Research on AI trends',
    summary: 'A comprehensive look at current AI developments',
    body: 'Full body content here',
    category: 'deep_research',
    source_service: 'command-center',
    metadata: null,
    content_format: 'markdown' as const,
    is_read: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'item-2',
    user_id: 1,
    household_id: 'household-1',
    title: 'Reminder: Take out trash',
    summary: 'Weekly reminder for trash day',
    body: 'Take out the trash tonight',
    category: 'reminder',
    source_service: 'command-center',
    metadata: null,
    content_format: 'plain' as const,
    is_read: true,
    created_at: new Date().toISOString(),
  },
];

describe('InboxListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListInboxItems.mockResolvedValue([]);
  });

  it('should render the "Inbox" title', async () => {
    const { getByText } = render(<InboxListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Inbox')).toBeTruthy();
    });
  });

  it('should show "No messages yet" when inbox is empty', async () => {
    mockListInboxItems.mockResolvedValue([]);

    const { getByText } = render(<InboxListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('No messages yet')).toBeTruthy();
    });
  });

  it('should show inbox items with titles', async () => {
    mockListInboxItems.mockResolvedValue(sampleItems);

    const { getByText } = render(<InboxListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Research on AI trends')).toBeTruthy();
      expect(getByText('Reminder: Take out trash')).toBeTruthy();
    });
  });

  it('should show item summaries', async () => {
    mockListInboxItems.mockResolvedValue(sampleItems);

    const { getByText } = render(<InboxListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('A comprehensive look at current AI developments')).toBeTruthy();
      expect(getByText('Weekly reminder for trash day')).toBeTruthy();
    });
  });

  it('should show category chips', async () => {
    mockListInboxItems.mockResolvedValue(sampleItems);

    const { getByText } = render(<InboxListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('deep research')).toBeTruthy();
      expect(getByText('reminder')).toBeTruthy();
    });
  });

  it('should show error message on load failure', async () => {
    mockListInboxItems.mockRejectedValue(new Error('Network error'));

    const { getByText } = render(<InboxListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Could not load inbox')).toBeTruthy();
    });
  });

  it('should show Retry button on load failure', async () => {
    mockListInboxItems.mockRejectedValue(new Error('Network error'));

    const { getByText } = render(<InboxListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Retry')).toBeTruthy();
    });
  });

  it('should call listInboxItems on mount', async () => {
    mockListInboxItems.mockResolvedValue([]);

    render(<InboxListScreen />, { wrapper });

    await waitFor(() => {
      expect(mockListInboxItems).toHaveBeenCalled();
    });
  });

  it('should strip think tags from summaries', async () => {
    const itemWithThink = [
      {
        ...sampleItems[0],
        summary: '<think>internal reasoning here</think>The actual summary',
      },
    ];
    mockListInboxItems.mockResolvedValue(itemWithThink);

    const { getByText, queryByText } = render(<InboxListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('The actual summary')).toBeTruthy();
      expect(queryByText('internal reasoning here')).toBeNull();
    });
  });
});
