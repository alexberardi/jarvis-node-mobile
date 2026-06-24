import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import MemoriesListScreen from '../../src/screens/Memories/MemoriesListScreen';
import { lightTheme } from '../../src/theme';
import { listMemories, deleteMemory } from '../../src/api/memoriesApi';

// L1 FLOW INTEGRATION — the Memories list surface (zero prior coverage): load on
// focus, the role-based filter (only elevated users see household memories), the
// swipe→Alert→delete path, and FAB→create navigation. Real screen + real
// filter/state; mocks only the api/auth/navigation leaves.

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const ReactLocal = require('react');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    // Run the focus effect once on mount so the list loads.
    useFocusEffect: (cb: any) => ReactLocal.useEffect(() => cb(), []),
  };
});

// useAuth drives householdId + role; set per test.
let mockAuthState: any;
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: mockAuthState }),
}));

jest.mock('../../src/api/memoriesApi', () => ({
  listMemories: jest.fn(),
  deleteMemory: jest.fn(),
}));

// Expose the swipe right-action (the delete button) without a real gesture.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const ReactLocal = require('react');
  return {
    __esModule: true,
    default: ({ children, renderRightActions }: any) =>
      ReactLocal.createElement(
        ReactLocal.Fragment,
        null,
        children,
        renderRightActions ? renderRightActions({ value: 0 }, { value: 0 }) : null,
      ),
  };
});

const OWN = { id: 'm1', content: 'I prefer dark mode', category: 'preference', user_id: 7, source: 'user', is_pinned: false, editable: true };
const HOUSEHOLD = { id: 'm2', content: 'House wifi is FastNet', category: 'fact', user_id: null, source: 'user', is_pinned: false, editable: true };

const authFor = (role: 'member' | 'admin') => ({
  activeHouseholdId: 'hh-1',
  households: [{ id: 'hh-1', name: 'Home', role }],
});

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <MemoriesListScreen />
    </PaperProvider>,
  );

describe('Memories list — flow integration (load, role filter, delete, create)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = authFor('member');
    (listMemories as jest.Mock).mockResolvedValue([OWN]);
    (deleteMemory as jest.Mock).mockResolvedValue(undefined);
  });

  it('loads memories on focus and renders the user’s own memory', async () => {
    const { findByText } = renderScreen();
    await findByText('I prefer dark mode');
    await findByText('My Memories');
    expect(listMemories).toHaveBeenCalledWith('hh-1');
  });

  it('hides household memories from a member, shows them to an elevated user', async () => {
    (listMemories as jest.Mock).mockResolvedValue([OWN, HOUSEHOLD]);

    // member: no Household section, household memory not rendered
    const member = renderScreen();
    await member.findByText('I prefer dark mode');
    expect(member.queryByText('House wifi is FastNet')).toBeNull();
    expect(member.queryByText('Household')).toBeNull();
    member.unmount();

    // admin: Household section + the household memory both shown
    mockAuthState = authFor('admin');
    const admin = renderScreen();
    await admin.findByText('House wifi is FastNet');
    await admin.findByText('Household');
  });

  it('swipe-delete → Alert confirm → deleteMemory → removed from the list', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByTestId, findByText, queryByText } = renderScreen();
    await findByText('I prefer dark mode');

    fireEvent.press(getByTestId('memory-delete-m1'));

    // The destructive confirm button in the Alert.
    expect(alertSpy).toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] as any[];
    const del = buttons.find((b) => b.text === 'Delete');
    await act(async () => {
      await del.onPress();
    });

    expect(deleteMemory).toHaveBeenCalledWith('m1', 'hh-1');
    await waitFor(() => expect(queryByText('I prefer dark mode')).toBeNull());
    alertSpy.mockRestore();
  });

  it('FAB navigates to create a new memory', async () => {
    const { getByTestId, findByText } = renderScreen();
    await findByText('I prefer dark mode');
    fireEvent.press(getByTestId('memory-add-fab'));
    expect(mockNavigate).toHaveBeenCalledWith('MemoryEdit', {});
  });

  it('shows an error + Retry that reloads on failure', async () => {
    (listMemories as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const { findByText, getByText } = renderScreen();
    await findByText('Could not load memories');

    (listMemories as jest.Mock).mockResolvedValueOnce([OWN]);
    fireEvent.press(getByText('Retry'));
    await findByText('I prefer dark mode');
  });
});
