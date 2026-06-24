import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import InboxListScreen from '../../src/screens/Inbox/InboxListScreen';
import { lightTheme } from '../../src/theme';
import {
  listInboxItems,
  bulkMarkItemsRead,
  bulkDeleteInboxItems,
} from '../../src/api/inboxApi';

// L1 FLOW INTEGRATION — the Inbox multi-select / bulk-ops state machine (no prior
// coverage): long-press → enter select mode, the per-item checkbox + select-all
// toggles, the live "{n} selected" header, bulk mark-read (bulkMarkItemsRead →
// items flip read → auto-exit), bulk delete (Alert confirm → bulkDeleteInboxItems
// → items removed), and Cancel. Real screen + real selection state (a Set in
// useState); mocks only the api/auth/navigation/gesture leaves.

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    getParent: () => ({ goBack: mockGoBack }),
  }),
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), []);
  },
}));

// Swipeable just renders its children inline (we drive select-mode, not swipe).
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children }: any) => <View>{children}</View> };
});
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: {} }));

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

jest.mock('../../src/api/inboxApi', () => ({
  listInboxItems: jest.fn(),
  deleteInboxItem: jest.fn(),
  bulkMarkItemsRead: jest.fn(),
  bulkDeleteInboxItems: jest.fn(),
}));

const ITEMS = [
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

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <InboxListScreen />
    </PaperProvider>,
  );

// Long-press bubbles up from the title Text to the Card's onLongPress.
const longPressItem = (utils: any, title: string) =>
  fireEvent(utils.getByText(title), 'longPress');

describe('Inbox select-mode — flow integration (bulk mark-read / delete / select-all)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listInboxItems as jest.Mock).mockResolvedValue(ITEMS);
    (bulkMarkItemsRead as jest.Mock).mockResolvedValue(undefined);
    (bulkDeleteInboxItems as jest.Mock).mockResolvedValue(undefined);
  });

  it('long-press enters select mode, selects that item, and reveals the bulk action bar', async () => {
    const utils = renderScreen();
    await utils.findByText('Research on AI trends');

    longPressItem(utils, 'Research on AI trends');

    // Header reflects the live count; the bulk-ops bar is now mounted.
    await utils.findByText('1 selected');
    expect(utils.getByTestId('inbox-bulk-mark-read')).toBeTruthy();
    expect(utils.getByTestId('inbox-bulk-delete')).toBeTruthy();
    // The pressed item is checked.
    expect(utils.getByTestId('inbox-checkbox-item-1').props.accessibilityState?.checked).toBe(true);
  });

  it('select-all selects every item; pressing it again (Clear) deselects all', async () => {
    const utils = renderScreen();
    await utils.findByText('Research on AI trends');
    longPressItem(utils, 'Research on AI trends');
    await utils.findByText('1 selected');

    fireEvent.press(utils.getByTestId('inbox-select-all'));
    await utils.findByText('2 selected');

    fireEvent.press(utils.getByTestId('inbox-select-all')); // now labelled "Clear"
    await utils.findByText('Select items');
  });

  it('per-item checkbox toggles a single item out of the selection', async () => {
    const utils = renderScreen();
    await utils.findByText('Research on AI trends');
    longPressItem(utils, 'Research on AI trends');
    fireEvent.press(utils.getByTestId('inbox-select-all'));
    await utils.findByText('2 selected');

    fireEvent.press(utils.getByTestId('inbox-checkbox-item-2'));
    await utils.findByText('1 selected');
    expect(utils.getByTestId('inbox-checkbox-item-2').props.accessibilityState?.checked).toBe(false);
  });

  it('bulk mark-read calls bulkMarkItemsRead with the selected ids and exits select mode', async () => {
    const utils = renderScreen();
    await utils.findByText('Research on AI trends');
    longPressItem(utils, 'Research on AI trends');
    fireEvent.press(utils.getByTestId('inbox-select-all'));
    await utils.findByText('2 selected');

    await act(async () => {
      fireEvent.press(utils.getByTestId('inbox-bulk-mark-read'));
    });

    expect(bulkMarkItemsRead).toHaveBeenCalledWith(['item-1', 'item-2']);
    // Exits select mode → header returns to the plain title.
    await utils.findByText('Inbox');
  });

  it('bulk delete confirms via Alert, calls bulkDeleteInboxItems, and removes the items', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const utils = renderScreen();
    await utils.findByText('Research on AI trends');
    longPressItem(utils, 'Research on AI trends');
    await utils.findByText('1 selected');

    fireEvent.press(utils.getByTestId('inbox-bulk-delete'));

    // Confirm via the destructive button in the Alert.
    expect(alertSpy).toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] as any[];
    const del = buttons.find((b) => b.text === 'Delete');
    await act(async () => {
      await del.onPress();
    });

    expect(bulkDeleteInboxItems).toHaveBeenCalledWith(['item-1']);
    await waitFor(() => expect(utils.queryByText('Research on AI trends')).toBeNull());
    // item-2 (unselected) is untouched.
    expect(utils.getByText('Reminder: Take out trash')).toBeTruthy();
    alertSpy.mockRestore();
  });

  it('Cancel exits select mode without calling any bulk api', async () => {
    const utils = renderScreen();
    await utils.findByText('Research on AI trends');
    longPressItem(utils, 'Research on AI trends');
    await utils.findByText('1 selected');

    fireEvent.press(utils.getByTestId('inbox-select-cancel'));

    await utils.findByText('Inbox');
    expect(bulkMarkItemsRead).not.toHaveBeenCalled();
    expect(bulkDeleteInboxItems).not.toHaveBeenCalled();
  });
});
