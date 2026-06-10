import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import InteractiveListScreen from '../../src/screens/Inbox/InteractiveListScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockReplace = jest.fn();

// Stable identities — react-navigation guarantees a stable navigation
// object, and the screen's load callback depends on it.
const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
  replace: mockReplace,
};
const mockRoute = { params: { itemId: 'test-id' } };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => mockRoute,
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
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

const mockGetInboxItem = jest.fn();

jest.mock('../../src/api/inboxApi', () => ({
  getInboxItem: (...args: any[]) => mockGetInboxItem(...args),
}));

const mockListRecords = jest.fn();

jest.mock('../../src/api/commandDataApi', () => ({
  listRecords: (...args: any[]) => mockListRecords(...args),
}));

const mockSendInteractiveCallback = jest.fn();
const mockGetInteractiveCallbackStatus = jest.fn();

jest.mock('../../src/api/commandCenterApi', () => ({
  sendInteractiveCallback: (...args: any[]) => mockSendInteractiveCallback(...args),
  getInteractiveCallbackStatus: (...args: any[]) =>
    mockGetInteractiveCallbackStatus(...args),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const baseMetadata = {
  type: 'interactive_list',
  version: 1,
  command_name: 'export_shopping_list',
  node_id: 'node-1',
  context: { provider: 'walmart' },
  empty_text: 'Nothing to export',
  sections: [
    {
      title: 'Regulars',
      rows: [
        {
          key: 'milk',
          label: 'milk',
          control: 'checkbox_stepper',
          default: { selected: true, quantity: 2 },
          disabled_caption: 'No Walmart match',
          requires_record_field: {
            command_name: 'export_shopping_list',
            field: 'walmart_item_id',
            field_label: 'ID',
          },
        },
        { key: 'eggs', label: 'eggs', control: 'checkbox', default: { selected: true } },
      ],
    },
    {
      title: 'One-offs',
      rows: [
        {
          key: 'cake',
          label: 'birthday cake',
          control: 'checkbox',
          default: { selected: false },
        },
      ],
    },
  ],
  actions: [{ label: 'Export {n} items', callback: 'export_selected', style: 'primary' }],
};

const sampleItem = (metadata: Record<string, unknown>) => ({
  id: 'test-id',
  user_id: 1,
  household_id: 'household-1',
  title: 'Shopping list — 3 items',
  summary: '3 items ready',
  body: 'plain body',
  category: 'interactive_list',
  source_service: 'command-center',
  metadata,
  content_format: 'plain' as const,
  is_read: true,
  created_at: '2026-06-10T10:30:00Z',
});

const milkMappedRecords = {
  records: [
    {
      key: 'milk',
      summary: { title: 'milk', subtitle: null, icon: 'cart' },
      data: { walmart_item_id: '12345' },
    },
  ],
  truncated: false,
  count: 1,
};

describe('InteractiveListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListRecords.mockResolvedValue(milkMappedRecords);
  });

  it('renders sections and rows from the payload + live records', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItem(baseMetadata));

    const { getByText } = render(<InteractiveListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Regulars')).toBeTruthy();
      expect(getByText('One-offs')).toBeTruthy();
      expect(getByText('milk')).toBeTruthy();
      expect(getByText('eggs')).toBeTruthy();
      expect(getByText('birthday cake')).toBeTruthy();
    });

    // Gate met via the fetched record → "{field_label}: {value}" caption.
    expect(getByText('ID: 12345')).toBeTruthy();
    // {n} in the action label tracks the live selection (milk + eggs).
    expect(getByText('Export 2 items')).toBeTruthy();
    expect(mockGetInboxItem).toHaveBeenCalledWith('test-id');
    expect(mockListRecords).toHaveBeenCalledWith('node-1', 'export_shopping_list');
  });

  it('shows disabled_caption on a gated row whose gate is unmet', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItem(baseMetadata));
    mockListRecords.mockResolvedValue({ records: [], truncated: false, count: 0 });

    const { getByText, queryByText } = render(<InteractiveListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('No Walmart match')).toBeTruthy();
    });
    expect(queryByText('ID: 12345')).toBeNull();
    // milk's default selection is overridden to deselected → only eggs.
    expect(getByText('Export 1 items')).toBeTruthy();
  });

  it('degrades gated rows to disabled when the record fetch fails', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItem(baseMetadata));
    mockListRecords.mockRejectedValue(new Error('node unreachable'));

    const { getByText } = render(<InteractiveListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('No Walmart match')).toBeTruthy();
      expect(getByText('eggs')).toBeTruthy();
    });
  });

  it('fires sendInteractiveCallback with the contract data shape', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItem(baseMetadata));
    mockSendInteractiveCallback.mockResolvedValue({
      id: 'job-1',
      status: 'pending',
      navigation_type: 'stack',
      created_at: '2026-06-10T10:31:00Z',
    });
    mockGetInteractiveCallbackStatus.mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      navigation_type: 'stack',
      completed_at: '2026-06-10T10:31:02Z',
      error_message: null,
      context_data: { message: 'All set' },
    });

    const { getByText } = render(<InteractiveListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Export 2 items')).toBeTruthy();
    });

    fireEvent.press(getByText('Export 2 items'));

    await waitFor(() => {
      expect(mockSendInteractiveCallback).toHaveBeenCalledWith({
        command_name: 'export_shopping_list',
        callback_name: 'export_selected',
        data: {
          action: 'export_selected',
          // Document order; quantity only on the checkbox_stepper row.
          selected: [{ key: 'milk', quantity: 2 }, { key: 'eggs' }],
          context: { provider: 'walmart' },
        },
        target_node_id: 'node-1',
        navigation_type: 'stack',
      });
    });

    // Let the poll loop finish so no state updates land after the test.
    await waitFor(
      () => {
        expect(getByText('All set')).toBeTruthy();
      },
      { timeout: 5000 },
    );
  });

  it('renders the result message and detail_lines after completion', async () => {
    mockGetInboxItem.mockResolvedValue(sampleItem(baseMetadata));
    mockSendInteractiveCallback.mockResolvedValue({
      id: 'job-1',
      status: 'pending',
      navigation_type: 'stack',
      created_at: '2026-06-10T10:31:00Z',
    });
    mockGetInteractiveCallbackStatus.mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      navigation_type: 'stack',
      completed_at: '2026-06-10T10:31:02Z',
      error_message: null,
      context_data: {
        message: 'Exported 2 items.',
        detail_lines: ['milk x2', 'eggs'],
      },
    });

    const { getByText } = render(<InteractiveListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Export 2 items')).toBeTruthy();
    });

    fireEvent.press(getByText('Export 2 items'));

    // The poll loop waits 1s before the first status check.
    await waitFor(
      () => {
        expect(getByText('Exported 2 items.')).toBeTruthy();
        expect(getByText('milk x2')).toBeTruthy();
        expect(getByText('eggs')).toBeTruthy();
        expect(getByText('Done')).toBeTruthy();
      },
      { timeout: 5000 },
    );
  });

  it('replaces itself with InboxDetail on a malformed payload', async () => {
    mockGetInboxItem.mockResolvedValue(
      sampleItem({ type: 'interactive_list', version: 1 }),
    );

    render(<InteractiveListScreen />, { wrapper });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('InboxDetail', { itemId: 'test-id' });
    });
  });

  it('renders empty_text and hides the action bar when there are zero rows', async () => {
    mockGetInboxItem.mockResolvedValue(
      sampleItem({ ...baseMetadata, sections: [{ rows: [] }] }),
    );

    const { getByText, queryByText } = render(<InteractiveListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Nothing to export')).toBeTruthy();
    });
    expect(queryByText('Export 0 items')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
