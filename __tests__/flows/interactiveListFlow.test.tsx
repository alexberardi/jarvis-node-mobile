import React from 'react';
import { Alert, Linking } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import InteractiveListScreen from '../../src/screens/Inbox/InteractiveListScreen';
import { lightTheme } from '../../src/theme';

// L1 FLOW INTEGRATION — the generic interactive_list inbox surface (extends the
// existing happy-path screen test): the non-timer interaction handlers proven
// against the REAL screen + real selection/quantity state — row-press
// toggle-select tracking {n}, the All/Clear select-all header, the +/- quantity
// stepper with clamping (and that the bumped quantity rides the callback), the
// submit firing sendInteractiveCallback with the exact data shape (+ immediate
// busy state, WITHOUT driving the poll loop), plus the post-completion result
// affordances: copy-to-clipboard (Clipboard.setStringAsync + Alert on failure)
// and open-link (Linking.openURL + Alert on failure). Only api/auth/nav/native
// leaves are mocked; the screen renders for real.

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockReplace = jest.fn();

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
import * as Clipboard from 'expo-clipboard';

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

// A single section with FOUR selectable rows (>3 → the Select-all header
// shows), the first a checkbox_stepper so the +/- stepper renders. No gates,
// so every row is immediately selectable and the fetch path is a no-op.
const baseMetadata = {
  type: 'interactive_list',
  version: 1,
  command_name: 'export_shopping_list',
  node_id: 'node-1',
  context: { provider: 'walmart' },
  sections: [
    {
      title: 'Items',
      rows: [
        {
          key: 'milk',
          label: 'milk',
          control: 'checkbox_stepper',
          default: { selected: true, quantity: 2 },
        },
        { key: 'eggs', label: 'eggs', control: 'checkbox', default: { selected: true } },
        { key: 'bread', label: 'bread', control: 'checkbox', default: { selected: false } },
        { key: 'cake', label: 'birthday cake', control: 'checkbox', default: { selected: false } },
      ],
    },
  ],
  actions: [{ label: 'Export {n} items', callback: 'export_selected', style: 'primary' }],
};

const sampleItem = (metadata: Record<string, unknown>) => ({
  id: 'test-id',
  user_id: 1,
  household_id: 'household-1',
  title: 'Shopping list',
  summary: 'ready',
  body: 'plain body',
  category: 'interactive_list',
  source_service: 'command-center',
  metadata,
  content_format: 'plain' as const,
  is_read: true,
  created_at: '2026-06-10T10:30:00Z',
});

// Drives the callback poll to a single `completed` status carrying the given
// context_data, then waits for the result view to render. Uses real timers
// (one ~1s poll tick); we never use fake timers.
const completeCallbackWith = (contextData: Record<string, unknown>) => {
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
    context_data: contextData,
  });
};

describe('InteractiveList — flow integration (select, stepper, submit, copy, open)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListRecords.mockResolvedValue({ records: [], truncated: false, count: 0 });
    mockGetInboxItem.mockResolvedValue(sampleItem(baseMetadata));
    (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
  });

  afterEach(() => {
    (Linking.openURL as jest.Mock).mockRestore();
  });

  it('row press toggles selection — {n} tracks deselect then re-select', async () => {
    const { getByText, getByTestId } = render(<InteractiveListScreen />, { wrapper });

    // milk + eggs default-selected → 2.
    await waitFor(() => expect(getByText('Export 2 items')).toBeTruthy());

    // Deselect milk (was selected) → 1.
    fireEvent.press(getByTestId('interactive-row-milk'));
    await waitFor(() => expect(getByText('Export 1 items')).toBeTruthy());

    // Select bread (was not selected) → 2 again.
    fireEvent.press(getByTestId('interactive-row-bread'));
    await waitFor(() => expect(getByText('Export 2 items')).toBeTruthy());
  });

  it('select-all header toggles every selectable row, then clears', async () => {
    const { getByText, getByTestId } = render(<InteractiveListScreen />, { wrapper });

    // >3 selectable rows → header present; 2 of 4 selected by default.
    await waitFor(() => expect(getByText('2 of 4 selected')).toBeTruthy());

    // "All" → select all four.
    fireEvent.press(getByTestId('select-all-toggle'));
    await waitFor(() => {
      expect(getByText('4 of 4 selected')).toBeTruthy();
      expect(getByText('Export 4 items')).toBeTruthy();
    });

    // Now the button reads "Clear" → deselect everything.
    fireEvent.press(getByTestId('select-all-toggle'));
    await waitFor(() => expect(getByText('0 of 4 selected')).toBeTruthy());
  });

  it('quantity stepper +/- bumps and clamps at the floor of 1', async () => {
    const { getByTestId } = render(<InteractiveListScreen />, { wrapper });

    // Stepper renders only for the enabled checkbox_stepper row (milk),
    // seeded to its default quantity of 2.
    await waitFor(() => expect(getByTestId('quantity-input-milk').props.value).toBe('2'));

    fireEvent.press(getByTestId('quantity-plus-milk'));
    await waitFor(() => expect(getByTestId('quantity-input-milk').props.value).toBe('3'));

    fireEvent.press(getByTestId('quantity-minus-milk'));
    fireEvent.press(getByTestId('quantity-minus-milk'));
    await waitFor(() => expect(getByTestId('quantity-input-milk').props.value).toBe('1'));

    // At 1 the minus button is disabled — clamped at the floor.
    expect(
      getByTestId('quantity-minus-milk').props.accessibilityState?.disabled,
    ).toBe(true);
  });

  it('quantity input strips non-digits and caps at 2 chars', async () => {
    const { getByTestId } = render(<InteractiveListScreen />, { wrapper });
    await waitFor(() => expect(getByTestId('quantity-input-milk').props.value).toBe('2'));

    fireEvent.changeText(getByTestId('quantity-input-milk'), '4a7x9');
    // digits only ("4799") then sliced to the first 2 → "47".
    await waitFor(() => expect(getByTestId('quantity-input-milk').props.value).toBe('47'));
  });

  it('submit fires sendInteractiveCallback with the collected-state shape (no poll drive)', async () => {
    // Keep the callback pending so the poll loop never resolves a result; we
    // assert only the submit call + the immediate busy state.
    mockSendInteractiveCallback.mockResolvedValue({
      id: 'job-1',
      status: 'pending',
      navigation_type: 'stack',
      created_at: '2026-06-10T10:31:00Z',
    });
    mockGetInteractiveCallbackStatus.mockResolvedValue({ id: 'job-1', status: 'pending' });

    const { getByText, getByTestId } = render(<InteractiveListScreen />, { wrapper });
    await waitFor(() => expect(getByText('Export 2 items')).toBeTruthy());

    // Bump milk's quantity so we prove the live quantity rides the callback
    // (default 2 → 3), with the default selection (milk + eggs).
    fireEvent.press(getByTestId('quantity-plus-milk'));
    await waitFor(() => expect(getByTestId('quantity-input-milk').props.value).toBe('3'));

    await act(async () => {
      fireEvent.press(getByText('Export 2 items'));
    });

    expect(mockSendInteractiveCallback).toHaveBeenCalledTimes(1);
    expect(mockSendInteractiveCallback).toHaveBeenCalledWith({
      command_name: 'export_shopping_list',
      callback_name: 'export_selected',
      data: {
        action: 'export_selected',
        selected: [{ key: 'milk', quantity: 3 }, { key: 'eggs' }],
        context: { provider: 'walmart' },
      },
      target_node_id: 'node-1',
      navigation_type: 'stack',
    });

    // Immediate state: the working indicator is up (busy).
    await waitFor(() => expect(getByText('Working…')).toBeTruthy());
  });

  it('copy-to-clipboard writes the result text via expo-clipboard', async () => {
    completeCallbackWith({ message: 'Done', text: 'paste-me-123' });
    const { getByText, getByTestId } = render(<InteractiveListScreen />, { wrapper });
    await waitFor(() => expect(getByText('Export 2 items')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByText('Export 2 items'));
    });

    // Result view lands after the poll completes.
    const copyBtn = await waitFor(() => getByTestId('copy-to-clipboard-button'), {
      timeout: 5000,
    });

    await act(async () => {
      fireEvent.press(copyBtn);
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('paste-me-123');
  });

  it('copy failure surfaces an Error alert and does not crash', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    (Clipboard.setStringAsync as jest.Mock).mockRejectedValue(new Error('no clipboard'));
    completeCallbackWith({ message: 'Done', text: 'paste-me-123' });

    const { getByText, getByTestId } = render(<InteractiveListScreen />, { wrapper });
    await waitFor(() => expect(getByText('Export 2 items')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByText('Export 2 items'));
    });
    const copyBtn = await waitFor(() => getByTestId('copy-to-clipboard-button'), {
      timeout: 5000,
    });

    await act(async () => {
      fireEvent.press(copyBtn);
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('paste-me-123');
    expect(alertSpy).toHaveBeenCalledWith('Error', 'Could not copy to clipboard.');
    alertSpy.mockRestore();
  });

  it('open-link button opens the result url via Linking; failure alerts', async () => {
    // A url result auto-opens once on arrival, AND exposes the Open-link button.
    completeCallbackWith({ message: 'Done', url: 'https://walmart.com/cart' });
    const { getByText, getByTestId } = render(<InteractiveListScreen />, { wrapper });
    await waitFor(() => expect(getByText('Export 2 items')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByText('Export 2 items'));
    });
    const openBtn = await waitFor(() => getByTestId('open-link-button'), {
      timeout: 5000,
    });

    // Auto-open already fired once on result arrival.
    expect(Linking.openURL).toHaveBeenCalledWith('https://walmart.com/cart');

    // Now make the next openURL reject and tap the button → Error alert.
    const alertSpy = jest.spyOn(Alert, 'alert');
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('no handler'));
    await act(async () => {
      fireEvent.press(openBtn);
    });

    expect(Linking.openURL).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Error', 'Could not open the link.'),
    );
    alertSpy.mockRestore();
  });
});
